# Banjo

Banjo is a Svelte wallet application being built around a framework-neutral wallet core. Wallet behavior should live in TypeScript modules under `src/lib/core`; Svelte components should handle presentation, user input, and browser UI wiring.

## Development Scripts

- `pnpm dev` starts the Vite development server.
- `pnpm build` creates a production build (includes extension entrypoints).
- `pnpm build:web` creates a web-only production build (no extension artifacts).
- `pnpm build:ext:chrome` creates an extension build with Chrome manifest.
- `pnpm build:ext:firefox` creates an extension build with Firefox manifest.
- `pnpm zip:chrome` packages the Chrome build into `releases/banjo-chrome-vX.X.X.zip`.
- `pnpm zip:firefox` packages the Firefox build into `releases/banjo-firefox-vX.X.X.zip`.
- `pnpm preview` serves the production build locally.
- `pnpm check` runs Svelte and TypeScript checks. This is the minimum verification command for every implementation slice.
- `pnpm test` runs unit tests once with Vitest.
- `pnpm test:watch` runs unit tests in watch mode.
- `pnpm bump-version <semver>` updates `package.json` and both extension manifests to the given version.

## Deployment

### Cloudflare Pages

1. Push to the `main` branch or create a tag `v*` to trigger the deploy workflow.
2. Set `CLOUDFLARE_API_TOKEN` in your GitHub repository secrets.
3. The workflow runs `pnpm build:web` and deploys the `dist/` directory to Cloudflare Pages.
4. The `public/_redirects` file handles SPA routing (`/* /index.html 200`).

Alternatively, deploy manually:

```bash
pnpm build:web
npx wrangler pages deploy dist --project-name=banjo
```

### Railway

1. Create a new Railway project from the `railway` branch of this repository.
2. Railway reads `railway.json` for build and deploy configuration.
3. The build command (`pnpm build:web`) produces the `dist/` directory.
4. The start command (`node server.js`) runs a minimal Express server with SPA fallback.

### Extension Stores

1. Run `pnpm bump-version <semver>` to set the version.
2. Run `pnpm build:ext:chrome && pnpm zip:chrome` to produce the Chrome zip.
3. Run `pnpm build:ext:firefox && pnpm zip:firefox` to produce the Firefox zip.
4. Submit the resulting `.zip` files to the respective store dashboards.

## Architecture Notes

- Core wallet logic belongs in `src/lib/core` once that directory exists.
- Stable core APIs should be imported through `$core` when possible.
- UI-only behavior belongs in Svelte components and route-level modules.
- Core modules must not import `.svelte` files, Svelte stores, routes, or UI state.
- Browser globals and extension APIs should be isolated behind adapters.
- Generated clients and cryptographic utilities should be copied or regenerated artifacts, not hand-rewritten code.

## Page And Section Structure

- Route-level `*Page.svelte` files own page composition, layout order, and step or mode orchestration.
- A page should not be a thin wrapper around a single `*Intro.svelte` component.
- Use `sections/*.svelte` for focused page sections such as headers, forms, review panels, status cards, and repeated cards.
- Avoid `Intro` as a catch-all section name. Only use it for static introductory copy with no orchestration responsibility.
- When sibling sections share state, create a page-scoped state/context file such as `send-page-state.svelte.ts` and let sections consume that explicit state container.
- Prefer separate section components when a block has its own interaction surface, is reused, or would make a page/section visually large.
- Prefer local snippets only for one-off markup decomposition inside a section that does not need independent state or lifecycle.
- Keep visual derivations such as variants, classes, and labels in `$derived` values or typed state getters rather than inline template conditionals.
- Public section props must use explicit TypeScript interfaces and avoid `any`.

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

## P2P Workspace

Banjo includes a collaborative transaction workspace that uses WebRTC data channels to let peers build, review, and sign transactions together. By default, WebRTC signaling uses BEACON-style encrypted Algorand note transactions instead of a TCP WebSocket relay. The WebSocket relay remains available as an advanced local-development fallback.

### Architecture

- **BEACON signaling** (`src/lib/p2p/beacon/`) — derives a wallet-authenticated encryption key, publishes/reads `BEACON/1:` notes from a configured protocol address, and exchanges encrypted WebRTC offer/answer payloads on-chain.
- **Advanced relay fallback** (`server/relay.mjs`) — optional lightweight Node.js WebSocket signalling relay for local development.
- **Peer connection** (`src/lib/p2p/peer-connection.ts`) — wraps `RTCPeerConnection` + data channel lifecycle. Uses Google's public STUN. Data channels are `ordered: true` for reliable delivery. BEACON uses non-trickle ICE so complete SDP payloads can be posted in encrypted note fragments.
- **Workspace session** (`src/lib/p2p/workspace-session.ts`) — orchestrates session lifecycle, state broadcasting, and transaction CRUD. Broadcasts full state on connect, then per-mutation diffs.
- **Transaction signer** (`src/lib/p2p/workspace-signer.ts`) — converts `TransactionDraft` into real `algosdk.Transaction` using live suggested params, signs via the core `signWalletTransactionRequest` infrastructure, and encodes signed blobs as base64 for data channel transport.
- **Workspace page** (`src/lib/pages/workspace/`) — route-level `WorkspacePage.svelte` with page state, lobby, toolbar, composer, review, and peers sections.

### Modes

| Mode | Description |
|------|-------------|
| **Send** | One peer drafts a payment/ASA/keyreg, the other reviews and signs. Signed blobs broadcast and submit to network. |
| **Swap** | (scaffolding) Two peers build reciprocal transactions for atomic submission. |
| **Multisig** | (scaffolding) Participants collect signatures off-chain; group submitted when threshold met. |

### BEACON Configuration

Set a public protocol noticeboard address for each network you want BEACON workspace signaling to support:

```bash
VITE_BEACON_PROTOCOL_ADDRESS_MAINNET=
VITE_BEACON_PROTOCOL_ADDRESS_TESTNET=
VITE_BEACON_PROTOCOL_ADDRESS_LOCALNET=
```

These are public Algorand addresses, not secrets. If no BEACON address is configured for the selected network, Workspace shows a configuration warning and the advanced WebSocket fallback remains available.

### Advanced Relay Fallback

```bash
cd server
node relay.mjs
# Default: ws://localhost:9876
# Override: RELAY_PORT=9877 node relay.mjs
```

### Development

1. Configure a BEACON protocol address for the selected network, or open Advanced and start the relay server.
2. Open two browser tabs to `http://localhost:9000/workspace`.
3. Initialize BEACON for each signing identity once.
4. In one tab, enter the recipient address and click **Send BEACON Offer**.
5. In the other tab, click **Listen for Offer**.
6. Draft transactions, review, sign, and submit after the WebRTC data channel opens.

## Roadmap

The progressive implementation roadmap is tracked in `.plans/11-progressive-roadmap-implementation.md`.
