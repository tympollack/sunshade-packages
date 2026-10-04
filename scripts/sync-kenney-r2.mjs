#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const R2_BUCKET = process.env.R2_BUCKET || 'sunshade-game-assets';
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.sunshade.icu/assets/kenney';
const SOURCE_DIR =
  process.env.SOURCE_DIR ||
  (fs.existsSync('C:\\Users\\Tymz\\dev\\downloaded_assets\\kenney.nl')
    ? 'C:\\Users\\Tymz\\dev\\downloaded_assets\\kenney.nl'
    : path.resolve(REPO_ROOT, '../downloaded_assets/kenney.nl'));

const CACHE_CONTROL_HEADER = 'public, max-age=31536000, immutable';
const CORS_HEADER = '*';

const TAXONOMY_REGEX = /^assets\/kenney\/[a-z0-9_-]+(\/[a-z0-9._-]+)+$/i;

/**
 * Validates whether an R2 key adheres to the expected Kenney taxonomy.
 * Examples:
 *  - 'assets/kenney/modular-characters/base_01.png'
 *  - 'assets/kenney/cards/spades_10.png'
 */
export function validateTaxonomyPath(key) {
  if (!key.startsWith('assets/kenney/')) {
    return { valid: false, reason: 'Key does not start with assets/kenney/' };
  }
  if (!TAXONOMY_REGEX.test(key)) {
    return { valid: false, reason: `Key does not match valid taxonomy format: ${key}` };
  }
  return { valid: true };
}

/**
 * Verifies public accessibility and Cloudflare edge cache response headers.
 */
export async function verifyCdnEndpoint(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      const headers = res.headers;
      const statusCode = res.statusCode;
      const cacheControl = headers['cache-control'] || '';
      const cfCacheStatus = headers['cf-cache-status'] || 'NONE';
      const cors = headers['access-control-allow-origin'] || '';

      resolve({
        url,
        statusCode,
        cacheControl,
        cfCacheStatus,
        cors,
        isSuccess: statusCode === 200,
        isCached: cfCacheStatus === 'HIT' || cfCacheStatus === 'DYNAMIC' || cacheControl.includes('immutable'),
      });
    }).on('error', (err) => {
      resolve({
        url,
        statusCode: 0,
        error: err.message,
        isSuccess: false,
        isCached: false,
      });
    });
  });
}

export async function runSync(options = {}) {
  const isDryRun = options.dryRun || process.argv.includes('--dry-run');
  const isVerifyOnly = options.verifyOnly || process.argv.includes('--verify-only');

  console.log('⚡ Cloudflare R2 Kenney Ingestion Engine');
  console.log(`🪣 Bucket: ${R2_BUCKET}`);
  console.log(`🌐 Edge CDN: ${CDN_BASE_URL}`);
  console.log(`📂 Source: ${SOURCE_DIR}`);
  console.log(`🔒 Cache-Control: ${CACHE_CONTROL_HEADER}`);
  console.log(`🌐 CORS: ${CORS_HEADER}\n`);

  if (isVerifyOnly) {
    console.log('🔍 Executing edge CDN reachability verification...');
    const testUrls = [
      `${CDN_BASE_URL}/modular-characters/base_01.png`,
      `${CDN_BASE_URL}/cards/spades_10.png`,
      `${CDN_BASE_URL}/ui-pack/sounds/click-a.ogg`,
    ];

    for (const url of testUrls) {
      const res = await verifyCdnEndpoint(url);
      console.log(`- ${url} => Status: ${res.statusCode}, CF-Cache: ${res.cfCacheStatus || 'N/A'}`);
    }
    return;
  }

  // Scan local packs and validate target taxonomy paths
  if (!fs.existsSync(SOURCE_DIR)) {
    console.warn(`⚠️ Source directory not found: ${SOURCE_DIR}. Running in mock/dry-run mode.`);
    return;
  }

  const stagedPacks = fs.readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  let validTaxonomyCount = 0;
  let invalidTaxonomyCount = 0;

  console.log(`📦 Scanning ${stagedPacks.length} packs for taxonomy validation...`);

  for (const pack of stagedPacks) {
    const packSlug = pack.name.replace(/^kenney_/, '');
    const packPath = path.join(SOURCE_DIR, pack.name);

    function walkAndValidate(dir, relPath = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walkAndValidate(fullPath, entryRel);
        } else {
          const r2Key = `assets/kenney/${packSlug}/${entryRel.replace(/\\/g, '/')}`;
          const validation = validateTaxonomyPath(r2Key);
          if (validation.valid) {
            validTaxonomyCount++;
          } else {
            invalidTaxonomyCount++;
          }
        }
      }
    }

    walkAndValidate(packPath);
  }

  console.log(`✅ Taxonomy validation complete: ${validTaxonomyCount} valid keys, ${invalidTaxonomyCount} invalid keys.`);
  console.log(`📋 R2 Upload Command Template:`);
  console.log(`   npx wrangler r2 object put "${R2_BUCKET}/assets/kenney/<pack>/<path>" --file "<file>" \\`);
  console.log(`     --cache-control "${CACHE_CONTROL_HEADER}"`);

  if (isDryRun) {
    console.log('\nℹ️ Dry-run mode completed. Zero remote mutations committed.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSync().catch(console.error);
}
