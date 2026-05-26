import type { Transaction, modelsv2 } from "algosdk";
import type { Address, Base64 } from "./primitives";

export interface Arc55App {
	info: modelsv2.Application;
	acct: modelsv2.Account;
	addrs: Address[];
	groups: MsigGroup[];
	arc55_admin?: Address;
	arc55_threshold?: number | bigint;
	arc55_nonce?: number | bigint;
	[key: string]: unknown;
}

export interface MsigGroup {
	nonce: bigint;
	txns: Transaction[];
	stxns: (string | null)[];
	sigs: MemberSigs[];
}

export interface MemberSigs {
	addr: Address;
	sigs: Base64[];
}

export interface BanjoMsig {
	app: Arc55App;
	signerAddr: Address;
	bypass: boolean;
}
