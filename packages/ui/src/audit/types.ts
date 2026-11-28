export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
}

export type AuditCheckCategory =
  | 'axe-contrast-a11y'
  | 'horizontal-overflow'
  | 'clipped-control'
  | 'small-tap-target'
  | 'overlapping-controls'
  | 'missing-mobile-nav'
  | 'unexpected-text-wrap'
  | 'overwide-prose'
  | 'clipped-scroll-container'
  | 'broken-image';

export interface AuditViolation {
  category: AuditCheckCategory;
  severity: 'error' | 'warning';
  selector: string;
  message: string;
  details?: string;
}

export interface RouteViewportReport {
  route: string;
  url: string;
  viewport: ViewportSpec;
  passed: boolean;
  durationMs: number;
  violations: AuditViolation[];
  error?: string;
}

export interface AuditReport {
  baseUrl: string;
  routes: string[];
  viewports: ViewportSpec[];
  passed: boolean;
  totalViolations: number;
  durationMs: number;
  results: RouteViewportReport[];
}

export interface AuditOptions {
  url: string;
  routes: string[];
  viewports: ViewportSpec[];
  json?: boolean;
  timeoutMs?: number;
  executablePath?: string;
  failOnWarnings?: boolean;
}
