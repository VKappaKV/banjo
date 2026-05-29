<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createHotAccountPreview, saveHotAccount } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step = "warning" | "mnemonic" | "challenge" | "done";

  let step = $state<Step>("warning");
  let preview = $state<ReturnType<typeof createHotAccountPreview> | null>(null);
  let challengeIndex = $state(0);
  let challengeAnswer = $state("");
  let challengeError = $state("");
  let saveError = $state("");
  let savedAddr = $state("");
  let revealWords = $state(false);

  function startGenerate() {
    preview = createHotAccountPreview();
    challengeIndex = Math.floor(Math.random() * 25);
    step = "mnemonic";
  }

  function proceedToChallenge() {
    challengeAnswer = "";
    challengeError = "";
    step = "challenge";
  }

  function verifyChallenge() {
    challengeError = "";
    if (!preview) return;
    if (
      challengeAnswer.trim().toLowerCase() !==
      preview.mnemonicWords[challengeIndex]!.toLowerCase()
    ) {
      challengeError = `Word #${challengeIndex + 1} does not match. Please try again.`;
      return;
    }
    void saveAccount();
  }

  async function saveAccount() {
    if (!preview || !app.core) return;
    saveError = "";
    try {
      const account = await saveHotAccount({
        account: preview.account,
        state: app.state,
        storage: app.core.storage,
        cryptoProvider: app.core.cryptoProvider,
      });
      savedAddr = account.addr;
      step = "done";
      await app.refreshWallet();
    } catch (e) {
      saveError = e instanceof Error ? e.message : "Failed to save account.";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">New Hot Account</h2>
  </div>

  {#if step === "warning"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Important</Card.Title>
        <Card.Description>
          You are about to generate a new random Algorand account key. This key
          will be stored in your browser's encrypted storage. Write down the
          mnemonic and keep it safe — it is the only way to recover this
          account.
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button onclick={startGenerate}>Generate Account</Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "mnemonic"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Your Mnemonic</Card.Title>
        <Card.Description
          >Write these 25 words down in order and store them securely.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-3">
        {#if preview}
          {@const words = preview.mnemonicWords}
          <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {#each words as word, i}
              <span class="text-muted-foreground text-right">{i + 1}.</span>
              <span class="font-mono">{word}</span>
            {/each}
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onclick={() => (revealWords = !revealWords)}
          >
            {revealWords ? "Hide" : "Show"} mnemonic
          </Button>
        </div>
      </Card.Content>
      <Card.Footer>
        <Button onclick={proceedToChallenge}
          >I've saved my mnemonic — Continue</Button
        >
      </Card.Footer>
    </Card.Root>
  {:else if step === "challenge"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Confirm your backup</Card.Title>
        <Card.Description
          >Type word #{challengeIndex + 1} from your mnemonic to confirm you've saved
          it.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-3">
        <input
          bind:value={challengeAnswer}
          class="w-full rounded border border-input bg-background p-2 font-mono text-sm"
          placeholder={`Word #${challengeIndex + 1}`}
        />
        {#if challengeError}
          <Alert.Root variant="destructive">
            <Alert.Description>{challengeError}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button onclick={verifyChallenge} disabled={!challengeAnswer.trim()}
          >Confirm</Button
        >
      </Card.Footer>
    </Card.Root>
  {:else if step === "done"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Account created</Card.Title>
        <Card.Description
          >Your new hot account is ready: {savedAddr.slice(
            0,
            8,
          )}...</Card.Description
        >
      </Card.Header>
      <Card.Content>
        {#if saveError}
          <Alert.Root variant="destructive">
            <Alert.Description>{saveError}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer class="flex gap-2">
        <Button onclick={onback}>Add Another Account</Button>
        <Button
          variant="outline"
          onclick={() => push(`/account-detail/${savedAddr}`)}
          >View Details</Button
        >
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
