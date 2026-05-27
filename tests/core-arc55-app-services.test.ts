import algosdk, { type Algodv2, type SuggestedParams, type modelsv2 } from "algosdk";
import { describe, expect, it, vi } from "vitest";
import {
	accountFromArc55App,
	arc55SignatureBoxName,
	arc55TransactionBoxName,
	buildArc55SignedGroup,
	buildArc55TransactionGroupCreationPlan,
	computeArc55MultisigAddress,
	detectArc55SigningMode,
	encodeArc55SignatureArray,
	loadArc55App,
	parseArc55GlobalState,
	parseArc55SignatureBox,
	parseArc55TransactionBox,
	validateArc55Import,
	validateDestroyArc55App,
	waitForArc55Threshold,
} from "../src/lib/core/apps";
import type { AccountInfo, Arc55App, MsigGroup } from "../src/lib/core/types";

const suggestedParams: SuggestedParams = {
	fee: 1000,
	minFee: 1000,
	firstValid: 1,
	lastValid: 1000,
	genesisHash: new Uint8Array(32),
	genesisID: "unitnet-v1",
	flatFee: true,
};

function accountAddress(): string {
	return algosdk.generateAccount().addr.toString();
}

function paymentTxn(sender: string): algosdk.Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender,
		receiver: accountAddress(),
		amount: 1,
		suggestedParams,
	});
}

function avmBytes(bytes: Uint8Array): modelsv2.AvmValue {
	return { type: 1, bytes } as modelsv2.AvmValue;
}

function avmUint(uint: bigint): modelsv2.AvmValue {
	return { type: 2, uint } as modelsv2.AvmValue;
}

function keyValue(key: Uint8Array | string, value: modelsv2.AvmValue): modelsv2.AvmKeyValue {
	return { key: typeof key === "string" ? new TextEncoder().encode(key) : key, value } as modelsv2.AvmKeyValue;
}

function appModel(args: { id?: bigint; globalState?: modelsv2.AvmKeyValue[] } = {}): modelsv2.Application {
	return { id: args.id ?? 123n, params: { globalState: args.globalState ?? [] } } as modelsv2.Application;
}

function emptyApp(globalState: modelsv2.AvmKeyValue[] = []): Arc55App {
	return { info: appModel({ globalState }), acct: { address: accountAddress() } as modelsv2.Account, addrs: [], groups: [] };
}

function signatureFor(transaction: algosdk.Transaction, account: algosdk.Account): Uint8Array {
	return algosdk.decodeSignedTransaction(transaction.signTxn(account.sk)).sig!;
}

