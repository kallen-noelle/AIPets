# React frontend rewrite

Status: accepted

## Decision

`apps/stage-web-react` becomes the only retained web frontend.
The Vue web app `apps/stage-web` stays in the tree until the React app reaches feature parity, then a later change removes it.
The desktop app `apps/stage-tamagotchi` keeps its Vue renderer until phase P5.

New code splits along five layers. Pure logic goes in `packages/stage-domain`.
State goes in `packages/stage-stores` and uses Zustand vanilla stores.
Primitives go in `packages/ui-react` and wrap Radix.
Business components go in `packages/stage-ui-react`. Page bases go in `packages/stage-pages-react`.
Apps compose these packages and hold only wiring.

The rewrite replaces four Vue specific pieces.

- `pinia-plugin-synced` becomes a Zustand middleware in `packages/stage-stores`. It applies the same cross-window and cross-process sync semantics.
- `vue-i18n` becomes `react-i18next`. A build step converts the YAML catalogs. It rewrites `{name}` to `{{name}}` and splits plural forms into `_one` and `_other` keys.
- `unplugin-vue-router` becomes React Router routes plus a settings registry. The registry keeps the settings entry list in one file.
- `@pinia/colada` query calls become TanStack Query calls.

## Ownership

`packages/stage-domain` owns pure functions and types. It imports no UI framework.
`packages/stage-stores` owns state slices, persistence, and the sync engine.
`packages/ui-react` owns framework primitives. `packages/stage-ui-react` owns business components.
`packages/stage-pages-react` owns page bases. Apps own routing, layout composition, and host differences.

## Scope

The rewrite covers the web app first. Desktop follows after the web parity checkpoint.
The chat domain is the P3 checkpoint. A change that finishes the chat domain stops for review before the rewrite continues.

## Non-goals

No change to the backend, the animation core `packages/character-animation`, or the plugin protocol.
No new locale. The locale list stays at Chinese and English.
No Vue removal in this decision. Removal is phase P6 and needs its own change.

## Target files

```text
packages/
  stage-domain/            # pure logic, no UI framework
  stage-stores/            # Zustand slices and the sync engine
  ui-react/                # primitives on Radix
  stage-ui-react/          # business components
  stage-pages-react/       # page bases
apps/
  stage-web-react/         # the retained web frontend
  stage-tamagotchi-react/  # phase P5
docs/ai/adr/
  2026-10-28-react-frontend-rewrite.md
```

## Verification

Run `pnpm -F @proj-airi/stage-web-react typecheck` and `pnpm -F @proj-airi/stage-web-react exec vitest run` for each phase.
Run `pnpm lint` before each phase ends.
Add one parity test that compares every React translation key with the Vue catalog.
Add one sync test that opens two tabs and checks that one store write reaches the other tab.
