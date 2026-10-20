import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const scriptBlock = workflow.match(/name: Verify source revision and successful publish run[\s\S]*?script: \|\r?\n([\s\S]*?)(?=\r?\n {6}- name:)/)?.[1];
assert.ok(scriptBlock, 'publish provenance verifier must exist');
const script = scriptBlock.split(/\r?\n/).map(line => line.replace(/^ {12}/, '')).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const verifyPublish = new AsyncFunction('process', 'context', 'github', script);
const sha = 'a'.repeat(40);

const verify = async ({ sourceSha = sha, contextSha = sha, runId = '123', run = {}, jobs } = {}) => {
  let inspected = false;
  const github = {
    rest: { actions: {
      getWorkflowRun: async () => {
        inspected = true;
        return { data: {
          head_sha: sha, head_branch: 'main', event: 'push',
          path: '.github/workflows/deploy.yml', status: 'completed', conclusion: 'success',
          ...run,
        } };
      },
      listJobsForWorkflowRun: () => {},
    } },
    paginate: async () => jobs ?? [
      { name: 'Validate build', conclusion: 'success' },
      { name: 'Build and publish GHCR image', conclusion: 'success' },
    ],
  };
  await verifyPublish(
    { env: { SOURCE_SHA: sourceSha, PUBLISH_RUN_ID: runId } },
    { sha: contextSha, repo: { owner: 'owner', repo: 'manager' } },
    github,
  );
  return inspected;
};

test('promotion accepts only a successful same-revision main-push publish with both build gates', async () => {
  assert.equal(await verify(), true);
  for (const run of [
    { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' },
    { path: '.github/workflows/other.yml' }, { status: 'in_progress' }, { conclusion: 'failure' },
  ]) {
    await assert.rejects(verify({ run }), /successful same-SHA main push/);
  }
  await assert.rejects(verify({ jobs: [{ name: 'Build and publish GHCR image', conclusion: 'success' }] }), /Required publish gate/);
  await assert.rejects(verify({ jobs: [
    { name: 'Validate build', conclusion: 'success' },
    { name: 'Build and publish GHCR image', conclusion: 'failure' },
  ] }), /Required publish gate/);
});

test('promotion rejects abbreviated source, revision substitution, and unsafe run IDs', async () => {
  await assert.rejects(verify({ sourceSha: 'aaaaaaa' }), /full SHA/);
  await assert.rejects(verify({ contextSha: 'b'.repeat(40) }), /full SHA/);
  for (const runId of ['0', '1; echo injected', '123abc', '9007199254740992']) {
    await assert.rejects(verify({ runId }), /Invalid publish run ID/);
  }
});

test('published identity and Nexa-tested digest are required before separate SSH deployment', () => {
  assert.match(workflow, /name: manager-image-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /name: manager-image-\$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /REQUESTED_IMAGE_REF" != "\$NEXA_TESTED_IMAGE_REF/);
  assert.match(workflow, /\.source_sha == \$source_sha and \.image_ref == \$image_ref/);
  assert.match(workflow, /vars\.MANAGER_AUTO_DEPLOY_PAUSED != 'true'/);
  assert.match(workflow, /needs: \[publish-image, promote-image\]/);
  assert.match(workflow, /NEW_IMAGE="\$\{\{ needs\.promote-image\.outputs\.image_ref \|\| needs\.publish-image\.outputs\.image_ref \}\}"/);
  const promoteJob = workflow.split('  promote-image:')[1].split('  deploy:')[0];
  assert.doesNotMatch(promoteJob, /build-push-action|npm run build|npm ci/);
});
