/* Generates all app icon assets from the Plategram logo.
   Source: assets/logo-source.png (the full lockup the user supplied).
   Run with: node scripts/make-icons.js */
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'logo-source.png');
const TEAL = { r: 0, g: 31, b: 32 }; // sampled from the logo background
const out = (name) => path.join(__dirname, '..', 'assets', name);

// tight bounds around just the plate emblem in the 201x201 lockup
// (kept clear of the wordmark below; teal padding is added afterward)
const EMBLEM_BOX = { left: 54, top: 22, width: 94, height: 90 };

function emblem(size) {
  return sharp(SRC).extract(EMBLEM_BOX).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
}

async function tealTile(size, emblemScale) {
  const e = Math.round(size * emblemScale);
  const emb = await emblem(e);
  return sharp({ create: { width: size, height: size, channels: 4, background: { ...TEAL, alpha: 1 } } })
    .composite([{ input: emb, gravity: 'center' }])
    .png().toBuffer();
}

async function transparentEmblem(size, emblemScale) {
  const e = Math.round(size * emblemScale);
  const emb = await emblem(e);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: emb, gravity: 'center' }])
    .png().toBuffer();
}

async function main() {
  // iOS home screen icon: emblem on the teal background, padded
  await sharp(await tealTile(1024, 0.62)).png().toFile(out('icon.png'));

  // splash: the full lockup, upscaled, kept on its own teal so it blends
  await sharp(SRC).resize(560, 560, { kernel: 'lanczos3' }).png().toFile(out('splash-icon.png'));

  // Android adaptive layers (background teal, emblem floats in the safe zone)
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { ...TEAL, alpha: 1 } } })
    .png().toFile(out('android-icon-background.png'));
  const fg = await transparentEmblem(1024, 0.55);
  await sharp(fg).png().toFile(out('android-icon-foreground.png'));
  await sharp(fg).png().toFile(out('android-icon-monochrome.png'));

  // emblem tile used as the in-app brand mark (onboarding, paywall)
  await sharp(await tealTile(240, 0.66)).png().toFile(out('emblem.png'));

  // web favicon
  await sharp(await tealTile(192, 0.66)).resize(64, 64).png().toFile(out('favicon.png'));

  console.log('All icon assets written from logo-source.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
