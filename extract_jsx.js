const fs = require('fs');
const path = require('path');
const fr = require('./src/i18n/uiDictionary/fr.js').default;

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!full.includes('node_modules') && !full.includes('.git')) {
        results = results.concat(getFiles(full));
      }
    } else if (file.endsWith('.jsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = getFiles('./src');
console.log('Total JSX files:', files.length);

const missingStrings = new Set();

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Match text between > and <
  const jsxTextMatches = content.match(/>([^<>{}\n]+)</g) || [];
  jsxTextMatches.forEach(m => {
    const text = m.slice(1, -1).trim();
    if (text && text.length > 1 && !/^[\d.,:\s%#$+\-\\/|–—()]+$/.test(text) && !/^[A-Z0-9_]+$/.test(text)) {
      if (!(text in fr)) {
        missingStrings.add(text);
      }
    }
  });

  // Match placeholder="..."
  const placeholderMatches = content.match(/placeholder=["']([^"']+)["']/g) || [];
  placeholderMatches.forEach(m => {
    const text = m.replace(/^placeholder=["']/, '').replace(/["']$/, '').trim();
    if (text && !(text in fr)) {
      missingStrings.add(text);
    }
  });

  // Match title="..."
  const titleMatches = content.match(/title=["']([^"']+)["']/g) || [];
  titleMatches.forEach(m => {
    const text = m.replace(/^title=["']/, '').replace(/["']$/, '').trim();
    if (text && !(text in fr)) {
      missingStrings.add(text);
    }
  });

  // Match aria-label="..."
  const ariaMatches = content.match(/aria-label=["']([^"']+)["']/g) || [];
  ariaMatches.forEach(m => {
    const text = m.replace(/^aria-label=["']/, '').replace(/["']$/, '').trim();
    if (text && !(text in fr)) {
      missingStrings.add(text);
    }
  });
});

console.log('Missing strings found in JSX:', missingStrings.size);
fs.writeFileSync('all_missing_from_jsx.json', JSON.stringify(Array.from(missingStrings).sort(), null, 2));
