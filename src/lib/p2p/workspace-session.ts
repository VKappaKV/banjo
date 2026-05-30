import type {
  WorkspaceState,
  WorkspacePeer,
  TransactionDraft,
  PeerSignature,
  WorkspaceMode,
  PeerConnectionCallbacks,
} from "./workspace-types";
import {
  createPeerConnection,
  type PeerConnection,
} from "./peer-connection";

export interface WorkspaceSessionOptions {
  relayUrl: string;
  sessionId: string;
  mode: WorkspaceMode;
  peerId?: string;
  initialState?: Partial<WorkspaceState>;
}

export interface WorkspaceSessionCallbacks {
  onStateChange: (state: WorkspaceState) => void;
  onPeerStatus: (peerId: string, connected: boolean) => void;
  onConnectionStatus?: (connected: boolean | "exhausted") => void;
  onTransactionProposed: (tx: TransactionDraft, sender: string) => void;
  onTransactionUpdated: (txId: string, changes: Partial<TransactionDraft>, sender: string) => void;
  onTransactionRemoved: (txId: string, sender: string) => void;
  onTransactionSigned: (txId: string, signature: PeerSignature, sender: string) => void;
}

export interface WorkspaceSession {
  readonly peerId: string;
  readonly sessionId: string;
  readonly state: WorkspaceState;
  readonly conn: PeerConnection;
  proposeTransaction: (tx: TransactionDraft) => void;
  updateTransaction: (txId: string, changes: Partial<TransactionDraft>) => void;
  removeTransaction: (txId: string) => void;
  signTransaction: (txId: string, signature: PeerSignature) => void;
  syncState: () => void;
  close: () => void;
}

export function createWorkspaceSession(
  options: WorkspaceSessionOptions,
  callbacks: WorkspaceSessionCallbacks,
): WorkspaceSession {
  const state: WorkspaceState = {
    sessionId: options.sessionId,
    mode: options.mode,
    peers: [],
    transactions: options.initialState?.transactions ?? [],
    multisig: options.initialState?.multisig,
    swapPairs: options.initialState?.swapPairs ?? [],
  };

  function broadcastState() {
    conn.sendStateSync({ ...state });
  }

  function notifyStateChange() {
    callbacks.onStateChange({ ...state });
  }

  const peerCallbacks: PeerConnectionCallbacks = {
    onStateSync(incomingState, sender) {
      state.peers = incomingState.peers;
      state.transactions = incomingState.transactions;
      notifyStateChange();
    },
    onTransactionPropose(tx, sender) {
      if (!state.transactions.some((t) => t.id === tx.id)) {
        state.transactions = [...state.transactions, tx];
        notifyStateChange();
      }
      callbacks.onTransactionProposed(tx, sender);
    },
    onTransactionUpdate(txId, changes, sender) {
      state.transactions = state.transactions.map((t) =>
        t.id === txId ? { ...t, ...changes } : t,
      );
      notifyStateChange();
      callbacks.onTransactionUpdated(txId, changes, sender);
    },
    onTransactionRemove(txId, sender) {
      state.transactions = state.transactions.filter((t) => t.id !== txId);
      notifyStateChange();
      callbacks.onTransactionRemoved(txId, sender);
    },
    onTransactionSign(txId, signature, sender) {
      state.transactions = state.transactions.map((t) => {
        if (t.id !== txId) return t;
        const alreadySigned = t.peerSignatures.some((s) => s.peerId === signature.peerId);
        if (alreadySigned) return t;
        return {
          ...t,
          peerSignatures: [...t.peerSignatures, signature],
          signedBy: [...t.signedBy, sender],
          status: "signed" as const,
        };
      });
      notifyStateChange();
      callbacks.onTransactionSigned(txId, signature, sender);
    },
    onPeerStatus(peerId, status) {
      const connected = status === "connected";
      const existing = state.peers.find((p) => p.peerId === peerId);
      if (existing) {
        existing.connected = connected;
      } else {
        state.peers = [...state.peers, { peerId, connected }];
      }
      notifyStateChange();
      callbacks.onPeerStatus(peerId, connected);
    },
    onPresence(peerId, typing) {
      const peer = state.peers.find((p) => p.peerId === peerId);
      if (peer) {
        peer.typing = typing;
        notifyStateChange();
      }
    },
    onConnectionStatus(connected) {
      callbacks.onConnectionStatus?.(connected);
    },
  };

  const conn = createPeerConnection(
    options.relayUrl,
    options.sessionId,
    peerCallbacks,
    options.peerId,
  );

  state.peers = [{ peerId: conn.peerId, connected: true }];

  return {
    get peerId() {
      return conn.peerId;
    },
    get sessionId() {
      return conn.sessionId;
    },
    get state() {
      return state;
    },
    conn,

    proposeTransaction(tx: TransactionDraft) {
      conn.sendTransactionPropose(tx);
      peerCallbacks.onTransactionPropose(tx, conn.peerId);
    },

    updateTransaction(txId: string, changes: Partial<TransactionDraft>) {
      conn.sendTransactionUpdate(txId, changes);
      peerCallbacks.onTransactionUpdate(txId, changes, conn.peerId);
    },

    removeTransaction(txId: string) {
      conn.sendTransactionRemove(txId);
      peerCallbacks.onTransactionRemove(txId, conn.peerId);
    },

    signTransaction(txId: string, signature: PeerSignature) {
      conn.sendTransactionSign(txId, signature);
      peerCallbacks.onTransactionSign(txId, signature, conn.peerId);
    },

    syncState() {
      broadcastState();
    },

    close() {
      conn.close();
    },
  };
}
