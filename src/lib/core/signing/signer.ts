import { Buffer } from "buffer";
import algosdk, { type Algodv2, type Transaction } from "algosdk";
import type { CryptoProvider, CredentialProvider, LedgerProvider } from "../runtime";
import type { WalletState } from "../state";
import type { WalletStorage } from "../storage";
import type { AccountHD, BanjoAccount, BanjoMsig, SeedData } from "../types";
import {
	decryptStoredSeed,
	deriveFalconKeyPair,
	getFalconLsigTeal,
	getPasskeySeed,
	hotSign,
	signWithHdSeed,
	signWithLedger,
} from "../keys";
import { SigningError, signingErrorCodes } from "./errors";

interface ResolvedSigningAccount {
	signingAddress: string;
	account: BanjoAccount;
	addressIndex?: number;
}

export interface SignTransactionsOptions {
	transactions: Transaction[];
	indexesToSign?: number[];
	authAddresses?: Array<string | undefined>;
	password?: string;
	msig?: BanjoMsig;
	state: WalletState;
	storage: WalletStorage;
	algod?: Algodv2;
	ledgerProvider: LedgerProvider;
	credentialProvider: CredentialProvider;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}

function findAccountInfo(state: WalletState, address: string): AccountHD | undefined {
	return state.accountInfo.find((accountInfo) => accountInfo.address === address);
}

function findSeedData(state: WalletState, seedId: number): SeedData | undefined {
	return state.seeds.find((seed) => seed.id === seedId);
}

function resolveAuthAddress(state: WalletState, sender: string): string | undefined {
	return findAccountInfo(state, sender)?.authAddr?.toString();
}

export function resolveTransactionSigner(args: {
	transaction: Transaction;
	index: number;
	state: WalletState;
	authAddresses?: Array<string | undefined>;
	msig?: BanjoMsig;
}): ResolvedSigningAccount {
	const sender = args.transaction.sender.toString();
	const signingAddress =
		args.msig?.signerAddr ??
		args.authAddresses?.[args.index] ??
		resolveAuthAddress(args.state, sender) ??
		sender;
	const directAccount = args.state.accounts.find((account) => account.addr === signingAddress);

	if (directAccount) {
		return { signingAddress, account: directAccount };
	}

	const accountInfo = findAccountInfo(args.state, signingAddress);
	const siblingAccount = accountInfo?.sibling
		? args.state.accounts.find((account) => account.addr === accountInfo.sibling)
		: undefined;

	if (siblingAccount) {
		return {
			signingAddress,
			account: siblingAccount,
			addressIndex: accountInfo?.addrIdx,
		};
	}

	throw new SigningError("Account Not Found", signingErrorCodes.invalidRequest);
}

