import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

/* Real-time hook: subscribes to /api/events (SSE) and applies snapshots.
 * Falls back to 5s polling when the stream drops or the browser lacks
 * EventSource support. `applySnapshot` merges the snapshot into local state;
 * `onEvent` receives discrete events (aura, battle, badge, ...). */
export function useLive(initial, applySnapshot, onEvent) {
  const [data, setData] = useState(initial);
  const cbRef = useRef({ applySnapshot, onEvent });
  cbRef.current = { applySnapshot, onEvent };

  useEffect(() => {
    let es = null;
    let poll = null;
    let stopped = false;

    const refresh = async () => {
      try {
        const d = await fetch(API_BASE + "/state", { credentials: "include" }).then((r) =>
          r.json(),
        );
        if (!stopped) setData((prev) => cbRef.current.applySnapshot(prev, d));
      } catch {
        /* server unreachable — keep last known */
      }
    };

    const startPolling = () => {
      if (poll) return;
      refresh();
      poll = setInterval(refresh, 5000);
    };
    const stopPolling = () => {
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };

    if (typeof EventSource !== "undefined") {
      es = new EventSource(API_BASE + "/events");
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === "snapshot") {
            setData((prev) => cbRef.current.applySnapshot(prev, evt.payload));
          } else if (cbRef.current.onEvent) {
            setData((prev) => cbRef.current.onEvent(prev, evt) ?? prev);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        // SSE dropped — fall back to polling; the EventSource auto-reconnects.
        startPolling();
        setTimeout(() => {
          if (es && es.readyState === EventSource.CLOSED && !stopped) {
            // still dead after reconnect attempts → keep polling
          }
        }, 8000);
      };
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
      stopPolling();
      if (es) es.close();
    };
  }, []);

  return data;
}
