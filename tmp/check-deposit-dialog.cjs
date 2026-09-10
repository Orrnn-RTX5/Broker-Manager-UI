const {chromium}=require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
const page=await browser.newPage();await page.goto('http://localhost:5180');await page.evaluate(async()=>{
const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {default:Dialog}=await import('/src/components/Popups/DepositDialog.jsx');
const host=document.createElement('div');document.body.append(host);const root=createRoot(host);window.dismissed=0;window.confirmed=0;
window.renderDeposit=status=>root.render(React.createElement(Dialog,{status,message:status==='confirm'?'Deposit 100.00 into account #200003?':status==='error'?'The broker rejected this deposit.':'Deposit submitted successfully.',onConfirm:()=>{window.confirmed++;window.renderDeposit('pending')},onDismiss:()=>{window.dismissed++;root.render(null)}}));window.renderDeposit('confirm');});
await page.getByRole('button',{name:'Confirm deposit',exact:true}).click();if(!await page.getByRole('button',{name:'Please wait…'}).isDisabled())throw Error('Pending not disabled');await page.keyboard.press('Escape');if(await page.evaluate(()=>window.dismissed))throw Error('Pending dismissed');
await page.evaluate(()=>window.renderDeposit('success'));await page.getByRole('heading',{name:'Deposit successful'}).waitFor();await page.getByRole('button',{name:'Continue'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
await page.evaluate(()=>window.renderDeposit('error'));await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Back to deposit'}).click();if(await page.evaluate(()=>window.confirmed)!==1)throw Error('Retried automatically');
console.log('PASS: confirm, pending lock, success, error and dismissal; no automatic retry');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
