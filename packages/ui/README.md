# @digitalcanopy/ui

Cross-platform design tokens, glassmorphism presets, and UI primitives for the SunShade & Digital Canopy ecosystem (Next.js, Expo, React Native Web).

## Installation

```bash
npm install @digitalcanopy/ui
# or
yarn add @digitalcanopy/ui
```

## Features

- **Design Tokens**: Burnt Orange (`#CC5500`), Deep Charcoal (`#1A1A1A`), Crisp Off-White (`#F9F9F9`), and Cozy Warm Amber/Gold palettes.
- **Glassmorphism Presets**: `glassPresets.standard`, `glassPresets.cozy`, `glassPresets.subtle`, `glassPresets.interactive`.
- **Universal Primitives** (Next.js Web, Expo / React Native iOS & Android, React Native Web):
  - `GlassCard`: Glassmorphic container with native padding support and backdrop blur.
  - `PrimaryButton`: Accessible action button with variant styling and loading states.
  - `TokenBalanceBadge`: Formatted ledger balances with telemetry fonts.
  - `AtmosphericBadge`: Status indicators for environment and network states.
  - `SelectableTile`: Interactive card selection tile.
- **Web & React Native Web Primitives** (Next.js, Vite, React Native Web):
  - `AppShell`: Responsive 3-pane workspace shell with collapsible desktop rail (`w-14` / `w-64`), mobile slide-over drawer (`md:hidden`), and non-blocking desktop inspector.
  - `Modal`, `Dialog`, & `BottomSheet`: Accessible stacked dialogs bounded to `85dvh` with scroll containment, focus trapping, and gesture spring physics.
  - `Popover`, `Tooltip`, `DropdownMenu`, & `Select`: Portal-mounted floating primitives (`z-[100]`) with collision padding and viewport flip/shift protection.
  - `ProgressBar` & `Skeleton`: Segmented progress tracking and shimmer skeleton loaders.
  - `DataTable`: Virtualized dataset grid with sortable columns and action menus.
  - `Sparkline`: SVG micro-chart with cubic Bézier smoothing and live telemetry tracking.
- **Headless UI Audit CLI (`sunshade-ui-audit`)**:
  - Zero-config Playwright + `axe-core` audit binary verifying WCAG AA contrast, horizontal overflow, clipped controls, mobile tap targets (`>= 32x32px`), mobile nav triggers, nowrap text wrapping, prose line width (`<= 760px`), clipped scroll containers, and `<img>` integrity.
  - Usage: `npx sunshade-ui-audit --url http://localhost:3000 --routes /,/dashboard`

## Usage

```tsx
import { GlassCard, PrimaryButton, AtmosphericBadge, TokenBalanceBadge } from '@digitalcanopy/ui';

export function Header() {
  return (
    <GlassCard variant="default" padding="md">
      <AtmosphericBadge label="System Online" variant="core" statusDot />
      <TokenBalanceBadge balance={1500} symbol="HT" />
      <PrimaryButton label="Connect" variant="sunshade" />
    </GlassCard>
  );
}
```
