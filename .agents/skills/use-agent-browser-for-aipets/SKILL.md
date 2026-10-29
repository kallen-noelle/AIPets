---
name: use-agent-browser-for-aipets
description: Test AIPETS display-model imports with agent-browser across stage-tamagotchi Electron and stage-web. Use when uploading and verifying contributor-supplied Live2D ZIP, VRM, or MMD ZIP/PMX/PMD files through AIPETS's model selector, including onboarding bypass, format-specific import behavior, and renderer verification.
---

# Use Agent Browser for AIPETS

Invoke `$agent-browser`. Run `agent-browser skills get core --full` before browser commands. For Electron, also invoke `$agent-browser-electron` and run `agent-browser skills get electron --full`.

Select the runtime guide:

- Electron stage-tamagotchi: read [references/electron.md](references/electron.md).
- stage-web: read [references/web.md](references/web.md).

## Model import contract

Use an absolute input path. AIPETS creates each format input with VueUse `useFileDialog` and keeps it detached from the DOM, so a CSS selector cannot reach it. Install this bridge before you click the format menu item:

```bash
agent-browser eval 'window.__agentBrowserOriginalFileInputClick ??= HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type === "file") { this.dataset.agentBrowserUpload = "true"; document.body.append(this); return; } return window.__agentBrowserOriginalFileInputClick.call(this); }; true'
```

The bridge marks only file inputs, skips the native chooser, and keeps the application's own `change` listener on the same node. Then use the matching selector and format-specific postcondition:

| Format | Menu item | Input selector | Format-specific result |
| --- | --- | --- | --- |
| Live2D | `Live2D` | `input[data-agent-browser-upload][accept=".zip"]` | Inspect the validation report and click `Confirm` only when import is permitted. |
| VRM | `VRM` | `input[data-agent-browser-upload][accept=".vrm"]` | Wait for the imported card; no Live2D validation confirmation is expected. |
| MMD | `MMD` | `input[data-agent-browser-upload][accept=".zip,.pmx,.pmd"]` | Verify archive/model storage separately from textures, physics, dynamic imports, and rendering. |

Resolve local Live2D and VRM fixtures from the paths documented by `$use-vishot-for-aipets`. For MMD, use a licensed archive containing the model and its texture directories. Do not encode a contributor's private fixture name in tests or source comments.

## Prepare AIPETS state

Use a fresh browser session or a dedicated Electron user-data directory. Mark onboarding complete before opening the model settings route:

```bash
agent-browser eval 'localStorage.setItem("onboarding/completed", "true"); localStorage.setItem("onboarding/skipped", "false"); location.reload(); true'
```

Open `/settings/models`, click `Select model`, and snapshot again.

## Import the model

1. Click the first `Options for Display Models` button.
2. Re-snapshot and click the exact Live2D, VRM, or MMD menu item.
3. Upload with the matching selector from the table. Narrow the selector by `accept` or `multiple` when several inputs were captured.
4. Re-snapshot. If Live2D validation displays a report, inspect it and click `Confirm` only when the report permits import.
5. Wait for the exact basename to appear on an imported model card with its own `Pick` button. The detached input's displayed filename is not sufficient.
6. Click that imported card's `Pick` button.
7. Restore the detached-input bridge after the change handler completes when the page will remain open.

## Verify the result

Require all of these postconditions:

1. `localStorage.getItem("settings/stage/model")` starts with `display-model-` after `Pick`.
2. The final stage shows the imported model rather than a preset, blank canvas, loading state, or import dialog.
3. A screenshot visually matches the format and fixture that was uploaded.
4. `agent-browser errors` contains no model-load failure.
5. `agent-browser console` contains no relevant Live2D, VRM, MMD, ZIP, texture, physics, or dynamic-import failure.

Do not infer the selected display model from the AIPETS card/profile dropdown in the header; it identifies the active character card and may retain a different label.

Treat upload, persistence, and rendering as separate checkpoints. A visible imported card proves only that storage succeeded.

## Close and report

Close agent-browser sessions. Stop processes started for the test and remove only the dedicated temporary Electron user-data directory. Report each format and runtime separately as passed, failed, or not runnable, with the first failing checkpoint and relevant console error.
