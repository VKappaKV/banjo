import type { Base64, Address, TxHash } from "./primitives";

interface Txn {
	sender: Address;
	fee: number;
	firstRound: number;
	lastRound: number;
	genesisID: string;
	genesisHash: Base64;
	note?: Uint8Array | Base64;
	reKeyTo?: Address;
	group?: Uint8Array | Base64;
	flatFee: boolean;
}

interface ConfigTxn extends Txn {
	type: "acfg";
	assetManager?: Address;
	assetReserve?: Address;
	assetFreeze?: Address;
	assetClawback?: Address;
}

interface TransferTxn extends Txn {
	receiver: Address;
	amount: number;
	closeRemainderTo?: Address;
}

export interface PaymentTxn extends TransferTxn {
	type: "pay";
}

export interface AssetTxn extends TransferTxn {
	type: "axfer";
	assetRevocationTarget?: Address;
	assetIndex: number;
}

export interface AssetConfigTxn extends ConfigTxn {
	assetIndex: number;
}

export interface AssetCreateTxn extends ConfigTxn {
	assetTotal?: number;
	assetDecimals?: number;
	assetDefaultFrozen?: boolean;
	assetName?: string;
	assetUnitName?: string;
	assetURL?: string;
	assetMetadataHash?: Uint8Array | Base64;
}

export interface DestroyAssetTxn extends ConfigTxn {
	assetIndex: number;
}

export interface FreezeAssetTxn extends Txn {
	type: "afrz";
	assetIndex: number;
	freezeAccount: Address;
	freezeState: boolean;
}

export interface KeyRegTxn extends Txn {
	type: "keyreg";
	voteKey?: Base64;
	selectionKey?: Base64;
	stateProofKey?: Base64;
	voteFirst?: number;
	voteLast?: number;
	voteKeyDilution?: number;
	nonParticipation?: boolean;
}

export enum OnApplicationComplete {
	NoOpOC = 0,
	OptInOC = 1,
	CloseOutOC = 2,
	ClearStateOC = 3,
	UpdateApplicationOC = 4,
	DeleteApplicationOC = 5,
}

export interface ApplicationTxn extends Txn {
	type: "appl";
	appArgs?: Uint8Array[] | Base64[];
	appAccounts?: Address[];
	appForeignApps?: number[];
	appForeignAssets?: number[];
}

export interface CreateApplTxn extends ApplicationTxn {
	appApprovalProgram: Uint8Array | Base64;
	appClearProgram: Uint8Array | Base64;
	appLocalInts: number;
	appLocalByteSlices: number;
	appGlobalInts: number;
	appGlobalByteSlices: number;
	appOnComplete?: OnApplicationComplete;
	extraPages?: number;
}

export interface CallApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.NoOpOC;
}

export interface OptInApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.OptInOC;
}

export interface CloseOutApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.CloseOutOC;
}

export interface ClearApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.ClearStateOC;
}

export interface UpdateApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.UpdateApplicationOC;
	appApprovalProgram: Uint8Array | Base64;
	appClearProgram: Uint8Array | Base64;
}

export interface DeleteApplTxn extends ApplicationTxn {
	appIndex: number;
	appOnComplete: OnApplicationComplete.DeleteApplicationOC;
}

export type ApplTxn =
	| CreateApplTxn
	| CallApplTxn
	| OptInApplTxn
	| CloseOutApplTxn
	| ClearApplTxn
	| UpdateApplTxn;

export type EncodedTransaction = Base64 | Uint8Array;

export type AlgorandTxn =
	| PaymentTxn
	| AssetTxn
	| AssetConfigTxn
	| AssetCreateTxn
	| DestroyAssetTxn
	| FreezeAssetTxn
	| KeyRegTxn
	| ApplTxn;

export type TxnStr = Base64;
export type SignedTxnStr = Base64;

export interface MultisigMetadata {
	version: number;
	threshold: number;
	addrs: Address[];
}

export interface WalletTransaction {
	txn: TxnStr;
	authAddr?: Address;
	msig?: MultisigMetadata;
	signers?: Address[];
	stxn?: SignedTxnStr;
	message?: string;
	groupMessage?: string;
}

export interface SignTxnsOpts {
	message?: string;
}

export interface SignTxnsError extends Error {
	code: number;
	data?: unknown;
}

export interface SignedTx {
	txID: TxHash;
	blob: Uint8Array;
}
