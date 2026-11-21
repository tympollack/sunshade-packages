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
- **Database Catalog Schema & Ingestion**: Direct integration with PostgreSQL `catalog.assets` table via `@digitalcanopy/assets/catalog`, complete with canonical seed assets and query loaders.
- **Dynamic Hot-Swapping Registry**: Drop-in custom IP hot-swapping at runtime via `@digitalcanopy/assets/registry` (`AssetRegistry`, `assetRegistry`), supporting pack overrides, single-key overrides, custom Flame frames/anchors, reactive pub/sub event streams, and graceful fallback to baseline Kenney assets.

## Usage

### 1. Canonical CDN Resolvers & Atlas Manifests

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

### 2. Drop-In Custom IP Hot-Swapping

```typescript
import {
  assetRegistry,
  playingCardsAtlas,
} from '@digitalcanopy/assets';

// Hot-swap an entire pack with a custom IP theme
assetRegistry.registerPackOverride('cards', 'https://cdn.digitalcanopy.io/custom-ip/cyberpunk-cards');

// Hot-swap a single legendary asset with custom high-DPI frame and anchor point
assetRegistry.registerOverride('card-spades-a', {
  url: 'https://cdn.digitalcanopy.io/custom-ip/cyberpunk-cards/holo_ace.svg',
  frame: { x: 0, y: 0, w: 280, h: 380 },
  anchor: { ax: 0.5, ay: 0.5 },
});

// Resolves to custom IP URL automatically
const cardUrl = assetRegistry.resolveCardUrl('card-spades-a');
// => "https://cdn.digitalcanopy.io/custom-ip/cyberpunk-cards/holo_ace.svg"

// Unmodified cards resolve under the custom pack override
const kingUrl = assetRegistry.resolveCardUrl('card-hearts-k');
// => "https://cdn.digitalcanopy.io/custom-ip/cyberpunk-cards/card-hearts-k.png"

// Flame engine sprite coordinates dynamically adapt to the custom IP frame
const flameData = assetRegistry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
// => { srcPosition: [0, 0], srcSize: [280, 380], anchor: [0.5, 0.5] }

// Subscribe to real-time hot-swap events to trigger reactive re-renders
const unsubscribe = assetRegistry.onSwap((event) => {
  console.log('Assets hot-swapped:', event.type, event.keys);
});
```

### 3. Database Catalog Integration (`catalog.assets`)

```typescript
import { loadCatalogAssets, assetRegistry } from '@digitalcanopy/assets';

// Load catalog assets scoped to War: Second Wind (WSW) from PostgreSQL or fallback cache
const wswAssets = await loadCatalogAssets({
  app_scope: 'wsw',
  fallbackToSeed: true,
});

// Ingest catalog directly into the active hot-swapping registry
assetRegistry.loadCatalog(wswAssets);
```