async function getSeedForSigning(args: {
	seedId: number;
	state: WalletState;
	storage: WalletStorage;
	credentialProvider: CredentialProvider;
	password?: string;
	seedCache: Map<number, Buffer>;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<Buffer> {
	const cached = args.seedCache.get(args.seedId);

	if (cached) {
		return cached;
	}

	const seedData = findSeedData(args.state, args.seedId) ??
		(await args.storage.getAllSeeds()).find((seed) => seed.id === args.seedId);

	if (!seedData) {
		throw new SigningError("Bad Seed Data", signingErrorCodes.invalidRequest);
	}

	const seed = seedData.credentialId
		? (await getPasskeySeed({ credentialId: seedData.credentialId, credentialProvider: args.credentialProvider })).seed
		: await decryptPasswordSeed({ seedData, password: args.password, cryptoProvider: args.cryptoProvider });

	args.seedCache.set(args.seedId, seed);

	return seed;
}

async function decryptPasswordSeed(args: {
	seedData: SeedData;
	password?: string;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<Buffer> {
	if (!args.password) {
		throw new SigningError("Password Required", signingErrorCodes.invalidRequest);
	}

	return decryptStoredSeed({
		seedData: args.seedData,
		passphrase: args.password,
		cryptoProvider: args.cryptoProvider,
	});
}

async function signFalconTransaction(args: {
	transaction: Transaction;
	account: BanjoAccount;
	seed: Buffer;
	algod?: Algodv2;
}): Promise<Uint8Array> {
	if (!args.account.falcon) {
		throw new SigningError("Invalid Falcon Account", signingErrorCodes.invalidRequest);
	}

	if (!args.algod) {
		throw new SigningError("Algod Required", signingErrorCodes.invalidRequest);
	}

	const falconPair = await deriveFalconKeyPair(args.seed);

	try {
		const { signCompressed } = await import("falcon-1024");
		const signature = signCompressed(falconPair.privateKey, args.transaction.rawTxID());
		const compiled = await args.algod
			.compile(getFalconLsigTeal(args.account.falcon.counter, falconPair.publicKey))
			.do();
		const logicSig = new algosdk.LogicSigAccount(Buffer.from(compiled.result, "base64"), [signature]);

		return algosdk.signLogicSigTransactionObject(args.transaction, logicSig).blob;
	} finally {
		falconPair.privateKey.fill(0);
	}
}

function attachMultisigSignature(args: {
	transaction: Transaction;
	signature: Uint8Array;
	msig: BanjoMsig;
}): Uint8Array {
	const threshold = Number(args.msig.app.arc55_threshold);

	if (!threshold || !args.msig.app.addrs.length) {
		throw new SigningError("Invalid Multisig", signingErrorCodes.invalidRequest);
	}

	const metadata = { version: 1, threshold, addrs: args.msig.app.addrs };
	const multisigTransaction = algosdk.createMultisigTransaction(args.transaction, metadata);

	return algosdk.appendSignRawMultisigSignature(
		multisigTransaction,
		metadata,
		args.msig.signerAddr,
		args.signature,
	).blob;
}

async function signOneTransaction(args: {
	transaction: Transaction;
	index: number;
	options: SignTransactionsOptions;
	seedCache: Map<number, Buffer>;
}): Promise<Uint8Array> {
	const resolved = resolveTransactionSigner({
		transaction: args.transaction,
		index: args.index,
		state: args.options.state,
		authAddresses: args.options.authAddresses,
		msig: args.options.msig,
	});

	if (resolved.account.seedId != null) {
		const seed = await getSeedForSigning({
			seedId: resolved.account.seedId,
			state: args.options.state,
			storage: args.options.storage,
			credentialProvider: args.options.credentialProvider,
			password: args.options.password,
			seedCache: args.seedCache,
			cryptoProvider: args.options.cryptoProvider,
		});

		if (resolved.account.slot != null) {
			const signature = await signWithHdSeed({
				seed: Buffer.from(seed),
				accountSlot: resolved.account.slot,
				addressIndex: resolved.addressIndex,
				bytesToSign: args.transaction.bytesToSign(),
			});

			return args.options.msig?.bypass
				? attachMultisigSignature({ transaction: args.transaction, signature, msig: args.options.msig })
				: args.transaction.attachSignature(resolved.signingAddress, signature);
		}

		if (resolved.account.falcon) {
			return signFalconTransaction({
				transaction: args.transaction,
				account: resolved.account,
				seed,
				algod: args.options.algod,
			});
		}
	}

	if (resolved.account.slot != null) {
		const signature = await signWithLedger({
			ledgerProvider: args.options.ledgerProvider,
			accountSlot: resolved.account.slot,
			transactionBytes: args.transaction.toByte(),
		});

		return args.options.msig?.bypass
			? attachMultisigSignature({ transaction: args.transaction, signature, msig: args.options.msig })
			: args.transaction.attachSignature(resolved.signingAddress, signature);
	}

	const signature = await hotSign({
		address: resolved.signingAddress,
		bytesToSign: args.transaction.bytesToSign(),
		storage: args.options.storage,
		cryptoProvider: args.options.cryptoProvider,
	});

	return args.options.msig?.bypass
		? attachMultisigSignature({ transaction: args.transaction, signature, msig: args.options.msig })
		: args.transaction.attachSignature(resolved.signingAddress, signature);
}

export async function signTransactions(options: SignTransactionsOptions): Promise<Uint8Array[]> {
	const indexesToSign = options.indexesToSign ?? options.transactions.map((_, index) => index);
	const seedCache = new Map<number, Buffer>();

	try {
		const signedTransactions: Uint8Array[] = [];

		for (const index of indexesToSign) {
			const transaction = options.transactions[index];

			if (!transaction) {
				throw new SigningError("Invalid Transaction Index", signingErrorCodes.invalidRequest);
			}

			signedTransactions.push(await signOneTransaction({ transaction, index, options, seedCache }));
		}

		return signedTransactions;
	} catch (error) {
		if (error instanceof SigningError) {
			throw error;
		}

		if (error instanceof Error && "code" in error && typeof error.code === "number") {
			throw new SigningError(error.message, error.code);
		}

		throw error;
	} finally {
		for (const seed of seedCache.values()) {
			seed.fill(0);
		}

		await options.ledgerProvider.close?.();
	}
}
