import type {
  WorkspaceState,
  TransactionDraft,
  PeerSignature,
  PeerConnectionCallbacks,
  RelayMessage,
} from "./workspace-types";
import {
  createRelayClient,
  type RelayClient,
  type RelayEventType,
} from "./relay-client";

const PEER_CONNECTION_TIMEOUT = 30000;
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export interface PeerConnection {
  readonly relay: RelayClient;
  readonly peerId: string;
  readonly sessionId: string;
  sendStateSync: (state: WorkspaceState) => void;
  sendTransactionPropose: (tx: TransactionDraft) => void;
  sendTransactionUpdate: (txId: string, changes: Partial<TransactionDraft>) => void;
  sendTransactionRemove: (txId: string) => void;
  sendTransactionSign: (txId: string, signature: PeerSignature) => void;
  sendPresence: (typing: boolean) => void;
  close: () => void;
  onDataChannelMessage: (handler: (data: string, peerId: string) => void) => void;
}

export function createPeerConnection(
  relayUrl: string,
  sessionId: string,
  callbacks: PeerConnectionCallbacks,
  existingPeerId?: string,
): PeerConnection {
  const dataChannelHandlers: Array<(data: string, peerId: string) => void> = [];
  const connections = new Map<string, RTCPeerConnection>();
  const dataChannels = new Map<string, RTCDataChannel>();

  function onDataChannelMessage(handler: (data: string, peerId: string) => void) {
    dataChannelHandlers.push(handler);
  }

  function notifyDataChannelHandlers(data: string, peerId: string) {
    for (const handler of dataChannelHandlers) {
      handler(data, peerId);
    }
  }

  function handleWorkspaceMessage(data: string, peerId: string) {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case "workspace:state_sync":
          callbacks.onStateSync(message.state as WorkspaceState, peerId);
          break;
        case "workspace:transaction_propose":
          callbacks.onTransactionPropose(message.transaction as TransactionDraft, peerId);
          break;
        case "workspace:transaction_update":
          callbacks.onTransactionUpdate(
            message.transactionId as string,
            message.changes as Partial<TransactionDraft>,
            peerId,
          );
          break;
        case "workspace:transaction_remove":
          callbacks.onTransactionRemove(message.transactionId as string, peerId);
          break;
        case "workspace:transaction_sign":
          callbacks.onTransactionSign(
            message.transactionId as string,
            message.signature as PeerSignature,
            peerId,
          );
          break;
        case "workspace:presence":
          callbacks.onPresence?.(peerId, message.typing as boolean);
          break;
      }
    } catch {
      // ignore malformed workspace messages
    }
  }

  const relay = createRelayClient(
    { url: relayUrl, sessionId, peerId: existingPeerId },
    (type: RelayEventType, message?: RelayMessage) => {
      switch (type) {
        case "open":
          callbacks.onConnectionStatus?.(true);
          break;
        case "close":
          callbacks.onConnectionStatus?.(false);
          break;
        case "exhausted":
          callbacks.onConnectionStatus?.("exhausted");
          break;
      }
      if (!message) return;
      switch (message.type) {
        case "relay:peer_joined": {
          const payload = message.payload as { peerId: string };
          const newPeerId = payload.peerId;
          initiateConnection(newPeerId);
          callbacks.onPeerStatus(newPeerId, "connected");
          break;
        }
        case "relay:peer_left": {
          const payload = message.payload as { peerId: string };
          const leftPeerId = payload.peerId;
          connections.get(leftPeerId)?.close();
          connections.delete(leftPeerId);
          dataChannels.delete(leftPeerId);
          callbacks.onPeerStatus(leftPeerId, "disconnected");
          break;
        }
        case "relay:peer_list": {
          const payload = message.payload as { peers: string[] };
          for (const peerId of payload.peers) {
            initiateConnection(peerId);
            callbacks.onPeerStatus(peerId, "connected");
          }
          break;
        }
        case "signal:offer": {
          const payload = message.payload as { sdp: string; peerId: string };
          handleOffer(payload.peerId, payload.sdp);
          break;
        }
        case "signal:answer": {
          const payload = message.payload as { sdp: string; peerId: string };
          handleAnswer(payload.peerId, payload.sdp);
          break;
        }
        case "signal:candidate": {
          const payload = message.payload as { candidate: string; peerId: string };
          handleCandidate(payload.peerId, payload.candidate);
          break;
        }
      }
    },
  );

  function initiateConnection(targetPeerId: string) {
    if (connections.has(targetPeerId) || targetPeerId === relay.peerId) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    connections.set(targetPeerId, pc);

    const dc = pc.createDataChannel("workspace", {
      ordered: true,
    });
    dataChannels.set(targetPeerId, dc);

    dc.onopen = () => {
      notifyDataChannelHandlers("connected", targetPeerId);
    };

    dc.onmessage = (event) => {
      handleWorkspaceMessage(event.data as string, targetPeerId);
    };

    dc.onclose = () => {
      callbacks.onPeerStatus(targetPeerId, "disconnected");
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        relay.send({
          type: "signal:candidate",
          target: targetPeerId,
          payload: { candidate: event.candidate.toJSON(), peerId: relay.peerId },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        callbacks.onPeerStatus(targetPeerId, "disconnected");
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (!dataChannels.has(targetPeerId)) {
        dataChannels.set(targetPeerId, channel);
      }
      channel.onmessage = (msgEvent) => {
        handleWorkspaceMessage(msgEvent.data as string, targetPeerId);
      };
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (pc.localDescription) {
          relay.send({
            type: "signal:offer",
            target: targetPeerId,
            payload: { sdp: pc.localDescription.sdp, peerId: relay.peerId },
          });
        }
      })
      .catch(() => {
        connections.delete(targetPeerId);
      });

    setTimeout(() => {
      if (pc.connectionState !== "connected") {
        pc.close();
        connections.delete(targetPeerId);
        dataChannels.delete(targetPeerId);
      }
    }, PEER_CONNECTION_TIMEOUT);
  }

  function handleOffer(fromPeerId: string, sdp: string) {
    let pc = connections.get(fromPeerId);
    if (!pc) {
      pc = new RTCPeerConnection(RTC_CONFIG);
      connections.set(fromPeerId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          relay.send({
            type: "signal:candidate",
            target: fromPeerId,
            payload: { candidate: event.candidate.toJSON(), peerId: relay.peerId },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc!.connectionState === "disconnected" || pc!.connectionState === "failed") {
          callbacks.onPeerStatus(fromPeerId, "disconnected");
        }
      };

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannels.set(fromPeerId, channel);
        channel.onmessage = (msgEvent) => {
          handleWorkspaceMessage(msgEvent.data as string, fromPeerId);
        };
      };
    }

    pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }))
      .then(() => pc!.createAnswer())
      .then((answer) => pc!.setLocalDescription(answer))
      .then(() => {
        if (pc!.localDescription) {
          relay.send({
            type: "signal:answer",
            target: fromPeerId,
            payload: { sdp: pc!.localDescription.sdp, peerId: relay.peerId },
          });
        }
      })
      .catch(() => {
        connections.delete(fromPeerId);
      });
  }

  function handleAnswer(fromPeerId: string, sdp: string) {
    const pc = connections.get(fromPeerId);
    if (pc && pc.remoteDescription === null) {
      pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp })).catch(() => {
        connections.delete(fromPeerId);
      });
    }
  }

  function handleCandidate(fromPeerId: string, candidateStr: string) {
    const pc = connections.get(fromPeerId);
    if (pc) {
      const candidate = typeof candidateStr === "string" ? JSON.parse(candidateStr) : candidateStr;
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
        // ignore invalid candidates
      });
    }
  }

  function sendToAll(type: string, payload: Record<string, unknown>) {
    const data = JSON.stringify({ type, ...payload });
    for (const [peerId, dc] of dataChannels) {
      if (dc.readyState === "open") {
        dc.send(data);
      }
    }
  }

  return {
    relay,
    get peerId() {
      return relay.peerId;
    },
    get sessionId() {
      return relay.sessionId;
    },
    sendStateSync(state: WorkspaceState) {
      sendToAll("workspace:state_sync", { state });
    },
    sendTransactionPropose(tx: TransactionDraft) {
      sendToAll("workspace:transaction_propose", { transaction: tx });
    },
    sendTransactionUpdate(txId: string, changes: Partial<TransactionDraft>) {
      sendToAll("workspace:transaction_update", { transactionId: txId, changes });
    },
    sendTransactionRemove(txId: string) {
      sendToAll("workspace:transaction_remove", { transactionId: txId });
    },
    sendTransactionSign(txId: string, signature: PeerSignature) {
      sendToAll("workspace:transaction_sign", { transactionId: txId, signature });
    },
    sendPresence(typing: boolean) {
      sendToAll("workspace:presence", { typing });
    },
    onDataChannelMessage,
    close() {
      for (const dc of dataChannels.values()) {
        dc.close();
      }
      for (const pc of connections.values()) {
        pc.close();
      }
      dataChannels.clear();
      connections.clear();
      relay.close();
    },
  };
}
