# Server runtime

This package routes AIPETS protocol events between authenticated module peers.
Use it for a standalone channel server or an embedded desktop server. It does not own chat sessions or model execution.

## Usage

Create a server through `@proj-aipets/server-runtime/server`, then call `start()` and `stop()` for its host lifecycle.
Use `setupApp` from the package root when an existing HTTP host owns the server lifecycle.

## Validation

Run `pnpm -F @proj-aipets/server-runtime typecheck` and `pnpm -F @proj-aipets/server-runtime exec vitest run`.
