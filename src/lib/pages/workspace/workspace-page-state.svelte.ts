import algosdk, { type SuggestedParams } from "algosdk";
import { createTransactionDraft, createSwapPairId } from "$p2p/workspace-types";
import {
  createWorkspaceSession,
  type WorkspaceSession,
  type WorkspaceSessionCallbacks,
} from "$p2p/workspace-session";
import {
  signWorkspaceDraft,
  signGroupedDraft,
  decodeSignedBlob,
  createPeerSignature,
  extractRawSignature,
  encodePeerSignature,
  assembleAndSubmitMultisig,
  buildAndGroupSwapTxns,
  submitAtomicGroup,
  submitSignedBlobs,
} from "$p2p/workspace-signer";
import type {
  WorkspaceState,
  WorkspacePeer,
  TransactionDraft,
  WorkspaceMode,
  PeerSignature,
  MultisigConfig,
  SwapPair,
} from "$p2p/workspace-types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { selectNetwork } from "$core/state";
import { builtInNetworks } from "$core/data/networks";
import { createAlgodClient } from "$core/network";
import { createBeaconSignalingTransport } from "$p2p/beacon/beacon-signaling-transport";
import { getBeaconProtocolAddress, getBeaconProtocolEnvName } from "$p2p/beacon/beacon-config";
import { deriveBeaconKeypair } from "$p2p/beacon/beacon-crypto";
import { lookupBeaconAnnouncement, submitBeaconNote } from "$p2p/beacon/beacon-indexer";
import { BEACON_PROTO } from "$p2p/beacon/beacon-types";
import type { SignalingEventHandler, SignalingTransport } from "$p2p/signaling-transport";
import { createLogCorrelationId } from "$core/logging";

const DEFAULT_RELAY_URL = "ws://localhost:9876";
const SESSION_STORAGE_KEY = "banjo:workspace-session";
type WorkspaceSignalingMode = "beacon" | "websocket";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
export type SigningStep = "idle" | "signing" | "submitting" | "done" | "error";

class WorkspacePageState {
  mode = $state<WorkspaceMode>("send");
  status = $state<ConnectionStatus>("idle");
  error = $state("");
  sessionId = $state("");
  signalingMode = $state<WorkspaceSignalingMode>("beacon");
  relayUrl = $state(DEFAULT_RELAY_URL);
  beaconIdentityAddress = $state("");
  beaconRecipientAddress = $state("");
  beaconProtocolAddress = $state("");
  beaconProtocolEnvName = $state("VITE_BEACON_PROTOCOL_ADDRESS_MAINNET");
  beaconInitialized = $state(false);
  beaconBusy = $state(false);
  beaconStatus = $state("");
  peers = $state<WorkspacePeer[]>([]);
  transactions = $state<TransactionDraft[]>([]);
  peerId = $state("");
  password = $state("");
  signingStep = $state<SigningStep>("idle");
  signingTxId = $state("");
  submittedTxIds = $state<string[]>([]);
  selectedNetworkName = $state("LocalNet");

  multisigAddrs = $state<string>("");
  multisigThreshold = $state(2);
  multisigComputedAddr = $state("");

  swapPairs = $state<SwapPair[]>([]);
  transitionTxId = $state("");
  savedSession = $state<{ sessionId: string; relayUrl: string; mode: WorkspaceMode; signalingMode?: WorkspaceSignalingMode } | null>(null);

  private session: WorkspaceSession | null = null;
  private app: WalletAppState | null = null;
  private presenceInterval: ReturnType<typeof setInterval> | null = null;
  private sessionCorrelationId = "";

  resetState() {
    this.stopPresencePing();
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.mode = "send";
    this.status = "idle";
    this.error = "";
    this.sessionId = "";
    this.signalingMode = "beacon";
    this.peers = [];
    this.transactions = [];
    this.peerId = "";
    this.password = "";
    this.signingStep = "idle";
    this.signingTxId = "";
    this.submittedTxIds = [];
    this.multisigAddrs = "";
    this.multisigThreshold = 2;
    this.multisigComputedAddr = "";
    this.swapPairs = [];
    this.transitionTxId = "";
    this.beaconRecipientAddress = "";
    this.beaconInitialized = false;
    this.beaconBusy = false;
    this.beaconStatus = "";
    this.sessionCorrelationId = "";
    this.loadSavedSession();
  }

