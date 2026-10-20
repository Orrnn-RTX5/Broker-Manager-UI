// scripts/release-desktop.cjs — env-driven desktop publish (no vendor defaults).
// Reads RELEASE_OWNER + RELEASE_REPO from the environment. If either is unset,
// publishing is disabled with a clear message (exit 1) and nothing is uploaded.
// Otherwise runs electron-builder with a generated publish config merged over
// the package.json build config (full config is embedded, so --config replace
// vs merge semantics both work).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const owner = (process.env.RELEASE_OWNER || '').trim();
const repo = (process.env.RELEASE_REPO || '').trim();
if (!owner || !repo) {
  console.error(
    'Desktop publishing is disabled: set RELEASE_OWNER and RELEASE_REPO ' +
    'to publish (no default release repository is configured).'
  );
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const build = {
  ...(pkg.build || {}),
  publish: [{ provider: 'github', owner, repo, private: false, releaseType: 'release' }],
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtx5-publish-'));
const cfgPath = path.join(dir, 'publish.json');
fs.writeFileSync(cfgPath, JSON.stringify({ build }));
const result = spawnSync(
  'npx',
  ['electron-builder', '--win', '--x64', '--publish', 'always', '--config', cfgPath],
  { stdio: 'inherit', shell: true }
);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
process.exit(result.status ?? 1);
