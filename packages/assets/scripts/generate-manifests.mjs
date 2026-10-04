#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFESTS_DIR = path.resolve(__dirname, '../src/manifests');
const DIST_ATLASES_DIR = path.resolve(__dirname, '../dist/atlases');

if (!fs.existsSync(MANIFESTS_DIR)) {
  fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
}

export function calculateMaxBottom(frames) {
  const values = Object.values(frames);
  if (values.length === 0) return 0;
  return Math.max(...values.map((f) => f.frame.y + f.frame.h));
}

export function calculateMaxRight(frames) {
  const values = Object.values(frames);
  if (values.length === 0) return 0;
  return Math.max(...values.map((f) => f.frame.x + f.frame.w));
}

/**
 * Creates an actual, valid PNG atlas image buffer corresponding to the manifest layout.
 * If source sprites exist in spritesDir, composites them onto the canvas.
 * Otherwise, generates an accurate framed canvas with pixel-matching dimensions.
 */
export function createAtlasPng(manifest, spritesDir = null) {
  const { w, h } = manifest.meta.size;
  const atlas = new PNG({ width: w, height: h });

  for (const [key, frameData] of Object.entries(manifest.frames)) {
    const { x, y, w: fw, h: fh } = frameData.frame;
    let composited = false;

    if (spritesDir && fs.existsSync(spritesDir)) {
      const candidates = [
        path.join(spritesDir, `${key}.png`),
        path.join(spritesDir, key.replace(/^char-[a-z]+-/, '') + '.png'),
        path.join(spritesDir, key.replace(/^tile-isometric-/, '') + '.png'),
        path.join(spritesDir, key.replace(/^button-/, '') + '.png'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            const spritePng = PNG.sync.read(fs.readFileSync(candidate));
            PNG.bitblt(
              spritePng,
              atlas,
              0,
              0,
              Math.min(fw, spritePng.width),
              Math.min(fh, spritePng.height),
              x,
              y
            );
            composited = true;
            break;
          } catch {
            // fallback to rendered frame
          }
        }
      }
    }

    if (!composited) {
      // Draw crisp frame boundaries so the generated sheet is visually inspectable
      for (let px = 0; px < fw; px++) {
        for (let py = 0; py < fh; py++) {
          const idx = ((y + py) * w + (x + px)) << 2;
          const isBorder = px === 0 || px === fw - 1 || py === 0 || py === fh - 1;
          if (isBorder) {
            atlas.data[idx] = 180;
            atlas.data[idx + 1] = 190;
            atlas.data[idx + 2] = 210;
            atlas.data[idx + 3] = 255;
          } else {
            atlas.data[idx] = 25;
            atlas.data[idx + 1] = 30;
            atlas.data[idx + 2] = 40;
            atlas.data[idx + 3] = 230;
          }
        }
      }
    }
  }

  return PNG.sync.write(atlas);
}

// ─── 1. Playing Cards Atlas ──────────────────────────────────────────────────
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const VALUES = ['a', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'j', 'q', 'k'];
const CARDBACKS = ['blue', 'red', 'green', 'yellow', 'cyan', 'default'];

const playingCardFrames = {};
const playingCardKeys = [];

let cardX = 0;
let cardY = 0;
const CARD_W = 140;
const CARD_H = 190;
const ATLAS_MAX_W = 2048;

for (const suit of SUITS) {
  for (const val of VALUES) {
    const key = `card-${suit}-${val}`;
    playingCardKeys.push(key);
    playingCardFrames[key] = {
      frame: { x: cardX, y: cardY, w: CARD_W, h: CARD_H },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: CARD_W, h: CARD_H },
      sourceSize: { w: CARD_W, h: CARD_H },
      anchor: { ax: 0.5, ay: 0.5 },
    };
    cardX += CARD_W;
    if (cardX + CARD_W > ATLAS_MAX_W) {
      cardX = 0;
      cardY += CARD_H;
    }
  }
}

for (const back of CARDBACKS) {
  const key = `cardback-${back}`;
  playingCardKeys.push(key);
  playingCardFrames[key] = {
    frame: { x: cardX, y: cardY, w: CARD_W, h: CARD_H },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: CARD_W, h: CARD_H },
    sourceSize: { w: CARD_W, h: CARD_H },
    anchor: { ax: 0.5, ay: 0.5 },
  };
  cardX += CARD_W;
  if (cardX + CARD_W > ATLAS_MAX_W) {
    cardX = 0;
    cardY += CARD_H;
  }
}

