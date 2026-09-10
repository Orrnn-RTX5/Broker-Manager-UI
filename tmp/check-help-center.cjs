const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
const page=await browser.newPage();await page.goto('http://localhost:5180');await page.evaluate(async()=>{
const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
const {default:HelpCenter}=await import('/src/components/HelpCenter.jsx');window.rtx5Updater={checkForUpdates:async()=>({status:'not-available',message:'You are up to date.'})};
const host=document.createElement('div');document.body.append(host);const root=createRoot(host);root.render(React.createElement(HelpCenter,{onClose:()=>root.unmount()}));});
const dialog=page.getByRole('dialog',{name:'Help Center'});await dialog.waitFor();
await dialog.getByPlaceholder('Search accounts, prices, workspace…').fill('Market Watch');if(await dialog.locator('section').count()!==1)throw Error('Search failed');
await dialog.getByRole('button',{name:'Updates',exact:true}).click();await dialog.getByRole('button',{name:'Check for updates',exact:true}).click();await dialog.getByRole('status').filter({hasText:'You are up to date.'}).waitFor();
await page.evaluate(()=>{window.rtx5Updater.checkForUpdates=async()=>{throw Error('Connection unavailable')}});
await dialog.getByRole('button',{name:'Check for updates',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Connection unavailable'}).waitFor();
await dialog.getByRole('button',{name:'Support',exact:true}).click();await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('Unable to connect to the market feed.');
await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});console.log('PASS: Help search, update success/error, support editing and Escape dismissal');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
