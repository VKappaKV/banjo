import type { Network } from "$core/types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import type { RelayMessage } from "../workspace-types";
import type { SignalingEventHandler, SignalingTransport } from "../signaling-transport";
import { BEACON_PROTO, type BeaconDecodedNote, type BeaconSessionRecord, type BeaconSignalPayload } from "./beacon-types";
import { deriveBeaconKeypair, deriveBeaconSessionToken, decryptBeaconPayload, encryptBeaconPayload, type BeaconKeypairResult } from "./beacon-crypto";
import { fetchBeaconTransactions, lookupBeaconAnnouncement, submitBeaconNote, submitBeaconNotes } from "./beacon-indexer";

export interface BeaconSignalingTransportOptions {
  app: WalletAppState;
  network: Network;
  protocolAddress: string;
  identityAddress: string;
  recipientAddress?: string;
  mode: "offer" | "listen";
  sessionId: string;
  pollIntervalMs?: number;
  password?: string;
}

export interface BeaconSignalingTransport extends SignalingTransport {
  announce: () => Promise<string>;
  hasAnnouncement: () => Promise<boolean>;
}

const DEFAULT_POLL_INTERVAL = 5000;
const OFFER_TTL_MS = 10 * 60 * 1000;

export function createBeaconSignalingTransport(
  options: BeaconSignalingTransportOptions,
  onEvent: SignalingEventHandler,
): BeaconSignalingTransport {
  let closed = false;
  let connected = false;
  let keypairPromise: Promise<BeaconKeypairResult> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastSeenRound = 0;
  const processedTxIds = new Set<string>();
  const sessions = new Map<string, BeaconSessionRecord>();
  const fragments = new Map<string, BeaconSignalPayload[]>();

  function keypair() {
    keypairPromise ??= deriveBeaconKeypair({
      app: options.app,
      address: options.identityAddress,
      network: options.network,
      password: options.password,
    });
    return keypairPromise;
  }

  function emitOpen() {
    connected = true;
    onEvent("open");
  }

  function reassembleFragment(note: BeaconDecodedNote, payload: BeaconSignalPayload): BeaconSignalPayload | undefined {
    if (!payload.total || payload.total <= 1) return payload;
    const key = note.transaction.group ?? `${note.transaction.sender}:${payload.type}:${payload.ts}`;
    const group = fragments.get(key) ?? [];
    group[payload.part ? payload.part - 1 : 0] = payload;
    fragments.set(key, group);
    if (group.filter(Boolean).length < payload.total) return undefined;
    fragments.delete(key);
    return {
      ...payload,
      part: 1,
      total: 1,
      sdp: group.slice(0, payload.total).map((part) => part?.sdp ?? "").join(""),
    };
  }

  async function processNote(note: BeaconDecodedNote, kp: BeaconKeypairResult) {
    if (!note.encrypted || processedTxIds.has(note.transaction.id)) return;
    processedTxIds.add(note.transaction.id);
    lastSeenRound = Math.max(lastSeenRound, note.transaction.round);
    const decrypted = decryptBeaconPayload<BeaconSignalPayload>(note.encrypted, kp.secretKey);
    if (!decrypted || decrypted.proto !== BEACON_PROTO) return;
    const payload = reassembleFragment(note, decrypted);
    if (!payload) return;
    if (payload.exp && payload.exp < Date.now()) return;
    if (Math.abs(payload.ts - Date.now()) > OFFER_TTL_MS * 2) return;

    const peerId = note.transaction.sender;
    if (payload.type === "offer" && payload.sdp && options.mode === "listen") {
      const token = deriveBeaconSessionToken(payload.wpk, kp.secretKey, payload.ts);
      sessions.set(peerId, { peerId, remoteAddress: peerId, remoteWpk: payload.wpk, offerTs: payload.ts });
      options.app.core?.logger.info({ namespace: "workspace", event: "beacon-offer-received", fields: { network: options.network.name } });
      onEvent("message", {
        type: "signal:offer",
        sender: peerId,
        payload: { sdp: payload.sdp, peerId, sessionToken: token },
      } as RelayMessage);
      return;
    }

    if (payload.type === "answer" && payload.sdp && options.mode === "offer") {
      sessions.set(peerId, { peerId, remoteAddress: peerId, remoteWpk: payload.wpk, offerTs: payload.ts });
      options.app.core?.logger.info({ namespace: "workspace", event: "beacon-answer-received", fields: { network: options.network.name } });
      onEvent("message", {
        type: "signal:answer",
        sender: peerId,
        payload: { sdp: payload.sdp, peerId },
      } as RelayMessage);
    }
  }

  async function poll() {
    if (closed) return;
    try {
      const kp = await keypair();
      const notes = await fetchBeaconTransactions({
        network: options.network,
        protocolAddress: options.protocolAddress,
        useFallback: options.app.state.fallbackEnabled,
        minRound: lastSeenRound > 0 ? lastSeenRound + 1 : undefined,
        limit: 50,
      });
      for (const note of notes.reverse()) {
        await processNote(note, kp);
      }
    } catch {
      if (!closed) onEvent("error");
    }
  }

  async function startOfferFlow(kp: BeaconKeypairResult) {
    if (!options.recipientAddress) throw new Error("Recipient address is required for BEACON offer mode.");
    const announcement = await lookupBeaconAnnouncement({
      network: options.network,
      protocolAddress: options.protocolAddress,
      address: options.recipientAddress,
      useFallback: options.app.state.fallbackEnabled,
    });
    if (!announcement?.wpk) throw new Error("Recipient has not initialized BEACON yet.");
    options.app.core?.logger.info({ namespace: "workspace", event: "beacon-recipient-announcement-found", fields: { network: options.network.name } });
    const peerId = options.recipientAddress;
    sessions.set(peerId, { peerId, remoteAddress: options.recipientAddress, remoteWpk: announcement.wpk, offerTs: Date.now() });
    onEvent("message", {
      type: "relay:peer_joined",
      payload: { peerId },
      sender: peerId,
    } as RelayMessage);
  }

  async function postSignal(message: RelayMessage) {
    const payload = message.payload as { sdp?: string; peerId?: string } | undefined;
    if (!payload?.sdp || (message.type !== "signal:offer" && message.type !== "signal:answer")) return;
    const kp = await keypair();
    const target = message.target ?? payload.peerId;
    if (!target) throw new Error("Missing BEACON signal target.");
    const session = sessions.get(target);
    if (!session) throw new Error("BEACON session target not found.");
    const ts = message.type === "signal:offer" ? session.offerTs : Date.now();
    const signal: BeaconSignalPayload = {
      proto: BEACON_PROTO,
      type: message.type === "signal:offer" ? "offer" : "answer",
      wpk: kp.wpk,
      ts,
      exp: Date.now() + OFFER_TTL_MS,
      sdp: payload.sdp,
      part: 1,
      total: 1,
    };
    const chunks = splitSignalSdp(signal.sdp ?? "");
    const encryptedPayloads = chunks.map((chunk, index) => encryptBeaconPayload({
      ...signal,
      sdp: chunk,
      part: index + 1,
      total: chunks.length,
    }, session.remoteWpk));
    await submitBeaconNotes({
      app: options.app,
      network: options.network,
      sender: options.identityAddress,
      protocolAddress: options.protocolAddress,
      payloads: encryptedPayloads,
      password: options.password,
    });
    options.app.core?.logger.info({
      namespace: "workspace",
      event: signal.type === "offer" ? "beacon-offer-sent" : "beacon-answer-sent",
      fields: { network: options.network.name, fragmentCount: encryptedPayloads.length },
    });
  }

  async function start() {
    try {
      const kp = await keypair();
      if (closed) return;
      emitOpen();
      options.app.core?.logger.info({ namespace: "workspace", event: "beacon-transport-opened", fields: { mode: options.mode, network: options.network.name } });
      await poll();
      pollTimer = setInterval(poll, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
      if (options.mode === "offer") {
        await startOfferFlow(kp);
      }
    } catch (error) {
      if (!closed) {
        options.app.core?.logger.error({ namespace: "workspace", event: "beacon-transport-start-failed", error, fields: { mode: options.mode, network: options.network.name } });
        onEvent("exhausted");
      }
    }
  }

  void start();

  return {
    get peerId() {
      return options.identityAddress;
    },
    get sessionId() {
      return options.sessionId;
    },
    get connected() {
      return connected;
    },
    supportsTrickleIce: false,
    async send(message) {
      await postSignal(message);
    },
    close() {
      closed = true;
      connected = false;
      if (pollTimer) clearInterval(pollTimer);
      onEvent("close");
    },
    async announce() {
      const kp = await keypair();
      return submitBeaconNote({
        app: options.app,
        network: options.network,
        sender: options.identityAddress,
        protocolAddress: options.protocolAddress,
        payload: { proto: BEACON_PROTO, type: "announce", wpk: kp.wpk, ts: Date.now() },
        password: options.password,
      });
    },
    async hasAnnouncement() {
      const announcement = await lookupBeaconAnnouncement({
        network: options.network,
        protocolAddress: options.protocolAddress,
        address: options.identityAddress,
        useFallback: options.app.state.fallbackEnabled,
      });
      return !!announcement?.wpk;
    },
  };
}

function splitSignalSdp(sdp: string): string[] {
  const chunkSize = 420;
  if (sdp.length <= chunkSize) return [sdp];
  const chunks: string[] = [];
  for (let i = 0; i < sdp.length; i += chunkSize) {
    chunks.push(sdp.slice(i, i + chunkSize));
  }
  return chunks;
}
