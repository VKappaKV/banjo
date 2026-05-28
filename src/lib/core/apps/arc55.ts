import { AlgorandClient, microAlgos } from "@algorandfoundation/algokit-utils";
import algosdk, { type Algodv2, type Transaction, type TransactionSigner, type modelsv2 } from "algosdk";
import { MsigAppClient, MsigAppFactory, type MsigAppComposer } from "../clients/MsigApp.client";
import type { AccountInfo, Arc55App, BanjoAccount, BanjoMsig, MemberSigs, MsigGroup } from "../types";
import { submitSignedTransactions } from "../transactions";

const arc55SignatureArrayType = algosdk.ABIType.from("byte[64][]");

export class Arc55Error extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Arc55Error";
	}
}

export interface ParsedArc55TransactionBox {
	nonce: bigint;
	index: number;
	transaction: Transaction;
	signedTransaction: string | null;
}

export interface ParsedArc55SignatureBox {
	nonce: bigint;
	address: string;
	signatures: string[];
}

export interface Arc55TransactionGroupCreationPlan {
	nonce: bigint;
	composer: MsigAppComposer;
	mbrPayments: Transaction[];
}

export interface Arc55SpecialSigningMode {
	msig?: BanjoMsig;
	creationPlan?: Arc55TransactionGroupCreationPlan;
}

function decodeUint64(bytes: Uint8Array): bigint {
	return BigInt(algosdk.decodeUint64(bytes, "bigint"));
}

function encodeUint64(value: bigint): Uint8Array {
	return algosdk.encodeUint64(value);
}

function stateKeyToString(key: Uint8Array): string {
	return new TextDecoder().decode(key);
}

function stateValueAsAddress(value: modelsv2.AvmValue): string | undefined {
	return value.bytes && value.bytes.length === 32 ? algosdk.encodeAddress(value.bytes) : undefined;
}

function getOrCreateGroup(app: Arc55App, nonce: bigint): MsigGroup {
	let group = app.groups.find((item) => item.nonce === nonce);

	if (!group) {
		group = { nonce, txns: [], stxns: [], sigs: [] };
		app.groups.push(group);
	}

	return group;
}

function signatureCount(group: MsigGroup): number {
	return group.sigs.reduce((total, member) => total + member.sigs.length, 0);
}

function isNotFoundError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	const status = (error as Error & { status?: unknown; response?: { status?: unknown } }).status ??
		(error as Error & { response?: { status?: unknown } }).response?.status;

	return status === 404 || message.includes("404") || message.includes("not found");
}

function createAlgorandClient(args: {
	algod: Algodv2;
	signer?: TransactionSigner;
	defaultSender?: string;
}): AlgorandClient {
	const algorand = AlgorandClient.fromClients({ algod: args.algod }).setDefaultValidityWindow(1000);

	if (args.signer) {
		algorand.setDefaultSigner(args.signer);

		if (args.defaultSender) {
			algorand.setSigner(args.defaultSender, args.signer);
		}
	}

	return algorand;
}

export function parseArc55GlobalState(app: Arc55App, globalState: modelsv2.AvmKeyValue[] = []): Arc55App {
	const indexedAddrs = new Map<number, string>();

	for (const entry of globalState) {
		if (entry.key.length === 8) {
			const address = stateValueAsAddress(entry.value);

			if (address) {
				indexedAddrs.set(Number(decodeUint64(entry.key)), address);
			}

			continue;
		}

		const key = stateKeyToString(entry.key);

		if (!key.startsWith("arc55_")) {
			continue;
		}

		if (key === "arc55_admin") {
			app.arc55_admin = stateValueAsAddress(entry.value);
		} else if (entry.value.type === 2) {
			app[key] = entry.value.uint ?? 0n;
		} else {
			app[key] = entry.value.bytes;
		}
	}

	app.addrs = [...indexedAddrs.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, address]) => address);

	const nonce = BigInt(app.arc55_nonce ?? 0n);
	app.groups = Array.from({ length: Number(nonce) }, (_, index) => ({
		nonce: BigInt(index + 1),
		txns: [],
		stxns: [],
		sigs: [],
	}));

	return app;
}

