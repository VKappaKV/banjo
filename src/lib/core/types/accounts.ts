import type { modelsv2 } from "algosdk";
import type { Address } from "./primitives";

export interface AccountHD extends modelsv2.Account {
	sibling?: string;
	addrIdx?: number;
}

export interface BanjoAccount {
	addr: Address;
	name?: string;
	hot?: boolean;
	slot?: number;
	appId?: bigint;
	network?: string;
	seedId?: number;
	xpub?: string;
	idxs?: number[];
	falcon?: {
		counter: number;
		publicKey: string;
	};
}

export interface AccountInfo extends BanjoAccount {
	title: string;
	isHot: boolean;
	canSign: boolean;
	subType?: "rekey" | "hd";
	info?: AccountHD;
	globalIdx: number;
	ns?: NsRecord;
}

export interface NsRecord {
	appID?: number;
	name: string;
	timeExpires?: string;
}

export interface NsObject {
	[key: string]: NsRecord;
}

export interface NsLookup {
	title: string;
	value: string;
}

export interface AccountSubs extends modelsv2.Account {
	subs?: Address[];
	xpub?: string;
}
