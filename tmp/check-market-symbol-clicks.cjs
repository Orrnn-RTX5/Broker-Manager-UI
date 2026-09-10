const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.goto('http://localhost:5180');
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {default:MarketData}=await import('/src/components/Popups/MarketData.jsx');
  const {default:store}=await import('/src/store/symbolStore.js');store.setState({initWebSocket:()=>{},symbols:{EURUSD:{symbol:'EURUSD',bid:'1.12345',ask:'1.12355',dir:'up'},BTCUSD:{symbol:'BTCUSD',bid:'80000',ask:'80001',dir:'down'}}});
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;background:#181818';document.body.append(host);createRoot(host).render(React.createElement(MarketData,{compact:true}));
 });
 const panel=page.locator('.market-watch-type');
 await panel.locator('.market-row').filter({hasText:'EURUSD'}).click();
 await page.waitForFunction(()=>document.querySelector('.market-data-tab.is-active')?.textContent.trim()==='Details');
 if(!(await panel.innerText()).includes('EURUSD'))throw Error('Wrong Details symbol');
 await panel.getByRole('button',{name:'Symbols',exact:true}).click();
 await panel.locator('.market-row').filter({hasText:'BTCUSD'}).dblclick();
 await page.waitForFunction(()=>document.querySelector('.market-data-tab.is-active')?.textContent.trim()==='Ticks');
 await page.waitForTimeout(450);
 if(!(await panel.innerText()).includes('BTCUSD')||(await panel.locator('.market-data-tab.is-active').innerText()).trim()!=='Ticks')throw Error('Double click changed symbol or reverted to Details');
 console.log('PASS: single click opens EURUSD Details; double click opens BTCUSD Ticks and stays there');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