  constructor() {
    this.loadSavedSession();
  }

  setApp(app: WalletAppState) {
    this.app = app;
    this.selectedNetworkName = selectNetwork(app.state, builtInNetworks)?.name ?? "LocalNet";
    this.refreshBeaconConfig();
    this.beaconIdentityAddress ||= this.signableAccounts[0]?.addr ?? "";
  }

  refreshBeaconConfig() {
    const network = this.selectedNetwork;
    this.beaconProtocolAddress = getBeaconProtocolAddress(network) ?? "";
    this.beaconProtocolEnvName = getBeaconProtocolEnvName(network);
  }

  get signableAccounts() {
    if (!this.app) return [];
    return this.app.accounts.filter((account) => account.canSign);
  }

  get needsPassword() {
    if (!this.signingTxId) return false;
    const tx = this.transactions.find((t) => t.id === this.signingTxId);
    if (!tx) return false;
    const signerAddr = tx.signerAddr || tx.sender;
    const account = this.app?.state.accounts.find((a) => a.addr === signerAddr);
    if (!account) return false;
    const seedId = account.seedId;
    if (seedId == null) return false;
    const seed = this.app?.state.seeds.find((s) => s.id === seedId);
    return !!seed && !seed.credentialId;
  }

  get selectedNetwork() {
    if (!this.app) return builtInNetworks[0]!;
    return selectNetwork(this.app.state, builtInNetworks);
  }

  get beaconConfigured() {
    return !!this.beaconProtocolAddress && algosdk.isValidAddress(this.beaconProtocolAddress);
  }

  get multisigConfig(): MultisigConfig | null {
    const addrs = this.multisigAddrs
      .split("\n")
      .map((a) => a.trim())
      .filter((a) => algosdk.isValidAddress(a));
    if (addrs.length < 1) return null;
    return { threshold: Math.min(this.multisigThreshold, addrs.length), addrs };
  }

  get currentSwapPair(): SwapPair | null {
    return this.swapPairs.find((p) => p.status !== "submitted") ?? null;
  }

  get transactionCountByStatus(): { draft: number; signed: number; submitted: number } {
    const counts = { draft: 0, signed: 0, submitted: 0 };
    for (const tx of this.transactions) {
      if (tx.status === "submitted") counts.submitted++;
      else if (tx.status === "signed") counts.signed++;
      else counts.draft++;
    }
    return counts;
  }

  createSession = async () => {
    if (this.signalingMode === "beacon") {
      await this.createBeaconSession();
      return;
    }
    if (!this.relayUrl.trim()) return;
    this.status = "connecting";
    this.error = "";
    const sessionId = crypto.randomUUID().slice(0, 8);
    this.sessionId = sessionId;
    this.sessionCorrelationId = createLogCorrelationId("workspace");
    this.app?.core?.logger.info({
      namespace: "workspace",
      event: "relay-session-create-started",
      correlationId: this.sessionCorrelationId,
      fields: { mode: this.mode, signalingMode: this.signalingMode },
    });
    this.connectSession(sessionId);
  };

  createBeaconSession = async () => {
    if (!this.app) return;
    this.refreshBeaconConfig();
    if (!this.beaconConfigured) {
      this.app.core?.logger.warn({ namespace: "workspace", event: "beacon-config-missing", fields: { network: this.selectedNetwork.name, envName: this.beaconProtocolEnvName } });
      this.error = `BEACON protocol address is not configured for ${this.selectedNetwork.name}. Set ${this.beaconProtocolEnvName}.`;
      this.status = "error";
      return;
    }
    if (!algosdk.isValidAddress(this.beaconIdentityAddress)) {
      this.error = "Select a valid BEACON identity account.";
      this.status = "error";
      return;
    }
    if (!algosdk.isValidAddress(this.beaconRecipientAddress)) {
      this.error = "Enter a valid recipient address for the BEACON workspace offer.";
      this.status = "error";
      return;
    }
    this.status = "connecting";
    this.error = "";
    this.beaconStatus = "Preparing encrypted BEACON offer...";
    const sessionId = crypto.randomUUID().slice(0, 8);
    this.sessionId = sessionId;
    this.sessionCorrelationId = createLogCorrelationId("beacon");
    this.app.core?.logger.info({
      namespace: "workspace",
      event: "beacon-offer-started",
      correlationId: this.sessionCorrelationId,
      fields: { network: this.selectedNetwork.name, configured: this.beaconConfigured },
    });
    this.connectSession(sessionId, (onEvent) => createBeaconSignalingTransport({
      app: this.app!,
      network: this.selectedNetwork,
      protocolAddress: this.beaconProtocolAddress,
      identityAddress: this.beaconIdentityAddress,
      recipientAddress: this.beaconRecipientAddress,
      mode: "offer",
      sessionId,
      password: this.password || undefined,
    }, onEvent));
  };