const playingCardsAtlas = {
  meta: {
    app: 'sunshade-atlas-pipeline',
    version: '1.0.0',
    image: 'https://cdn.sunshade.icu/assets/kenney/cards/playing-cards-atlas.png',
    format: 'RGBA8888',
    size: { w: ATLAS_MAX_W, h: calculateMaxBottom(playingCardFrames) },
    scale: '1',
    pack: 'playing-cards',
  },
  frames: playingCardFrames,
};

// ─── 2. Isometric Tiles Atlas ────────────────────────────────────────────────
const ISO_TILE_NAMES = [
  'tile-isometric-grass',
  'tile-isometric-dirt',
  'tile-isometric-stone',
  'tile-isometric-water',
  'tile-isometric-sand',
  'tile-isometric-wood-floor',
  'tile-isometric-dungeon-floor',
  'tile-isometric-wall-stone',
  'tile-isometric-wall-wood',
  'tile-isometric-wall-corner',
  'tile-isometric-stairs-stone',
  'tile-isometric-stairs-wood',
  'tile-isometric-door-closed',
  'tile-isometric-door-open',
  'tile-isometric-chest-closed',
  'tile-isometric-chest-open',
  'tile-isometric-barrel',
  'tile-isometric-crate',
  'tile-isometric-bookshelf',
  'tile-isometric-table',
  'tile-isometric-chair',
  'tile-isometric-pillar',
  'tile-isometric-torch',
  'tile-isometric-rug',
];

const isoFrames = {};
let isoX = 0;
let isoY = 0;
const ISO_W = 256;
const ISO_H = 128;

for (const tile of ISO_TILE_NAMES) {
  isoFrames[tile] = {
    frame: { x: isoX, y: isoY, w: ISO_W, h: ISO_H },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: ISO_W, h: ISO_H },
    sourceSize: { w: ISO_W, h: ISO_H },
    anchor: { ax: 0.5, ay: 0.75 },
  };
  isoX += ISO_W;
  if (isoX + ISO_W > ATLAS_MAX_W) {
    isoX = 0;
    isoY += ISO_H;
  }
}

const isometricAtlas = {
  meta: {
    app: 'sunshade-atlas-pipeline',
    version: '1.0.0',
    image: 'https://cdn.sunshade.icu/assets/kenney/isometric-miniature-dungeon/isometric-tiles-atlas.png',
    format: 'RGBA8888',
    size: { w: ATLAS_MAX_W, h: calculateMaxBottom(isoFrames) },
    scale: '1',
    pack: 'isometric-tiles',
  },
  frames: isoFrames,
};

// ─── 3. Modular Characters Atlas ─────────────────────────────────────────────
const CHAR_CATEGORIES = {
  face: ['face-0', 'face-1', 'face-2', 'face-3', 'face-4', 'face-5', 'face-6', 'face-7'],
  hair: ['hair-blonde-0', 'hair-blonde-1', 'hair-brown-0', 'hair-brown-1', 'hair-black-0', 'hair-black-1', 'hair-red-0'],
  pants: ['pants-blue-0', 'pants-blue-1', 'pants-green-0', 'pants-red-0', 'pants-black-0', 'pants-white-0'],
  shirts: ['shirt-blue-0', 'shirt-blue-1', 'shirt-green-0', 'shirt-red-0', 'shirt-black-0', 'shirt-white-0'],
  shoes: ['shoes-brown-0', 'shoes-black-0', 'shoes-white-0', 'shoes-red-0'],
  skin: ['skin-beige-0', 'skin-brown-0', 'skin-dark-0', 'skin-light-0'],
};

const charFrames = {};
const charKeys = [];
let charX = 0;
let charY = 0;
const CHAR_W = 128;
const CHAR_H = 128;

for (const [cat, items] of Object.entries(CHAR_CATEGORIES)) {
  for (const item of items) {
    const key = `char-${cat}-${item}`;
    charKeys.push(key);
    charFrames[key] = {
      frame: { x: charX, y: charY, w: CHAR_W, h: CHAR_H },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: CHAR_W, h: CHAR_H },
      sourceSize: { w: CHAR_W, h: CHAR_H },
      anchor: { ax: 0.5, ay: 0.5 },
    };
    charX += CHAR_W;
    if (charX + CHAR_W > ATLAS_MAX_W) {
      charX = 0;
      charY += CHAR_H;
    }
  }
}

const charactersAtlas = {
  meta: {
    app: 'sunshade-atlas-pipeline',
    version: '1.0.0',
    image: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/modular-characters-atlas.png',
    format: 'RGBA8888',
    size: { w: ATLAS_MAX_W, h: calculateMaxBottom(charFrames) },
    scale: '1',
    pack: 'modular-characters',
  },
  frames: charFrames,
};

