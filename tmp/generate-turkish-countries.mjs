import fs from 'node:fs';import {ALL_COUNTRIES} from '../src/utils/countries.js';
const en=new Intl.DisplayNames(['en'],{type:'region'});const tr=new Intl.DisplayNames(['tr'],{type:'region'});const map={};for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){const c=String.fromCharCode(i,j);const name=en.of(c);if(ALL_COUNTRIES.includes(name))map[name]=tr.of(c);}
Object.assign(map,{'Congo (Brazzaville)':tr.of('CG'),'Congo (Kinshasa)':tr.of('CD'),'Czech Republic':tr.of('CZ'),'East Timor':tr.of('TL'),'Ivory Coast':tr.of('CI'),'Vatican City':tr.of('VA'),'Turkey':tr.of('TR'),'Cape Verde':tr.of('CV')});
fs.writeFileSync('src/i18n/uiDictionary/trCountries.js','// Turkish country display names. Country identifiers and submitted values stay unchanged.\nexport default '+JSON.stringify(map,null,2)+';\n');
