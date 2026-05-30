import type { RelayMessage } from "./workspace-types";

export type SignalingEventType = "open" | "message" | "close" | "error" | "exhausted";
export type SignalingEventHandler = (type: SignalingEventType, message?: RelayMessage) => void;

export interface SignalingTransport {
  readonly peerId: string;
  readonly sessionId: string;
  readonly connected: boolean;
  readonly supportsTrickleIce: boolean;
  send: (message: RelayMessage) => void | Promise<void>;
  close: () => void;
}
