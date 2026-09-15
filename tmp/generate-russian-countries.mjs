import fs from 'node:fs';import {ALL_COUNTRIES} from '../src/utils/countries.js';
const en=new Intl.DisplayNames(['en'],{type:'region'});const ru=new Intl.DisplayNames(['ru'],{type:'region'});const map={};for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){const c=String.fromCharCode(i,j);const name=en.of(c);if(ALL_COUNTRIES.includes(name))map[name]=ru.of(c);}
Object.assign(map,{'Congo (Brazzaville)':ru.of('CG'),'Congo (Kinshasa)':ru.of('CD'),'Czech Republic':ru.of('CZ'),'East Timor':ru.of('TL'),'Ivory Coast':ru.of('CI'),'Vatican City':ru.of('VA'),'Turkey':ru.of('TR'),'Cape Verde':ru.of('CV')});
fs.writeFileSync('src/i18n/uiDictionary/ruCountries.js','// Russian country display names. Country identifiers and submitted values stay unchanged.\nexport default '+JSON.stringify(map,null,2)+';\n');
