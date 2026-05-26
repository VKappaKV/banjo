# Banjo Core

Banjo core contains framework-neutral wallet logic. It should be usable by Svelte UI, browser extension adapters, popup flows, and internal modal signing without importing UI code.

## Boundaries

- Core modules must not import `.svelte` files.
- Core modules must not import Svelte stores, route modules, or UI state.
- Browser globals and extension APIs belong behind adapters or explicitly named providers.
- Storage, credentials, crypto, Ledger access, fetch, notifications, confirmations, and message delivery should be injected through interfaces where practical.
- Generated clients belong in `clients/` and should be copied or regenerated, not hand-edited internally.
- Reusable test doubles belong in `testing/`.

## Naming

- Wallet-branded identifiers should use Banjo names during the port.
- Neutral protocol and domain names stay unchanged when they are not wallet-branded, such as `WalletTransaction`, `Arc55App`, `Network`, and `SeedData`.
