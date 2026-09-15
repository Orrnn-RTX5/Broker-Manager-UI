import fs from 'node:fs';import de from '../src/i18n/uiDictionary/de.js';import locale from '../src/i18n/locales/de.js';import {lookupTranslation} from '../src/i18n/translatorEngine.js';
const known=new Set([...Object.values(de),...Object.values(locale)].map(s=>s.toLowerCase()));const a=JSON.parse(fs.readFileSync('tmp/german-dialog-audit.json'));
for(const {name,texts} of a){const misses=texts.filter(t=>/[a-z]{3}/i.test(t)&&!known.has(t.toLowerCase())&&!t.includes('@')&&!/^\d|^Test|^test|^BTC|^EUR|^USD|^XAU|^NAS|^GBP|^ETH|^A[A-Z]/.test(t));console.log(name+': '+JSON.stringify(misses));}
