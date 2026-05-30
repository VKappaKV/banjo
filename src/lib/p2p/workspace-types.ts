import type { Address } from "$core/types";

export type WorkspaceMode = "multisig" | "swap" | "send";

export interface WorkspacePeer {
  peerId: string;
  connected: boolean;
  typing?: boolean;
  lastActive?: number;
}

export type TransactionStatus = "draft" | "signed" | "submitted";

export interface PeerSignature {
  peerId: string;
  signedBlob: string;
}

export interface TransactionDraft {
  id: string;
  type: "pay" | "axfer" | "appl" | "keyreg";
  sender: string;
  receiver: string;
  amount: string;
  assetId?: string;
  assetDecimals?: number;
  note: string;
  closeRemainderTo: string;
  rekeyTo: string;
  voteKey?: string;
  selectionKey?: string;
  stateProofKey?: string;
  voteFirst?: string;
  voteLast?: string;
  voteKeyDilution?: string;
  nonParticipation?: boolean;
  status: TransactionStatus;
  signedBy: string[];
  peerSignatures: PeerSignature[];
  swapGroupId?: string;
  signerAddr?: string;
}

export interface MultisigConfig {
  threshold: number;
  addrs: string[];
}

export interface SwapPair {
  id: string;
  txn1Id: string;
  txn2Id: string;
  status: "building" | "ready" | "grouped" | "signed" | "submitted";
}

export interface WorkspaceState {
  sessionId: string;
  mode: WorkspaceMode;
  peers: WorkspacePeer[];
  transactions: TransactionDraft[];
  multisig?: MultisigConfig;
  swapPairs?: SwapPair[];
}

export type RelayMessageType =
  | "relay:peer_assigned"
  | "relay:peer_joined"
  | "relay:peer_left"
  | "relay:peer_list"
  | "signal:offer"
  | "signal:answer"
  | "signal:candidate"
  | "workspace:state_sync"
  | "workspace:transaction_propose"
  | "workspace:transaction_update"
  | "workspace:transaction_remove"
  | "workspace:transaction_sign"
  | "workspace:presence";

export interface RelayMessage {
  type: RelayMessageType;
  payload?: unknown;
  sender?: string;
  target?: string;
}

export interface PeerConnectionCallbacks {
  onStateSync: (state: WorkspaceState, sender: string) => void;
  onTransactionPropose: (tx: TransactionDraft, sender: string) => void;
  onTransactionUpdate: (txId: string, changes: Partial<TransactionDraft>, sender: string) => void;
  onTransactionRemove: (txId: string, sender: string) => void;
  onTransactionSign: (txId: string, signature: PeerSignature, sender: string) => void;
  onPeerStatus: (peerId: string, status: "connected" | "disconnected") => void;
  onConnectionStatus?: (connected: boolean | "exhausted") => void;
  onPresence?: (peerId: string, typing: boolean) => void;
}

export function createTransactionDraft(overrides?: Partial<TransactionDraft>): TransactionDraft {
  return {
    id: crypto.randomUUID(),
    type: "pay",
    sender: "",
    receiver: "",
    amount: "",
    note: "",
    closeRemainderTo: "",
    rekeyTo: "",
    status: "draft",
    signedBy: [],
    peerSignatures: [],
    ...overrides,
  };
}

export function createSwapPairId(): string {
  return crypto.randomUUID().slice(0, 8);
}
