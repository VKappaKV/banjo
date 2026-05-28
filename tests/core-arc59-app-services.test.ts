import { describe, expect, it } from "vitest";
import { executeArc59SendAssetPlan } from "../src/lib/core/apps";
import type { Arc59SendAssetPlan } from "../src/lib/core/transactions";

describe("ARC-59 app services", () => {
	it("executes ARC-59 send plans through the prepared composer", async () => {
		const sendResult = { txIds: ["txid"] };
		const calls: unknown[] = [];
		const plan = {
			type: "arc59",
			recommendedSendParams: { populateAppCallResources: false },
			composer: {
				async send(params?: unknown) {
					calls.push(params);
					return sendResult;
				},
			},
		} as Arc59SendAssetPlan;

		await expect(executeArc59SendAssetPlan(plan)).resolves.toBe(sendResult);
		expect(calls).toEqual([{ populateAppCallResources: false }]);
	});

	it("rejects direct plans because they do not need ARC-59 app execution", async () => {
		await expect(executeArc59SendAssetPlan({ type: "direct" } as Arc59SendAssetPlan)).rejects.toThrow(
			"Direct ARC-59 plan",
		);
	});
});
