# aipets Agent Guide

This file gives the core rules for all work in the aipets monorepo. The animation core drives transparent video clips instead of Live2D, VRM, or MMD. Skills and nested `AGENTS.md` files give the rules for specific tasks. Before you start a task, find it in [Task Routing](#task-routing) and read the listed file.

## Scope

[README.md](./README.md) holds the full range table. The list below is the short form.

- Retained: the browser app `apps/stage-web-react`, the Electron desktop shell in `apps/stage-web-react/electron`, the animation core `packages/character-animation`, memory, ears, mouth, the plugin system, the chess game plugin, MCP, the backend, input devices, and desktop native code.
- Removed: the mobile app, the Telegram and Discord bots, the X integration, the game integrations, and the Satori chat adapter. The bot packages, `apps/stage-pocket`, `packages/cap-vite`, and `integrations/satori-bot` are gone. The Godot desktop host `apps/stage-tamagotchi-kirie` and `engines/stage-tamagotchi-godot` are gone.
- Removed: every Vue app and Vue package. `apps/stage-web`, `apps/stage-tamagotchi`, `apps/component-calling`, and `apps/ui-server-auth` are deleted. So are `packages/stage-ui`, `packages/stage-ui-three`, `packages/stage-shared`, `packages/stage-pages`, `packages/stage-layouts`, `packages/ui`, `packages/ui-loading-screens`, `packages/ui-transitions`, `packages/electron-vueuse`, and `packages/input-gamepad-vueuse`.
- Dropped: the Live2D, VRM, MMD, Spine, and Tachie body renderers.
- Trimmed: the LLM provider list and the locales. Keep Chinese and English only.
- Kept but not wired: nothing. Every app in the tree is wired.
- Package scope stays `@proj-aipets/*`. Only the project name changes.
- Removed: accounts and `apps/ui-server-auth`.

An entry that the scope drops stays in the tree until a later change removes it. Do not extend a dropped entry.

## Project Map

The app uses React, Vite, UnoCSS, TypeScript, Vitest, and ESLint. The Electron shell is plain CommonJS.

The only app is `apps/stage-web-react`.

| Path | Content |
| --- | --- |
| `apps/stage-web-react` | The React web app and its Electron shell. This is the only frontend. |
| `apps/stage-web-react/electron` | The Electron main process, preload, windows, and plugin host. Plain CommonJS. |
| `packages/character-animation` | The transparent video animation core. Pure logic, no UI framework. |
| `packages/i18n` | All translations. |
| `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` | The server channel that `services/` and `plugins/` use. |
| `server/apps/api` | The hosted Hono resource API and its business domains. |
| `server/apps/auth` | The standalone Better Auth and OIDC service. |
| `server/packages` | Backend-only schema and Node infrastructure packages. |
| `server/dev/caddy` | Local Auth and API edge routing. |
| `server/docker-compose.yaml` | The complete local backend stack. |

Key files and directories:

- Pages are in `apps/stage-web-react/src/pages`.
- The React routes are in `apps/stage-web-react/src/router.tsx`. The React settings pages are in `apps/stage-web-react/src/pages/settings/`.
- The animation code is in `apps/stage-web-react/src/animation/` and `packages/character-animation/src/`. Read [The animation stack](./README.md#the-animation-stack) before you change it.
- The Electron main process is `apps/stage-web-react/electron/main.cjs`. The installer config is `apps/stage-web-react/electron-builder.config.cjs`.
- The settings page list is in `apps/stage-web-react/src/pages/settings/`. Add a route and a link there.
- Provider definitions are in `apps/stage-web-react/src/providers/` and `packages/provider-inference/src/`.
- Eventa contracts and desktop channels are in `apps/stage-web-react/electron/shared/contract.cjs`.
- Style configuration is in `uno.config.ts`. Styles are in `apps/stage-web-react/src/styles`.
- CI pipelines are in `.github/workflows`. Lint rules are in `eslint.config.ts`.

## Commands

Use pnpm workspace filters to limit a command to one workspace. Replace `<package name>` with the `name` field in `package.json`, for example `@proj-aipets/stage-web-react`.

- Typecheck one workspace: `pnpm -F <package name> typecheck`.
- Test one file: `pnpm -F <package name> exec vitest run <path>`. Give `<path>` relative to the workspace.
- Test one workspace: `pnpm -F <package name> exec vitest run`.
- Test all workspaces: `pnpm test:run`. Turbo runs the `test:run` script of each workspace, with its browser projects.
- Test the root scripts in `.github/scripts`: `pnpm test:root`. The root `vitest.config.ts` has only these tests.
- Test the changes of a branch: run the `test:run` script of each changed workspace and of each workspace that depends on it.
  Use the merge base with `origin/main` as the base.

  ```sh
  base=$(git merge-base origin/main HEAD)
  TURBO_SCM_BASE="$base" pnpm exec turbo run test:run --affected
  ```

  If the branch changes `.github/scripts`, also run `pnpm test:root`.

- Lint: `pnpm lint`. ESLint also does the formatting. To fix lint and format errors, run `pnpm lint:fix`.
- Build one workspace: `pnpm -F <package name> build`.
- Build the Windows installer: `pnpm -F @proj-aipets/stage-web-react electron:dist`.

## Scope and Checks

- Keep each change inside the scope of the task.
- In each function, component, or test that you change, correct the code that does not obey a current rule. Do not change other code only to improve it.
- Do not add one-off patterns. Before you write a new utility or function, search for an existing internal implementation.
- If new logic can become a shared utility, propose the shared approach to the user.
- If a refactor is small, do it step by step.
- After a task, run the typecheck and the related tests for each workspace that you changed.
- Before you create a PR or push to one, run the tests of the branch changes. CI runs every project, including the browser projects.
- If a change alters UI structure, layout, or interaction, review the related browser and end-to-end tests.
- If intended behavior changes, update the affected assertions. Keep valid regression checks. Do not delete an assertion only to make a test pass.
- After the final UI change, run the related tests on the final commit.
- Before you report a CI success, make sure that CI tested the current PR head.
- If you change a shared package or an exported type, also run the root `pnpm typecheck`.
- Run `pnpm lint` before you finish.
- Report only the checks that you ran. Give each command and its result.
- At the end, summarize the changes, the commands that you ran, and the follow-up work.

## Code Rules

- Put shared logic in `packages/`. Keep module boundaries clear.
- Use kebab-case for all file names.
- Do not use `any`. Prefer type generics. Use `as unknown as <Type>` only when you cannot fix the type safely.
- Omit TypeScript and JavaScript source extensions in relative imports, dynamic imports, and re-exports. Write `./module`, not `./module.ts` or `./module.js`. Keep an extension only when the runtime or asset format requires it.
- Do not edit `tsconfig.json` to hide an import or type error. Find and fix the cause.
- Treat a circular import as a design problem. First reconsider ownership and module boundaries. If you cannot resolve the cycle confidently, ask the user.
- Use `@moeru/eventa` for all IPC, RPC, and cross-process events. Define the contracts in one central place, such as `apps/stage-web-react/electron/shared`.
- Use dependency injection only at external boundaries: databases, model runtimes, queues, caches, filesystems, networks, clocks, environments, and feature gates. Use `injeca` for it.
- Do not add dependency objects for internal functions that only call sibling helpers or forward parameters.
- Prefer classes for runtime or browser APIs. Also prefer classes for substantial business modules that own state, lifecycle, or a stable domain boundary.
- Prefer functions for pure transformations and local helpers.
- Use Valibot for schema validation. Keep each schema near its consumers.
- Use `errorMessageFrom(error)` from `@moeru/std` to get an error message. Add `?? 'fallback'` when you need a default. For other error handling, prefer the `@moeru/std` patterns.
- Mark every workaround with a `// NOTICE:` comment in this format:

  ```ts
  // NOTICE:
  // Why this workaround is needed.
  // Root cause summary.
  // Source/context (file, issue, URL, or node_modules reference).
  // Removal condition (when it can be safely deleted).
  ```

### Backward Compatibility

- Do not add backward-compatibility guards.
- If old callers or old data need extended support, write a refactor document with the target shape. Then start another Codex or Claude Code session from the shell to do the refactor.
- If a compatibility fallback must stay for a limited time, mark it with `// NOTICE:` and give its removal condition.
- If a compatibility fallback is permanent, document it as supported policy. Do not call it legacy.
- A nested `AGENTS.md` can override this rule for a public contract. It must name the root rule that it overrides.

### Dependencies

- Prefer `es-toolkit` for general utilities. Ask the user before you add another general utility library, such as a package from `unjs` or `tinylib`.
- Some features use `node:*` built-in modules, DOM operations, Vue composables, React hooks, Vite plugins, or GitHub Actions workflows. For these features, research existing libraries first.
- Before you choose a library, ask the user to choose. Help the user compare the options.
- If the user works spec-driven, list the candidate libraries in a Markdown comparison table.
- If the user asks you to use a specific tool or dependency, read its documentation in Context7 first. Then examine how this repository uses it.
- If Context7 returns several names without a clear difference, ask the user to choose one.
- If the documentation conflicts with the typecheck result, examine the dependency source in `node_modules` to find the cause.

## Documentation

- Put project-wide and client ADRs in `docs/ai/adr/`. Put hosted backend ADRs in `server/docs/ai/adr/`, and obey the ADR rules in `server/AGENTS.md`.
- Put a documentation change in the same commit or PR as the code that it describes. This rule applies to ADRs, `README.md` files, and component references.
- Put agent configuration changes in their own commit. Agent configuration includes `AGENTS.md`, `CLAUDE.md`, skills, and `.github/copilot-instructions.md`.
- If the agent configuration describes the code of a PR, put its commit in that PR. Do not open a second PR for it.
- Keep a structured `README.md` in each `packages/` and `apps/` entry. It tells what the entry does, how to use it, when to use it, and when not to use it.
- Keep only the Chinese and English project README. Do not add another translated README.
- Put all translations in `packages/i18n`. This project keeps Chinese and English only.
- Do not add a locale. The scope trims the locale list to Chinese and English.
- Do not use English text as a placeholder in other locales. Add only the locales you implement.
- When you add a nested `AGENTS.md`, add a `CLAUDE.md` next to it that contains only `@AGENTS.md`. The root `CLAUDE.md` stops Claude Code from reading a nested `AGENTS.md` without this file.

## Writing

- For text, obey the [`simple-english`](.agents/skills/simple-english/SKILL.md) skill. Text includes documentation, code comments, commit messages, and PR and issue text.
- Do not apply the skill to code, identifiers, commands, or quoted errors.
- This repository breaks these rules most often:
  - Do not write "should", "may", "might", "could", or "would". Write "must" or "can", or state the fact.
  - Do not use semicolons. Write two sentences.
  - Write "for example" and "that is". Do not write "e.g.", "i.e.", or "etc.".
  - Write an instruction in 20 words or fewer. Write a description in 25 words or fewer.
  - Put a condition before its command.

## Git and Pull Requests

- Use Conventional Commits, for example `feat(<package name>): add runner reconnect backoff`. Do not use gitmoji.
- Name branches `username/feat/short-name`.
- Rebase when you pull.
- To create, open, publish, or prepare a pull request, use the [`create-pr`](.agents/skills/create-pr/SKILL.md) skill. It also covers visual evidence and review follow-up.

## Task Routing

Skills are in `.agents/skills/<name>/SKILL.md`. Read the listed file before you start the task.

| Task | Read |
| --- | --- |
| Design, change, or review UI appearance and interaction | [Design Guide](DESIGN.md) |
| Write, refactor, or review TypeScript or Vue code | [`enforce-rules-for-typescript`](.agents/skills/enforce-rules-for-typescript/SKILL.md) |
| Write or debug tests, reproduce a bug, add mocks, or fix test import boundaries | [`enforce-rules-for-vitest`](.agents/skills/enforce-rules-for-vitest/SKILL.md) |
| Change UnoCSS, Vue styles, UI components, animations, icons, or color mode | [`enforce-rules-for-unocss`](.agents/skills/enforce-rules-for-unocss/SKILL.md) |
| Add `synced` to a Pinia store, or change a synced store | [`enforce-rules-for-pinia-synced`](.agents/skills/enforce-rules-for-pinia-synced/SKILL.md) |
| Write or change a string that users see, or a glossary term | [`packages/i18n/AGENTS.md`](packages/i18n/AGENTS.md) |
| Review pending Crowdin translations, or find why approved translations did not reach the repository | [`enforce-rules-for-i18n`](.agents/skills/enforce-rules-for-i18n/SKILL.md) |
| Work under `server/` | [`server/AGENTS.md`](server/AGENTS.md). For `server/apps/api`, also read [`server/apps/api/AGENTS.md`](server/apps/api/AGENTS.md). |
| Write documentation, code comments, commit messages, or PR and issue text | [`simple-english`](.agents/skills/simple-english/SKILL.md) |
| Analyze why a chat, speech, or audio turn was slow or failed, using saved IO traces | [`analyze-io-traces`](.agents/skills/analyze-io-traces/SKILL.md) |
| Create or prepare a pull request | [`create-pr`](.agents/skills/create-pr/SKILL.md) |
| Upload a local file through a file input or a file chooser in a web or Electron app | [`agent-browser`](.agents/skills/agent-browser/SKILL.md). For Electron, also read [`agent-browser-electron`](.agents/skills/agent-browser-electron/SKILL.md). |
| Test the transparent video animation in stage-web-react | [`use-agent-browser-for-aipets`](.agents/skills/use-agent-browser-for-aipets/SKILL.md) |

These directories also have their own `AGENTS.md`. Read it before you work in the directory:

- `packages/model-driver-mediapipe/`
- `services/computer-use-mcp/`
