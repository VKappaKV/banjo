<script lang="ts">
  import { getWalletAppContext } from "$lib/app/context";
  import BehaviorSection from "./sections/BehaviorSection.svelte";
  import NetworkSection from "./sections/NetworkSection.svelte";
  import PreferencesSection from "./sections/PreferencesSection.svelte";
  import ThemeSection from "./sections/ThemeSection.svelte";

  const app = getWalletAppContext();
</script>

<div class="grid gap-6">
  <div>
    <h2 class="text-2xl font-mono tracking-tight">Settings</h2>
    <p class="text-muted-foreground text-sm">
      Configure wallet preferences, network options, and developer tools.
    </p>
  </div>
  <ThemeSection />
  <NetworkSection />
  <PreferencesSection />
  <BehaviorSection />
</div>
