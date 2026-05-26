# Banjo Core

Banjo core contains framework-neutral wallet logic. It should be usable by Svelte UI, browser extension adapters, popup flows, and internal modal signing without importing UI code.

## Boundaries

- Core modules must not import `.svelte` files.
- Core modules must not import Svelte stores, route modules, or UI state.
- Browser globals and extension APIs belong behind adapters or explicitly named providers.
- Storage, credentials, crypto, Ledger access, fetch, notifications, confirmations, and message delivery should be injected through interfaces where practical.
- Generated clients belong in `clients/` and should be copied or regenerated, not hand-edited internally.
- Reusable test doubles belong in `testing/`.

## Public Imports

- Application code should import stable wallet APIs from `$core` when possible.
- Internal core modules may import explicit sibling modules when that keeps dependency direction clear.
- Avoid exporting every helper from `$core`; only stable types, factories, and integration APIs should be promoted there.

## Folder Rules

- `types/`: shared domain types. Must not import runtime implementations.
- `data/`: static wallet data and typed accessors. Must not perform network or storage calls.
- `clients/`: generated or regenerated app clients. Handwritten business logic should wrap these from another folder.
- `storage/`: storage interfaces and storage adapters. Browser storage details should not leak into unrelated core modules.
- `runtime/`: side-effect interfaces for notifications, confirmations, crypto, credentials, Ledger, fetch, and message delivery.
- `state/`: plain wallet state, selectors, and loading helpers. Must not import UI stores.
- `network/`: algod, indexer, KMD, fallback, and network validation helpers.
- `accounts/`: account records, account lookup, onboarding orchestration, and duplicate checks.
- `keys/`: seed, hot key, HD, passkey, Ledger, and Falcon key helpers.
- `signing/`: transaction and data signing orchestration.
- `transactions/`: wallet-initiated transaction builders and transaction validation helpers.
- `apps/`: ARC-backed wallet services and app-client wrappers.
- `assets/`: asset cache, asset metadata, and URL resolution helpers.
- `protocol/`: dApp request/response validation and serialization.
- `adapters/`: browser, extension, popup, modal, and platform implementations around core interfaces.
- `testing/`: reusable test doubles and test-only helpers.

## Naming

- Wallet-branded identifiers should use Banjo names during the port.
- Neutral protocol and domain names stay unchanged when they are not wallet-branded, such as `WalletTransaction`, `Arc55App`, `Network`, and `SeedData`.
