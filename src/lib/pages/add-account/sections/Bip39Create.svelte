<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createAndStoreBip39Seed } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step = "warning" | "generate" | "done";
  let step = $state<Step>("warning");
  let passphrase = $state("");
  let passphraseConfirm = $state("");
  let error = $state("");
  let generatedMnemonic = $state("");
  let seedId = $state<number | null>(null);

  function proceedToGenerate() {
    if (passphrase !== passphraseConfirm) {
      error = "Passphrases do not match.";
      return;
    }
    if (passphrase.length < 4) {
      error = "Passphrase must be at least 4 characters.";
      return;
    }
    error = "";
    void generate();
  }

  async function generate() {
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }
    try {
      const result = await createAndStoreBip39Seed({
        passphrase,
        storage: app.core.storage,
        cryptoProvider: app.core.cryptoProvider,
      });
      generatedMnemonic = result.mnemonic;
      seedId = result.seedId;
      step = "done";
    } catch (e) {
      error = e instanceof Error ? e.message : "Creation failed.";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">New BIP39 Seed</h2>
  </div>

  {#if step === "warning"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Important</Card.Title>
        <Card.Description>
          You are about to generate a new BIP39 seed phrase. This seed can
          derive multiple HD accounts. Write down the mnemonic and keep it safe
          — it is the only way to recover your HD accounts.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3">
        <input
          type="password"
          bind:value={passphrase}
          class="w-full rounded border border-input bg-background p-2 text-sm"
          placeholder="Encryption passphrase"
        />
        <input
          type="password"
          bind:value={passphraseConfirm}
          class="w-full rounded border border-input bg-background p-2 text-sm"
          placeholder="Confirm passphrase"
        />
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button onclick={proceedToGenerate}>Generate Seed</Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "done"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Seed Created</Card.Title>
        <Card.Description>
          Seed ID {seedId} — write down this mnemonic and store it securely.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {#each generatedMnemonic.split(" ") as word, i}
            <span class="text-muted-foreground text-right">{i + 1}.</span>
            <span class="font-mono">{word}</span>
          {/each}
        </div>
      </Card.Content>
      <Card.Footer class="flex gap-2">
        <Button onclick={onback}>Done</Button>
        <Button
          variant="outline"
          onclick={() => {
            step = "warning";
            passphrase = "";
            passphraseConfirm = "";
            generatedMnemonic = "";
            seedId = null;
          }}
        >
          Create Another
        </Button>
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
