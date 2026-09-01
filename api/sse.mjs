/* SSE hub — real-time push for the whole platform.
 *
 * Any module can import { broadcast } and push { type, payload } to every
 * connected client (leaderboard apps, community app, admin panel). Clients
 * reconnect automatically on drop, and the server sends a periodic heartbeat
 * so a quiet board still gets a fresh snapshot.
 */

const clients = new Set();

export function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}

export function handleSse(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

// Heartbeat: every 5s push the live snapshot so late joiners / quiet periods
// still converge, and clients can treat a missed beat as a dropped stream.
export function startHeartbeat(snapshotFn) {
  setInterval(() => {
    try {
      broadcast({ type: "snapshot", payload: snapshotFn() });
    } catch {
      /* keep the hub alive */
    }
  }, 5000);
}
