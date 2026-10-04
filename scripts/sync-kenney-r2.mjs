#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execSync } from 'node:child_process';
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

/**
 * Uploads a file to Cloudflare R2 bucket with configured cache headers.
 */
export function uploadFileToR2(bucket, r2Key, filePath, cacheControl = CACHE_CONTROL_HEADER) {
  const cmd = `npx wrangler r2 object put "${bucket}/${r2Key}" --file "${filePath}" --cache-control "${cacheControl}"`;
  execSync(cmd, { stdio: 'inherit' });
}

export async function runSync(options = {}) {
  const isDryRun = options.dryRun ?? (process.argv.includes('--dry-run'));
  const isVerifyOnly = options.verifyOnly ?? (process.argv.includes('--verify-only'));
  const uploader = options.uploader || uploadFileToR2;

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

    let allSuccess = true;
    for (const url of testUrls) {
      const res = await verifyCdnEndpoint(url);
      console.log(`- ${url} => Status: ${res.statusCode}, CF-Cache: ${res.cfCacheStatus || 'N/A'}`);
      if (!res.isSuccess) {
        allSuccess = false;
      }
    }

    if (!allSuccess) {
      console.error('❌ CDN endpoint reachability verification failed: one or more assets unavailable.');
      process.exitCode = 1;
      return { success: false };
    }

    console.log('✅ All CDN endpoints verified successfully.');
    return { success: true };
  }

  // Scan local packs and validate target taxonomy paths
  if (!fs.existsSync(SOURCE_DIR)) {
    console.warn(`⚠️ Source directory not found: ${SOURCE_DIR}. Running in mock/dry-run mode.`);
    return { success: true, uploaded: 0, validTaxonomyCount: 0 };
  }

  const stagedPacks = fs.readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const validFiles = [];
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
            validFiles.push({ fullPath, r2Key });
          } else {
            invalidTaxonomyCount++;
          }
        }
      }
    }

    walkAndValidate(packPath);
  }

  // Also include any generated atlas image sheets in packages/assets/dist/atlases
  const atlasesDir = path.resolve(REPO_ROOT, 'packages/assets/dist/atlases');
  if (fs.existsSync(atlasesDir)) {
    const atlasFiles = fs.readdirSync(atlasesDir).filter((f) => f.endsWith('.png'));
    for (const atlasFile of atlasFiles) {
      const packSlug = atlasFile.replace(/-atlas\.png$/, '').replace('playing-cards', 'cards');
      const r2Key = `assets/kenney/${packSlug}/${atlasFile}`;
      validFiles.push({ fullPath: path.join(atlasesDir, atlasFile), r2Key });
    }
  }

  console.log(`✅ Taxonomy validation complete: ${validFiles.length} valid keys, ${invalidTaxonomyCount} invalid keys.`);

  if (isDryRun) {
    console.log('\nℹ️ Dry-run mode completed. Zero remote mutations committed.');
    console.log(`📋 R2 Upload Command Template:`);
    console.log(`   npx wrangler r2 object put "${R2_BUCKET}/assets/kenney/<pack>/<path>" --file "<file>" \\`);
    console.log(`     --cache-control "${CACHE_CONTROL_HEADER}"`);
    return { success: true, uploaded: 0, validTaxonomyCount: validFiles.length };
  }

  console.log(`\n🚀 Uploading ${validFiles.length} validated files to R2 bucket '${R2_BUCKET}'...`);
  for (const file of validFiles) {
    try {
      uploader(R2_BUCKET, file.r2Key, file.fullPath, CACHE_CONTROL_HEADER);
    } catch (err) {
      console.error(`❌ Failed to upload ${file.r2Key}:`, err.message);
      process.exitCode = 1;
      throw err;
    }
  }

  console.log(`✅ Upload complete: ${validFiles.length} files synchronized to R2.`);
  return { success: true, uploaded: validFiles.length, validTaxonomyCount: validFiles.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