  listenBeaconSession = async () => {
    if (!this.app) return;
    this.refreshBeaconConfig();
    if (!this.beaconConfigured) {
      this.app.core?.logger.warn({ namespace: "workspace", event: "beacon-config-missing", fields: { network: this.selectedNetwork.name, envName: this.beaconProtocolEnvName } });
      this.error = `BEACON protocol address is not configured for ${this.selectedNetwork.name}. Set ${this.beaconProtocolEnvName}.`;
      this.status = "error";
      return;
    }
    if (!algosdk.isValidAddress(this.beaconIdentityAddress)) {
      this.error = "Select a valid BEACON identity account.";
      this.status = "error";
      return;
    }
    this.status = "connecting";
    this.error = "";
    this.beaconStatus = "Listening for encrypted BEACON offers...";
    const sessionId = crypto.randomUUID().slice(0, 8);
    this.sessionId = sessionId;
    this.sessionCorrelationId = createLogCorrelationId("beacon");
    this.app.core?.logger.info({
      namespace: "workspace",
      event: "beacon-listen-started",
      correlationId: this.sessionCorrelationId,
      fields: { network: this.selectedNetwork.name, configured: this.beaconConfigured },
    });
    this.connectSession(sessionId, (onEvent) => createBeaconSignalingTransport({
      app: this.app!,
      network: this.selectedNetwork,
      protocolAddress: this.beaconProtocolAddress,
      identityAddress: this.beaconIdentityAddress,
      mode: "listen",
      sessionId,
      password: this.password || undefined,
    }, onEvent));
  };

  joinSession = (sessionId: string) => {
    if (!sessionId.trim() || !this.relayUrl.trim()) return;
    this.status = "connecting";
    this.error = "";
    this.sessionId = sessionId;
    this.sessionCorrelationId = createLogCorrelationId("workspace");
    this.app?.core?.logger.info({ namespace: "workspace", event: "relay-session-join-started", correlationId: this.sessionCorrelationId, fields: { mode: this.mode, signalingMode: this.signalingMode } });
    this.connectSession(sessionId);
  };

  checkBeaconAnnouncement = async () => {
    if (!this.app || !algosdk.isValidAddress(this.beaconIdentityAddress)) return;
    this.refreshBeaconConfig();
    if (!this.beaconConfigured) {
      this.beaconInitialized = false;
      return;
    }
    this.beaconBusy = true;
    this.beaconStatus = "Checking BEACON announcement...";
    this.app.core?.logger.info({ namespace: "workspace", event: "beacon-announcement-check-started", fields: { network: this.selectedNetwork.name } });
    try {
      const announcement = await lookupBeaconAnnouncement({
        network: this.selectedNetwork,
        protocolAddress: this.beaconProtocolAddress,
        address: this.beaconIdentityAddress,
        useFallback: this.app.state.fallbackEnabled,
      });
      this.beaconInitialized = !!announcement?.wpk;
      this.beaconStatus = this.beaconInitialized ? "BEACON initialized." : "BEACON announcement not found.";
      this.app.core?.logger.info({ namespace: "workspace", event: "beacon-announcement-check-completed", fields: { initialized: this.beaconInitialized } });
    } catch (err) {
      this.beaconStatus = err instanceof Error ? err.message : "Could not check BEACON announcement.";
      this.app.core?.logger.warn({ namespace: "workspace", event: "beacon-announcement-check-failed", error: err });
    } finally {
      this.beaconBusy = false;
    }
  };

