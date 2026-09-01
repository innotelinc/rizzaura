import { useEffect, useState } from "react";
import { api, apiUrl } from "../../shared/api";
import { useLive } from "../../shared/useLive";
import { fmt, ago, timeLeft } from "../../shared/format";

function useMe() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    api("/api/me")
      .then((d) => setMe(d.anon ? null : d.user))
      .catch(() => {});
  }, []);
  return me;
}

function Nav({ me }) {
  return (
    <nav>
      <a className="logo" href="/">
        Rizz <b>Aura</b>
      </a>
      <span className="live">
        <i></i>COMMUNITY
      </span>
      <div className="navlinks">
        <a href="https://app.rizzaura.net" target="_blank" rel="noreferrer">
          App
        </a>
        <a href="https://rankings.rizzaura.net" target="_blank" rel="noreferrer">
          Rankings
        </a>
        {me && me.isAdmin && (
          <a href="https://admin.rizzaura.net" target="_blank" rel="noreferrer">
            Admin
          </a>
        )}
        {me ? (
          <span className={`user-chip ${me.isAdmin ? "admin" : ""}`}>
            <i className="dot"></i>
            {me.name}
          </span>
        ) : (
          <a
            className="nav-cta"
            href={apiUrl("/auth/login?next=" + encodeURIComponent(window.location.origin))}
          >
            Sign In
          </a>
        )}
      </div>
    </nav>
  );
}

const empty = {
  roster: [],
  pAura: {},
  feed: [],
  battle: null,
  censusCounts: {},
  teams: [],
  competitions: [],
};
const merge = (prev, d) => ({
  roster: d.roster || prev.roster,
  pAura: { ...prev.pAura, ...(d.pAura || {}) },
  feed: d.feed || prev.feed,
  battle: d.battle || prev.battle,
  censusCounts: { ...prev.censusCounts, ...(d.censusCounts || {}) },
  teams: d.teams || prev.teams,
  competitions: d.competitions || prev.competitions,
});

const CENSUS = [
  {
    id: "overrated",
    q: "Most overrated celebrity?",
    options: ["Taylor Swift", "Drake", "MrBeast", "Your Ex"],
  },
  {
    id: "farmer",
    q: "Biggest aura farmer?",
    options: ["MrBeast", "Kai Cenat", "IShowSpeed", "The Group Chat"],
  },
  {
    id: "mvp",
    q: "Internet MVP of the week?",
    options: ["Kendrick Lamar", "CaseOh", "The Intern", "Sabrina Carpenter"],
  },
  {
    id: "goat",
    q: "GOAT of the internet?",
    options: ["MrBeast", "Kai Cenat", "Messi", "Taylor Swift"],
  },
];

function Feed({ feed }) {
  return (
    <div className="feed-wrap card">
      {(feed || []).slice(0, 30).map((e, i) => (
        <div className="feed-card" key={e.ts + "-" + i}>
          <span className="feed-ico">{e.icon}</span>
          <div>
            <div className="feed-txt" dangerouslySetInnerHTML={{ __html: e.text }} />
            <div className="feed-time">{ago(e.ts)}</div>
          </div>
        </div>
      ))}
      {!feed?.length && <div className="empty">Feed is warming up…</div>}
    </div>
  );
}

function Battles({ s, me }) {
  const b = s.battle;
  if (!b || !b.a) return null;
  const a = s.roster.find((p) => p.id === b.a);
  const bb = s.roster.find((p) => p.id === b.b);
  const vote = async (id) => {
    if (!me) {
      window.location.href = apiUrl(
        "/auth/login?next=" + encodeURIComponent(window.location.origin),
      );
      return;
    }
    try {
      await api("/api/battle", { method: "POST", body: JSON.stringify({ winnerId: id }) });
    } catch {
      /* ignore */
    }
  };
  const F = ({ p }) => (
    <div className="fighter">
      <span className="big">{p?.emoji}</span>
      <h3>{p?.name}</h3>
      <div className="cat-tag">{b.cat.toUpperCase()}</div>
      {!b.voted ? (
        <button className="mini-btn primary" onClick={() => vote(p.id)}>
          🏆 Mog
        </button>
      ) : (
        <span style={{ fontSize: ".7rem", color: "var(--dim)" }}>
          {b.winner === p.id ? "WON 💀" : "MOGGED"}
        </span>
      )}
    </div>
  );
  return (
    <div className="card">
      <div
        className="arena"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "1rem",
          alignItems: "center",
          padding: "2rem 1.2rem",
        }}
      >
        <F p={a} />
        <div className="vs">VS</div>
        <F p={bb} />
      </div>
      <div className="center" style={{ paddingBottom: "1.2rem" }}>
        <span
          className="battle-cat"
          style={{
            fontFamily: "Unbounded",
            fontSize: ".72rem",
            fontWeight: 800,
            letterSpacing: ".16em",
            color: "#0b0b12",
            background: "var(--grad)",
            borderRadius: 999,
            padding: ".4rem 1rem",
          }}
        >
          ⚔️ {b.cat} BATTLE
        </span>
      </div>
    </div>
  );
}

