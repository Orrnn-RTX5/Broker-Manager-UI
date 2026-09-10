const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async () => {
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:925,height:585}});
 page.on('pageerror',e=>console.log(e.message)); await page.goto('http://localhost:5180');
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const hooksSource=await (await fetch('/src/hooks/usePermissions.js')).text(); const queryPath=hooksSource.match(/from ["']([^"']*tanstack[^"']*)["']/)[1]; const {QueryClient,QueryClientProvider}=await import(queryPath);
  const {default:Modal}=await import('/src/components/Popups/AccountDetailsModal.jsx');
  window.fetch=async()=>new Response(JSON.stringify({}),{headers:{'Content-Type':'application/json'}});
  const host=document.createElement('div');document.body.append(host);
  createRoot(host).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(Modal,{account:{login:200001,name:'TEST TEST',group:'demo/STD',currency:'USD'},onClose:()=>{}})));
 });
 await page.evaluate(async()=>{
  const {default:store}=await import('/src/store/symbolStore.js');window.tradePreviewStore=store;
  store.setState({initWebSocket:()=>{},isConnected:true,feedError:''});
  store.getState().upsertSymbols([{symbol:'EURUSD',bid:1.08321,ask:1.08335}]);
 });
 await page.evaluate(()=>document.documentElement.classList.add('dark')); await page.getByRole('tab',{name:'Trade',exact:true}).click();
 await page.locator('.account-trade-chart polyline').first().waitFor({state:'attached'});
 const timing=await page.evaluate(async()=>{
  const start=performance.now();
  window.tradePreviewStore.getState().upsertSymbols([{symbol:'EURUSD',bid:1.08325,ask:1.08339}]);
  await new Promise(requestAnimationFrame);
  return performance.now()-start;
 });
 console.log('Shared quote update to animation frame (ms):',timing);
 await page.screenshot({path:'tmp/account-trade-redesign.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
