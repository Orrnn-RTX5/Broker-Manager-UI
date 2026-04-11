const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('http://69.197.178.27')) {
        content = content.replace(/http:\/\/69\.197\.178\.27/g, '/api');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated', fullPath);
      }
    }
  }
}

walk(dir);
console.log('Done');
