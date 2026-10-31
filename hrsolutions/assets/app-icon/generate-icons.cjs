/**
 * Rasterize the Pixbe login pixel mark into Android/iOS launcher icons.
 * Geometry matches .pixbe-pixel in figma-onboarding.css (28×28, #17324e).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const NAVY = '#17324e';
const BG = '#FFFFFF';
const ROOT = path.resolve(__dirname, '..', '..');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const IOS_ICON = path.join(
  ROOT,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png'
);

/** Pixel mark in a 108 viewBox (Android adaptive), centered in the ~66% safe zone. */
function markSvg({ size, fill, background }) {
  // Mark occupies ~42% of canvas so adaptive safe-zone + padding look good.
  const mark = size * 0.42;
  const scale = mark / 28;
  const ox = (size - mark) / 2;
  const oy = (size - mark) / 2;
  const r = 3 * scale;
  const stem = { x: ox, y: oy, w: 8 * scale, h: 28 * scale };
  const a = { x: ox + 12 * scale, y: oy, w: 16 * scale, h: 12 * scale };
  const b = { x: ox + 12 * scale, y: oy + 16 * scale, w: 10 * scale, h: 12 * scale };

  const rect = (p) =>
    `<rect x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${p.w.toFixed(2)}" height="${p.h.toFixed(2)}" rx="${r.toFixed(2)}" fill="${fill}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}
  ${rect(stem)}
  ${rect(a)}
  ${rect(b)}
</svg>`;
}

async function pngFromSvg(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

async function roundPng(svg, size, outPath) {
  const circle = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
</svg>`);
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(base)
    .composite([{ input: await sharp(circle).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(outPath);
}

const densities = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

(async () => {
  for (const d of densities) {
    const dir = path.join(ANDROID_RES, d.folder);
    fs.mkdirSync(dir, { recursive: true });
    const full = markSvg({ size: d.launcher, fill: NAVY, background: BG });
    const fg = markSvg({ size: d.foreground, fill: NAVY, background: null });
    await pngFromSvg(full, path.join(dir, 'ic_launcher.png'));
    await roundPng(full, d.launcher, path.join(dir, 'ic_launcher_round.png'));
    await pngFromSvg(fg, path.join(dir, 'ic_launcher_foreground.png'));
    console.log('android', d.folder);
  }

  // Master 1024 for iOS
  const iosSvg = markSvg({ size: 1024, fill: NAVY, background: BG });
  await pngFromSvg(iosSvg, IOS_ICON);
  console.log('ios AppIcon-512@2x.png');

  // Keep a source SVG for reference
  const src = path.join(__dirname, 'pixbe-pixel-mark.svg');
  fs.writeFileSync(src, markSvg({ size: 1024, fill: NAVY, background: BG }));
  console.log('wrote', src);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
