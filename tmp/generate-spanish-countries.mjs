import fs from 'node:fs';import {ALL_COUNTRIES} from '../src/utils/countries.js';
const en=new Intl.DisplayNames(['en'],{type:'region'});const es=new Intl.DisplayNames(['es'],{type:'region'});const map={};for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){const c=String.fromCharCode(i,j);const name=en.of(c);if(ALL_COUNTRIES.includes(name))map[name]=es.of(c);}
Object.assign(map,{'Congo (Brazzaville)':es.of('CG'),'Congo (Kinshasa)':es.of('CD'),'Czech Republic':es.of('CZ'),'East Timor':es.of('TL'),'Ivory Coast':es.of('CI'),'Vatican City':es.of('VA'),'Turkey':es.of('TR'),'Cape Verde':es.of('CV')});
fs.writeFileSync('src/i18n/uiDictionary/esCountries.js','// Spanish country display names. Country identifiers and submitted values stay unchanged.\nexport default '+JSON.stringify(map,null,2)+';\n');
