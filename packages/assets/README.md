# @digitalcanopy/assets

Decoupled game and application asset ecosystem for SunShade & Digital Canopy. Hosts zero binary media in repositories, resolving images and audio through Cloudflare R2 edge CDN and providing lightweight Flame/WebGL JSON sprite manifests with strict TypeScript autocomplete keys.

## Installation

```bash
npm install @digitalcanopy/assets
# or
yarn add @digitalcanopy/assets
```

## Features

- **Zero-Binary Repository Hygiene**: Eliminates multi-megabyte PNG, SVG, WAV, and OGG binaries from client git repos.
- **CDN URL Resolvers**: Fast edge URL generation targeting `https://cdn.sunshade.icu/assets/kenney/` with immutable caching headers.
  - `getKenneyAssetUrl(pack, path, extension)`
  - `getKenneyCardUrl(cardKey, extension)`
  - `getKenneyCharacterUrl(category, itemKey, extension)`
  - `getKenneyAudioUrl(soundName, extension)`
- **Flame & WebGL Atlas Manifests**:
  - `playingCardsAtlas`: 52 face cards + 6 card back variations (140x190 frames).
  - `isometricTilesAtlas`: 24 2.5D isometric tiles with pivot anchors `(0.5, 0.75)`.
  - `modularCharactersAtlas`: 35 modular avatar components across 6 categories.
  - `uiSpritesAtlas`: 23 UI elements (buttons, panels, icons, progress bars).
- **Flame Coordinate Converter**: `toFlameSpriteData(manifest, frameKey)` converts manifest entries directly into `[srcPosition, srcSize, anchor]` tuples for Flutter Flame `SpriteComponent.fromFrame`.
- **Strict TypeScript Keys**: Exported constant arrays and union types (`PLAYING_CARDS`, `ISOMETRIC_TILES`, `MODULAR_CHARACTERS`, `UI_SPRITES`) for IDE autocomplete.

## Usage

```typescript
import {
  getKenneyCardUrl,
  toFlameSpriteData,
  playingCardsAtlas,
  PLAYING_CARDS,
} from '@digitalcanopy/assets';

// Resolve asset URL directly from edge CDN
const cardUrl = getKenneyCardUrl('card-spades-10');
// => "https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png"

// Map coordinates for Flame engine
const spriteData = toFlameSpriteData(playingCardsAtlas, 'card-spades-a');
// => { srcPosition: [0, 0], srcSize: [140, 190], anchor: [0.5, 0.5] }
```
