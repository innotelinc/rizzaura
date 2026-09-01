import { useMemo } from "react";
import { PERSONALITIES, CAT_COLORS } from "../data";
import { useStore, getAura, votesLeftToday, fmt } from "../store";

function StatBar({ label, v }) {
  return (
    <span className="stat">
      <small>{label}</small>
      <div className="bar">
        <i style={{ width: v + "%" }}></i>
      </div>
    </span>
  );
}

export default function Leaderboard() {
  const { state, actions } = useStore();
  const votesLeft = votesLeftToday(state);
  // only pAura drives the sort — recomputing on every state change is wasteful
  const sorted = useMemo(
    () => [...PERSONALITIES].sort((a, b) => getAura(state, b.id) - getAura(state, a.id)),
    [state.pAura], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <section id="leaderboard">
      <div className="sec-head">
        <div className="tag">Live Rankings</div>
        <h2>
          The Aura <span className="grad-text">Leaderboard</span>
        </h2>
        <p>
          Upvote to pump. Downvote to dump. Every vote moves the board. Golden Upvotes move it a
          lot.
        </p>
      </div>
      <div className="card">
        {sorted.map((p, i) => {
          const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
          return (
            <div className="rank-row" key={p.id}>
              <span className={`rank-no ${cls}`}>#{i + 1}</span>
              <div className="rank-ava" style={{ borderColor: CAT_COLORS[p.cat] + "55" }}>
                {p.emoji}
              </div>
              <div className="rank-info">
                <div className="nm">
                  {p.name}{" "}
                  <span className="cat" style={{ color: CAT_COLORS[p.cat] }}>
                    {p.cat.toUpperCase()}
                  </span>
                </div>
                <div className="handle">{p.handle}</div>
                <div className="stat-bars">
                  <StatBar label="RIZZ" v={p.rizz} />
                  <StatBar label="DRIP" v={p.drip} />
                  <StatBar label="MCE" v={p.mce} />
                </div>
              </div>
              <div className="rank-aura">
                <small>AURA</small>
                <b style={{ textShadow: `0 0 14px ${CAT_COLORS[p.cat]}66` }}>
                  {fmt(getAura(state, p.id))}
                </b>
                <div
                  style={{
                    display: "flex",
                    gap: ".3rem",
                    marginTop: ".4rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="votebtn"
                    title="Pump (+5 aura)"
                    disabled={votesLeft <= 0}
                    onClick={() => actions.votePerson(p.id, 1)}
                  >
                    ▲
                  </button>
                  <button
                    className="votebtn down"
                    title="Dump (-5 aura)"
                    disabled={votesLeft <= 0}
                    onClick={() => actions.votePerson(p.id, -1)}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
