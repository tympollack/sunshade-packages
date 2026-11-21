#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunshade-tarball-smoke-'));

function packAndExtract(pkgRelDir, scopeName, pkgShortName) {
  const pkgRoot = path.join(repoRoot, pkgRelDir);
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));

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
  const tarballPath = path.join(tmpDir, tarballName);

  const installDir = path.join(tmpDir, 'node_modules', scopeName, pkgShortName);
  fs.mkdirSync(installDir, { recursive: true });
  execFileSync('tar', ['-xzf', tarballPath, '-C', installDir, '--strip-components=1'], {
    stdio: 'pipe',
  });

  for (const [subpath, targets] of Object.entries(pkgJson.exports)) {
    for (const [condition, relPath] of Object.entries(targets)) {
      const fullPath = path.resolve(installDir, relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `[${pkgJson.name}] Missing exported ${condition} target for "${subpath}": ${relPath}`
      );
    }
  }
}

try {
  // Link peer dependencies (react, react-dom) only — intentionally omit @digitalcanopy/ui
  // so plain Node execution fails if @digitalcanopy/cadence leaks uncompiled @digitalcanopy/ui/tokens.
  const nodeModulesDir = path.join(tmpDir, 'node_modules');
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  for (const peer of ['react', 'react-dom']) {
    const srcPeer = path.join(repoRoot, 'node_modules', peer);
    if (fs.existsSync(srcPeer)) {
      fs.symlinkSync(srcPeer, path.join(nodeModulesDir, peer), 'junction');
    }
  }

  packAndExtract('packages/links', '@digitalcanopy', 'links');
  packAndExtract('packages/cadence', '@digitalcanopy', 'cadence');

  const consumerCjs = path.join(tmpDir, 'consumer.cjs');
  fs.writeFileSync(consumerCjs, '');
  const requireFromTmp = createRequire(consumerCjs);

  // 1. Verify @digitalcanopy/links CJS shared default client across . and ./react
  const React = requireFromTmp('react');
  const { renderToStaticMarkup } = requireFromTmp('react-dom/server');
  const linksRoot = requireFromTmp('@digitalcanopy/links');
  const linksReact = requireFromTmp('@digitalcanopy/links/react');

  // Calling useTrackedLink in ./react initializes the default client if unset
  renderToStaticMarkup(
    React.createElement(() => {
      linksReact.useTrackedLink('https://sunshade.icu', { enabled: false });
      return null;
    })
  );
  const clientCreatedByReactEntry = linksRoot.getDefaultClient();
  assert.equal(typeof clientCreatedByReactEntry?.shortenUrl, 'function');
  assert.strictEqual(
    clientCreatedByReactEntry,
    globalThis[Symbol.for('@digitalcanopy/links/defaultClient')]
  );

  const customClient = new linksRoot.LinksClient({ baseUrl: 'https://custom.links.sunshade.icu' });
  linksRoot.setDefaultClient(customClient);
  assert.strictEqual(linksRoot.getDefaultClient(), customClient);
  assert.strictEqual(
    globalThis[Symbol.for('@digitalcanopy/links/defaultClient')],
    customClient,
    'CJS @digitalcanopy/links and ./react must share the same default client slot'
  );

  // 2. Verify @digitalcanopy/cadence CJS loads in plain Node and shares widgetRegistry across entries
  const cadenceRoot = requireFromTmp('@digitalcanopy/cadence');
  const cadenceCore = requireFromTmp('@digitalcanopy/cadence/core');
  const cadenceWidgets = requireFromTmp('@digitalcanopy/cadence/widgets');
  const cadenceAdapters = requireFromTmp('@digitalcanopy/cadence/adapters');

  assert.equal(typeof cadenceCore.createInitialSessionState, 'function');
  assert.equal(typeof cadenceAdapters.getCadenceAppPreset, 'function');

  cadenceRoot.registerWidget({
    id: 'tarball-smoke-widget',
    title: 'Smoke Widget',
    category: 'vocab',
    component: () => null,
  });
  assert.ok(
    cadenceWidgets.getWidgetById('tarball-smoke-widget'),
    'CJS @digitalcanopy/cadence and ./widgets must share widgetRegistry'
  );
  let adapterWidgetId = null;
  renderToStaticMarkup(
    React.createElement(() => {
      const session = cadenceAdapters.useEcosystemCadenceSession('COZY', {
        persist: false,
        rng: () => 0.99,
      });
      adapterWidgetId = session.chapterCardProps.widget?.id ?? null;
      return null;
    })
  );
  assert.equal(
    adapterWidgetId,
    'tarball-smoke-widget',
    'CJS ./adapters must read widgets registered through root @digitalcanopy/cadence'
  );
  cadenceRoot.resetWidgetRegistry(true);

  // 3. Verify ESM imports for both packages in plain Node
  const esmScript = `
    import assert from 'node:assert/strict';
    import * as linksRoot from '@digitalcanopy/links';
    import * as linksReact from '@digitalcanopy/links/react';
    import * as cadenceRoot from '@digitalcanopy/cadence';
    import * as cadenceCore from '@digitalcanopy/cadence/core';
    import * as cadenceWidgets from '@digitalcanopy/cadence/widgets';
    import * as cadenceAdapters from '@digitalcanopy/cadence/adapters';

    const custom = new linksRoot.LinksClient({ baseUrl: 'https://esm.links.sunshade.icu' });
    linksRoot.setDefaultClient(custom);
    assert.strictEqual(linksRoot.getDefaultClient(), custom);
    assert.equal(typeof linksReact.useTrackedLink, 'function');
    assert.equal(typeof linksReact.SafeAnchor, 'function');

    assert.equal(typeof cadenceCore.cadenceReducer, 'function');
    assert.equal(typeof cadenceAdapters.getCadenceAppPreset, 'function');
    cadenceRoot.registerWidget({
      id: 'esm-smoke-widget',
      title: 'ESM Smoke Widget',
      category: 'puzzle',
      component: () => null,
    });
    assert.ok(cadenceWidgets.getWidgetById('esm-smoke-widget'));
    cadenceRoot.resetWidgetRegistry(true);
  `;
  const consumerMjs = path.join(tmpDir, 'consumer.mjs');
  fs.writeFileSync(consumerMjs, esmScript);
  execFileSync(process.execPath, [consumerMjs], { stdio: 'pipe' });

  console.log('✓ @digitalcanopy/links & @digitalcanopy/cadence tarball smoke test passed (plain Node CJS + ESM)');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