export function parseArc55TransactionBox(name: Uint8Array, value: Uint8Array): ParsedArc55TransactionBox | undefined {
	if (name.length !== 9) {
		return undefined;
	}

	const nonce = decodeUint64(name.slice(0, 8));
	const index = name[8];

	if (index == null) {
		throw new Arc55Error("Invalid ARC-55 transaction box name");
	}

	try {
		const signed = algosdk.decodeSignedTransaction(value);

		return {
			nonce,
			index,
			transaction: signed.txn,
			signedTransaction: algosdk.bytesToBase64(value),
		};
	} catch {
		return {
			nonce,
			index,
			transaction: algosdk.decodeUnsignedTransaction(value),
			signedTransaction: null,
		};
	}
}

export function parseArc55SignatureBox(name: Uint8Array, value: Uint8Array): ParsedArc55SignatureBox | undefined {
	if (name.length !== 40) {
		return undefined;
	}

	const decoded = arc55SignatureArrayType.decode(value);

	if (!Array.isArray(decoded)) {
		throw new Arc55Error("Invalid ARC-55 signature box value");
	}

	return {
		nonce: decodeUint64(name.slice(0, 8)),
		address: algosdk.encodeAddress(name.slice(8)),
		signatures: decoded.map((signature) => {
			const signatureBytes = signature instanceof Uint8Array
				? signature
				: Array.isArray(signature)
					? Uint8Array.from(signature as number[])
					: undefined;

			if (!signatureBytes || signatureBytes.length !== 64) {
				throw new Arc55Error("Invalid ARC-55 signature value");
			}

			return algosdk.bytesToBase64(signatureBytes);
		}),
	};
}

export function applyArc55Box(app: Arc55App, name: Uint8Array, value: Uint8Array): void {
	const transactionBox = parseArc55TransactionBox(name, value);

	if (transactionBox) {
		const group = getOrCreateGroup(app, transactionBox.nonce);
		group.txns[transactionBox.index] = transactionBox.transaction;
		group.stxns[transactionBox.index] = transactionBox.signedTransaction;
		return;
	}

	const signatureBox = parseArc55SignatureBox(name, value);

	if (signatureBox) {
		const group = getOrCreateGroup(app, signatureBox.nonce);
		const existing = group.sigs.find((member) => member.addr === signatureBox.address);

		if (existing) {
			existing.sigs = signatureBox.signatures;
		} else {
			group.sigs.push({ addr: signatureBox.address, sigs: signatureBox.signatures });
		}
	}
}

export async function loadArc55App(args: {
	appId: bigint | number;
	algod: Algodv2;
	ignore404?: boolean;
}): Promise<Arc55App | undefined> {
	try {
		const appInfo = (await args.algod.getApplicationByID(args.appId).do()) as modelsv2.Application;
		const appAddress = algosdk.getApplicationAddress(args.appId);
		const appAccount = (await args.algod.accountInformation(appAddress).do()) as modelsv2.Account;
		const app: Arc55App = { info: appInfo, acct: appAccount, addrs: [], groups: [] };
		parseArc55GlobalState(app, appInfo.params.globalState ?? []);

		const boxesResponse = (await args.algod.getApplicationBoxes(args.appId).do()) as modelsv2.BoxesResponse;

		for (const boxDescriptor of boxesResponse.boxes ?? []) {
			const box = (await args.algod.getApplicationBoxByName(args.appId, boxDescriptor.name).do()) as modelsv2.Box;
			applyArc55Box(app, box.name, box.value);
		}

		app.groups.sort((left, right) => Number(left.nonce - right.nonce));

		return app;
	} catch (error) {
		if (args.ignore404 && isNotFoundError(error)) {
			return undefined;
		}

		throw error;
	}
}

export function buildArc55SignedGroup(app: Arc55App, nonce: bigint): Uint8Array[] {
	const group = app.groups.find((item) => item.nonce === nonce);
	const threshold = Number(app.arc55_threshold);

	if (!group) {
		throw new Arc55Error("ARC-55 group not found");
	}

	if (!threshold || !app.addrs.length) {
		throw new Arc55Error("Invalid ARC-55 multisig metadata");
	}

	return group.txns.map((transaction, index) => {
		const storedSigned = group.stxns[index];

		if (storedSigned) {
			return algosdk.base64ToBytes(storedSigned);
		}

		let blob = algosdk.createMultisigTransaction(transaction, {
			version: 1,
			threshold,
			addrs: app.addrs,
		});

		for (const member of group.sigs) {
			const signature = member.sigs[index];

			if (!signature) {
				continue;
			}

			blob = algosdk.appendSignRawMultisigSignature(
				blob,
				{ version: 1, threshold, addrs: app.addrs },
				member.addr,
				algosdk.base64ToBytes(signature),
			).blob;
		}

		return blob;
	});
}

