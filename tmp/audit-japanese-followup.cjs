const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('manager_language','ja'));
 await page.goto('http://localhost:5180/manager-login');
 await page.locator('#manager-login').fill('9000');
 await page.locator('#manager-password').fill(process.env.JAPANESE_AUDIT_PASSWORD);
 await page.locator('button[type=submit]').click();
 await page.waitForURL('**/dashboard',{timeout:45000});
 const routes=['/ib','/ib/tree','/symbols'];
 const results=[];
 for(const route of routes){
 await page.evaluate(route=>{history.pushState({},'',route);window.dispatchEvent(new PopStateEvent('popstate'));},route);await page.waitForTimeout(6000);await page.locator('.rtx5-command-shell').waitFor();
 const missing=await page.evaluate(async()=>{const {default:de}=await import('/src/i18n/uiDictionary/ja.js');const {default:locale}=await import('/src/i18n/locales/ja.js');const translated=new Set([...Object.values(de),...Object.values(locale)].map(v=>v.toLowerCase()));const found=new Set();const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName)||!node.parentElement?.getClientRects().length)continue;const value=node.data.trim();if(value&&/[a-z]{3}/i.test(value)&&!translated.has(value.toLowerCase()))found.add(value);}for(const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))for(const attr of ['placeholder','title','aria-label']){const value=el.getAttribute(attr);if(value&&/[a-z]{3}/i.test(value)&&!translated.has(value.toLowerCase()))found.add(value);}return [...found];});
 results.push({route,missing});fs.writeFileSync('tmp/japanese-followup-audit.json',JSON.stringify(results,null,2));console.log(route+': '+missing.length+' unmatched strings');
 
 }
 fs.writeFileSync('tmp/japanese-followup-audit.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});

