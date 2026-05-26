# Generated Clients

This directory contains generated Algorand app clients used by Banjo core.

## Source Artifacts

- `Arc59Client.ts` was copied from `https://github.com/GalaxyPay/lute/blob/main/src/clients/Arc59Client.ts`.
- `MsigApp.client.ts` was copied from `https://github.com/GalaxyPay/lute/blob/main/src/clients/MsigApp.client.ts`.

## Rules

- Do not hand-edit generated client internals.
- Wrap generated clients from `apps/`, `transactions/`, or another domain folder when handwritten behavior is needed.
- Prefer regeneration with `algokit generate client <app-spec> --output <client.ts>` when the matching ARC-32 or ARC-56 application specification is available.
- `data/msig-app.arc4.json` provides ARC-4 ABI access for ARC-55 behavior, but it is not the full ARC-56 app spec embedded in `MsigApp.client.ts`.

The copied generated clients include a minimal Banjo compatibility edit: `Buffer` is imported from the browser-compatible `buffer` package because the upstream generated files reference `Buffer` without importing it. Generated methods and app specs are otherwise left intact.

## Deferred Clients

- The upstream governance client is deferred for Banjo v1. Revisit when governance claim or root-management features are added to the Banjo roadmap.
