const checks = [
	{
		title: "Prerequisites",
		steps: [
			"Run `algokit localnet start`.",
			"Run `pnpm dev` and open Banjo.",
			"Switch Banjo to LocalNet.",
			"Use Add Account > KMD Import to import at least two funded LocalNet accounts.",
			"Refresh accounts and confirm balances are visible.",
		],
	},
	{
		title: "Payment",
		steps: [
			"Open Send from the sidebar.",
			"Select ALGO mode.",
			"Send a small amount from account A to account B with a short note.",
			"Review sender, receiver, amount, note, and fee.",
			"Sign and submit, then refresh accounts and confirm balances changed.",
		],
	},
	{
		title: "ASA Transfer",
		steps: [
			"Create a LocalNet ASA externally or via algod tooling, then opt account B into it.",
			"Refresh Banjo so account A shows the ASA holding.",
			"Open Send > ASA mode and transfer a small amount from account A to account B.",
			"Review asset ID, receiver, amount, and optional note.",
			"Submit and confirm both account asset balances after refresh.",
		],
	},
	{
		title: "ARC-59 ASA Route",
		steps: [
			"Use an ASA receiver that is not opted into the selected ASA.",
			"Ensure LocalNet has a sandbox ARC-59 router configured in settings.",
			"Open Send > ASA mode and enter the non-opted-in receiver.",
			"Confirm the review step shows ARC-59, MBR payment, app call fee, and inner transaction count.",
			"Submit and confirm the ARC-59 group succeeds or returns an actionable contract/network error.",
		],
	},
	{
		title: "Rekey",
		steps: [
			"Open Send > Rekey mode.",
			"Enter account B as the new auth address for account A.",
			"Confirm the rekey warning is shown in the form and review step.",
			"Submit, refresh, and verify account A shows its auth/rekey relationship.",
			"Optionally rekey account A back to itself before continuing smoke checks.",
		],
	},
	{
		title: "Participation Key Registration",
		steps: [
			"Open Send > Online keyreg mode.",
			"Paste `goal account partkeyinfo` output and click Parse Partkey.",
			"Confirm first/last round, key dilution, voting key, selection key, and state proof key populate.",
			"Click Estimate Block Time and confirm a block-time estimate appears.",
			"Review and submit, or use Offline keyreg mode for an offline/non-participation transaction.",
		],
	},
	{
		title: "Atomic Swap",
		steps: [
			"Open Swap from the sidebar.",
			"Create a proposal from account A to account B for reciprocal ALGO or ASA amounts.",
			"Copy the serialized proposal JSON.",
			"Switch to Accept Proposal, paste the JSON, sign as account B, and submit.",
			"Refresh accounts and verify both sides of the swap settled.",
		],
	},
];

console.log("Banjo LocalNet M14 Smoke Checklist");
console.log("=================================");

for (const [index, check] of checks.entries()) {
	console.log(`\n${index + 1}. ${check.title}`);
	for (const step of check.steps) {
		console.log(`   - ${step}`);
	}
}

console.log("\nVerification after smoke run:");
console.log("   - `pnpm check`");
console.log("   - `pnpm test`");
console.log("   - `pnpm build`");
