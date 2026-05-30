<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { importAndStoreBip39Seed } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  let mnemonic = $state("");
  let passphrase = $state("");
  let error = $state("");
  let seedId = $state<number | null>(null);

  async function handleImport() {
    error = "";
    seedId = null;

    const trimmed = mnemonic.trim();
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

	try {
		app.core.logger.info({ namespace: "onboarding", event: "bip39-import-started" });
		const result = await importAndStoreBip39Seed({
        mnemonic: trimmed,
        passphrase,
        storage: app.core.storage,
        cryptoProvider: app.core.cryptoProvider,
		});
		seedId = result.seedId;
		app.core.logger.info({ namespace: "onboarding", event: "bip39-import-completed", fields: { seedId: result.seedId } });
	} catch (e) {
		error = e instanceof Error ? e.message : "Import failed.";
		app.core.logger.error({ namespace: "onboarding", event: "bip39-import-failed", error: e });
	}
}
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">BIP39 Seed Import</h2>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Import a BIP39 seed phrase</Card.Title>
      <Card.Description
        >Enter your 24-word BIP39 seed and a password to encrypt it locally.</Card.Description
      >
    </Card.Header>
    <Card.Content class="grid gap-3">
      <textarea
        bind:value={mnemonic}
        class="min-h-25 w-full rounded border border-input bg-background p-3 font-mono text-sm"
        placeholder="Paste 24-word BIP39 seed phrase..."
      ></textarea>

      <input
        type="password"
        bind:value={passphrase}
        class="w-full rounded border border-input bg-background p-2 text-sm"
        placeholder="Encryption passphrase"
      />

      {#if error}
        <Alert.Root variant="destructive">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}

      {#if seedId !== null}
        <Alert.Root>
          <Alert.Description
            >Seed imported with ID {seedId}. You can now discover HD accounts.</Alert.Description
          >
        </Alert.Root>
      {/if}
    </Card.Content>
    <Card.Footer class="flex gap-2">
      <Button onclick={handleImport} disabled={!mnemonic.trim()}
        >Import Seed</Button
      >
      {#if seedId !== null}
        <Button variant="outline" onclick={onback}>Done</Button>
      {/if}
    </Card.Footer>
  </Card.Root>
</div>
