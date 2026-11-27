// @vitest-environment node
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseCliArgs, parseViewports, runAudit, formatAuditReport } from '../audit';

const execFileAsync = promisify(execFile);

describe('sunshade-ui-audit CLI & Headless Engine', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/clean') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clean Page</title>
    <style>
      body { margin: 0; background: #1A1A1A; color: #F9F9F9; font-family: sans-serif; }
      header { display: flex; align-items: center; padding: 8px 16px; }
      .nav-btn { min-width: 40px; min-height: 40px; background: #9A3412; color: #FFFFFF; border: none; font-weight: 600; }
      main { padding: 16px; }
      p { max-width: 640px; color: #D6D3D1; }
    </style>
  </head>
  <body>
    <header>
      <button type="button" class="nav-btn" aria-label="Open navigation menu" data-testid="mobile-nav-btn">Menu</button>
    </header>
    <main>
      <h1>Dashboard</h1>
      <p>Clean, high-contrast prose paragraph well below 760px width threshold.</p>
      <img src="/deferred-offscreen.png" loading="lazy" alt="Deferred asset" width="60" height="60" style="display: block; margin-top: 2400px;" />
    </main>
    <aside aria-label="Inspector" style="display: none;">Hidden desktop inspector</aside>
  </body>
</html>`);
        return;
      }

      if (req.url === '/defective') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Defective Page</title>
    <style>
      body { margin: 0; background: #FFFFFF; color: #111111; font-family: sans-serif; }
      .low-contrast { color: #E5E5E5; background: #FFFFFF; }
      .tiny-btn { width: 20px; height: 20px; padding: 0; font-size: 10px; }
      .overflow-box { width: 900px; height: 20px; background: #ddd; }
      .clipped-scroll { height: 40px; overflow-y: hidden; }
      .wide-prose { width: 820px; }
      .nowrap-badge { display: inline-block; width: 40px; }
      .desktop-nav { display: none; }
    </style>
  </head>
  <body>
    <aside class="desktop-nav">Hidden Sidebar</aside>
    <main>
      <h1>Defective</h1>
      <button type="button" aria-haspopup="listbox" role="combobox" aria-expanded="false" style="min-width:40px;min-height:40px;">Select</button>
      <p class="low-contrast" data-testid="bad-contrast">Hard to read low contrast text</p>
      <button type="button" class="tiny-btn" data-testid="tiny-target">x</button>
      <span class="nowrap-badge whitespace-nowrap" style="white-space: normal" data-testid="wrapped-badge">Long Wrapping Badge Label</span>
      <div style="width: 100px; overflow: hidden;"><button type="button" style="width: 160px; min-height: 40px;" data-testid="ancestor-clipped-btn">Clipped Button</button></div>
      <div class="overflow-box" data-testid="wide-box">Overflowing content</div>
      <div class="clipped-scroll" data-testid="clipped-box">
        <div style="height: 180px;">Clipped tall inner content</div>
      </div>
      <p class="wide-prose" data-testid="wide-prose">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam.
      </p>
      <img src="/does-not-exist.png" alt="Broken test asset" width="60" height="60" data-testid="broken-img" />
    </main>
  </body>
</html>`);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('parses CLI flags and environment variables cleanly', () => {
    const parsed = parseCliArgs(
      ['--url', 'http://localhost:4100/', '--routes', '/,/login,settings', '--viewports', 'mobile:375x667,desktop:1440x900', '--json'],
      {}
    );

    expect(parsed.url).toBe('http://localhost:4100');
    expect(parsed.routes).toEqual(['/', '/login', '/settings']);
    expect(parsed.viewports).toEqual([
      { name: 'mobile', width: 375, height: 667 },
      { name: 'desktop', width: 1440, height: 900 },
    ]);
    expect(parsed.json).toBe(true);

    expect(() => parseViewports('bad-viewport')).toThrow();
    expect(() => parseViewports('')).toThrow();
    expect(() => parseCliArgs(['--viewports='], {})).toThrow();
    expect(() => parseCliArgs(['--routes='], {})).toThrow();
  });

  it('rejects empty viewport/route lists in runAudit and sanitizes control chars in report output', async () => {
    await expect(
      runAudit({ url: baseUrl, routes: ['/clean'], viewports: [] })
    ).rejects.toThrow();
    await expect(
      runAudit({ url: baseUrl, routes: [], viewports: parseViewports('desktop:1280x800') })
    ).rejects.toThrow();

    const sanitized = formatAuditReport({
      baseUrl: 'http://localhost:3000\x1b[31m',
      routes: ['/'],
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
      passed: false,
      totalViolations: 1,
      durationMs: 10,
      results: [
        {
          route: '/\nFAKE_PASS',
          url: 'http://localhost:3000/',
          viewport: { name: 'mobile', width: 375, height: 667 },
          passed: false,
          durationMs: 10,
          violations: [
            {
              category: 'clipped-control',
              severity: 'error',
              selector: 'btn\x1b[2J\n  PASS',
              message: 'msg\x07bell',
            },
          ],
        },
      ],
    });
    expect(sanitized).not.toContain('\x1b');
    expect(sanitized).not.toContain('\x07');
    expect(sanitized).not.toContain('\nFAKE_PASS');
  });

  it('audits compliant and defective routes across mobile and desktop viewports in one pass', async () => {
    const report = await runAudit({
      url: baseUrl,
      routes: ['/clean', '/defective'],
      viewports: parseViewports('mobile:375x667,desktop:1280x800'),
    });

    const cleanResults = report.results.filter((r) => r.route === '/clean');
    expect(cleanResults).toHaveLength(2);
    expect(cleanResults.every((r) => r.passed)).toBe(true);

    const defectiveResults = report.results.filter((r) => r.route === '/defective');
    expect(defectiveResults).toHaveLength(2);
    expect(report.passed).toBe(false);
    expect(report.totalViolations).toBeGreaterThan(0);

    const allViolations = defectiveResults.flatMap((r) => r.violations);
    const categories = new Set(allViolations.map((v) => v.category));

    expect(categories.has('axe-contrast-a11y')).toBe(true);
    expect(categories.has('horizontal-overflow')).toBe(true);
    expect(categories.has('clipped-control')).toBe(true);
    expect(categories.has('small-tap-target')).toBe(true);
    expect(categories.has('missing-mobile-nav')).toBe(true);
    expect(categories.has('unexpected-text-wrap')).toBe(true);
    expect(categories.has('clipped-scroll-container')).toBe(true);
    expect(categories.has('overwide-prose')).toBe(true);
    expect(categories.has('broken-image')).toBe(true);

    const formatted = formatAuditReport(report);
    expect(formatted).toContain('PASS  /clean');
    expect(formatted).toContain('FAIL  /defective');
    expect(formatted).toContain('[data-testid="tiny-target"]');
    expect(formatted).toContain('[data-testid="wrapped-badge"]');
    expect(formatted).toContain('[data-testid="ancestor-clipped-btn"]');
    expect(formatted).toContain('[data-testid="clipped-box"]');
    expect(formatted).toContain('[data-testid="broken-img"]');
  }, 60000);

  it('executes compiled dist/audit/cli.js bin returning exit code 0 on pass and 1 on fail', async () => {
    const cliPath = path.resolve(__dirname, '../../dist/audit/cli.js');

    const passRes = await execFileAsync(process.execPath, [
      cliPath,
      '--url',
      baseUrl,
      '--routes',
      '/clean',
      '--viewports',
      'desktop:1280x800',
      '--json',
    ]);
    const passJson = JSON.parse(passRes.stdout);
    expect(passJson.passed).toBe(true);

    let failCode = 0;
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        '--url',
        baseUrl,
        '--routes',
        '/defective',
        '--viewports',
        'mobile:375x667',
      ]);
    } catch (err: any) {
      failCode = err.code ?? 1;
    }
    expect(failCode).toBe(1);
  }, 60000);
});
