const sharp = require('sharp');

async function analyze(file, bg) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4
  // bg: 'white' or 'dark'
  const isContent = (r, g, b, a) => {
    if (a < 20) return false; // transparent
    if (bg === 'white') {
      // content = anything noticeably darker/colored than white
      return !(r > 235 && g > 235 && b > 235);
    } else {
      // dark bg ~ (43,45,58). content = brighter/colored
      return !(r < 70 && g < 75 && b < 90);
    }
  };

  // column occupancy
  const colCount = new Array(width).fill(0);
  const rowCount = new Array(height).fill(0);
  // also track green content per column to locate the green X and the "5" box
  const greenCol = new Array(width).fill(0);
  const isGreen = (r, g, b) => g > 140 && g > r + 25 && g > b + 40 && r > 80;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (isContent(r, g, b, a)) {
        colCount[x]++;
        rowCount[y]++;
        if (isGreen(r, g, b)) greenCol[x]++;
      }
    }
  }

  // find content column runs (gap = columns with count==0 over a stretch)
  const thr = 1;
  const runs = [];
  let start = -1;
  for (let x = 0; x < width; x++) {
    const on = colCount[x] >= thr;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, width - 1]);
  // merge runs separated by small gaps (< gapMerge px) to keep letters together
  const gapMerge = Math.round(width * 0.012);
  const merged = [];
  for (const r of runs) {
    if (merged.length && r[0] - merged[merged.length - 1][1] <= gapMerge) {
      merged[merged.length - 1][1] = r[1];
    } else merged.push([...r]);
  }

  // row bbox
  let top = -1, bot = -1;
  for (let y = 0; y < height; y++) if (rowCount[y] >= thr) { if (top < 0) top = y; bot = y; }

  // green-heavy column clusters (to identify X emblem on far left)
  let gStart = -1; const greenRuns = [];
  for (let x = 0; x < width; x++) {
    const on = greenCol[x] >= 3;
    if (on && gStart < 0) gStart = x;
    if (!on && gStart >= 0) { greenRuns.push([gStart, x - 1]); gStart = -1; }
  }
  if (gStart >= 0) greenRuns.push([gStart, width - 1]);

  console.log(`\n=== ${file} (${width}x${height}) bg=${bg} ===`);
  console.log('row bbox: top', top, 'bot', bot, 'height', bot - top);
  console.log('content column runs (merged, gap<=' + gapMerge + '):');
  merged.forEach((r, i) => console.log(`  [${i}] x ${r[0]}..${r[1]} (w=${r[1]-r[0]})`));
  console.log('green column runs:');
  greenRuns.forEach((r, i) => console.log(`  [${i}] x ${r[0]}..${r[1]} (w=${r[1]-r[0]})`));
}

(async () => {
  await analyze('public/brand-logo.png', 'white');
  await analyze('public/rtx5-logo.png', 'dark');
})();