describe("ARC-55 app services", () => {
	it("parses global state with admin, threshold, nonce, and repeated signer addresses", () => {
		const admin = algosdk.generateAccount().addr.toString();
		const signer = algosdk.generateAccount().addr.toString();
		const other = algosdk.generateAccount().addr.toString();
		const app = emptyApp();

		parseArc55GlobalState(app, [
			keyValue("arc55_admin", avmBytes(algosdk.decodeAddress(admin).publicKey)),
			keyValue("arc55_threshold", avmUint(2n)),
			keyValue("arc55_nonce", avmUint(3n)),
			keyValue(algosdk.encodeUint64(0), avmBytes(algosdk.decodeAddress(signer).publicKey)),
			keyValue(algosdk.encodeUint64(1), avmBytes(algosdk.decodeAddress(signer).publicKey)),
			keyValue(algosdk.encodeUint64(2), avmBytes(algosdk.decodeAddress(other).publicKey)),
		]);

		expect(app.arc55_admin).toBe(admin);
		expect(app.arc55_threshold).toBe(2n);
		expect(app.arc55_nonce).toBe(3n);
		expect(app.addrs).toEqual([signer, signer, other]);
		expect(app.groups.map((group) => group.nonce)).toEqual([1n, 2n, 3n]);
	});

	it("parses unsigned and signed transaction boxes", () => {
		const sender = algosdk.generateAccount();
		const transaction = paymentTxn(sender.addr.toString());
		const unsigned = parseArc55TransactionBox(
			arc55TransactionBoxName(7n, 2),
			algosdk.encodeUnsignedTransaction(transaction),
		)!;
		const signedBytes = transaction.signTxn(sender.sk);
		const signed = parseArc55TransactionBox(arc55TransactionBoxName(7n, 3), signedBytes)!;

		expect(unsigned.nonce).toBe(7n);
		expect(unsigned.index).toBe(2);
		expect(unsigned.transaction.txID()).toBe(transaction.txID());
		expect(unsigned.signedTransaction).toBeNull();
		expect(signed.index).toBe(3);
		expect(signed.signedTransaction).toBe(algosdk.bytesToBase64(signedBytes));
	});

	it("parses signature boxes as ABI byte[64][]", () => {
		const signer = algosdk.generateAccount().addr.toString();
		const signatures = [new Uint8Array(64).fill(1), new Uint8Array(64).fill(2)];
		const parsed = parseArc55SignatureBox(
			arc55SignatureBoxName(5n, signer),
			encodeArc55SignatureArray(signatures),
		)!;

		expect(parsed.nonce).toBe(5n);
		expect(parsed.address).toBe(signer);
		expect(parsed.signatures).toEqual(signatures.map((signature) => algosdk.bytesToBase64(signature)));
	});

	it("loads an ARC-55 app without wallet side effects", async () => {
		const admin = algosdk.generateAccount().addr.toString();
		const member = algosdk.generateAccount().addr.toString();
		const transaction = paymentTxn(computeArc55MultisigAddress(1, [member]));
		const globalState = [
			keyValue("arc55_admin", avmBytes(algosdk.decodeAddress(admin).publicKey)),
			keyValue("arc55_threshold", avmUint(1n)),
			keyValue("arc55_nonce", avmUint(1n)),
			keyValue(algosdk.encodeUint64(0), avmBytes(algosdk.decodeAddress(member).publicKey)),
		];
		const boxes = [{ name: arc55TransactionBoxName(1n, 0) }];
		const algod = {
			getApplicationByID: () => ({ do: async () => appModel({ id: 44n, globalState }) }),
			accountInformation: () => ({ do: async () => ({ address: algosdk.getApplicationAddress(44n) }) }),
			getApplicationBoxes: () => ({ do: async () => ({ boxes }) }),
			getApplicationBoxByName: () => ({ do: async () => ({ name: boxes[0]!.name, value: algosdk.encodeUnsignedTransaction(transaction), round: 1n }) }),
		} as unknown as Algodv2;

		const app = await loadArc55App({ appId: 44n, algod });

		expect(app?.info.id).toBe(44n);
		expect(app?.arc55_admin).toBe(admin);
		expect(app?.addrs).toEqual([member]);
		expect(app?.groups[0]?.txns[0]?.txID()).toBe(transaction.txID());
	});

	it("returns undefined for ignored missing ARC-55 apps", async () => {
		const algod = {
			getApplicationByID: () => ({ do: async () => { throw new Error("404 not found"); } }),
		} as unknown as Algodv2;

		await expect(loadArc55App({ appId: 999n, algod, ignore404: true })).resolves.toBeUndefined();
	});

	it("builds signed multisig groups from member signatures and preserves stored signed transactions", () => {
		const signer = algosdk.generateAccount();
		const other = algosdk.generateAccount();
		const multisigAddress = computeArc55MultisigAddress(1, [signer.addr.toString(), other.addr.toString()]);
		const unsignedTxn = paymentTxn(multisigAddress);
		const storedTxn = paymentTxn(signer.addr.toString());
		const storedSigned = storedTxn.signTxn(signer.sk);
		const group: MsigGroup = {
			nonce: 1n,
			txns: [unsignedTxn, storedTxn],
			stxns: [null, algosdk.bytesToBase64(storedSigned)],
			sigs: [{ addr: signer.addr.toString(), sigs: [algosdk.bytesToBase64(signatureFor(unsignedTxn, signer))] }],
		};
		const app = { ...emptyApp(), addrs: [signer.addr.toString(), other.addr.toString()], arc55_threshold: 1n, groups: [group] };

		const [builtUnsigned, builtStored] = buildArc55SignedGroup(app, 1n);
		const decodedUnsigned = algosdk.decodeSignedTransaction(builtUnsigned!);

		expect(decodedUnsigned.msig?.thr).toBe(1);
		expect(decodedUnsigned.msig?.subsig[0]?.s?.byteLength).toBe(64);
		expect(decodedUnsigned.txn.txID()).toBe(unsignedTxn.txID());
		expect(builtStored).toEqual(storedSigned);
	});

	it("validates imports, creates account records, and detects bypass voting power", () => {
		const admin = algosdk.generateAccount().addr.toString();
		const signer = algosdk.generateAccount().addr.toString();
		const app = {
			...emptyApp(),
			info: appModel({ id: 55n }),
			arc55_admin: admin,
			arc55_threshold: 2n,
			addrs: [signer, signer, accountAddress()],
		};
		const signingAccounts = [{ addr: signer, canSign: true } as AccountInfo];

		expect(() => validateArc55Import(app, signingAccounts)).not.toThrow();
		expect(accountFromArc55App(app, "TestNet")).toEqual({
			addr: computeArc55MultisigAddress(2, app.addrs),
			appId: 55n,
			network: "TestNet",
		});
		expect(detectArc55SigningMode({ account: { addr: "MSIG", appId: 55n }, app, signingAccounts })).toMatchObject({
			signerAddr: signer,
			bypass: true,
		});
	});

	it("blocks destroy while groups or signatures remain", () => {
		const app = { ...emptyApp(), groups: [{ nonce: 1n, txns: [paymentTxn(accountAddress())], stxns: [], sigs: [] }] };

		expect(() => validateDestroyArc55App(app)).toThrow("Cannot destroy ARC-55 app");
	});

	it("builds transaction group creation plans with MBR payments", () => {
		const app = { ...emptyApp(), info: appModel({ id: 77n }), arc55_nonce: 4n };
		const sender = accountAddress();
		const transaction = paymentTxn(sender);
		const calls: Array<{ method: string; params?: unknown }> = [];
		const client = {
			newGroup: () => ({
				arc55NewTransactionGroup(params?: unknown) { calls.push({ method: "arc55NewTransactionGroup", params }); return this; },
				arc55AddTransaction(params?: unknown) { calls.push({ method: "arc55AddTransaction", params }); return this; },
			}),
		} as never;

		const plan = buildArc55TransactionGroupCreationPlan({
			app,
			transactions: [transaction],
			sender,
			client,
			suggestedParams,
		});

		expect(plan.nonce).toBe(5n);
		expect(plan.mbrPayments).toHaveLength(1);
		expect(plan.mbrPayments[0]?.payment?.receiver.toString()).toBe(algosdk.getApplicationAddress(77n).toString());
		expect(calls.map((call) => call.method)).toEqual(["arc55NewTransactionGroup", "arc55AddTransaction"]);
	});

	it("cancels threshold polling through AbortSignal", async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(waitForArc55Threshold({
			appId: 1n,
			nonce: 1n,
			algod: {} as Algodv2,
			signal: controller.signal,
			pollIntervalMs: 1,
			loadApp: async () => emptyApp(),
		})).rejects.toThrow("cancelled");
	});
});
