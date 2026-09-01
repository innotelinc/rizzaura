import { useMemo } from "react";
import { useStore, makeEvent } from "../store";

export default function Ticker() {
  const { state } = useStore();
  // regenerate as the feed evolves (at least 10 entries for a full marquee)
  const items = useMemo(() => {
    const count = Math.max(10, state.feed.length);
    return Array.from({ length: count }, () => makeEvent().text.replace(/<[^>]+>/g, ""));
  }, [state.feed.length]);
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {items.concat(items).map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
