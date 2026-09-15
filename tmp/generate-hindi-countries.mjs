import fs from 'node:fs';import {ALL_COUNTRIES} from '../src/utils/countries.js';
const en=new Intl.DisplayNames(['en'],{type:'region'});const hi=new Intl.DisplayNames(['hi'],{type:'region'});const map={};for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){const c=String.fromCharCode(i,j);const name=en.of(c);if(ALL_COUNTRIES.includes(name))map[name]=hi.of(c);}
Object.assign(map,{'Congo (Brazzaville)':hi.of('CG'),'Congo (Kinshasa)':hi.of('CD'),'Czech Republic':hi.of('CZ'),'East Timor':hi.of('TL'),'Ivory Coast':hi.of('CI'),'Vatican City':hi.of('VA'),'Turkey':hi.of('TR'),'Cape Verde':hi.of('CV')});
fs.writeFileSync('src/i18n/uiDictionary/hiCountries.js','// Hindi country display names. Country identifiers and submitted values stay unchanged.\nexport default '+JSON.stringify(map,null,2)+';\n');
