import type { RelayMessage, RelayMessageType } from "./workspace-types";

export type RelayEventType = "open" | "message" | "close" | "error" | "exhausted";
export type RelayEventHandler = (type: RelayEventType, message?: RelayMessage) => void;

export interface RelayClientOptions {
  url: string;
  sessionId: string;
  peerId?: string;
  maxRetries?: number;
  initialRetryDelay?: number;
}

const MAX_RETRIES_DEFAULT = 5;
const INITIAL_DELAY_DEFAULT = 1000;

export interface RelayClient {
  readonly peerId: string;
  readonly sessionId: string;
  readonly connected: boolean;
  send: (message: RelayMessage) => void;
  close: () => void;
}

export function createRelayClient(
  options: RelayClientOptions,
  onEvent: RelayEventHandler,
): RelayClient {
  const maxRetries = options.maxRetries ?? MAX_RETRIES_DEFAULT;
  const initialDelay = options.initialRetryDelay ?? INITIAL_DELAY_DEFAULT;

  let ws: WebSocket | null = null;
  let assignedPeerId = options.peerId ?? "";
  let closed = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;
  const pendingMessages: RelayMessage[] = [];

  function connect() {
    if (closed) return;
    const url = `${options.url}?sessionId=${options.sessionId}${options.peerId ? `&peerId=${options.peerId}` : ""}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      if (closed) { ws?.close(); return; }
      retryCount = 0;
      connected = true;
      flushPending();
      onEvent("open");
    };

    ws.onmessage = (event) => {
      if (closed) return;
      try {
        const message = JSON.parse(event.data as string) as RelayMessage;
        if (message.type === "relay:peer_assigned") {
          const payload = message.payload as { peerId: string; sessionId: string };
          assignedPeerId = payload.peerId;
        }
        onEvent("message", message);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    ws.onclose = () => {
      connected = false;
      if (!closed) {
        onEvent("close");
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    if (retryCount >= maxRetries) {
      onEvent("exhausted");
      return;
    }
    retryCount++;
    const delay = Math.min(initialDelay * Math.pow(2, retryCount - 1), 30000);
    retryTimer = setTimeout(connect, delay);
  }

  function flushPending() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (pendingMessages.length > 0) {
      const msg = pendingMessages.shift()!;
      ws.send(JSON.stringify(msg));
    }
  }

  connect();

  return {
    get peerId() {
      return assignedPeerId;
    },
    get sessionId() {
      return options.sessionId;
    },
    get connected() {
      return connected;
    },
    send(message: RelayMessage) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else if (!closed && retryCount < maxRetries) {
        pendingMessages.push(message);
      }
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
      connected = false;
    },
  };
}
