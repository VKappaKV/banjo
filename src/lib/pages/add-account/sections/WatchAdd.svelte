<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { addWatchAccount } from "$core/accounts";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  let address = $state("");
  let error = $state("");
  let success = $state("");

  async function handleAdd() {
    error = "";
    success = "";

    const trimmed = address.trim();
    if (!trimmed) {
      error = "Enter an Algorand address.";
      return;
    }

    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

    try {
      const account = await addWatchAccount({
        address: trimmed,
        state: app.state,
        storage: app.core.storage,
      });
      success = `Watching ${account.addr.slice(0, 8)}...`;
      address = "";
      await app.refreshWallet();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to add watch account.";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">Watch Account</h2>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Add an address to watch</Card.Title>
      <Card.Description
        >You will be able to see the balance and assets of this address without
        importing any keys.</Card.Description
      >
    </Card.Header>
    <Card.Content class="grid gap-3">
      <input
        bind:value={address}
        class="w-full rounded border border-input bg-background p-2 font-mono text-sm"
        placeholder="Algorand address (e.g. ABC123...)"
      />

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
      <Button onclick={handleAdd} disabled={!address.trim()}
        >Add Watch Account</Button
      >
      {#if success}
        <Button variant="outline" onclick={() => push("/accounts")}
          >View Accounts</Button
        >
      {/if}
    </Card.Footer>
  </Card.Root>
</div>
