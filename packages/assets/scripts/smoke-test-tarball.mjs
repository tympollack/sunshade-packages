#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digitalcanopy-assets-smoke-'));
let tarballPath = '';

try {
  const packOutput =
    process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/c', 'npm', 'pack', '--pack-destination', tmpDir], {
          cwd: pkgRoot,
          encoding: 'utf8',
        })
      : execFileSync('npm', ['pack', '--pack-destination', tmpDir], {
          cwd: pkgRoot,
          encoding: 'utf8',
        });

  const tarballName = packOutput.trim().split(/\r?\n/).pop();
  assert.ok(tarballName && tarballName.endsWith('.tgz'), `Expected tarball name, got: ${packOutput}`);
  tarballPath = path.join(tmpDir, tarballName);

  const installedPkgDir = path.join(tmpDir, 'node_modules', '@digitalcanopy', 'assets');
  fs.mkdirSync(installedPkgDir, { recursive: true });
  execFileSync('tar', ['-xzf', tarballPath, '-C', installedPkgDir, '--strip-components=1'], {
    stdio: 'pipe',
  });

  // 1. Verify every exported subpath file (types, import, require) is present in the tarball
  for (const [subpath, targets] of Object.entries(pkgJson.exports)) {
    for (const [condition, relPath] of Object.entries(targets)) {
      const fullPath = path.resolve(installedPkgDir, relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `Missing exported ${condition} target for "${subpath}": ${relPath}`
      );
    }
  }

  // 2. Verify CJS require() across all subpaths + shared assetRegistry singleton
  const consumerFile = path.join(tmpDir, 'consumer.cjs');
  fs.writeFileSync(consumerFile, '');
  const requireFromTmp = createRequire(consumerFile);

  const cjsRoot = requireFromTmp('@digitalcanopy/assets');
  const cjsManifests = requireFromTmp('@digitalcanopy/assets/manifests');
  const cjsResolvers = requireFromTmp('@digitalcanopy/assets/resolvers');
  const cjsCatalog = requireFromTmp('@digitalcanopy/assets/catalog');
  const cjsRegistry = requireFromTmp('@digitalcanopy/assets/registry');

  assert.equal(typeof cjsResolvers.getKenneyCharacterUrl, 'function');
  assert.ok(Array.isArray(cjsManifests.MODULAR_CHARACTERS));
  assert.ok(Array.isArray(cjsCatalog.SEED_CATALOG_ASSETS));

  assert.strictEqual(
    cjsRoot.assetRegistry,
    cjsRegistry.assetRegistry,
    'CJS root and ./registry must share the same assetRegistry singleton'
  );

  const customAceUrl = 'https://cdn.digitalcanopy.io/smoke/custom-ace.svg';
  cjsRoot.assetRegistry.registerOverride('card-spades-a', customAceUrl);
  assert.equal(cjsRegistry.assetRegistry.resolveCardUrl('card-spades-a'), customAceUrl);
  cjsRoot.assetRegistry.reset();

  // 3. Verify ESM import() across all subpaths + shared assetRegistry singleton
  const esmScript = `
    import assert from 'node:assert/strict';
    import * as esmRoot from '@digitalcanopy/assets';
    import * as esmManifests from '@digitalcanopy/assets/manifests';
    import * as esmResolvers from '@digitalcanopy/assets/resolvers';
    import * as esmCatalog from '@digitalcanopy/assets/catalog';
    import * as esmRegistry from '@digitalcanopy/assets/registry';

    assert.equal(typeof esmResolvers.getKenneyCharacterUrl, 'function');
    assert.ok(Array.isArray(esmManifests.MODULAR_CHARACTERS));
    assert.ok(Array.isArray(esmCatalog.SEED_CATALOG_ASSETS));
    assert.strictEqual(esmRoot.assetRegistry, esmRegistry.assetRegistry);

    const customHairUrl = 'https://cdn.digitalcanopy.io/smoke/hair.png';
    esmRoot.assetRegistry.registerOverride('char-hair-hair-blonde-0', customHairUrl);
    assert.equal(esmRegistry.assetRegistry.resolveUrl('char-hair-hair-blonde-0'), customHairUrl);
    esmRoot.assetRegistry.reset();
  `;
  const esmConsumerPath = path.join(tmpDir, 'consumer.mjs');
  fs.writeFileSync(esmConsumerPath, esmScript);
  execFileSync(process.execPath, [esmConsumerPath], { stdio: 'pipe' });

  console.log('✓ @digitalcanopy/assets tarball smoke test passed (CJS + ESM + singleton + exports)');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
