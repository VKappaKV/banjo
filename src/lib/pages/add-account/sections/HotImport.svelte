<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { importHotMnemonic } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  let mnemonic = $state("");
  let error = $state("");
  let success = $state("");

  async function handleImport() {
    error = "";
    success = "";

    const trimmed = mnemonic.trim();
    const words = trimmed.split(/\s+/);

    if (words.length !== 25) {
      error =
        "Algorand mnemonics are exactly 25 words. Found " + words.length + ".";
      return;
    }

    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

    try {
      const account = await importHotMnemonic({
        mnemonic: trimmed,
        state: app.state,
        storage: app.core.storage,
        cryptoProvider: app.core.cryptoProvider,
      });
      success = `Imported ${account.addr.slice(0, 8)}...`;
      await app.refreshWallet();
    } catch (e) {
      error = e instanceof Error ? e.message : "Import failed.";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">Hot Mnemonic Import</h2>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Paste or type your 25-word mnemonic</Card.Title>
      <Card.Description
        >This key will be stored in your browser's encrypted key storage.</Card.Description
      >
    </Card.Header>
    <Card.Content class="grid gap-3">
      <textarea
        bind:value={mnemonic}
        class="min-h-[120px] w-full rounded border border-input bg-background p-3 font-mono text-sm"
        placeholder="Paste 25-word mnemonic here..."
      ></textarea>

      {#if error}
        <Alert.Root variant="destructive">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}

      {#if success}
        <Alert.Root>
          <Alert.Description>{success}</Alert.Description>
        </Alert.Root>
      {/if}
    </Card.Content>
    <Card.Footer class="flex gap-2">
      <Button onclick={handleImport} disabled={!mnemonic.trim()}>Import</Button>
      {#if success}
        <Button variant="outline" onclick={() => push("/accounts")}
          >View Accounts</Button
        >
      {/if}
    </Card.Footer>
  </Card.Root>
</div>
