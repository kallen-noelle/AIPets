<picture>
  <source
    width="100%"
    srcset="./assets/banner-dark-1280x640.avif"
    media="(prefers-color-scheme: dark)"
  />
  <source
    width="100%"
    srcset="./assets/banner-light-1280x640.avif"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img width="250" src="./assets/banner-light-1280x640.avif" />
</picture>

<h1 align="center">aipets</h1>

<p align="center">A talking digital pet that lives on your desktop.</p>

<p align="center">
  [<a href="../README.md">简体中文</a>] [<a href="./README.en.md">English</a>]
</p>

## What this project does

A digital pet lives on your screen and talks with you. A language model writes the reply. A speech model speaks it.
A video player shows the matching body animation on a transparent window.

The body is not a 3D model. Every visible action is a short transparent video clip. A session decides which clip plays
next. A crossfade player swaps between two video elements, so the pet never freezes on a cut.

## Development

```shell
pnpm install
pnpm dev:web
```

### Desktop app

```shell
pnpm -F @proj-aipets/stage-web-react dev       # Vite dev server
pnpm -F @proj-aipets/stage-web-react electron  # Electron window on the dev server
```

Build the Windows installer:

```shell
pnpm -F @proj-aipets/stage-web-react electron:dist
```

The installer is written to `apps/stage-web-react/release/`. That folder is not committed.

### Character assets

```shell
pnpm characters:build   # rebuild assets/characters.json from the character folders
pnpm state:split        # split a clip into a start part and an end part
```

### Checks

```shell
pnpm -F @proj-aipets/stage-web-react typecheck
pnpm -F @proj-aipets/character-animation exec vitest run
pnpm lint
```

## Features

### Animation director

The director decides what the pet does when nobody talks to it. It is not a random shuffle.

- `src/animation/ambient-director.ts` runs a program of ambient phases.
- A phase holds a clip list and a duration. The controller adds the durations and resolves the active phase from
  `elapsed % total`. No timer drives the loop, so a dropped frame cannot drift the phase.
- `src/animation/retrieval.ts` selects clips for the current context.
- `src/animation/drag-physics.ts` reacts to window drags.
- `src/animation/director-bus.ts` and `src/desktop/pet-relay.ts` keep the director state equal across every window.
  The pet window and the chat window therefore show the same pose.
- `src/animation/playback-history.ts` and `animation-log.ts` record what played, for debugging and review.

### Conversation

- Chat runs on `packages/provider-inference`, which wraps [xsai](https://github.com/moeru-ai/xsai) clients.
- Each character has a persona. Personas ship with the character folder or come from an imported pack.
- `src/character/affect-store.ts` keeps a persistent affect state, so the mood survives a reload.
- Chat tools let the model call built-in abilities: memory, MCP tools, and plugin actions.
- `src/chat/sessions.ts` stores chat sessions locally.

### Memory

- Memory is a list of small entries. Each entry holds a name, a one-line description, and a body.
- An entry belongs to one character. An entry without an owner is general and reaches every character.
- The model reads, writes, and forgets entries through `builtIn_readMemory`, `builtIn_writeMemory`, and
  `builtIn_forgetMemory`.
- Entries persist in browser storage, so no database is required for local use.

### Ears

- `src/audio/recorder.ts` captures the microphone.
- `src/audio/pipeline.ts` runs voice activity detection and streams audio to the recognizer.
- `src/speech/local-recognition.ts` runs recognition in the browser.
- `src/speech/omni-transcription.ts` sends audio to a hosted transcription provider.
- Settings pages cover wake words, voiceprint, transcription, and hearing thresholds.

### Mouth

- Speech synthesis supports several providers.
- `src/speech/playback.ts` plays the audio and reports progress.
- `src/audio/beat-sync.ts` aligns playback with the body animation.

### Desktop shell

The Electron shell in `apps/stage-web-react/electron` turns the web app into a desktop pet.

- The pet window is transparent, frameless, and always on top.
- A click-through mode forwards mouse events to the window below, so the pet does not block your work.
- Secondary windows host chat and widgets as separate always-on-top windows.
- `packages/electron-native-backdrop` and `packages/electron-screen-capture` add native window effects and screen
  capture.
- `electron-builder.config.cjs` builds the Windows installer.

### Settings

Every feature has a settings page. The pages live in `apps/stage-web-react/src/pages/settings/`:

| Group | Pages |
| --- | --- |
| Model access | providers, provider detail, models, consciousness, modules, recipes |
| Speech | speech, transcriber, hearing, wake words, voiceprint |
| Knowledge | memory, memory entries, memory short term, memory long term, web search, vision |
| System | system, desktop, animation, data, connection, migrating |
| Extensions | plugins, MCP, tool cards, stickers, card, artistry, beat sync, home assistant |

## Project layout

| Path | Content |
| --- | --- |
| `apps/stage-web-react` | The React web app and its Electron shell. This is the only frontend. |
| `apps/stage-web-react/electron` | The Electron main process, preload, windows, and plugin host. |
| `apps/stage-web-react/src/animation` | Director, clip retrieval, crossfade player, and drag physics. |
| `assets/` | Character folders, clip files, and the generated `characters.json` index. |
| `packages/character-animation` | The transparent video animation core. Pure logic, no UI framework. |
| `packages/provider-inference` | LLM provider clients. |
| `packages/plugin-sdk`, `packages/plugin-protocol` | The plugin contract. |
| `packages/input-gamepad`, `packages/input-playstation-dualsense-5` | Input device drivers. |
| `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` | The server channel that `services/` and `plugins/` use. |
| `plugins/` | Product plugins: chess, Bilibili Laplace, and Claude Code. |
| `services/computer-use-mcp` | A computer-use MCP server. |
| `server/apps/api` | The hosted Hono resource API and its business domains. |
| `server/apps/auth` | The standalone Better Auth and OIDC service. |
| `server/docker-compose.yaml` | The complete local backend stack. |
| `docs/` | Project documentation and ADRs. |

## Supported LLM providers

This project keeps a short list. A generic OpenAI-compatible endpoint still works for anything else.

- [x] [OpenAI](https://platform.openai.com/docs/guides/gpt/chat-completions-api)
- [x] [Anthropic Claude](https://anthropic.com)
- [x] [DeepSeek](https://www.deepseek.com/)
- [x] [Qwen](https://help.aliyun.com/document_detail/2400395.html)

## Documentation

- [README.md](./README.md): document index
- [ai/animation-video-stage-plan.md](./ai/animation-video-stage-plan.md): the transparent video stage plan
- [../AGENTS.md](../AGENTS.md): rules for agent and contributor work
- [../DESIGN.md](../DESIGN.md): UI design guide
- [../.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md): contribution guide

## License

MIT. See [../LICENSE](../LICENSE).

## Acknowledgements

PC2005-cloud
