# Banjo

Banjo is a Svelte wallet application being built around a framework-neutral wallet core. Wallet behavior should live in TypeScript modules under `src/lib/core`; Svelte components should handle presentation, user input, and browser UI wiring.

## Development Scripts

- `pnpm dev` starts the Vite development server.
- `pnpm build` creates a production build.
- `pnpm preview` serves the production build locally.
- `pnpm check` runs Svelte and TypeScript checks. This is the minimum verification command for every implementation slice.
- `pnpm test` runs unit tests once with Vitest.
- `pnpm test:watch` runs unit tests in watch mode.

## Architecture Notes

- Core wallet logic belongs in `src/lib/core` once that directory exists.
- UI-only behavior belongs in Svelte components and route-level modules.
- Core modules must not import `.svelte` files, Svelte stores, routes, or UI state.
- Browser globals and extension APIs should be isolated behind adapters.
- Generated clients and cryptographic utilities should be copied or regenerated artifacts, not hand-rewritten code.

## Runtime Targets

Banjo v1 targets these runtime modes from the start:

- Normal web app.
- Browser extension side panel.
- Internal modal signer.
- Standalone popup.

## Migration Decisions

- Banjo v1 starts with a separate Banjo IndexedDB database. Existing wallet IndexedDB data is not migrated in the first port.
- Banjo exposes `window.banjo` only for extension detection. It does not expose a legacy compatibility alias in v1.
- Wallet-branded identifiers are renamed to Banjo identifiers during the port. Neutral protocol and domain names remain unchanged when they are not wallet-branded, such as `WalletTransaction`, `Arc55App`, `Network`, and `SeedData`.

## Roadmap

The progressive implementation roadmap is tracked in `.plans/11-progressive-roadmap-implementation.md`.