  initializeBeacon = async () => {
    if (!this.app) return;
    this.refreshBeaconConfig();
    if (!this.beaconConfigured) {
      this.app.core?.logger.warn({ namespace: "workspace", event: "beacon-config-missing", fields: { network: this.selectedNetwork.name, envName: this.beaconProtocolEnvName } });
      this.error = `BEACON protocol address is not configured for ${this.selectedNetwork.name}. Set ${this.beaconProtocolEnvName}.`;
      return;
    }
    if (!algosdk.isValidAddress(this.beaconIdentityAddress)) {
      this.error = "Select a valid BEACON identity account.";
      return;
    }
    this.beaconBusy = true;
    this.error = "";
    this.beaconStatus = "Deriving BEACON key and broadcasting announcement...";
    const correlationId = createLogCorrelationId("beacon-init");
    this.app.core?.logger.info({ namespace: "workspace", event: "beacon-initialize-started", correlationId, fields: { network: this.selectedNetwork.name } });
    try {
      const keypair = await deriveBeaconKeypair({
        app: this.app,
        address: this.beaconIdentityAddress,
        network: this.selectedNetwork,
        password: this.password || undefined,
      });
      const txid = await submitBeaconNote({
        app: this.app,
        network: this.selectedNetwork,
        sender: this.beaconIdentityAddress,
        protocolAddress: this.beaconProtocolAddress,
        payload: { proto: BEACON_PROTO, type: "announce", wpk: keypair.wpk, ts: Date.now() },
        password: this.password || undefined,
      });
      this.beaconInitialized = true;
      this.beaconStatus = txid ? `BEACON initialized: ${txid.slice(0, 8)}...` : "BEACON initialized.";
      this.app.notify("BEACON initialized", "success", 3000);
      this.app.core?.logger.info({ namespace: "workspace", event: "beacon-initialize-completed", correlationId, fields: { txId: txid } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to initialize BEACON.";
      this.beaconStatus = this.error;
      this.app.core?.logger.error({ namespace: "workspace", event: "beacon-initialize-failed", correlationId, error: err });
    } finally {
      this.beaconBusy = false;
    }
  };

  private connectSession(sessionId: string, signalingTransportFactory?: (onEvent: SignalingEventHandler) => SignalingTransport) {
    try {
      let knownPeers = new Set<string>();

      const callbacks: WorkspaceSessionCallbacks = {
        onStateChange: (state: WorkspaceState) => {
          this.peers = state.peers;
          this.transactions = state.transactions;
          if (state.multisig) {
            this.multisigAddrs = state.multisig.addrs.join("\n");
            this.multisigThreshold = state.multisig.threshold;
            this.multisigComputedAddr = String(algosdk.multisigAddress({
              version: 1,
              threshold: state.multisig.threshold,
              addrs: state.multisig.addrs,
            }));
          }
          if (state.swapPairs) {
            this.swapPairs = state.swapPairs;
          }
        },
        onPeerStatus: (peerId: string, connected: boolean) => {
          this.peers = [...this.peers];
          if (connected && !knownPeers.has(peerId) && this.app) {
            knownPeers.add(peerId);
            this.app.core?.logger.info({ namespace: "workspace", event: "peer-connected", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
            this.app.notify(`Peer joined workspace`, "success", 3000);
          } else if (!connected && knownPeers.has(peerId) && this.app) {
            knownPeers.delete(peerId);
            this.app.core?.logger.info({ namespace: "workspace", event: "peer-disconnected", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
            this.app.notify(`Peer left workspace`, "warning", 3000);
          }
        },
        onTransactionProposed: (tx: TransactionDraft, sender: string) => {
          this.transactions = [...this.transactions];
          this.transitionTxId = tx.id;
          this.app?.core?.logger.info({ namespace: "workspace", event: "transaction-proposed-received", correlationId: this.sessionCorrelationId, fields: { type: tx.type, mode: this.mode, local: sender === this.peerId } });
          if (sender !== this.peerId && this.app) {
            this.app.notify(`New ${tx.type} transaction proposed`, "info", 3000);
          }
        },
        onTransactionUpdated: () => {
          this.transactions = [...this.transactions];
        },
        onTransactionRemoved: () => {
          this.transactions = [...this.transactions];
        },
        onTransactionSigned: (txId: string, _sig: PeerSignature, sender: string) => {
          this.transactions = [...this.transactions];
          this.transitionTxId = txId;
          this.app?.core?.logger.info({ namespace: "workspace", event: "transaction-signed-received", correlationId: this.sessionCorrelationId, fields: { local: sender === this.peerId } });
          if (sender !== this.peerId && this.app) {
            this.app.notify(`Peer signed a transaction`, "success", 3000);
          }
        },
        onConnectionStatus: (connected: boolean | "exhausted") => {
          if (connected === "exhausted") {
            this.status = "error";
            this.error = this.signalingMode === "beacon"
              ? "BEACON signaling failed. Check protocol address config, recipient announcement, and network connectivity."
              : "Relay server not reachable. Make sure the relay is running (`node server/relay.mjs`).";
            this.app?.core?.logger.error({ namespace: "workspace", event: "connection-exhausted", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
          } else if (!connected && this.status === "connected") {
            this.status = "error";
            this.error = "Connection lost — reconnecting...";
            this.app?.core?.logger.warn({ namespace: "workspace", event: "connection-lost", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
          } else if (!connected && this.status === "connecting") {
            this.status = "error";
            this.error = this.signalingMode === "beacon"
              ? "Could not start BEACON signaling."
              : "Could not reach relay server. Is it running?";
            this.app?.core?.logger.warn({ namespace: "workspace", event: "connection-start-failed", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
          } else if (connected && (this.status === "error" || this.status === "connecting")) {
            this.status = "connected";
            this.error = "";
            this.app?.core?.logger.info({ namespace: "workspace", event: "connection-restored", correlationId: this.sessionCorrelationId, fields: { signalingMode: this.signalingMode } });
          }
        },
      };

      const multisig = this.mode === "multisig" ? this.multisigConfig : undefined;

      this.session = createWorkspaceSession(
        {
          relayUrl: this.relayUrl,
          sessionId,
          mode: this.mode,
          signalingTransportFactory,
          initialState: { multisig: multisig ?? undefined },
        },
        callbacks,
      );

      this.peerId = this.session.peerId;
      this.status = "connected";
      this.saveSession();
      this.app?.core?.logger.info({ namespace: "workspace", event: "session-connected", correlationId: this.sessionCorrelationId, fields: { mode: this.mode, signalingMode: this.signalingMode } });

      this.startPresencePing();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to connect.";
      this.status = "error";
      this.app?.core?.logger.error({ namespace: "workspace", event: "session-connect-failed", correlationId: this.sessionCorrelationId, error: err, fields: { mode: this.mode, signalingMode: this.signalingMode } });
    }
  }

  private saveSession() {
    try {
      const data = { sessionId: this.sessionId, relayUrl: this.relayUrl, mode: this.mode, signalingMode: this.signalingMode };
      globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  private loadSavedSession() {
    try {
      const raw = globalThis.localStorage?.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        this.savedSession = JSON.parse(raw) as { sessionId: string; relayUrl: string; mode: WorkspaceMode; signalingMode?: WorkspaceSignalingMode };
      }
    } catch { /* ignore */ }
  }

  clearSavedSession() {
    try {
      globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
    } catch { /* ignore */ }
    this.savedSession = null;
  }

  reconnectToSavedSession = () => {
    if (!this.savedSession) return;
    this.relayUrl = this.savedSession.relayUrl;
    this.mode = this.savedSession.mode;
    this.signalingMode = this.savedSession.signalingMode ?? "websocket";
    this.joinSession(this.savedSession.sessionId);
  };

  private startPresencePing() {
    this.stopPresencePing();
    this.presenceInterval = setInterval(() => {
      this.session?.conn.sendPresence(false);
    }, 15000);
  }

  private stopPresencePing() {
    if (this.presenceInterval !== null) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  broadcastTyping = (typing: boolean) => {
    this.session?.conn.sendPresence(typing);
  };

  broadcastMultisigConfig() {
    if (!this.session || !this.multisigConfig) return;
    this.session.conn.sendStateSync({
      sessionId: this.session.sessionId,
      mode: "multisig",
      peers: [],
      transactions: [],
      multisig: this.multisigConfig,
      swapPairs: [],
    });
  }

  disconnect = () => {
    this.app?.core?.logger.info({ namespace: "workspace", event: "session-disconnected", correlationId: this.sessionCorrelationId, fields: { mode: this.mode, signalingMode: this.signalingMode } });
    this.stopPresencePing();
    this.session?.close();
    this.session = null;
    this.status = "idle";
    this.sessionId = "";
    this.peers = [];
    this.transactions = [];
    this.peerId = "";
    this.signingStep = "idle";
    this.signingTxId = "";
    this.submittedTxIds = [];
    this.password = "";
    this.swapPairs = [];
  };

  proposeTransaction = (overrides?: Partial<TransactionDraft>) => {
    if (!this.session) return;
    const tx = createTransactionDraft(overrides);

    if (this.mode === "multisig" && this.multisigConfig) {
      tx.sender = this.multisigComputedAddr;
    }

    this.session.proposeTransaction(tx);
    this.app?.core?.logger.info({ namespace: "workspace", event: "transaction-proposed", correlationId: this.sessionCorrelationId, fields: { type: tx.type, mode: this.mode } });
  };

  updateTransaction = (txId: string, changes: Partial<TransactionDraft>) => {
    this.session?.updateTransaction(txId, changes);
  };

  removeTransaction = (txId: string) => {
    this.session?.removeTransaction(txId);
  };

  clearTransition = () => {
    this.transitionTxId = "";
  };

  syncState = () => {
    this.session?.syncState();
  };

  getMultisigSignatureCount(txId: string): number {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || !this.multisigConfig) return 0;
    return tx.peerSignatures.length;
  }

  getMultisigThresholdMet(txId: string): boolean {
    return this.getMultisigSignatureCount(txId) >= this.multisigConfig!.threshold;
  }

  signTransaction = async (txId: string) => {
    if (!this.session || !this.app) return;
    this.signingStep = "signing";
    this.signingTxId = txId;
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-sign");
    this.app.core?.logger.info({ namespace: "workspace", event: "transaction-sign-started", correlationId, fields: { mode: this.mode } });

    try {
      const draft = this.transactions.find((t) => t.id === txId);
      if (!draft) throw new Error("Transaction not found.");

      const { signedBlob } = await signWorkspaceDraft({
        draft,
        app: this.app,
        networkName: this.selectedNetworkName,
        password: this.password || undefined,
      });

      if (this.mode === "multisig") {
        const rawSig = extractRawSignature(signedBlob);
        const localAddr = this.findSigningAddress(draft);
        const sig = encodePeerSignature(localAddr, rawSig);
        this.session.signTransaction(txId, sig);
      } else {
        const signature = createPeerSignature(this.session.peerId, signedBlob);
        this.session.signTransaction(txId, signature);

        if (this.mode === "swap" && draft.swapGroupId) {
          this.updateSwapPairStatus(draft.swapGroupId);
        }
      }

      this.password = "";
      this.signingStep = "idle";
      this.app.core?.logger.info({ namespace: "workspace", event: "transaction-sign-completed", correlationId, fields: { mode: this.mode } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to sign transaction.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "transaction-sign-failed", correlationId, error: err, fields: { mode: this.mode } });
    }
  };

  private updateSwapPairStatus(groupId: string) {
    this.swapPairs = this.swapPairs.map((pair) => {
      if (pair.id !== groupId) return pair;
      const txn1 = this.transactions.find((t) => t.id === pair.txn1Id);
      const txn2 = this.transactions.find((t) => t.id === pair.txn2Id);
      const bothSigned = txn1?.status === "signed" && txn2?.status === "signed";
      return { ...pair, status: bothSigned ? "signed" : "grouped" } as SwapPair;
    });
  }

  private findSigningAddress(draft: TransactionDraft): string {
    const signer = draft.signerAddr;
    if (signer && this.app?.state.accounts.find((a) => a.addr === signer)) return signer;

    if (this.multisigConfig && this.app) {
      for (const acct of this.app.state.accounts) {
        if (this.multisigConfig.addrs.includes(acct.addr)) return acct.addr;
      }
    }

    return draft.sender;
  }

  signSwapSide = async (txId: string, groupId: string) => {
    if (!this.session || !this.app) return;
    this.signingStep = "signing";
    this.signingTxId = txId;
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-swap-sign");
    this.app.core?.logger.info({ namespace: "workspace", event: "swap-side-sign-started", correlationId });

    try {
      const pair = this.swapPairs.find((p) => p.id === groupId);
      if (!pair) throw new Error("Swap pair not found.");
      const draft1 = this.transactions.find((t) => t.id === pair.txn1Id);
      const draft2 = this.transactions.find((t) => t.id === pair.txn2Id);
      if (!draft1 || !draft2) throw new Error("Both swap sides require drafts.");

      const network = selectNetwork(this.app.state, builtInNetworks);
      const algod = createAlgodClient(network, this.app.state.fallbackEnabled);
      const params = (await algod.getTransactionParams().do()) as SuggestedParams;
      const [grouped1, grouped2] = await buildAndGroupSwapTxns(draft1, draft2, params);

      const groupedTxn = txId === pair.txn1Id ? grouped1 : grouped2;

      const signedBlob = await signGroupedDraft(groupedTxn, this.app, this.password);
      const signature = createPeerSignature(this.session.peerId, signedBlob);
      this.session.signTransaction(txId, signature);
      this.updateSwapPairStatus(groupId);

      this.password = "";
      this.signingStep = "idle";
      this.app.core?.logger.info({ namespace: "workspace", event: "swap-side-sign-completed", correlationId });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to sign swap side.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "swap-side-sign-failed", correlationId, error: err });
    }
  };

  submitSwapGroup = async (groupId: string) => {
    if (!this.app) return;
    this.signingStep = "submitting";
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-swap-submit");
    this.app.core?.logger.info({ namespace: "workspace", event: "swap-group-submit-started", correlationId });

    try {
      const pair = this.swapPairs.find((p) => p.id === groupId);
      if (!pair) throw new Error("Swap pair not found.");

      const txn1 = this.transactions.find((t) => t.id === pair.txn1Id);
      const txn2 = this.transactions.find((t) => t.id === pair.txn2Id);
      if (!txn1 || !txn2) throw new Error("Both swap transactions not found.");

      const blobs1 = txn1.peerSignatures.map((s) => decodeSignedBlob(s.signedBlob));
      const blobs2 = txn2.peerSignatures.map((s) => decodeSignedBlob(s.signedBlob));
      const allBlobs = [...blobs1, ...blobs2];

      if (allBlobs.length === 0) throw new Error("No signed blobs to submit.");

      const network = selectNetwork(this.app.state, builtInNetworks);
      const algod = createAlgodClient(network, this.app.state.fallbackEnabled);
      const txid = await submitAtomicGroup(algod, allBlobs);

      this.session?.updateTransaction(pair.txn1Id, { status: "submitted" });
      this.session?.updateTransaction(pair.txn2Id, { status: "submitted" });
      this.swapPairs = this.swapPairs.map((p) =>
        p.id === groupId ? { ...p, status: "submitted" as const } : p,
      );
      this.submittedTxIds = [txid];
      this.signingStep = "done";
      this.app.core?.logger.info({ namespace: "workspace", event: "swap-group-submit-completed", correlationId, fields: { txId: txid } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to submit swap group.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "swap-group-submit-failed", correlationId, error: err });
    }
  };

  submitMultisigTransaction = async (txId: string) => {
    if (!this.app || !this.multisigConfig) return;
    this.signingStep = "submitting";
    this.signingTxId = txId;
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-multisig-submit");
    this.app.core?.logger.info({ namespace: "workspace", event: "multisig-submit-started", correlationId, fields: { threshold: this.multisigConfig.threshold } });

    try {
      const draft = this.transactions.find((t) => t.id === txId);
      if (!draft) throw new Error("Transaction not found.");

      const signatures = draft.peerSignatures.map((ps) => ({
        addr: ps.peerId,
        rawSig: decodeSignedBlob(ps.signedBlob),
      }));

      if (signatures.length < this.multisigConfig.threshold) {
        throw new Error(`Need ${this.multisigConfig.threshold} signatures, have ${signatures.length}.`);
      }

      const txid = await assembleAndSubmitMultisig(this.app, draft, this.multisigConfig, signatures);
      this.session?.updateTransaction(txId, { status: "submitted" });
      this.submittedTxIds = [txid];
      this.signingStep = "done";
      this.app.core?.logger.info({ namespace: "workspace", event: "multisig-submit-completed", correlationId, fields: { txId: txid } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to submit multisig transaction.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "multisig-submit-failed", correlationId, error: err });
    }
  };

  submitTransaction = async (txId: string) => {
    if (!this.app) return;
    this.signingStep = "submitting";
    this.signingTxId = txId;
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-submit");
    this.app.core?.logger.info({ namespace: "workspace", event: "transaction-submit-started", correlationId, fields: { mode: this.mode } });

    try {
      const draft = this.transactions.find((t) => t.id === txId);
      if (!draft) throw new Error("Transaction not found.");
      if (draft.peerSignatures.length === 0) throw new Error("No signatures to submit.");

      const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
      const blobs = draft.peerSignatures.map((s) => decodeSignedBlob(s.signedBlob));
      const txIds = await submitSignedBlobs(algod, blobs);

      this.session?.updateTransaction(txId, { status: "submitted" });
      this.submittedTxIds = txIds;
      this.signingStep = "done";
      this.app.core?.logger.info({ namespace: "workspace", event: "transaction-submit-completed", correlationId, fields: { txIds } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to submit transaction.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "transaction-submit-failed", correlationId, error: err, fields: { mode: this.mode } });
    }
  };

  submitAllSigned = async () => {
    if (!this.app) return;
    this.signingStep = "submitting";
    this.error = "";
    const correlationId = createLogCorrelationId("workspace-submit-all");
    this.app.core?.logger.info({ namespace: "workspace", event: "submit-all-started", correlationId });

    try {
      const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
      const txIds: string[] = [];

      for (const draft of this.transactions) {
        if (draft.status !== "signed" || draft.peerSignatures.length === 0) continue;
        const blobs = draft.peerSignatures.map((s) => decodeSignedBlob(s.signedBlob));
        const submitted = await submitSignedBlobs(algod, blobs);
        txIds.push(...submitted);
        this.session?.updateTransaction(draft.id, { status: "submitted" });
      }

      this.submittedTxIds = txIds;
      this.signingStep = "done";
      this.app.core?.logger.info({ namespace: "workspace", event: "submit-all-completed", correlationId, fields: { txIds } });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to submit transactions.";
      this.signingStep = "error";
      this.app.core?.logger.error({ namespace: "workspace", event: "submit-all-failed", correlationId, error: err });
    }
  };

  canSubmit(txId: string): boolean {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx) return false;

    if (this.mode === "send") return tx.peerSignatures.length > 0;
    if (this.mode === "multisig" && this.multisigConfig) {
      return tx.peerSignatures.length >= this.multisigConfig.threshold;
    }
    return false;
  }

  assignSwapPair(txn1Id: string, txn2Id: string): string | null {
    const pairId = createSwapPairId();
    const pair: SwapPair = { id: pairId, txn1Id, txn2Id, status: "grouped" };
    this.swapPairs = [...this.swapPairs, pair];

    this.updateTransaction(txn1Id, { swapGroupId: pairId });
    this.updateTransaction(txn2Id, { swapGroupId: pairId });
    this.app?.core?.logger.info({ namespace: "workspace", event: "swap-pair-assigned", correlationId: this.sessionCorrelationId });

    return pairId;
  }

  isSwapReady(groupId: string): boolean {
    const pair = this.swapPairs.find((p) => p.id === groupId);
    if (!pair) return false;
    return pair.status === "grouped" || pair.status === "signed";
  }

  isSwapBothSigned(groupId: string): boolean {
    const pair = this.swapPairs.find((p) => p.id === groupId);
    if (!pair) return false;
    const txn1 = this.transactions.find((t) => t.id === pair.txn1Id);
    const txn2 = this.transactions.find((t) => t.id === pair.txn2Id);
    return txn1?.status === "signed" && txn2?.status === "signed";
  }

  getPeerById(peerId: string): WorkspacePeer | undefined {
    return this.peers.find((p) => p.peerId === peerId);
  }
}

let _instance: WorkspacePageState | null = null;

export function setWorkspacePageState(): WorkspacePageState {
  if (!_instance) {
    _instance = new WorkspacePageState();
  }
  _instance.resetState();
  return _instance;
}

export function getWorkspacePageState(): WorkspacePageState {
  if (!_instance) {
    _instance = new WorkspacePageState();
  }
  return _instance;
}
