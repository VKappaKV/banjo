import { describe, expect, it, onTestFinished } from "vitest";
import WebSocket from "ws";

const RELAY_URL = "ws://localhost:9876";

async function connect(sessionId: string, peerId?: string): Promise<{ ws: WebSocket; peerId: string }> {
  const url = `${RELAY_URL}?sessionId=${sessionId}${peerId ? `&peerId=${peerId}` : ""}`;
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });
  const peerIdAssigned = peerId ?? "";
  return { ws, peerId: peerIdAssigned };
}

function waitForMessage(ws: WebSocket, type: string, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === type) {
          clearTimeout(timer);
          resolve(msg);
        }
      } catch { /* skip */ }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS error")); };
    ws.onclose = () => { clearTimeout(timer); reject(new Error("WS closed")); };
  });
}

describe("relay server", () => {
  it("rejects connections without sessionId", async () => {
    const ws = new WebSocket("ws://localhost:9876");
    const closeCode = await new Promise<number | null>((resolve) => {
      ws.onclose = (e) => resolve(e.code);
      setTimeout(() => resolve(null), 2000);
    });
    expect(closeCode).toBe(4000);
  });

  it("assigns peerId on connect and notifies peer_joined", async () => {
    const sessionId = `test-${Date.now()}`;
    const ws1 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const assigned: { peerId: string } = await new Promise((resolve) => {
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve(msg.payload);
      };
    });

    expect(assigned.peerId).toBeTruthy();

    const ws2 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const joined: { payload: { peerId: string } } = await new Promise((resolve) => {
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_joined") resolve(msg);
      };
    });

    expect(joined.payload.peerId).toBeTruthy();
    ws1.close();
    ws2.close();
  });

  it("relays signal messages between peers", async () => {
    const sessionId = `sig-test-${Date.now()}`;
    const ws1 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const { peerId: id1 } = await new Promise<{ peerId: string }>((resolve) => {
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve(msg.payload);
      };
    });

    const ws2 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const { peerId: id2 } = await new Promise<{ peerId: string }>((resolve) => {
      ws2.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve(msg.payload);
      };
    });

    const offerPromise = waitForMessage(ws1, "signal:offer");
    ws2.send(JSON.stringify({
      type: "signal:offer",
      payload: { sdp: "test-sdp", peerId: id2 },
      target: id1,
    }));
    const offer = await offerPromise;
    expect(offer.payload.sdp).toBe("test-sdp");

    ws1.close();
    ws2.close();
  });

  it("notifies peer_left on disconnect", async () => {
    const sessionId = `leave-test-${Date.now()}`;
    const ws1 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    await new Promise<void>((resolve) => {
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve();
      };
    });

    const ws2 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const { peerId: id2 } = await new Promise<{ peerId: string }>((resolve) => {
      ws2.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve(msg.payload);
      };
    });

    const leftPromise = waitForMessage(ws1, "relay:peer_left");
    ws2.close();
    const left = await leftPromise;
    expect(left.payload.peerId).toBe(id2);

    ws1.close();
  });

  it("lists existing peers for new joiners", async () => {
    const sessionId = `list-test-${Date.now()}`;

    const ws1 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    const id1 = await new Promise<string>((resolve) => {
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve(msg.payload.peerId);
      };
    });

    const ws2 = new WebSocket(`${RELAY_URL}?sessionId=${sessionId}`);
    await new Promise<void>((resolve) => {
      ws2.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "relay:peer_assigned") resolve();
      };
    });

    const listPromise = waitForMessage(ws2, "relay:peer_list");
    ws2.send(JSON.stringify({ type: "relay:list_peers" }));
    const list = await listPromise;
    expect(list.payload.peers).toContain(id1);

    ws1.close();
    ws2.close();
  });
});
