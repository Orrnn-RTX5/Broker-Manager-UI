const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('manager_language','de'));
 await page.goto('http://localhost:5180/manager-login');
 await page.locator('#manager-login').fill('9000');
 await page.locator('#manager-password').fill(process.env.GERMAN_AUDIT_PASSWORD);
 await page.locator('button[type=submit]').click();
 await page.waitForURL('**/dashboard',{timeout:45000});

 await page.waitForTimeout(2000);
 await page.getByText('Ansicht',{exact:true}).first().click();await page.getByText('Sprachen',{exact:true}).click();await page.getByRole('button',{name:/Englisch/}).click();await page.waitForTimeout(200);
 if(await page.locator('html').getAttribute('lang')!=='en')throw new Error('English switch failed');
 await page.getByText('View',{exact:true}).first().click();await page.getByText('Languages',{exact:true}).click();await page.getByRole('button',{name:/German/}).click();await page.waitForTimeout(200);
 if(await page.locator('html').getAttribute('lang')!=='de')throw new Error('German switch failed');
 console.log('PASS: English/German language menu switching');
 await page.evaluate(()=>{history.pushState({},'','/analytics/advertising-campaigns');dispatchEvent(new PopStateEvent('popstate'));});await page.waitForTimeout(2000);
 await page.locator('.data-state-card').first().waitFor({timeout:30000});await page.waitForTimeout(300);const cdp=await page.context().newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/german-campaigns.png',Buffer.from(shot.data,'base64'));
 const fresh=await browser.newPage();await fresh.goto('http://localhost:5180/manager-login');await fresh.locator('#manager-login').waitFor();await fresh.waitForTimeout(200);
 if(await fresh.locator('html').getAttribute('lang')!=='de')throw new Error('German default failed');
 console.log('PASS: German default for a fresh browser');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});

