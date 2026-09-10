const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.goto('http://localhost:5180');
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const source=await(await fetch('/src/hooks/usePermissions.js')).text();
  const {QueryClient,QueryClientProvider}=await import(source.match(/from ["']([^"']*tanstack[^"']*)["']/)[1]);
  const {default:Dashboard}=await import('/src/features/dashboard/Dashboard.jsx');
  const {default:Sidebar}=await import('/src/components/MarginCallsSidebar.jsx');
  const {default:Provider}=await import('/src/components/docking/DockingProvider.jsx');
  const ctxSource=await(await fetch('/src/components/docking/DockingProvider.jsx')).text();
  const {useDockingContext}=await import(ctxSource.match(/from ["']([^"']*DockingContext[^"']*)["']/)[1]);
  window.fetch=()=>new Promise(()=>{});
  const client=new QueryClient();client.setQueryData(['sidebar-accounts',''],{rows:[{login:'111111',group:'Real',balance:100},{login:'222222',group:'demo/STD',balance:500}],total:2});
  function Preview(){const {panels}=useDockingContext();const p=panels.accounts;return React.createElement(React.Fragment,null,React.createElement(Dashboard),p.visible&&React.createElement('aside',{'data-testid':'accounts'},React.createElement('h2',null,p.title),React.createElement(Sidebar,{key:p.accountType,accountType:p.accountType,isAuthenticated:true})));}
  const host=document.createElement('div');document.body.append(host);createRoot(host).render(React.createElement(QueryClientProvider,{client},React.createElement(Provider,{initialPanels:{accounts:{visible:false},owner_console:{visible:true}}},React.createElement(Preview))));
 });
 await page.getByRole('button',{name:'Show real accounts',exact:true}).click();
 let text=await page.locator('[data-testid="accounts"]').innerText();if(!text.includes('111111')||text.includes('222222'))throw Error('Real filter failed: '+text);
 await page.getByRole('button',{name:'Show demo accounts',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByRole('heading',{name:'Demo Accounts',exact:true}).waitFor();
 text=await page.locator('[data-testid="accounts"]').innerText();if(!text.includes('222222')||text.includes('111111'))throw Error('Demo filter failed: '+text);
 console.log('PASS: Real click and Demo keyboard activation display only matching accounts');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