function Census({ s, me }) {
  const [voted, setVoted] = useState({});
  const cast = async (qid, option) => {
    if (!me) {
      window.location.href = apiUrl(
        "/auth/login?next=" + encodeURIComponent(window.location.origin),
      );
      return;
    }
    try {
      const r = await api("/api/census", { method: "POST", body: JSON.stringify({ qid, option }) });
      setVoted((v) => ({ ...v, [qid]: true }));
      if (!r.ok && r.reason === "already") setVoted((v) => ({ ...v, [qid]: true }));
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className="census-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))",
        gap: "1.1rem",
      }}
    >
      {CENSUS.map((q) => {
        const counts = s.censusCounts[q.id] || q.options.map(() => 0);
        const total = counts.reduce((a, b) => a + b, 0) || 1;
        const done = voted[q.id];
        return (
          <div className="card census-card" key={q.id} style={{ padding: "1.3rem" }}>
            <h3 style={{ fontSize: ".98rem", fontWeight: 700, marginBottom: "1rem" }}>{q.q}</h3>
            {q.options.map((o, i) => {
              const pct = Math.round((counts[i] / total) * 100);
              return (
                <div
                  className={`opt ${done ? "voted" : ""}`}
                  key={i}
                  style={{ marginBottom: ".7rem" }}
                >
                  <div
                    className="row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: ".85rem",
                      marginBottom: ".3rem",
                    }}
                  >
                    <span>{o}</span>
                    <b style={{ color: "var(--dim)", fontWeight: 600 }}>{pct}%</b>
                  </div>
                  <div
                    className="bar"
                    style={{
                      width: "100%",
                      height: 8,
                      background: "rgba(255,255,255,.09)",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}
                  >
                    <i
                      style={{
                        display: "block",
                        height: "100%",
                        background: "var(--grad)",
                        width: pct + "%",
                      }}
                    />
                  </div>
                  {!done && (
                    <button
                      onClick={() => cast(q.id, i)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid var(--line)",
                        color: "#fff",
                        borderRadius: 10,
                        padding: ".55rem .8rem",
                        cursor: "pointer",
                        fontSize: ".86rem",
                        fontFamily: "inherit",
                        marginTop: ".35rem",
                      }}
                    >
                      Vote {o}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Teams({ s, me }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emoji, setEmoji] = useState("🤝");
  const [msg, setMsg] = useState("");

  const create = async () => {
    if (!me) {
      window.location.href = apiUrl(
        "/auth/login?next=" + encodeURIComponent(window.location.origin),
      );
      return;
    }
    try {
      const r = await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name, tag, emoji }),
      });
      if (r.ok) {
        setShowForm(false);
        setName("");
        setTag("");
      } else setMsg(r.error);
    } catch (e) {
      setMsg(e.message);
    }
  };
  const join = async (id) => {
    if (!me) {
      window.location.href = apiUrl(
        "/auth/login?next=" + encodeURIComponent(window.location.origin),
      );
      return;
    }
    try {
      const r = await api("/api/teams/" + id + "/join", { method: "POST" });
      if (!r.ok) setMsg(r.error);
    } catch (e) {
      setMsg(e.message);
    }
  };
  const leave = async (id) => {
    try {
      await api("/api/teams/" + id + "/leave", { method: "POST" });
    } catch {
      /* ignore */
    }
  };
  const teams = s.teams || [];
  return (
    <div className="stack">
      <div className="spread">
        <p className="dim" style={{ fontSize: ".9rem" }}>
          Squad up. Team aura counts toward competitions. Your crew, your clout.
        </p>
        {!showForm ? (
          <button className="mini-btn primary" onClick={() => setShowForm(true)}>
            + Found a Team
          </button>
        ) : (
          <div className="card panel" style={{ width: "min(420px, 100%)" }}>
            <label className="field">
              Team name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Glaze Factory"
              />
            </label>
            <div className="row mt">
              <label className="field" style={{ flex: 1 }}>
                Tag (≤4)
                <input
                  value={tag}
                  maxLength={4}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="GLAZE"
                />
              </label>
              <label className="field" style={{ width: 90 }}>
                Emoji
                <input value={emoji} maxLength={2} onChange={(e) => setEmoji(e.target.value)} />
              </label>
            </div>
            {msg && (
              <div className="dim mt" style={{ fontSize: ".78rem" }}>
                {msg}
              </div>
            )}
            <div className="row mt">
              <button className="mini-btn primary" onClick={create}>
                Create
              </button>
              <button className="mini-btn" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {!teams.length ? (
        <div className="card">
          <div className="empty">No teams yet — found the first one and start the dynasty. 🤝</div>
        </div>
      ) : (
        <div className="grid">
          {teams.map((t) => {
            const mine = me && t.members && me.teamId === t.id;
            return (
              <div className="card panel" key={t.id}>
                <div className="spread">
                  <h3 style={{ fontFamily: "Unbounded", fontSize: "1rem" }}>
                    {t.emoji} {t.name}
                  </h3>
                  <span className="verified-chip">{t.tag}</span>
                </div>
                <div className="dim mt" style={{ fontSize: ".82rem" }}>
                  👥 {t.members} members · ⚡ {fmt(t.aura)} team aura
                </div>
                <div className="row mt">
                  {mine ? (
                    <button className="mini-btn" onClick={() => leave(t.id)}>
                      Leave
                    </button>
                  ) : (
                    <button className="mini-btn primary" onClick={() => join(t.id)}>
                      Join
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Competitions({ s }) {
  const comps = s.competitions || [];
  if (!comps.length) {
    return (
      <div className="card">
        <div className="empty">No live competitions right now — check back soon. 🏟️</div>
      </div>
    );
  }
  return (
    <div className="stack">
      {comps.map((c) => (
        <div className="card panel" key={c.id}>
          <div className="spread">
            <div>
              <h3 style={{ fontFamily: "Unbounded", fontSize: "1.05rem" }}>🏟️ {c.name}</h3>
              <div className="dim" style={{ fontSize: ".78rem", marginTop: ".2rem" }}>
                {c.type === "aura" ? "Aura Sprint" : "Vote Storm"} · {timeLeft(c.endsAt)}
              </div>
            </div>
            <span className="live">
              <i></i>LIVE
            </span>
          </div>
          <div className="card" style={{ marginTop: "1rem", overflow: "hidden" }}>
            {(c.teams || []).map((t, i) => (
              <div
                className="rank-row"
                key={t.id}
                style={{ gridTemplateColumns: "2.4rem 1fr auto" }}
              >
                <div className={`rank-no ${i < 3 ? ["gold", "silver", "bronze"][i] : ""}`}>
                  #{i + 1}
                </div>
                <div className="rank-info">
                  <div className="nm">
                    {t.emoji} {t.name}
                    <span className="cat">{t.tag}</span>
                  </div>
                  <div className="handle">{t.members} members</div>
                </div>
                <div className="rank-aura">
                  <small>SCORE</small>
                  <b>{fmt(t.score)}</b>
                </div>
              </div>
            ))}
            {!c.teams?.length && (
              <div className="empty">No teams entered yet — join with your crew.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const me = useMe();
  const s = useLive(empty, merge);
  const [tab, setTab] = useState("feed");

  return (
    <>
      <Nav me={me} />
      <header className="hero">
        <div className="hero-badge">💬 THE HUB</div>
        <h1>
          The <span className="grad-text">Community</span> Fuel
        </h1>
        <p className="sub">
          Live mogged feed, daily battles, census chaos, teams, and competitions — all updated in
          real time.
        </p>
      </header>
      <main>
        <div className="tabs">
          <button className={tab === "feed" ? "sel" : ""} onClick={() => setTab("feed")}>
            🔥 Mogged Feed
          </button>
          <button className={tab === "battles" ? "sel" : ""} onClick={() => setTab("battles")}>
            ⚔️ Battles
          </button>
          <button className={tab === "census" ? "sel" : ""} onClick={() => setTab("census")}>
            📊 Census
          </button>
          <button className={tab === "teams" ? "sel" : ""} onClick={() => setTab("teams")}>
            🤝 Teams
          </button>
          <button className={tab === "comps" ? "sel" : ""} onClick={() => setTab("comps")}>
            🏟️ Competitions
          </button>
        </div>
        {tab === "feed" && <Feed feed={s.feed} />}
        {tab === "battles" && <Battles s={s} me={me} />}
        {tab === "census" && <Census s={s} me={me} />}
        {tab === "teams" && <Teams s={s} me={me} />}
        {tab === "comps" && <Competitions s={s} />}
      </main>
      <footer>
        <div>
          <b>Rizz Aura</b> — Global Leaderboard Platform
        </div>
        <div>Feed · Battles · Census · Teams · Competitions</div>
      </footer>
    </>
  );
}
