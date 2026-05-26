export interface MsgpackHD {
	hd: {
		sibling?: string;
		addrIdx?: number;
	};
	ai: string;
}

export interface Siwa {
	domain: string;
	account_address: string;
	uri: string;
	version: string;
	statement?: string;
	nonce?: string;
	"issued-at"?: string;
	"expiration-time"?: string;
	"not-before"?: string;
	"request-id"?: string;
	chain_id: "283";
	resources?: string[];
	type: "ed25519";
}
