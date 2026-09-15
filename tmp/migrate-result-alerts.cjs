const fs = require('node:fs');
const path = require('node:path');
function walk(dir) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const file = path.join(dir, entry.name);
  if (entry.isDirectory()) { if(entry.name !== 'i18n') walk(file); continue; }
  if (!/\.(jsx|js)$/.test(file) || file.endsWith('.test.js')) continue;
  let source = fs.readFileSync(file, 'utf8');
  if (!/\b(?:window\.)?alert\(/.test(source)) continue;
  source = source.split('\n').map(line => {
   if (!/\b(?:window\.)?alert\(/.test(line)) return line;
   let method = 'showResult';
   if (/DENIED_MESSAGE|does not have permission|Error|failed:|failed\\n|Unable to|copy\.error|alert\(e\.message\)|alert\(message\)|alert\(error\.message/.test(line)) method += '.error';
   else if (/Please enter|No rows to|Only volume|Save a restriction first|historical records/.test(line)) method += '.info';
   else if (/successfully|Successfully|Restrictions (updated|cleared)|Spread markup set|Execution set|Book set to|Copied /.test(line)) method += '.success';
   return line.replace(/\b(?:window\.)?alert\(/g, method + '(').replace(/showResult\(JSON\.stringify\(result, null, 2\)\)/g, 'showResult(result)');
  }).join('\n');
  let relative = path.relative(path.dirname(file), 'src/store/resultDialogStore.js').replaceAll('\\', '/');
  if (!relative.startsWith('.')) relative = './' + relative;
  source = `import { showResult } from '${relative}';\n` + source;
  fs.writeFileSync(file, source);
  console.log(file);
 }
}
walk('src');
