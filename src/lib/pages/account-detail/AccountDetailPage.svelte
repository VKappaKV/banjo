<script lang="ts">
	import AccountDetail from "./sections/AccountDetail.svelte";

	export let params: Record<string, string> = {};
</script>

<AccountDetail addr={params.addr} />
