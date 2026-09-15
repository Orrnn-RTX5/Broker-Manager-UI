import fs from 'node:fs';
const p='src/styles/command-center.css';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('.cc-map-visual {');
const end=s.indexOf('.cc-region-columns',start);
s=s.slice(0,start)+`/* Natural Earth geography with quiet, atlas-style country boundaries. */
.cc-map-visual { position:relative; height:clamp(150px, 13vw, 210px); overflow:hidden; border-bottom:1px solid var(--border-2); background:var(--cc-map-water); padding:6px 10px 25px; }
.cc-map-visual svg { display:block; width:100%; height:100%; overflow:visible; }
.cc-map-grid { fill:none; stroke:var(--cc-map-coast); stroke-width:.45; opacity:.13; }
.cc-map-land { stroke:var(--cc-map-coast); stroke-width:.65; stroke-linejoin:round; }
.cc-map-borders { fill:none; stroke:var(--cc-map-coast); stroke-width:.4; stroke-linejoin:round; opacity:.55; }
.cc-map-markers .halo { fill:var(--success); fill-opacity:.10; stroke:var(--success); stroke-opacity:.32; stroke-width:.7; }
.cc-map-markers .core { fill:var(--success); stroke:var(--bg-panel); stroke-width:1.2; }
.cc-map-caption { position:absolute; right:12px; bottom:9px; left:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--text-tertiary); font-size:8px; line-height:1; }
.cc-map-caption > span:first-child { font-size:7px; letter-spacing:.13em; }
.cc-map-caption > span:last-child { display:inline-flex; align-items:center; gap:5px; }
.cc-map-caption i { width:4px; height:4px; border-radius:50%; background:var(--success); }
`+s.slice(end);
s=s.replace('--cc-map-land-top: #505050;', '--cc-map-land-top: #404744;').replace('--cc-map-land-bottom: #303030;', '--cc-map-land-bottom: #303633;').replace('--cc-map-coast: #808080;', '--cc-map-coast: #7a8981;');
fs.writeFileSync(p,s);
