const fs=require('node:fs');let s=fs.readFileSync('tmp/audit-german-dialogs.cjs','utf8').replaceAll('german','hindi').replaceAll('GERMAN_AUDIT_PASSWORD','HINDI_AUDIT_PASSWORD').replaceAll("'de'","'hi'");
s=s.replace("['Datei','Bearbeiten','Ansicht','Extras','Fenster','Hilfe']","['फ़ाइल','संपादित करें','देखें','उपकरण','विंडो','मदद']").replaceAll('Neues Konto','नया खाता').replaceAll('Abbrechen','रद्द करें');
s=s.replace("const cdp=await page.context().newCDPSession(page);", "await page.locator('.data-state-card').first().waitFor({timeout:30000});await page.waitForTimeout(400);const cdp=await page.context().newCDPSession(page);");
fs.writeFileSync('tmp/audit-hindi-dialogs.cjs',s);
