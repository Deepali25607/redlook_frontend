// Generates the source artwork for the Redlook Android launcher icon + splash.
//
// Theme: "girls shopping" — a chic shopping bag with a bow and a heart on a
// rose gradient (matches the Redlook fashion brand). Output PNGs land in
// assets/ and are consumed by `npx @capacitor/assets generate --android`,
// which fans them out to every mipmap density + the adaptive icon.
//
// Re-run after editing: `node scripts/generate-icon.mjs`
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets');
mkdirSync(out, { recursive: true });

// --- The shopping bag mark (girly: bow on top + heart on the front). ---------
// Drawn around centre (512,512); kept inside the adaptive-icon safe zone
// (~660px central circle) so launchers never clip it.
function bag({ scale = 1, cx = 512, cy = 512 } = {}) {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-512} ${-512})">
    <!-- handles -->
    <path d="M 410 405 C 410 320 478 320 478 405" fill="none"
          stroke="#ffffff" stroke-width="30" stroke-linecap="round"/>
    <path d="M 546 405 C 546 320 614 320 614 405" fill="none"
          stroke="#ffffff" stroke-width="30" stroke-linecap="round"/>
    <!-- bag body (trapezoid, rounded base) -->
    <path d="M 360 400 L 664 400 L 694 716 Q 696 742 670 742 L 354 742
             Q 328 742 330 716 Z" fill="url(#bagFill)"/>
    <!-- rim highlight -->
    <path d="M 360 400 L 664 400" stroke="#f7c9da" stroke-width="10"
          stroke-linecap="round" opacity="0.7"/>
    <!-- bow at the bag mouth (the 'girly' cue) -->
    <g fill="#ff5d8f">
      <path d="M 512 408 C 470 372 430 372 430 408 C 430 444 470 444 512 412 Z"/>
      <path d="M 512 408 C 554 372 594 372 594 408 C 594 444 554 444 512 412 Z"/>
      <circle cx="512" cy="410" r="17"/>
    </g>
    <!-- heart on the bag front -->
    <path d="M 512 632
             C 512 632 432 576 432 524
             C 432 494 458 474 484 474
             C 502 474 510 486 512 494
             C 514 486 522 474 540 474
             C 566 474 592 494 592 524
             C 592 576 512 632 512 632 Z" fill="#e8336d"/>
    <!-- sparkle -->
    <path d="M 648 372 L 658 402 L 688 412 L 658 422 L 648 452 L 638 422
             L 608 412 L 638 402 Z" fill="#ffffff" opacity="0.95"/>
  </g>`;
}

const defs = `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff8fb4"/>
      <stop offset="0.55" stop-color="#f1497f"/>
      <stop offset="1" stop-color="#d11f63"/>
    </linearGradient>
    <radialGradient id="bgGlow" cx="0.3" cy="0.25" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bagFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ffe6f0"/>
    </linearGradient>
  </defs>`;

// Adaptive-icon foreground: transparent background, just the mark.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs}
  ${bag()}
</svg>`;

// Adaptive-icon background: the rose gradient (gets masked to the platform shape).
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs}
  <rect width="1024" height="1024" fill="url(#bgGrad)"/>
  <rect width="1024" height="1024" fill="url(#bgGlow)"/>
</svg>`;

// Splash: gradient + centred (smaller) mark + wordmark.
function splash(bgStops) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <defs>
      <linearGradient id="sGrad" x1="0" y1="0" x2="1" y2="1">${bgStops}</linearGradient>
      <linearGradient id="bagFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe6f0"/>
      </linearGradient>
    </defs>
    <rect width="2732" height="2732" fill="url(#sGrad)"/>
    ${bag({ scale: 1.0, cx: 1366, cy: 1230 })}
    <text x="1366" y="1720" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
          font-size="190" font-weight="700" letter-spacing="14" fill="#ffffff">Redlook</text>
  </svg>`;
}

const splashLight = splash('<stop offset="0" stop-color="#ff8fb4"/><stop offset="0.55" stop-color="#f1497f"/><stop offset="1" stop-color="#d11f63"/>');
const splashDark = splash('<stop offset="0" stop-color="#7a1038"/><stop offset="1" stop-color="#3d0a20"/>');

const jobs = [
  ['icon-foreground.png', foreground, 1024],
  ['icon-background.png', background, 1024],
  ['icon-only.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" rx="220" fill="url(#bgGrad)"/><rect width="1024" height="1024" rx="220" fill="url(#bgGlow)"/>${bag({ scale: 0.9 })}</svg>`, 1024],
  ['splash.png', splashLight, 2732],
  ['splash-dark.png', splashDark, 2732],
];

for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(out, name));
  console.log('wrote assets/' + name);
}
console.log('done');
