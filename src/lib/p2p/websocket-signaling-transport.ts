import { createRelayClient } from "./relay-client";
import type { SignalingEventHandler, SignalingTransport } from "./signaling-transport";

export interface WebSocketSignalingTransportOptions {
  url: string;
  sessionId: string;
  peerId?: string;
}

export function createWebSocketSignalingTransport(
  options: WebSocketSignalingTransportOptions,
  onEvent: SignalingEventHandler,
): SignalingTransport {
  const relay = createRelayClient(options, onEvent);

  return {
    get peerId() {
      return relay.peerId;
    },
    get sessionId() {
      return relay.sessionId;
    },
    get connected() {
      return relay.connected;
    },
    supportsTrickleIce: true,
    send(message) {
      relay.send(message);
    },
    close() {
      relay.close();
    },
  };
}
