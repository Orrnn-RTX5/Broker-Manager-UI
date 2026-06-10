const sharp = require('sharp');
const fs = require('fs');

// Wordmark "RTX5" region (green X emblem removed), from analysis — same on both files.
const WORD = { left: 1608, top: 1902, right: 3733, bottom: 2708 };
const w = WORD.right - WORD.left + 1; // 2126
const h = WORD.bottom - WORD.top + 1; // 807

async function sampleBg(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  // sample top-left corner (x=20,y=20)
  const i = (20 * info.width + 20) * ch;
  return { r: data[i], g: data[i + 1], b: data[i + 2], alpha: 1 };
}

async function build(srcFile, outFile) {
  const bg = await sampleBg(srcFile);
  // extract just the wordmark
  const word = await sharp(srcFile).extract({ left: WORD.left, top: WORD.top, width: w, height: h }).png().toBuffer();

  // padding around the wordmark — modest, balanced logo margins (~10%)
  const padX = 90;
  const padY = 80;
  const canvasW = w + padX * 2;
  const canvasH = h + padY * 2;

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: word, left: padX, top: padY }])
    .png()
    .toFile(outFile);

  const meta = await sharp(outFile).metadata();
  console.log(`${outFile}: ${meta.width}x${meta.height}  bg=rgb(${bg.r},${bg.g},${bg.b})  wordmark=${w}x${h}`);
}

(async () => {
  // backup originals
  for (const f of ['brand-logo.png', 'rtx5-logo.png']) {
    fs.copyFileSync(`public/${f}`, `tmp/${f}.orig`);
  }
  await build('tmp/brand-logo.png.orig', 'public/brand-logo.png');
  await build('tmp/rtx5-logo.png.orig', 'public/rtx5-logo.png');
  console.log('done');
})();
