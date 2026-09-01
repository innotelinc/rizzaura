import { useStore, ago } from "../store";

export default function Feed() {
  const { state } = useStore();
  return (
    <section id="feed">
      <div className="sec-head">
        <div className="tag">Mogged Feed</div>
        <h2>
          Internet <span className="grad-text">Mogging</span> In Real Time
        </h2>
        <p>The latest W's, L's, and aura events across the internet. 🎬</p>
      </div>
      <div className="card feed-wrap">
        {state.feed.map((e, i) => (
          <div className="feed-card card" key={e.ts + "-" + i}>
            <span className="feed-ico">{e.icon}</span>
            <div>
              <div className="feed-txt" dangerouslySetInnerHTML={{ __html: e.text }}></div>
              <div className="feed-time">🕒 {ago(e.ts)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
