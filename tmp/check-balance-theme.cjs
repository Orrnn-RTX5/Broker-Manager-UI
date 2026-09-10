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
 await page.locator('.account-positions-body').waitFor();
 await page.evaluate(()=>{
  document.querySelector('.account-details-status')?.remove();
  document.querySelector('.account-positions-body').innerHTML='<div class="account-positions-empty">No open positions matching this account.</div>';
 });
 const emptyHeight=await page.locator('.account-positions-table-shell').evaluate(el=>el.getBoundingClientRect().height);
 if(emptyHeight>110)throw Error('Empty positions area is too tall: '+emptyHeight);
 console.log('Compact empty trade area:',emptyHeight);
 await page.evaluate(()=>{
  document.documentElement.classList.add('dark'); document.querySelector('.account-details-status')?.remove(); const body=document.querySelector('.account-positions-body');
  body.innerHTML=Array.from({length:6},(_,i)=>'<div class="account-positions-grid account-positions-row">'+['BTCUSD','BUY','0.01','79661.40000','0.00000','0.00000','79965.21000','0.00','3.04','<button class="account-position-close-button">CLOSE</button>'].map((v,j)=>'<div style="text-align:'+(j>1&&j<9?'right':'left')+'">'+v+'</div>').join('')+'</div>').join('');
 });
 const filled=await page.locator('.account-positions-table-shell').evaluate(el=>({height:el.getBoundingClientRect().height,scrolls:el.scrollHeight>el.clientHeight})); if(filled.height<=emptyHeight||!filled.scrolls)throw Error('Trade area did not expand and scroll'); console.log('Populated trade area:',filled);
 const result=await page.evaluate(()=>{
  const shell=document.querySelector('.account-positions-table-shell'),rows=document.querySelectorAll('.account-positions-row'),header=document.querySelector('.account-positions-header'),summary=document.querySelector('.account-balance-summary');
  return {twoRowsVisible:rows[1].getBoundingClientRect().bottom<=shell.getBoundingClientRect().bottom,columnsAligned:[...header.children].every((c,i)=>Math.abs(c.getBoundingClientRect().left-rows[0].children[i].getBoundingClientRect().left)<1),summaryBelowRows:summary.getBoundingClientRect().top>=rows[1].getBoundingClientRect().bottom};
 });
 console.log(result);if(Object.values(result).some(v=>!v))throw Error('Layout check failed');
 await page.screenshot({path:'tmp/account-overview-two-rows.png'});
 const appearance=await page.evaluate(()=>{
  const tab=document.querySelector('.account-details-tab.is-active'),style=getComputedStyle(tab);
  return {footerHidden:!document.querySelector('.account-details-footer'),noFill:style.backgroundColor==='rgba(0, 0, 0, 0)',noGlow:style.boxShadow==='none',border:style.borderTopWidth==='1px'};
 });
 console.log(appearance);if(Object.values(appearance).some(v=>!v))throw Error('Overview appearance check failed');
 await page.getByRole('tab',{name:'Personal',exact:true}).click();
 await page.locator('.account-details-footer').waitFor();
 console.log('Personal tab retains footer actions');
 await page.getByLabel('First name',{exact:true}).fill('Preview name');
 if(await page.getByLabel('First name',{exact:true}).inputValue()!=='Preview name')throw Error('Personal field editing failed');
 if(await page.locator('.account-personal-field').count()!==19)throw Error('Personal fields missing');
 if(!await page.getByLabel('Registered',{exact:true}).evaluate(el=>el.readOnly))throw Error('Registration should be read-only');
 await page.screenshot({path:'tmp/account-personal-redesign.png'});
 console.log('PASS: 19 personal fields, editable name, read-only registration');
 if(await page.getByRole('button',{name:'Minimize account details',exact:true}).count()) throw Error('Minimize button remains');
 await page.evaluate(()=>{const indicator=document.createElement('div');indicator.id='connection-check';indicator.className='cc-status-connection';indicator.textContent='Connected';document.body.append(indicator);});
 await page.getByRole('button',{name:'Maximize account details',exact:true}).click();
 if(await page.locator('#connection-check').isVisible())throw Error('Connection indicator remains maximized');
 await page.getByRole('button',{name:'Restore account details',exact:true}).click();
 if(!await page.locator('#connection-check').isVisible())throw Error('Connection indicator did not return');
 console.log('PASS: no minimize control; connection hidden on maximize and restored afterward');
 await page.getByRole('tab',{name:'Account',exact:true}).click();
 if(await page.locator('.account-trading-settings .account-section-heading-icon').count())throw Error('Account heading icon remains');
 const accountLayout=await page.locator('.account-trading-settings').evaluate(tab=>{
  const card=tab.querySelector('.account-settings-card'),grid=tab.querySelector('.account-settings-grid');
  tab.scrollTop=tab.scrollHeight;
  const note=tab.querySelector('.account-settings-note');
  return {fieldsNotClipped:grid.getBoundingClientRect().bottom<=card.getBoundingClientRect().bottom+1,canReachBottom:note.getBoundingClientRect().bottom<=tab.getBoundingClientRect().bottom+1};
 });
 console.log('Account layout:',accountLayout);if(Object.values(accountLayout).some(v=>!v))throw Error('Account fields clipped');
 await page.screenshot({path:'tmp/account-settings-visible.png'});
 await page.getByRole('tab',{name:'Limits',exact:true}).click();
 const limits=page.locator('.account-limits-tab');
 if(await limits.locator('svg').count())throw Error('Limits icons remain');
 await page.getByLabel('Margin call level',{exact:true}).fill('125');
 await page.getByLabel('Stop out level',{exact:true}).fill('60');
 const values=await limits.locator('.account-risk-preview dd').allTextContents();
 if(values.join(',')!=='125%,60%')throw Error('Threshold preview did not update');
 await page.getByRole('tab',{name:'Limits',exact:true}).focus();
 await page.screenshot({path:'tmp/account-limits-redesign.png'});
 console.log('PASS: Limits icons removed and editable thresholds update preview');
 await page.getByRole('tab',{name:'Balance',exact:true}).click();
 const balance=page.locator('.account-transaction-card');await balance.waitFor();
 await balance.getByRole('button',{name:'Transfer',exact:true}).click();
 await balance.getByLabel('Destination account login *',{exact:true}).fill('200002');
 await balance.locator('#transaction-amount').fill('10');
 console.log('Balance styling:',await balance.evaluate(el=>({background:getComputedStyle(el).backgroundColor,header:getComputedStyle(el.querySelector('.account-transaction-header')).backgroundColor,selectedBorder:getComputedStyle(el.querySelector('.is-selected')).borderColor,purpleClasses:el.querySelectorAll('[class*="purple"]').length})));
 await page.screenshot({path:'tmp/balance-dark-theme.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
