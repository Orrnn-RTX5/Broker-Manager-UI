const {chromium}=require('./browser-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{const page=await browser.newPage();await page.goto('http://localhost:5180/manager-login');console.log(JSON.stringify(await page.evaluate(async()=>{
const React=(await import('/node_modules/.vite/deps/react.js')).default;
const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
const path='/src/features/symbols/tabs/SymbolsTab.jsx';
const source=await (await fetch(path)).text();
const apiPath=source.match(/from "([^\"]*\/services\/api\.js[^\"]*)"/)[1];
const api=await import(apiPath);
const apiSource=await (await fetch(apiPath)).text();
const clientPath=apiSource.match(/from "([^\"]*\/apiClient\.js[^\"]*)"/)[1];
const client=(await import(clientPath)).default;
const Component=(await import(path)).default;
const rows=Array.from({length:5},(_,i)=>({symbol:['BTCUSD','EURUSD','GBPUSD','USDJPY','XAUUSD'][i],digits:5,enabled:true,symbolType:'base',contractSize:100000,spread:10,calcMode:'forex'}));
let delay=0;let requests=0;
client.get=async endpoint=>{requests++;if(delay)await new Promise(r=>setTimeout(r,delay));if(endpoint.startsWith('/SymbolsList'))return rows.map(r=>r.symbol);if(endpoint.startsWith('/SymbolsParams'))return rows;if(endpoint.startsWith('/SymbolCategoryList'))return [];throw Error('Unexpected fixture endpoint');};
const results=[];
for(const mode of ['cold','cached','cached','cached','cached','cached']){
if(mode==='cold'){api.invalidateSymbolManagementData();delay=2500;}else{delay=0;}
const host=document.createElement('div');host.style='position:fixed;inset:0;z-index:99999;background:white';document.body.append(host);const root=createRoot(host);const started=performance.now();const requestStart=requests;
const result=await new Promise(resolve=>{const observer=new MutationObserver(()=>{if(host.querySelector('tbody tr td:nth-child(4)')?.textContent.trim()!=='5')return;observer.disconnect();requestAnimationFrame(()=>resolve({mode,rows:5,readyMs:+(performance.now()-started).toFixed(1),requests:requests-requestStart}));});observer.observe(host,{subtree:true,childList:true,characterData:true});root.render(React.createElement(Component));});results.push(result);root.unmount();host.remove();
}
return results;
})));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
