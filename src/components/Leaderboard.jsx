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

const money = (cents) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function Leaderboard() {
  const { state, actions } = useStore();
  const votesLeft = votesLeftToday(state);
  const bids = useMemo(
    () => [...(state.bids || [])].sort((a, b) => b.cents - a.cents || a.ts - b.ts),
    [state.bids],
  );
  const sorted = useMemo(
    () => [...PERSONALITIES].sort((a, b) => getAura(state, b.id) - getAura(state, a.id)),
    [state.pAura], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const topBid = bids[0];
  return (
    <section id="leaderboard">
      <div className="sec-head lb-head">
        <div className="tag">Live Rankings</div>
        <h2>
          The Aura <span className="grad-text">Leaderboard</span>
        </h2>
        <p>
          Upvote to pump. Dump to dump. Golden Upvotes move it a lot. Or skip the grind:{" "}
          <b style={{ color: "#fff" }}>
            buy a slot and stand above everyone — rank is what you pay.
          </b>{" "}
          💸
        </p>
        <button className="mini-btn cash-cta" onClick={actions.openBid}>
          💰 Buy the Board
        </button>
        {topBid && (
          <div className="top-bid-line">
            Top bid right now: <b>{money(topBid.cents)}</b> by {topBid.name} {topBid.emoji} —{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                actions.openBid();
              }}
            >
              mog them 👑
            </a>
          </div>
        )}
      </div>
      <div className="card">
        {bids.map((b, i) => (
          <div className={`rank-row clout-row ${i === 0 ? "top-bid" : ""}`} key={b.id}>
            <span className={`rank-no ${i === 0 ? "gold" : ""}`}>#{i + 1}</span>
            <div className="rank-ava clout-ava">{b.emoji}</div>
            <div className="rank-info">
              <div className="nm">
                {b.name} <span className="cat paid-chip">💰 PAID</span>
                <span className="verified-chip">✓ VERIFIED</span>
              </div>
              <div className="handle">
                {b.handle} · flexed {money(b.cents)}
              </div>
            </div>
            <div className="rank-aura">
              <small>FLEX</small>
              <b className="cash-text">{money(b.cents)}</b>
            </div>
          </div>
        ))}
        {bids.length > 0 && (
          <div className="board-divider">
            <span>⬇ THE GRIND BOARD · RANKED BY AURA VOTES ⬇</span>
          </div>
        )}
        {sorted.map((p, i) => {
          const rank = i + bids.length + 1;
          const cls = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
          return (
            <div className="rank-row" key={p.id}>
              <span className={`rank-no ${cls}`}>#{rank}</span>
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
