const fs=require('node:fs');let s=fs.readFileSync('tmp/audit-german.cjs','utf8');s=s.slice(0,s.indexOf(' const routes='))+`
 await page.waitForTimeout(2000);
 await page.getByText('Ansicht',{exact:true}).first().click();await page.getByText('Sprachen',{exact:true}).click();await page.getByRole('button',{name:/Englisch/}).click();await page.waitForTimeout(200);
 if(await page.locator('html').getAttribute('lang')!=='en')throw new Error('English switch failed');
 await page.getByText('View',{exact:true}).first().click();await page.getByText('Languages',{exact:true}).click();await page.getByRole('button',{name:/German/}).click();await page.waitForTimeout(200);
 if(await page.locator('html').getAttribute('lang')!=='de')throw new Error('German switch failed');
 console.log('PASS: English/German language menu switching');
 await page.evaluate(()=>{history.pushState({},'','/analytics/advertising-campaigns');dispatchEvent(new PopStateEvent('popstate'));});await page.waitForTimeout(2000);
 const cdp=await page.context().newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/german-campaigns.png',Buffer.from(shot.data,'base64'));
 const fresh=await browser.newPage();await fresh.goto('http://localhost:5180/manager-login');await fresh.locator('#manager-login').waitFor();await fresh.waitForTimeout(200);
 if(await fresh.locator('html').getAttribute('lang')!=='de')throw new Error('German default failed');
 console.log('PASS: German default for a fresh browser');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
`;fs.writeFileSync('tmp/verify-german-language.cjs',s);
