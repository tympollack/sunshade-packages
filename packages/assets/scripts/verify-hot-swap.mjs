#!/usr/bin/env node

/**
 * @file verify-hot-swap.mjs
 * @description Verification script for @digitalcanopy/assets drop-in custom IP hot-swapping
 * and database catalog registry integration.
 */

import {
  createAssetRegistry,
  playingCardsAtlas,
  isometricTilesAtlas,
  modularCharactersAtlas,
  SEED_CATALOG_ASSETS,
  PLAYING_CARDS,
  ISOMETRIC_TILES,
  toFlameSpriteData,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
  getKenneyAudioUrl,
} from '../dist/index.mjs';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, label, details) {
  if (condition) {
    passedChecks++;
    console.log(`  ${GREEN}✓${RESET} ${label}`);
  } else {
    failedChecks++;
    console.error(`  ${RED}✗ [FAIL]${RESET} ${label}`);
    if (details) console.error(`    ${DIM}${details}${RESET}`);
  }
}

async function runHotSwapVerification() {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   @digitalcanopy/assets Drop-In Custom IP Hot-Swap Verification  ${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  const registry = createAssetRegistry();
  const events = [];
  const unsubscribe = registry.subscribe((event) => {
    events.push(event);
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 1: Canonical Baseline Kenney Resolution
  // ─────────────────────────────────────────────────────────────
  console.log(`${BOLD}1. Validating Canonical Baseline Kenney Assets${RESET}`);
  const baseCard = registry.resolveCardUrl('card-spades-10');
  assert(
    baseCard === getKenneyCardUrl('card-spades-10'),
    'Default card resolution targets Kenney R2 CDN',
    `Expected ${getKenneyCardUrl('card-spades-10')}, got ${baseCard}`
  );

  const baseChar = registry.resolveCharacterUrl('hair', 'curly-brown');
  assert(
    baseChar === getKenneyCharacterUrl('hair', 'curly-brown'),
    'Default character avatar resolution targets Kenney R2 CDN'
  );

  const baseAudio = registry.resolveAudioUrl('switch-b');
  assert(
    baseAudio === getKenneyAudioUrl('switch-b'),
    'Default audio sound effects resolution targets Kenney R2 CDN'
  );

  const baseFlame = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
  const expectedFlame = toFlameSpriteData(playingCardsAtlas, 'card-spades-a');
  assert(
    JSON.stringify(baseFlame) === JSON.stringify(expectedFlame),
    'Baseline Flame sprite data matches playing cards atlas frame coordinates'
  );

  // ─────────────────────────────────────────────────────────────
  // Phase 2: Database Catalog Ingestion
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}2. Ingesting Database Catalog (catalog.assets Seed Data)${RESET}`);
  registry.loadCatalog(SEED_CATALOG_ASSETS, 'wsw');
  assert(
    registry.hasOverride('card-back-cyan'),
    'WSW card back registered from catalog.assets'
  );
  assert(
    registry.hasOverride('card-face-spades-ace'),
    'WSW ace of spades registered from catalog.assets'
  );
  assert(
    !registry.hasOverride('avatar-base-neutral'),
    'Non-WSW scoped assets ignored when scope filter is active'
  );

  // ─────────────────────────────────────────────────────────────
  // Phase 3: Drop-In Custom IP Hot-Swapping
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}3. Executing Drop-In Custom IP Hot-Swap${RESET}`);

  // 3a. Pack-level custom IP: Cyberpunk Syndicate Decks
  const CYBERPUNK_CDN = 'https://cdn.digitalcanopy.io/custom-ip/syndicate-cards';
  registry.registerPackOverride('cards', CYBERPUNK_CDN);

  const cyberpunkKing = registry.resolveCardUrl('card-hearts-k');
  assert(
    cyberpunkKing === `${CYBERPUNK_CDN}/card-hearts-k.png`,
    'Pack-level override hot-swaps all playing cards to Cyberpunk Syndicate CDN',
    `Resolved: ${cyberpunkKing}`
  );

  // 3b. Key-level legendary override with custom Hi-DPI frame and custom anchor
  const HOLO_ACE_URL = 'https://cdn.digitalcanopy.io/custom-ip/syndicate-cards/holo_ace.svg';
  registry.registerOverride('card-spades-a', {
    url: HOLO_ACE_URL,
    frame: { x: 0, y: 0, w: 280, h: 380 },
    anchor: { ax: 0.5, ay: 0.5 },
  });

  const resolvedHoloAce = registry.resolveCardUrl('card-spades-a');
  assert(
    resolvedHoloAce === HOLO_ACE_URL,
    'Key-level override takes precedence over pack-level override'
  );

  const customFlameCard = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
  assert(
    customFlameCard?.srcSize[0] === 280 && customFlameCard?.srcSize[1] === 380,
    'Flame sprite data adapts dynamically to custom Hi-DPI dimensions [280, 380]'
  );

  // 3c. Avatar Studio modular component hot-swap
  const CYBER_HAIR_URL = 'https://cdn.digitalcanopy.io/avatars/cyber-hair.png';
  registry.registerOverride('hair/curly-brown', {
    url: CYBER_HAIR_URL,
    frame: { x: 0, y: 0, w: 256, h: 256 },
    anchor: { ax: 0.5, ay: 0.7 },
  });

  const resolvedHair = registry.resolveCharacterUrl('hair', 'curly-brown');
  assert(
    resolvedHair === CYBER_HAIR_URL,
    'Modular character component hot-swapped to custom anime hair sprite'
  );

  const flameHair = registry.resolveFlameSpriteData(modularCharactersAtlas, 'hair/curly-brown');
  assert(
    flameHair?.anchor[1] === 0.7,
    'Custom anchor point preserved without coordinate drift in Flame sprite'
  );

  // 3d. Cozy Villages 2.5D Isometric tile hot-swap
  const tileKey = ISOMETRIC_TILES[0];
  const NEON_TILE_URL = 'https://cdn.digitalcanopy.io/cozy/biomes/neon/tile-00.png';
  registry.registerOverride(tileKey, {
    url: NEON_TILE_URL,
    frame: { x: 0, y: 0, w: 512, h: 256 },
    anchor: { ax: 0.5, ay: 0.75 },
  });

  const flameTile = registry.resolveFlameSpriteData(isometricTilesAtlas, tileKey);
  assert(
    flameTile?.srcSize[0] === 512 && flameTile?.anchor[1] === 0.75,
    'Isometric tile maintains 2.5D floor anchor (0.5, 0.75) under hot-swapped texture'
  );

  // ─────────────────────────────────────────────────────────────
  // Phase 4: Non-Overridden Assets Fallback Cleanliness
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}4. Verifying Seamless Fallback on Non-Overridden Assets${RESET}`);
  const fallbackPants = registry.resolveCharacterUrl('pants', 'pants-0');
  assert(
    fallbackPants.includes('assets/kenney/modular-characters/pants/pants-0.png'),
    'Non-overridden avatar components fall back to canonical Kenney CDN'
  );

  const fallbackTile = registry.resolveFlameSpriteData(isometricTilesAtlas, ISOMETRIC_TILES[1]);
  const standardTile = toFlameSpriteData(isometricTilesAtlas, ISOMETRIC_TILES[1]);
  assert(
    JSON.stringify(fallbackTile) === JSON.stringify(standardTile),
    'Non-overridden tiles retain default atlas coordinate mapping'
  );

  // ─────────────────────────────────────────────────────────────
  // Phase 5: Reactive Hot-Swap Event Stream
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}5. Verifying Reactive Event Stream Lifecycle${RESET}`);
  assert(
    events.some((e) => e.type === 'override_registered'),
    'Received override_registered events'
  );
  assert(
    events.some((e) => e.type === 'pack_registered'),
    'Received pack_registered events'
  );
  assert(
    events.some((e) => e.type === 'catalog_loaded'),
    'Received catalog_loaded event'
  );

  // ─────────────────────────────────────────────────────────────
  // Phase 6: Teardown & Reset
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}6. Verifying Registry Teardown & Canonical Reversion${RESET}`);
  registry.reset();
  const resetCard = registry.resolveCardUrl('card-spades-10');
  assert(
    resetCard === baseCard,
    'Post-reset card resolution reverts 100% to canonical Kenney CDN'
  );

  const resetFlame = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
  assert(
    JSON.stringify(resetFlame) === JSON.stringify(expectedFlame),
    'Post-reset Flame coordinates revert 100% to baseline Kenney atlas frames'
  );

  assert(
    events.some((e) => e.type === 'reset'),
    'Received final reset event'
  );

  unsubscribe();

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}${CYAN}----------------------------------------------------------------${RESET}`);
  console.log(
    `Total Checks: ${passedChecks + failedChecks} | ${GREEN}Passed: ${passedChecks}${RESET} | ${
      failedChecks > 0 ? `${RED}Failed: ${failedChecks}${RESET}` : `${GREEN}Failed: 0${RESET}`
    }`
  );
  console.log(`${BOLD}${CYAN}----------------------------------------------------------------${RESET}\n`);

  if (failedChecks > 0) {
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✓ ALL DROP-IN CUSTOM IP HOT-SWAP VERIFICATION CHECKS PASSED.${RESET}\n`);
}

runHotSwapVerification().catch((err) => {
  console.error(`${RED}Fatal verification error:${RESET}`, err);
  process.exit(1);
});
