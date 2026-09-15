import fs from 'node:fs';const p='tmp/german-source-audit.mjs';let s=fs.readFileSync(p,'utf8').replace("&&s.includes(' ')", "");fs.writeFileSync(p,s);