export async function submitArc55Group(args: {
	app: Arc55App;
	nonce: bigint;
	algod: Algodv2;
}): Promise<modelsv2.PendingTransactionResponse> {
	return submitSignedTransactions({
		algod: args.algod,
		signedTransactions: buildArc55SignedGroup(args.app, args.nonce),
	});
}

export function createArc55AppClient(args: {
	appId: bigint | number;
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): MsigAppClient {
	const factory = new MsigAppFactory({
		algorand: createAlgorandClient({ algod: args.algod, signer: args.signer, defaultSender: args.sender }),
		defaultSender: args.sender,
		defaultSigner: args.signer,
	});

	return factory.getAppClientById({ appId: BigInt(args.appId) });
}

export async function clearArc55Signatures(args: {
	appId: bigint | number;
	nonce: bigint;
	address: string;
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): Promise<unknown> {
	const params = await args.algod.getTransactionParams().do();
	const client = createArc55AppClient(args);

	return client.send.arc55ClearSignatures({
		args: { transactionGroup: args.nonce, address: args.address },
		staticFee: microAlgos(BigInt(params.minFee ?? 1000) * 2n),
	});
}

export async function deleteArc55Group(args: {
	appId: bigint | number;
	group: MsigGroup;
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): Promise<unknown> {
	const params = await args.algod.getTransactionParams().do();
	const client = createArc55AppClient(args);
	const composer = client.newGroup();
	const staticFee = microAlgos(BigInt(params.minFee ?? 1000) * 2n);

	for (const member of args.group.sigs.filter((item) => item.sigs.length > 0)) {
		composer.arc55ClearSignatures({
			sender: args.sender,
			args: { transactionGroup: args.group.nonce, address: member.addr },
			staticFee,
		});
	}

	args.group.txns.forEach((_, index) => {
		composer.arc55RemoveTransaction({
			sender: args.sender,
			args: { transactionGroup: args.group.nonce, index },
			staticFee,
		});
	});

	return composer.send({ populateAppCallResources: true });
}

export function validateDestroyArc55App(app: Arc55App): void {
	if (app.groups.some((group) => group.txns.length > 0 || signatureCount(group) > 0)) {
		throw new Arc55Error("Cannot destroy ARC-55 app while transaction groups or signatures remain");
	}
}

export async function destroyArc55App(args: {
	app: Arc55App;
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): Promise<unknown> {
	validateDestroyArc55App(args.app);
	const params = await args.algod.getTransactionParams().do();
	const client = createArc55AppClient({
		appId: args.app.info.id,
		sender: args.sender,
		algod: args.algod,
		signer: args.signer,
	});

	return client.send.delete.destroy({ args: [], staticFee: microAlgos(BigInt(params.minFee ?? 1000) * 2n) });
}

export function computeArc55MultisigAddress(threshold: number, addresses: string[]): string {
	if (!Number.isInteger(threshold) || threshold < 1 || threshold > addresses.length) {
		throw new Arc55Error("Invalid ARC-55 multisig threshold");
	}

	addresses.forEach((address) => {
		if (!algosdk.isValidAddress(address)) {
			throw new Arc55Error("Invalid ARC-55 multisig address");
		}
	});

	return algosdk.multisigAddress({ version: 1, threshold, addrs: addresses }).toString();
}

export async function deployArc55App(args: {
	creator: string;
	threshold: number;
	addresses: string[];
	algod: Algodv2;
	signer: TransactionSigner;
}): Promise<{ appId: bigint; address: string }> {
	const address = computeArc55MultisigAddress(args.threshold, args.addresses);
	const factory = new MsigAppFactory({
		algorand: createAlgorandClient({ algod: args.algod, signer: args.signer, defaultSender: args.creator }),
		defaultSender: args.creator,
		defaultSigner: args.signer,
	});
	const result = await factory.send.create.deploy({
		args: { admin: args.creator, threshold: args.threshold, addresses: args.addresses },
	});
	const appId = BigInt(result.result.appId ?? result.result.return ?? 0n);

	if (appId === 0n) {
		throw new Arc55Error("ARC-55 deploy did not return an app ID");
	}

	return { appId, address };
}

export function validateArc55Import(app: Arc55App, signingAccounts: AccountInfo[]): void {
	if (!app.arc55_admin || !app.arc55_threshold || app.addrs.length === 0) {
		throw new Arc55Error("Invalid ARC-55 app");
	}

	const localSigners = new Set(signingAccounts.filter((account) => account.canSign).map((account) => account.addr));

	if (!localSigners.has(app.arc55_admin) && !app.addrs.some((address) => localSigners.has(address))) {
		throw new Arc55Error("No local ARC-55 admin or member signing account found");
	}
}

export function accountFromArc55App(app: Arc55App, networkName: string): BanjoAccount {
	return {
		addr: computeArc55MultisigAddress(Number(app.arc55_threshold), app.addrs),
		appId: app.info.id,
		network: networkName,
	};
}

export function detectArc55SigningMode(args: {
	account: BanjoAccount;
	app: Arc55App;
	signingAccounts: AccountInfo[];
}): BanjoMsig | undefined {
	if (args.account.appId == null) {
		return undefined;
	}

	const threshold = Number(args.app.arc55_threshold);

	if (!threshold) {
		return undefined;
	}

	const localSigners = args.signingAccounts.filter((account) => account.canSign);
	const best = localSigners
		.map((account) => ({
			address: account.addr,
			power: args.app.addrs.filter((address) => address === account.addr).length,
		}))
		.sort((left, right) => right.power - left.power)[0];

	if (!best || best.power === 0) {
		return undefined;
	}

	return { app: args.app, signerAddr: best.address, bypass: best.power >= threshold };
}

export function buildArc55TransactionGroupCreationPlan(args: {
	app: Arc55App;
	transactions: Transaction[];
	signedTransactions?: Array<Uint8Array | null | undefined>;
	sender: string;
	client: MsigAppClient;
	suggestedParams: algosdk.SuggestedParams;
	signer?: TransactionSigner;
}): Arc55TransactionGroupCreationPlan {
	const nonce = BigInt(args.app.arc55_nonce ?? 0n) + 1n;
	const appAddress = algosdk.getApplicationAddress(args.app.info.id);
	const composer = args.client.newGroup();
	const mbrPayments: Transaction[] = [];
	composer.arc55NewTransactionGroup({ sender: args.sender, args: [] });

	args.transactions.forEach((transaction, index) => {
		const transactionBytes = args.signedTransactions?.[index] ?? algosdk.encodeUnsignedTransaction(transaction);
		const mbr = 2500n + 400n * BigInt(9 + transactionBytes.length);
		const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender: args.sender,
			receiver: appAddress,
			amount: mbr,
			suggestedParams: args.suggestedParams,
		});
		mbrPayments.push(payment);
		composer.arc55AddTransaction({
			sender: args.sender,
			args: { costs: payment, transactionGroup: nonce, index, transaction: transactionBytes },
		});
	});

	return { nonce, composer, mbrPayments };
}

export async function waitForArc55Threshold(args: {
	appId: bigint | number;
	nonce: bigint;
	algod: Algodv2;
	threshold?: number;
	pollIntervalMs?: number;
	signal?: AbortSignal;
	loadApp?: typeof loadArc55App;
}): Promise<Uint8Array[]> {
	const loadApp = args.loadApp ?? loadArc55App;
	const pollIntervalMs = args.pollIntervalMs ?? 1000;

	while (!args.signal?.aborted) {
		const app = await loadApp({ appId: args.appId, algod: args.algod });
		const group = app?.groups.find((item) => item.nonce === args.nonce);
		const threshold = args.threshold ?? Number(app?.arc55_threshold ?? 0);

		if (app && group && threshold && signatureCount(group) >= threshold * group.txns.length) {
			return buildArc55SignedGroup(app, args.nonce);
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Arc55Error("ARC-55 signature polling cancelled");
}

export function arc55TransactionBoxName(nonce: bigint, index: number): Uint8Array {
	return new Uint8Array([...encodeUint64(nonce), index]);
}

export function arc55SignatureBoxName(nonce: bigint, address: string): Uint8Array {
	return new Uint8Array([...encodeUint64(nonce), ...algosdk.decodeAddress(address).publicKey]);
}

export function encodeArc55SignatureArray(signatures: Uint8Array[]): Uint8Array {
	return arc55SignatureArrayType.encode(signatures);
}
