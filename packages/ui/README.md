# @sunshade/ui

Universal design tokens, glassmorphism presets, and cross-platform UI primitives for the SunShade ecosystem.

## Installation

```bash
npm install @sunshade/ui
# or
yarn add @sunshade/ui
```

## Features

- **Design Tokens**: Burnt Orange (`#CC5500`), Deep Charcoal (`#1A1A1A`), Crisp Off-White (`#F9F9F9`), and Cozy Warm Amber/Gold palettes.
- **Glassmorphism Presets**: `glassPresets.standard`, `glassPresets.cozy`, `glassPresets.subtle`, `glassPresets.interactive`.
- **Universal Primitives**:
  - `GlassCard`: Glassmorphic container with native padding support and backdrop blur.
  - `PrimaryButton`: Accessible action button with variant styling and loading states.
  - `TokenBalanceBadge`: Formatted ledger balances with telemetry fonts.
  - `AtmosphericBadge`: Status indicators for environment and network states.
- **Cross-Platform**: Works identically on Next.js (Web), Expo / React Native (iOS & Android), and React Native Web.

## Usage

```tsx
import { GlassCard, PrimaryButton, AtmosphericBadge, TokenBalanceBadge } from '@sunshade/ui';

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
