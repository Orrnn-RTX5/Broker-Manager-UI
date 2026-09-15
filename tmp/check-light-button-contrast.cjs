const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const p=await b.newPage(); await p.goto('http://localhost:5180');
 const result=await p.evaluate(()=>{
 document.documentElement.classList.remove('dark');
 const host=document.createElement('div');host.className='legacy-popup';
 host.innerHTML='<button class="ui-btn ui-btn-primary">Change</button><button disabled class="ui-btn ui-btn-primary">Change</button><button class="ui-btn ui-btn-secondary">Verify</button>';
 document.body.append(host);
 return [...host.children].map(e=>({label:e.textContent,disabled:e.disabled,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
 });
 console.log(result);
 if(result[0].color!=='rgb(255, 255, 255)'||result[1].color!=='rgb(255, 255, 255)'||result[2].color==='rgb(255, 255, 255)')throw Error('Button contrast check failed');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
