import { useEffect, useState } from "react";
import { api, apiUrl } from "../../shared/api";
import { fmt } from "../../shared/format";
import { SITE } from "../../shared/urls";

const BADGES = [
  {
    id: "first-vote",
    name: "First Ballot",
    emoji: "🗳️",
    tier: "bronze",
    desc: "Cast your first vote.",
  },
  { id: "voice-heard", name: "Voice Heard", emoji: "📢", tier: "silver", desc: "Cast 25 votes." },
  {
    id: "vote-enthusiast",
    name: "Vote Enthusiast",
    emoji: "🗳️",
    tier: "gold",
    desc: "Cast 50 votes.",
  },
  {
    id: "electoral-college",
    name: "Electoral College",
    emoji: "🏛️",
    tier: "gold",
    desc: "Cast 100 votes.",
  },
  {
    id: "ballot-stuffer",
    name: "Ballot Stuffer",
    emoji: "📦",
    tier: "platinum",
    desc: "Cast 200 votes.",
  },
  { id: "centurion", name: "Century", emoji: "💯", tier: "bronze", desc: "Reach 100 aura." },
  { id: "rising-star", name: "Rising Star", emoji: "🌟", tier: "bronze", desc: "Reach 250 aura." },
  { id: "influencer", name: "Influencer", emoji: "📈", tier: "silver", desc: "Reach 500 aura." },
  {
    id: "aura-millionaire",
    name: "Aura Millionaire",
    emoji: "💵",
    tier: "silver",
    desc: "Reach 1,000 aura.",
  },
  { id: "aura-god", name: "Aura God", emoji: "🕶️", tier: "gold", desc: "Reach 2,000 aura." },
  { id: "mogul", name: "Mogul", emoji: "👑", tier: "gold", desc: "Reach 5,000 aura." },
  { id: "legend", name: "Legend", emoji: "🏛️", tier: "platinum", desc: "Reach 10,000 aura." },
  {
    id: "untouchable",
    name: "Untouchable",
    emoji: "☄️",
    tier: "platinum",
    desc: "Reach 20,000 aura.",
  },
  { id: "battle-winner", name: "Gladiator", emoji: "⚔️", tier: "silver", desc: "Win a battle." },
  { id: "battle-champ", name: "Undisputed", emoji: "🥊", tier: "gold", desc: "Win 10 battles." },
  {
    id: "battle-royale",
    name: "Battle Royale",
    emoji: "⚔️",
    tier: "platinum",
    desc: "Win 25 battles.",
  },
  {
    id: "census-voter",
    name: "Census Taker",
    emoji: "📊",
    tier: "bronze",
    desc: "Answer a census question.",
  },
  {
    id: "census-addict",
    name: "Census Addict",
    emoji: "📊",
    tier: "silver",
    desc: "Answer 10 census questions.",
  },
  {
    id: "pollster",
    name: "Pollster",
    emoji: "🗳️",
    tier: "gold",
    desc: "Answer 25 census questions.",
  },
  {
    id: "golden-gifter",
    name: "Sugar Daddy",
    emoji: "💸",
    tier: "gold",
    desc: "Drop a Golden Upvote.",
  },
  {
    id: "glaze-lord",
    name: "Glaze Lord",
    emoji: "💸",
    tier: "platinum",
    desc: "Drop 3 Golden Upvotes.",
  },
  { id: "team-player", name: "Team Player", emoji: "🤝", tier: "silver", desc: "Join a team." },
  { id: "founder", name: "Founder", emoji: "🚩", tier: "gold", desc: "Found a team." },
  {
    id: "squad-goals",
    name: "Squad Goals",
    emoji: "👥",
    tier: "silver",
    desc: "Be in a team of 5+.",
  },
  {
    id: "competitor",
    name: "Competitor",
    emoji: "🏅",
    tier: "bronze",
    desc: "Enter a competition.",
  },
  {
    id: "comp-veteran",
    name: "Comp Veteran",
    emoji: "🏅",
    tier: "silver",
    desc: "Enter 3 competitions.",
  },
  {
    id: "triple-threat",
    name: "Triple Threat",
    emoji: "🎯",
    tier: "gold",
    desc: "Enter 5 competitions.",
  },
  { id: "champion", name: "Champion", emoji: "🏆", tier: "platinum", desc: "Win a competition." },
  {
    id: "back-to-back",
    name: "Back-to-Back",
    emoji: "🏆",
    tier: "gold",
    desc: "Win 2 competitions.",
  },
  {
    id: "hall-of-famer",
    name: "Hall of Famer",
    emoji: "⭐",
    tier: "platinum",
    desc: "Finish a season top-10.",
  },
  {
    id: "three-peat",
    name: "Three-Peat",
    emoji: "⭐",
    tier: "gold",
    desc: "Finish top-10 in 3 seasons.",
  },
  {
    id: "dynasty",
    name: "Dynasty",
    emoji: "👑",
    tier: "platinum",
    desc: "Finish top-10 in 5 seasons.",
  },
  {
    id: "main-character",
    name: "Main Character",
    emoji: "🎬",
    tier: "gold",
    desc: "Reach #1 on the player board.",
  },
  {
    id: "diamond-hands",
    name: "Diamond Hands",
    emoji: "💎",
    tier: "silver",
    desc: "Hold #1 for 7 days.",
  },
  {
    id: "platinum-grip",
    name: "Platinum Grip",
    emoji: "💎",
    tier: "platinum",
    desc: "Hold #1 for 30 days.",
  },
];

