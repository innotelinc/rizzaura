import { useEffect, useState } from "react";
import { api, apiUrl } from "../../shared/api";
import { useLive } from "../../shared/useLive";
import { fmt, timeLeft } from "../../shared/format";
import { SITE } from "../../shared/urls";

const RANK_COLORS = ["gold", "silver", "bronze"];

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
        <i></i>LIVE RANKINGS
      </span>
      <div className="navlinks">
        <a href={SITE.app} target="_blank" rel="noreferrer">
          App
        </a>
        <a href={SITE.community} target="_blank" rel="noreferrer">
          Community
        </a>
        {me && me.isAdmin && (
          <a href={SITE.admin} target="_blank" rel="noreferrer">
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

const empty = { roster: [], pAura: {}, bids: [], season: null, hallOfFame: [] };
const merge = (prev, d) => ({
  roster: d.roster || prev.roster,
  pAura: { ...prev.pAura, ...(d.pAura || {}) },
  bids: d.bids || prev.bids,
  season: d.season || prev.season,
  hallOfFame: d.hallOfFame || prev.hallOfFame,
  teams: d.teams || prev.teams,
  competitions: d.competitions || prev.competitions,
});

function auraOf(s, id) {
  return s.pAura[id] ?? s.roster.find((p) => p.id === id)?.aura ?? 100;
}

function globalBoard(s) {
  const paid = (s.bids || [])
    .map((b) => ({
      id: b.id,
      name: b.name,
      handle: b.handle,
      emoji: b.emoji,
      aura: b.cents,
      paid: true,
      verified: b.verified,
    }))
    .sort((a, b) => b.aura - a.aura);
  const free = (s.roster || [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      handle: p.handle,
      emoji: p.emoji,
      cat: p.cat,
      aura: auraOf(s, p.id),
      paid: false,
    }))
    .sort((a, b) => b.aura - a.aura);
  return [...paid, ...free];
}

function RankRow({ row, rank, live }) {
  return (
    <div
      className={`rank-row ${row.paid ? "clout-row" : ""} ${rank === 0 && row.paid ? "top-bid" : ""}`}
    >
      <div className={`rank-no ${RANK_COLORS[rank] || ""}`}>#{rank + 1}</div>
      <div className={`rank-ava ${row.paid ? "clout-ava" : ""}`}>{row.emoji}</div>
      <div className="rank-info">
        <div className="nm">
          {row.name}
          {row.paid && <span className="verified-chip">✓ AURA VERIFIED</span>}
          {row.paid && <span className="cat paid-chip">💰 PAID</span>}
          {row.cat && <span className="cat">{row.cat.toUpperCase()}</span>}
        </div>
        <div className="handle">{row.handle}</div>
      </div>
      <div className="rank-aura">
        <small>{row.paid ? "PAID SLOT" : "AURA"}</small>
        <b>{fmt(row.aura)}</b>
      </div>
      {live && <i style={{ color: "var(--cyan)", fontSize: ".7rem" }}>●</i>}
    </div>
  );
}

function GlobalBoard({ s }) {
  const board = globalBoard(s);
  return (
    <div className="card">
      {board.slice(0, 100).map((row, i) => (
        <RankRow key={row.id} row={row} rank={i} live={i === 0} />
      ))}
    </div>
  );
}

function SeasonBoard({ s, season }) {
  const board = globalBoard(s);
  const top = board.slice(0, 20);
  return (
    <div className="card">
      <div className="spread" style={{ padding: "1rem 1.1rem" }}>
        <div>
          <b style={{ fontFamily: "Unbounded" }}>{season.name}</b>
          <div className="dim" style={{ fontSize: ".78rem", marginTop: ".2rem" }}>
            Started {new Date(season.startedAt).toLocaleDateString()} · Ends{" "}
            {new Date(season.endsAt).toLocaleDateString()}
          </div>
        </div>
        <span className="live">
          <i></i>
          {timeLeft(season.endsAt)}
        </span>
      </div>
      {top.map((row, i) => (
        <RankRow key={row.id} row={row} rank={i} />
      ))}
      <div className="dim center" style={{ fontSize: ".78rem", padding: "1rem" }}>
        Season snapshot locks at the end — top 10 players earn prestige + Hall of Fame entry.
      </div>
    </div>
  );
}

function HallOfFame({ s }) {
  const fame = s.hallOfFame || [];
  if (!fame.length) {
    return (
      <div className="card">
        <div className="empty">
          The Hall of Fame is empty — Season One hasn't wrapped yet. The top 10 players and top 20
          personalities get immortalized here. 🏛️
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      {fame.map((snap) => (
        <div className="card panel" key={snap.season.id}>
          <div className="spread" style={{ marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontFamily: "Unbounded", fontSize: "1.05rem" }}>
                {snap.season.name} <span className="grad-text">🏛️</span>
              </h3>
              <div className="dim" style={{ fontSize: ".78rem" }}>
                Ended {new Date(snap.endedAt).toLocaleDateString()}
              </div>
            </div>
            <span className="verified-chip">SEASON LEGACY</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1.4rem" }}>
            <div>
              <div
                className="tag"
                style={{
                  color: "var(--gold)",
                  fontSize: ".68rem",
                  fontWeight: 800,
                  letterSpacing: ".14em",
                  marginBottom: ".7rem",
                }}
              >
                TOP PERSONALITIES
              </div>
              {snap.personalities.slice(0, 10).map((p, i) => (
                <div className="spread" key={i} style={{ padding: ".4rem 0", fontSize: ".85rem" }}>
                  <span>
                    {p.emoji} {p.name}
                  </span>
                  <b className="gold">{fmt(p.aura)}</b>
                </div>
              ))}
            </div>
            <div>
              <div
                className="tag"
                style={{
                  color: "var(--gold)",
                  fontSize: ".68rem",
                  fontWeight: 800,
                  letterSpacing: ".14em",
                  marginBottom: ".7rem",
                }}
              >
                HALL OF FAME PLAYERS
              </div>
              {snap.players.map((p, i) => (
                <div className="spread" key={i} style={{ padding: ".4rem 0", fontSize: ".85rem" }}>
                  <span>
                    {p.avatar} {p.name}
                  </span>
                  <b>{fmt(p.aura)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PrestigeBoard({ s }) {
  const players = (s.hallOfFame || [])
    .flatMap((snap) => snap.players)
    .reduce((acc, p) => {
      acc[p.sub] = acc[p.sub] || { name: p.name, avatar: p.avatar, count: 0, lastAura: p.aura };
      acc[p.sub].count += 1;
      acc[p.sub].lastAura = Math.max(acc[p.sub].lastAura, p.aura);
      return acc;
    }, {});
  const rows = Object.values(players).sort((a, b) => b.count - a.count || b.lastAura - a.lastAura);
  if (!rows.length) {
    return (
      <div className="card">
        <div className="empty">
          No prestige yet — finish a season in the top 10 to earn your first ⭐.
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      {rows.map((p, i) => (
        <div className="rank-row" key={i}>
          <div className={`rank-no ${RANK_COLORS[i] || ""}`}>#{i + 1}</div>
          <div className="rank-ava">{p.avatar}</div>
          <div className="rank-info">
            <div className="nm">
              {p.name}
              <span
                className="cat"
                style={{ color: "var(--gold)", borderColor: "rgba(255,215,106,.4)" }}
              >
                PRESTIGE {p.count}
              </span>
            </div>
            <div className="handle">Hall of Fame inductions: {p.count}</div>
          </div>
          <div className="rank-aura">
            <small>LEGACY AURA</small>
            <b>{fmt(p.lastAura)}</b>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const me = useMe();
  const s = useLive(empty, merge);
  const [tab, setTab] = useState("global");
  const players = s.players;

  return (
    <>
      <Nav me={me} />
      <header className="hero">
        <div className="hero-badge">⚡ REAL-TIME · SSE LIVE</div>
        <h1>
          The <span className="grad-text">Rankings</span> of the Internet
        </h1>
        <p className="sub">
          Live aura standings, seasonal championships, and the Hall of Fame — updated in real time
          as votes, battles, and paid flexes land.
        </p>
        <div className="hero-stats">
          <span>
            <b>{fmt(players)}</b> players
          </span>
          <span>
            Season <b>{s.season?.id}</b> — {s.season?.name}
          </span>
          <span>
            <b>{s.hallOfFame?.length || 0}</b> seasons immortalized
          </span>
        </div>
      </header>
      <main>
        <section id="rankings">
          <div className="tabs">
            <button className={tab === "global" ? "sel" : ""} onClick={() => setTab("global")}>
              🌍 Global
            </button>
            <button className={tab === "season" ? "sel" : ""} onClick={() => setTab("season")}>
              📅 Seasonal
            </button>
            <button className={tab === "fame" ? "sel" : ""} onClick={() => setTab("fame")}>
              🏛️ Hall of Fame
            </button>
            <button className={tab === "prestige" ? "sel" : ""} onClick={() => setTab("prestige")}>
              ⭐ Prestige
            </button>
          </div>
          {tab === "global" && <GlobalBoard s={s} />}
          {tab === "season" && s.season && <SeasonBoard s={s} season={s.season} />}
          {tab === "fame" && <HallOfFame s={s} />}
          {tab === "prestige" && <PrestigeBoard s={s} />}
        </section>
      </main>
      <footer>
        <div>
          <b>Rizz Aura</b> — Global Leaderboard Platform
        </div>
        <div>Rankings · Seasons · Hall of Fame</div>
      </footer>
    </>
  );
}
