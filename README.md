# SunShade Packages (`sunshade-packages`)

> Centralized Turborepo monorepo for shared libraries and design system packages across the SunShade ecosystem.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@digitalcanopy/ui`](./packages/ui) | `0.1.0` | Shared design tokens, glassmorphism presets, and cross-platform UI primitives (Next.js, Expo, React Native Web). |
| [`@digitalcanopy/supabase`](./packages/supabase) | `0.1.0` | Shared cross-domain Supabase authentication and client helpers. |

## Monorepo Architecture

This repository is dedicated solely to core ecosystem packages. It does not host product applications, ensuring fast CI, independent semantic versioning, and zero coupling to application deployments.

```
sunshade-packages/
├── .changeset/           Automated semantic versioning and release management
├── .github/workflows/    CI build/test and release workflows
├── packages/
│   ├── ui/               @digitalcanopy/ui design system & primitives
│   └── supabase/         @digitalcanopy/supabase client & auth
├── package.json          Root workspaces and tooling
└── turbo.json            Turborepo task pipeline
```

## Workflows

- **Build all packages:** `npm run build`
- **Run boundary tests:** `npm run test:boundaries`
- **Type-check:** `npm run typecheck`
- **Add a Changeset:** `npx changeset`
- **Publish packages:** Automated via GitHub Actions on push to `main` using Changesets.