function useAdmin() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/api/me")
      .then((d) => {
        setMe(d.anon ? null : d.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  return { me, loading };
}

function Gate({ me, loading }) {
  if (loading) {
    return (
      <main>
        <div className="empty">Checking access…</div>
      </main>
    );
  }
  if (!me || !me.isAdmin) {
    return (
      <main>
        <div className="card panel center mt">
          <h2 style={{ fontFamily: "Unbounded", fontSize: "1.3rem" }}>🛠️ Admins Only</h2>
          <p className="dim" style={{ margin: "1rem 0 1.4rem", lineHeight: 1.6 }}>
            This control center is restricted to the <b>rizz-aura-admins</b> group in Authentik.
            Sign in with an admin account to continue.
          </p>
          <a
            className="btn"
            href={apiUrl("/auth/login?next=" + encodeURIComponent(window.location.origin))}
          >
            Sign In
          </a>
        </div>
      </main>
    );
  }
  return null;
}

export default function App() {
  const { me, loading } = useAdmin();
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [season, setSeason] = useState(null);
  const [comps, setComps] = useState([]);
  const [msg, setMsg] = useState("");
  const [grantPlayer, setGrantPlayer] = useState("");
  const [grantBadge, setGrantBadge] = useState(BADGES[0].id);
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState("aura");
  const [compDays, setCompDays] = useState(3);

  const refresh = () => {
    api("/api/admin/stats")
      .then(setStats)
      .catch(() => {});
    api("/api/achievements")
      .then((d) => setAchievements(d.earned || []))
      .catch(() => {});
    api("/api/seasons")
      .then((d) => setSeason(d.season))
      .catch(() => {});
    api("/api/state")
      .then((d) => setComps(d.competitions || []))
      .catch(() => {});
  };
  useEffect(() => {
    if (me?.isAdmin) refresh();
  }, [me]);

  if (loading || !me?.isAdmin) return <Gate me={me} loading={loading} />;

  const act = async (path, body) => {
    try {
      const r = await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      setMsg(r.error || "done ✅");
      refresh();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const topPlayers = (stats?.topPlayers || []).map((p) => p.name).join(", ");

  return (
    <>
      <nav>
        <a className="logo" href="/">
          Rizz <b>Aura</b> <span style={{ fontSize: ".6rem", color: "var(--gold)" }}>ADMIN</span>
        </a>
        <span className="live">
          <i></i>CONTROL CENTER
        </span>
        <div className="navlinks">
          <a href={SITE.app} target="_blank" rel="noreferrer">
            App
          </a>
          <a href={SITE.rankings} target="_blank" rel="noreferrer">
            Rankings
          </a>
          <a href={SITE.community} target="_blank" rel="noreferrer">
            Community
          </a>
          <span className="user-chip admin">
            <i className="dot"></i>
            {me.name}
          </span>
        </div>
      </nav>
      <main>
        {msg && (
          <div className="card panel" style={{ borderColor: "rgba(0,245,255,.4)" }}>
            <div className="dim">{msg}</div>
          </div>
        )}
        <div className="tabs mt">
          <button className={tab === "stats" ? "sel" : ""} onClick={() => setTab("stats")}>
            📈 Overview
          </button>
          <button className={tab === "badges" ? "sel" : ""} onClick={() => setTab("badges")}>
            🏅 Badges
          </button>
          <button className={tab === "season" ? "sel" : ""} onClick={() => setTab("season")}>
            📅 Seasons
          </button>
          <button className={tab === "comps" ? "sel" : ""} onClick={() => setTab("comps")}>
            🏟️ Competitions
          </button>
        </div>

        {tab === "stats" && stats && (
          <div className="stack">
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))" }}
            >
              {[
                ["👥", "Players", stats.players],
                ["🧑‍🚀", "Signed-in users", stats.users],
                ["🗳️", "Votes today", stats.votesToday],
                ["💰", "Orders", stats.orders],
                ["💵", "Revenue", "$" + (stats.revenueCents / 100).toFixed(2)],
                ["🏅", "Badges granted", stats.badges],
              ].map(([emoji, label, val]) => (
                <div className="card panel center" key={label}>
                  <div style={{ fontSize: "1.6rem" }}>{emoji}</div>
                  <div
                    className="dim"
                    style={{ fontSize: ".72rem", letterSpacing: ".1em", marginTop: ".4rem" }}
                  >
                    {label.toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontFamily: "Unbounded",
                      fontWeight: 900,
                      fontSize: "1.3rem",
                      marginTop: ".3rem",
                    }}
                  >
                    {fmt(val)}
                  </div>
                </div>
              ))}
            </div>
            <div className="card panel">
              <div className="sec-head" style={{ marginBottom: "1rem" }}>
                <div className="tag">Season {season?.id}</div>
                <h2 style={{ fontSize: "1.2rem" }}>{season?.name}</h2>
                <p className="dim" style={{ fontSize: ".85rem" }}>
                  Ends {season ? new Date(season.endsAt).toLocaleDateString() : "—"} · Top players:{" "}
                  {topPlayers || "none yet"}
                </p>
              </div>
              <button
                className="mini-btn danger"
                onClick={() => act("/api/admin/seasons/rollover")}
              >
                ⏭ Force Season Rollover
              </button>
            </div>
          </div>
        )}

        {tab === "badges" && (
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
            <div className="card panel">
              <div className="sec-head" style={{ marginBottom: "1rem" }}>
                <div className="tag">Grant / Revoke</div>
                <h2 style={{ fontSize: "1.2rem" }}>Badge Control</h2>
              </div>
              <label className="field">
                Player sub (Authentik subject id)
                <input
                  value={grantPlayer}
                  onChange={(e) => setGrantPlayer(e.target.value)}
                  placeholder="e.g. b3f…"
                />
              </label>
              <label className="field mt">
                Badge
                <select value={grantBadge} onChange={(e) => setGrantBadge(e.target.value)}>
                  {BADGES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.emoji} {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row mt">
                <button
                  className="mini-btn primary"
                  onClick={() =>
                    act("/api/admin/achievements/grant", { player: grantPlayer, badge: grantBadge })
                  }
                >
                  + Grant
                </button>
                <button
                  className="mini-btn"
                  onClick={() =>
                    act("/api/admin/achievements/revoke", {
                      player: grantPlayer,
                      badge: grantBadge,
                    })
                  }
                >
                  − Revoke
                </button>
              </div>
            </div>
            <div className="card panel">
              <div className="sec-head" style={{ marginBottom: "1rem" }}>
                <div className="tag">Recent grants</div>
                <h2 style={{ fontSize: "1.2rem" }}>Achievement Log</h2>
              </div>
              <div className="feed-wrap" style={{ maxHeight: 340 }}>
                {achievements
                  .slice(-30)
                  .reverse()
                  .map((a, i) => {
                    const b = BADGES.find((x) => x.id === a.badge);
                    return (
                      <div className="feed-card" key={i}>
                        <span className="feed-ico">{b?.emoji || "🏅"}</span>
                        <div>
                          <div className="feed-txt">
                            <b>{a.player}</b> earned {b?.name || a.badge}
                          </div>
                          <div className="feed-time">{new Date(a.ts).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                {!achievements.length && <div className="empty">No badges granted yet.</div>}
              </div>
            </div>
          </div>
        )}

        {tab === "season" && (
          <div className="card panel">
            <div className="sec-head">
              <div className="tag">Season control</div>
              <h2 style={{ fontSize: "1.2rem" }}>
                {season?.id} — {season?.name}
              </h2>
              <p className="dim" style={{ fontSize: ".85rem" }}>
                Rollover snapshots the top 20 personalities + top 10 players into the Hall of Fame,
                awards prestige, and starts the next 28-day season.
              </p>
            </div>
            <button className="mini-btn danger" onClick={() => act("/api/admin/seasons/rollover")}>
              ⏭ Rollover Now
            </button>
          </div>
        )}

        {tab === "comps" && (
          <div className="stack">
            <div className="card panel">
              <div className="sec-head" style={{ marginBottom: "1rem" }}>
                <div className="tag">Create</div>
                <h2 style={{ fontSize: "1.2rem" }}>New Competition</h2>
              </div>
              <label className="field">
                Name
                <input
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Summer Clout Cup"
                />
              </label>
              <div className="row mt">
                <label className="field" style={{ flex: 1 }}>
                  Type
                  <select value={compType} onChange={(e) => setCompType(e.target.value)}>
                    <option value="aura">Aura Sprint</option>
                    <option value="votes">Vote Storm</option>
                  </select>
                </label>
                <label className="field" style={{ width: 160 }}>
                  Days (1-30)
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={compDays}
                    onChange={(e) => setCompDays(e.target.value)}
                  />
                </label>
              </div>
              <div className="row mt">
                <button
                  className="mini-btn primary"
                  onClick={() =>
                    act("/api/competitions", { name: compName, type: compType, days: compDays })
                  }
                >
                  🏟️ Launch Competition
                </button>
              </div>
            </div>
            <div className="card panel">
              <div className="sec-head" style={{ marginBottom: "1rem" }}>
                <div className="tag">Live</div>
                <h2 style={{ fontSize: "1.2rem" }}>Active Competitions</h2>
              </div>
              {comps.map((c) => (
                <div
                  className="spread"
                  key={c.id}
                  style={{ padding: ".6rem 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}
                >
                  <div>
                    <b>{c.name}</b>
                    <div className="dim" style={{ fontSize: ".78rem" }}>
                      {c.type === "aura" ? "Aura Sprint" : "Vote Storm"} · {c.teams?.length || 0}{" "}
                      teams
                    </div>
                  </div>
                  <button
                    className="mini-btn danger"
                    onClick={() => act("/api/admin/competitions/" + c.id + "/end")}
                  >
                    End
                  </button>
                </div>
              ))}
              {!comps.length && <div className="empty">No live competitions.</div>}
            </div>
          </div>
        )}
      </main>
      <footer>
        <div>
          <b>Rizz Aura</b> — Admin Control Center
        </div>
      </footer>
    </>
  );
}