// ─── 4. UI Sprites Atlas ─────────────────────────────────────────────────────
const UI_SPRITE_NAMES = [
  'button-default',
  'button-hover',
  'button-pressed',
  'button-disabled',
  'button-round-blue',
  'button-round-green',
  'button-round-red',
  'button-round-yellow',
  'panel-wooden',
  'panel-metal',
  'panel-glass',
  'icon-checkmark',
  'icon-cross',
  'icon-arrow-up',
  'icon-arrow-down',
  'icon-arrow-left',
  'icon-arrow-right',
  'icon-settings',
  'icon-star',
  'slider-bar',
  'slider-knob',
  'bar-progress-bg',
  'bar-progress-fill',
];

const uiFrames = {};
let uiX = 0;
let uiY = 0;
const UI_W = 128;
const UI_H = 128;

for (const sprite of UI_SPRITE_NAMES) {
  uiFrames[sprite] = {
    frame: { x: uiX, y: uiY, w: UI_W, h: UI_H },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: UI_W, h: UI_H },
    sourceSize: { w: UI_W, h: UI_H },
    anchor: { ax: 0.5, ay: 0.5 },
  };
  uiX += UI_W;
  if (uiX + UI_W > ATLAS_MAX_W) {
    uiX = 0;
    uiY += UI_H;
  }
}

const uiAtlas = {
  meta: {
    app: 'sunshade-atlas-pipeline',
    version: '1.0.0',
    image: 'https://cdn.sunshade.icu/assets/kenney/ui-pack/ui-sprites-atlas.png',
    format: 'RGBA8888',
    size: { w: ATLAS_MAX_W, h: calculateMaxBottom(uiFrames) },
    scale: '1',
    pack: 'ui-sprites',
  },
  frames: uiFrames,
};

// ─── 5. Generator Function ──────────────────────────────────────────────────
export function generateAllManifests(options = {}) {
  const manifestsDir = options.manifestsDir || MANIFESTS_DIR;
  const generateImages = options.generateImages ?? true;
  const imagesDir = options.imagesDir || DIST_ATLASES_DIR;

  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }

  const manifests = [
    { name: 'playing-cards.atlas.json', imageName: 'playing-cards-atlas.png', data: playingCardsAtlas },
    { name: 'isometric-tiles.atlas.json', imageName: 'isometric-tiles-atlas.png', data: isometricAtlas },
    { name: 'modular-characters.atlas.json', imageName: 'modular-characters-atlas.png', data: charactersAtlas },
    { name: 'ui-sprites.atlas.json', imageName: 'ui-sprites-atlas.png', data: uiAtlas },
  ];

  for (const item of manifests) {
    fs.writeFileSync(
      path.join(manifestsDir, item.name),
      JSON.stringify(item.data, null, 2),
      'utf-8'
    );
  }

  const keysTsContent = `/**
 * Autocomplete Key Definitions and Constants for Kenney Asset Packs
 * Generated by sunshade-atlas-pipeline
 */

export const PLAYING_CARDS = ${JSON.stringify(playingCardKeys, null, 2)} as const;
export type PlayingCardKey = (typeof PLAYING_CARDS)[number];

export const ISOMETRIC_TILES = ${JSON.stringify(ISO_TILE_NAMES, null, 2)} as const;
export type IsometricTileKey = (typeof ISOMETRIC_TILES)[number];

export const MODULAR_CHARACTERS = ${JSON.stringify(charKeys, null, 2)} as const;
export type ModularCharacterKey = (typeof MODULAR_CHARACTERS)[number];

export const UI_SPRITES = ${JSON.stringify(UI_SPRITE_NAMES, null, 2)} as const;
export type UiSpriteKey = (typeof UI_SPRITES)[number];
`;

  fs.writeFileSync(path.join(manifestsDir, 'keys.ts'), keysTsContent, 'utf-8');

  if (generateImages) {
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    for (const item of manifests) {
      const buffer = createAtlasPng(item.data, options.spritesDir);
      fs.writeFileSync(path.join(imagesDir, item.imageName), buffer);
    }
    console.log(`🖼️  Generated ${manifests.length} atlas PNG sheets in ${imagesDir}`);
  }

  return { manifests, keysCount: playingCardKeys.length + ISO_TILE_NAMES.length + charKeys.length + UI_SPRITE_NAMES.length };
}

// ─── CLI Execution ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const res = generateAllManifests();
    console.log('✅ Generated lightweight atlas manifests:');
    console.log('  - playing-cards.atlas.json');
    console.log('  - isometric-tiles.atlas.json');
    console.log('  - modular-characters.atlas.json');
    console.log('  - ui-sprites.atlas.json');
    console.log('  - keys.ts (with strict TypeScript types & constants)\n');
  } catch (err) {
    console.error('❌ Manifest generation failed:', err);
    process.exitCode = 1;
  }
}
