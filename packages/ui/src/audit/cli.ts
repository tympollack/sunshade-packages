#!/usr/bin/env node
import type { AuditOptions, ViewportSpec } from './types';
import { runAudit, formatAuditReport } from './runner';

export const DEFAULT_VIEWPORTS = 'mobile:375x667,desktop:1280x800';

export function parseViewports(raw: string): ViewportSpec[] {
  const specs = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [maybeName, maybeDims] = entry.includes(':') ? entry.split(':') : [entry, entry];
      const match = /^(\d+)x(\d+)$/i.exec(maybeDims.trim());
      if (!match) {
        throw new Error(`Invalid viewport spec "${entry}". Expected format name:WIDTHxHEIGHT (e.g. mobile:375x667).`);
      }
      const width = Number(match[1]);
      const height = Number(match[2]);
      return {
        name: entry.includes(':') ? maybeName.trim() : `${width}x${height}`,
        width,
        height,
      };
    });

  if (specs.length === 0) {
    throw new Error('At least one viewport must be specified (e.g. mobile:375x667,desktop:1280x800).');
  }

  return specs;
}

export function parseCliArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env
): AuditOptions & { help?: boolean } {
  let url = env.SUNSHADE_AUDIT_URL || 'http://localhost:3000';
  let routesRaw = env.SUNSHADE_AUDIT_ROUTES || '/';
  let viewportsRaw = env.SUNSHADE_AUDIT_VIEWPORTS || DEFAULT_VIEWPORTS;
  let json = env.SUNSHADE_AUDIT_JSON === '1' || env.SUNSHADE_AUDIT_JSON === 'true';
  let timeoutMs = env.SUNSHADE_AUDIT_TIMEOUT ? Number(env.SUNSHADE_AUDIT_TIMEOUT) : 15000;
  let executablePath = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    } else if (arg === '--url' && argv[i + 1]) {
      url = argv[++i];
    } else if (arg.startsWith('--routes=')) {
      routesRaw = arg.slice('--routes='.length);
    } else if (arg === '--routes' && argv[i + 1]) {
      routesRaw = argv[++i];
    } else if (arg.startsWith('--viewports=')) {
      viewportsRaw = arg.slice('--viewports='.length);
    } else if (arg === '--viewports' && argv[i + 1]) {
      viewportsRaw = argv[++i];
    } else if (arg.startsWith('--timeout=')) {
      timeoutMs = Number(arg.slice('--timeout='.length));
    } else if (arg === '--timeout' && argv[i + 1]) {
      timeoutMs = Number(argv[++i]);
    } else if (arg.startsWith('--executable-path=')) {
      executablePath = arg.slice('--executable-path='.length);
    } else if (arg === '--executable-path' && argv[i + 1]) {
      executablePath = argv[++i];
    }
  }

  const routes = routesRaw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => (r.startsWith('/') || r.startsWith('http') ? r : `/${r}`));

  if (routes.length === 0) {
    throw new Error('At least one route must be specified (e.g. / or /,/dashboard).');
  }

  return {
    url: url.replace(/\/+$/, ''),
    routes,
    viewports: parseViewports(viewportsRaw),
    json,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
    executablePath,
    help,
  };
}

function printHelp(): void {
  console.log(`sunshade-ui-audit - Headless UI Layout & Accessibility Audit CLI

Usage:
  sunshade-ui-audit [options]

Options:
  --url <url>               Base URL to audit (default: http://localhost:3000, env: SUNSHADE_AUDIT_URL)
  --routes <r1,r2>          Comma-separated routes (default: /, env: SUNSHADE_AUDIT_ROUTES)
  --viewports <specs>       Viewport list (default: ${DEFAULT_VIEWPORTS}, env: SUNSHADE_AUDIT_VIEWPORTS)
  --timeout <ms>            Navigation timeout in ms (default: 15000)
  --executable-path <path>  Optional Chromium executable path (env: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  --json                    Emit structured JSON audit report
  -h, --help                Show help message`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const report = await runAudit(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAuditReport(report));
  }

  return report.passed ? 0 : 1;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`[sunshade-ui-audit] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    });
}
