const fs=require('node:fs');
const file='tmp/verify-all-symbols.cjs';
let s=fs.readFileSync(file,'utf8').replace(/getByText\('([^']+) symbols',\{exact:true\}\)/g,(_,label)=>'getByText(/'+label.replace(/[^\x00-\x7F]/g,'.')+' symbols/)');
fs.writeFileSync(file,s);
