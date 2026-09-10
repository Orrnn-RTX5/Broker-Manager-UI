const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
const page=await browser.newPage({viewport:{width:1100,height:500}});await page.goto('http://localhost:5180');
await page.evaluate(async()=>{
 const React=(await import('/node_modules/.vite/deps/react.js')).default;
 const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const src=await(await fetch('/src/hooks/useWorkspaceNavigation.js')).text();
 const {QueryClient,QueryClientProvider}=await import(src.match(/from ["']([^"']*tanstack[^"']*)["']/)[1]);
 const {MemoryRouter}=await import(src.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]);
 const {default:Tabs}=await import('/src/components/shell/WorkspaceTabs.jsx');await import('/src/styles/command-center.css');
 const host=document.createElement('div');host.className='rtx5-command-shell';host.style.cssText='position:fixed;inset:0;background:#181818';document.body.append(host);
 createRoot(host).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(MemoryRouter,{initialEntries:['/analytics/online-users']},React.createElement(Tabs))));
});
const widths=()=>page.locator('.cc-workspace-tab-shell').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
await page.getByRole('button',{name:'Close Exposure',exact:true}).waitFor();const before=await widths();
await page.getByRole('button',{name:'Close Exposure',exact:true}).click();const after=await widths();if(after.length!==4||after.some(w=>w!==before[0]))throw Error('Tabs resized after closing');
const gap=await page.evaluate(()=>{const tabs=document.querySelectorAll('.cc-workspace-tab-shell');return document.querySelector('.cc-workspace-add').getBoundingClientRect().left-tabs[tabs.length-1].getBoundingClientRect().right;});if(Math.abs(gap)>1)throw Error('Plus button not adjacent');
await page.setViewportSize({width:480,height:500});if(!await page.getByRole('button',{name:'Open quick navigation'}).isVisible())throw Error('Plus hidden on narrow viewport');
console.log({before,after,plusGap:gap,narrowPlusVisible:true});
 for(const name of ['Dashboard','Liquidity','Risk Monitor','Compliance']) await page.getByRole('button',{name:'Close '+name,exact:true}).click();
 await page.getByRole('button',{name:'Open quick navigation',exact:true}).click();
 const menu=page.getByRole('menu',{name:'Quick navigation'});await menu.waitFor();
 const bounds=await menu.boundingBox();const plus=await page.getByRole('button',{name:'Open quick navigation',exact:true}).boundingBox();
 if(bounds.x<0||bounds.x+bounds.width>480||Math.abs(bounds.x-plus.x)>1)throw Error('Empty tabs dropdown outside workspace');
 if(await menu.getByRole('menuitem').count()!==5)throw Error('Navigation items missing');
 await page.keyboard.press('Escape');if(await menu.isVisible())throw Error('Escape did not close menu');
 console.log('PASS: all tabs closed; dropdown opens below + with all five items visible; Escape closes it');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
