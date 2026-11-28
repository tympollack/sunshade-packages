import { chromium, type Browser, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import type {
  AuditOptions,
  AuditReport,
  AuditViolation,
  RouteViewportReport,
  ViewportSpec,
} from './types';
import { evaluateDomGuardrails } from './domChecks';

async function launchAuditBrowser(executablePath?: string): Promise<Browser> {
  if (executablePath) {
    return chromium.launch({ headless: true, executablePath });
  }

  try {
    return await chromium.launch({ headless: true });
  } catch (primaryErr) {
    const channels: Array<'chrome' | 'msedge'> = ['chrome', 'msedge'];
    for (const channel of channels) {
      try {
        return await chromium.launch({ headless: true, channel });
      } catch {
        // Try next available system browser channel
      }
    }
    throw primaryErr;
  }
}

function buildTargetUrl(baseUrl: string, route: string): string {
  if (route.startsWith('http://') || route.startsWith('https://')) {
    return route;
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}

export async function runPageAuditChecks(
  page: Page,
  viewport: ViewportSpec,
  route: string,
  targetUrl: string,
  timeoutMs = 15000
): Promise<RouteViewportReport> {
  const startedAt = Date.now();
  const violations: AuditViolation[] = [];

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    if (response && response.status() >= 400) {
      return {
        route,
        url: targetUrl,
        viewport,
        passed: false,
        durationMs: Date.now() - startedAt,
        violations: [],
        error: `HTTP ${response.status()} returned for ${targetUrl}`,
      };
    }

    // Allow client-side hydration and fonts/styles to settle
    await page.waitForTimeout(200);

    // 1. Run axe-core WCAG 2.0/2.1 AA contrast & accessibility checks
    const axeResults = await new AxeBuilder({ page: page as any })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    for (const v of axeResults.violations) {
      if (v.impact !== 'serious' && v.impact !== 'critical' && v.id !== 'color-contrast') {
        continue;
      }
      for (const node of v.nodes) {
        violations.push({
          category: 'axe-contrast-a11y',
          severity: 'error',
          selector: node.target.join(' ') || 'document',
          message: `[${v.id}] (${v.impact || 'serious'}) ${v.help}`,
          details: node.failureSummary,
        });
      }
    }

    // 2. Run deterministic layout, mobile nav, wrapping, scroll-clip, and image checks
    const domViolations = await page.evaluate(evaluateDomGuardrails, viewport.width);
    violations.push(...domViolations);

    return {
      route,
      url: targetUrl,
      viewport,
      passed: violations.length === 0,
      durationMs: Date.now() - startedAt,
      violations,
    };
  } catch (err) {
    return {
      route,
      url: targetUrl,
      viewport,
      passed: false,
      durationMs: Date.now() - startedAt,
      violations,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sanitizeTerminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function runAudit(options: AuditOptions): Promise<AuditReport> {
  if (!options.routes || options.routes.length === 0) {
    throw new Error('runAudit requires at least one route.');
  }
  if (!options.viewports || options.viewports.length === 0) {
    throw new Error('runAudit requires at least one viewport.');
  }

  const startedAt = Date.now();
  const browser = await launchAuditBrowser(options.executablePath);
  const results: RouteViewportReport[] = [];

  try {
    for (const viewport of options.viewports) {
      const isMobile = viewport.width < 768;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile,
        hasTouch: isMobile,
      });
      const page = await context.newPage();

      try {
        for (const route of options.routes) {
          const targetUrl = buildTargetUrl(options.url, route);
          const result = await runPageAuditChecks(
            page,
            viewport,
            route,
            targetUrl,
            options.timeoutMs ?? 15000
          );
          results.push(result);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const totalViolations = results.reduce((sum, r) => sum + r.violations.length + (r.error ? 1 : 0), 0);
  const passed = results.length > 0 && results.every((r) => r.passed);

  return {
    baseUrl: options.url,
    routes: options.routes,
    viewports: options.viewports,
    passed,
    totalViolations,
    durationMs: Date.now() - startedAt,
    results,
  };
}

export function formatAuditReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`\nsunshade-ui-audit -> ${sanitizeTerminalText(report.baseUrl)} (${report.durationMs}ms)`);

  for (const r of report.results) {
    const vpLabel = `${sanitizeTerminalText(r.viewport.name)}:${r.viewport.width}x${r.viewport.height}`;
    const safeRoute = sanitizeTerminalText(r.route);
    if (r.passed) {
      lines.push(`  PASS  ${safeRoute} [${vpLabel}] (${r.durationMs}ms)`);
      continue;
    }

    lines.push(`  FAIL  ${safeRoute} [${vpLabel}] (${r.durationMs}ms)`);
    if (r.error) {
      lines.push(`    - [navigation-error] ${sanitizeTerminalText(r.error)}`);
    }
    for (const v of r.violations) {
      lines.push(
        `    - [${v.category}] selector="${sanitizeTerminalText(v.selector)}" :: ${sanitizeTerminalText(v.message)}`
      );
      if (v.details) {
        lines.push(`      details: ${sanitizeTerminalText(v.details)}`);
      }
    }
  }

  if (report.passed) {
    lines.push(`\nPASSED: 0 violations across ${report.results.length} route/viewport check(s).\n`);
  } else {
    lines.push(`\nFAILED: ${report.totalViolations} issue(s) found across ${report.results.length} route/viewport check(s).\n`);
  }

  return lines.join('\n');
}
