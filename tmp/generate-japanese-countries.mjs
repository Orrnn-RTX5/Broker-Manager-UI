import fs from 'node:fs';import {ALL_COUNTRIES} from '../src/utils/countries.js';
const en=new Intl.DisplayNames(['en'],{type:'region'});const ja=new Intl.DisplayNames(['ja'],{type:'region'});const map={};for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){const c=String.fromCharCode(i,j);const name=en.of(c);if(ALL_COUNTRIES.includes(name))map[name]=ja.of(c);}
Object.assign(map,{'Congo (Brazzaville)':ja.of('CG'),'Congo (Kinshasa)':ja.of('CD'),'Czech Republic':ja.of('CZ'),'East Timor':ja.of('TL'),'Ivory Coast':ja.of('CI'),'Vatican City':ja.of('VA'),'Turkey':ja.of('TR'),'Cape Verde':ja.of('CV')});
fs.writeFileSync('src/i18n/uiDictionary/jaCountries.js','// Japanese country display names. Country identifiers and submitted values stay unchanged.\nexport default '+JSON.stringify(map,null,2)+';\n');
