const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('manager_language','es'));
 await page.goto('http://localhost:5180/manager-login');
 await page.locator('#manager-login').fill('9000');
 await page.locator('#manager-password').fill(process.env.SPANISH_AUDIT_PASSWORD);
 await page.locator('button[type=submit]').click();
 await page.waitForURL('**/dashboard',{timeout:45000});

 const results=[];
 async function capture(name,selector='body'){
 await page.waitForTimeout(800);
 const texts=await page.locator(selector).evaluate(el=>{const result=[];const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(n.parentElement?.getClientRects().length&&!['SCRIPT','STYLE'].includes(n.parentElement.tagName)){const t=n.data.trim();if(t)result.push(t);}}for(const a of el.querySelectorAll('[title],[placeholder],[aria-label]'))for(const key of ['title','placeholder','aria-label']){const t=a.getAttribute(key);if(t)result.push(t);}return [...new Set(result)];});
 results.push({name,texts});fs.writeFileSync('C:/Users/ADMIN/AppData/Local/Temp/spanish-dialog-audit.json',JSON.stringify(results,null,2));console.log('Checked '+name);
 }
 await page.waitForTimeout(3000);await capture('dashboard');
 for(const name of ["Archivo","Editar","Ver","Herramientas","Ventana","Ayuda"]){await page.getByText(name,{exact:true}).first().click();await capture('menu '+name);await page.keyboard.press('Escape');await page.mouse.click(720,500);}
 await page.getByRole('button',{name:"Nueva cuenta",exact:true}).first().click();await page.locator('.new-account-modal').waitFor();await capture('new account','.new-account-modal');await page.locator('.new-account-modal').getByRole('button',{name:"Cancelar",exact:true}).click();
 await page.evaluate(()=>{history.pushState({},'','/clients/trading-accounts');dispatchEvent(new PopStateEvent('popstate'));});
 await page.locator('.trading-accounts-page tbody tr').first().waitFor({timeout:20000});await page.locator('.trading-accounts-page tbody tr').first().dblclick();
 await page.locator('.account-details-window').waitFor();
 for(const tab of ['overview','personal','account','limits','balance','trade','history','security']){await page.locator('#account-tab-'+tab).click();await capture('account '+tab,'.account-details-window');}
 await page.locator('.account-details-window-controls button').last().click();
 await page.evaluate(()=>{history.pushState({},'','/symbol-management');dispatchEvent(new PopStateEvent('popstate'));});await page.locator('.symbol-management-tabs').waitFor();
 for(let i=0;i<6;i++){await page.locator('.symbol-management-tab').nth(i).click();await capture('symbol tab '+i,'.symbol-management-page');}
 await page.evaluate(()=>{history.pushState({},'','/analytics/advertising-campaigns');dispatchEvent(new PopStateEvent('popstate'));});await page.waitForTimeout(2000);await capture('campaigns');
 await page.locator('.data-state-card').first().waitFor({timeout:30000});await page.waitForTimeout(400);const cdp=await page.context().newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/spanish-campaigns.png',Buffer.from(shot.data,'base64'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
