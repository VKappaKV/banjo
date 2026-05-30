export const BEACON_PROTO = "BEACON/1";
export const BEACON_PREFIX = `${BEACON_PROTO}:`;
export const BEACON_NOTE_LIMIT = 1024;

export type BeaconMessageType = "announce" | "announce-rotate" | "offer" | "answer" | "reject" | "ping" | "revoke";

export interface BeaconAnnouncement {
  proto: typeof BEACON_PROTO;
  type: "announce" | "announce-rotate";
  wpk: string;
  ts: number;
  supersedes?: string;
}

export interface BeaconEncryptedWrapper {
  epk: string;
  nonce: string;
  ct: string;
}

export interface BeaconSignalPayload {
  proto: typeof BEACON_PROTO;
  type: "offer" | "answer" | "reject" | "ping" | "revoke";
  wpk: string;
  ts: number;
  exp: number;
  sdp?: string;
  part?: number;
  total?: number;
}

export interface BeaconIndexedTransaction {
  id: string;
  sender: string;
  round: number;
  note: string;
  group?: string;
}

export interface BeaconDecodedNote {
  transaction: BeaconIndexedTransaction;
  plaintext?: BeaconAnnouncement;
  encrypted?: BeaconEncryptedWrapper;
}

export interface BeaconSessionRecord {
  peerId: string;
  remoteAddress: string;
  remoteWpk: string;
  offerTs: number;
}
