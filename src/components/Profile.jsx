import { useStore, rankOf, percentile, votesLeftToday, fmt } from "../store";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function ProfileCard({ p, state, actions }) {
  const rank = rankOf(p.aura);
  const pc = percentile(state, p.aura);
  const progress = rank.next
    ? clamp(Math.round(((p.aura - rank.min) / (rank.next - rank.min)) * 100), 2, 98)
    : 100;
  const flexed = state.owned.includes("flexframe");
  const pctLabel = pc.isTop ? "The Main Character" : `Top ${Math.max(1, pc.pct)}% Worldwide`;

  const copyFlex = async () => {
    const label = pc.isTop
      ? "the literal main character"
      : `Top ${Math.max(1, pc.pct)}% Aura Worldwide`;
    const txt = `Bro I'm ${label} (${rank.title}, ${fmt(p.aura)} Aura) 😎🔥 — Rizz Aura`;
    try {
      await navigator.clipboard.writeText(txt);
      actions.toast("Copied — go flex 📋😎");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      actions.toast("Copied — go flex 📋😎");
    }
  };

  return (
    <div className={`card prof-card ${flexed ? "flexed" : ""}`}>
      {state.sticker && <span className="sticker">{state.sticker}</span>}
      <div className="prof-ava">{p.avatar}</div>
      <h3>{p.name}</h3>
      <div className="rank-title">
        {rank.title.toUpperCase()} · {pctLabel.toUpperCase()}
      </div>
      <div className="big-aura">
        {fmt(p.aura)}
        <small>AURA POINTS™</small>
      </div>
      <div className="rank-progress">
        <div className="lbl">
          <span>{rank.title}</span>
          <span>
            {rank.next ? `${fmt(rank.next)} Aura → ${rankOf(rank.next).title}` : "MAX RIZZ 😎"}
          </span>
        </div>
        <div className="bar">
          <i style={{ width: progress + "%" }}></i>
        </div>
      </div>
      <div className="prof-stats">
        <span>
          🪙 <b>{fmt(state.coins)}</b> coins
        </span>
        <span>
          🗳️ <b>{votesLeftToday(state)}</b> votes left
        </span>
        {flexed && <span className="paid-flex-chip">✨ PAID FLEX</span>}
      </div>
      <div className="prof-actions">
        <button className="mini-btn" onClick={copyFlex}>
          📋 Copy Flex
        </button>
        <button className="mini-btn" onClick={actions.openClaim}>
          ✏️ Edit Profile
        </button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { state, actions } = useStore();
  return (
    <section id="profile">
      <div className="sec-head">
        <div className="tag">Your Aura</div>
        <h2>
          Your <span className="grad-text">Main Character</span> Card
        </h2>
        <p>This is your internet identity. Guard it with your life.</p>
      </div>
      <div className="profile-wrap">
        {!state.profile ? (
          <div className="card prof-card">
            <div className="prof-ava">👻</div>
            <h3>You're an unclaimed NPC</h3>
            <div className="rank-title">RANK: UNRANKED</div>
            <p style={{ color: "var(--dim)", fontSize: ".85rem", lineHeight: 1.6 }}>
              The leaderboard doesn't know you exist yet. That's sad. Fix it.
            </p>
            <div className="prof-actions">
              <button className="btn" onClick={actions.openClaim}>
                ⚡ Claim Your Aura
              </button>
            </div>
          </div>
        ) : (
          <ProfileCard p={state.profile} state={state} actions={actions} />
        )}
      </div>
    </section>
  );
}
