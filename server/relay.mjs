import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = process.env.RELAY_PORT ?? 9876;

const sessions = new Map();

const wss = new WebSocketServer({ noServer: true });

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", sessions: sessions.size }));
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  const peerId = url.searchParams.get("peerId") ?? randomUUID();

  if (!sessionId) {
    ws.close(4000, "Missing sessionId");
    return;
  }

  let session = sessions.get(sessionId);
  if (!session) {
    session = { peers: new Map() };
    sessions.set(sessionId, session);
  }

  const peerInfo = { ws, peerId, connectedAt: Date.now() };
  session.peers.set(peerId, peerInfo);

  ws.peerId = peerId;
  ws.sessionId = sessionId;

  console.log(`[${sessionId}] peer connected: ${peerId} (${session.peers.size} peers)`);

  ws.send(JSON.stringify({
    type: "relay:peer_assigned",
    payload: { peerId, sessionId },
  }));

  broadcastTo(session, peerId, {
    type: "relay:peer_joined",
    payload: { peerId },
  });

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { type } = message;

    switch (type) {
      case "signal:offer":
      case "signal:answer":
      case "signal:candidate":
        const targetId = message.target;
        const target = session.peers.get(targetId);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type,
            payload: message.payload,
            sender: peerId,
          }));
        }
        break;

      case "relay:list_peers":
        ws.send(JSON.stringify({
          type: "relay:peer_list",
          payload: {
            peers: [...session.peers.keys()].filter((id) => id !== peerId),
          },
        }));
        break;

      default:
        break;
    }
  });

  ws.on("close", () => {
    session.peers.delete(peerId);
    console.log(`[${sessionId}] peer disconnected: ${peerId} (${session.peers.size} peers)`);

    if (session.peers.size === 0) {
      sessions.delete(sessionId);
      console.log(`[${sessionId}] session closed (no peers)`);
    } else {
      broadcastTo(session, peerId, {
        type: "relay:peer_left",
        payload: { peerId },
      });
    }
  });

  ws.on("error", () => {
    ws.close();
  });
});

function broadcastTo(session, senderId, message) {
  const data = JSON.stringify({ ...message, sender: senderId });
  for (const [id, peer] of session.peers) {
    if (id !== senderId && peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(data);
    }
  }
}

server.listen(PORT, () => {
  console.log(`Banjo relay listening on ws://localhost:${PORT}`);
});
