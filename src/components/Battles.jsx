import { useStore, getPerson } from "../store";

function Fighter({ p, voted, mogged, won, onVote }) {
  return (
    <div
      className="fighter"
      style={
        won
          ? { borderColor: "rgba(0,245,255,.6)", boxShadow: "0 0 30px rgba(0,245,255,.3)" }
          : undefined
      }
    >
      <span className="big">{p.emoji}</span>
      <h3>{p.name}</h3>
      <div className="cat-tag">{p.cat.toUpperCase()}</div>
      <button className="btn ghost" disabled={voted} onClick={onVote}>
        Vote {p.name.split(" ")[0]}
      </button>
      {mogged && (
        <div className="stamp">
          <span>MOGGED</span>
        </div>
      )}
    </div>
  );
}

export default function Battles() {
  const { state, actions } = useStore();
  const bt = state.battle;
  if (!bt || !bt.a) return null;
  const a = getPerson(bt.a);
  const b = getPerson(bt.b);
  return (
    <section id="battles">
      <div className="sec-head">
        <div className="tag">Main Character Battles</div>
        <h2>
          Who's The <span className="grad-text">Main Character</span>?
        </h2>
        <p>Winner gains aura. Loser gets mogged. No mercy.</p>
      </div>
      <div className="card arena">
        <div style={{ gridColumn: "1/-1", textAlign: "center" }}>
          <span className="battle-cat">WHO HAS MORE {bt.cat.toUpperCase()}?</span>
        </div>
        <Fighter
          p={a}
          voted={bt.voted}
          mogged={bt.voted && bt.loser === a.id}
          won={bt.voted && bt.winner === a.id}
          onVote={() => actions.battleVote(a.id)}
        />
        <div className="vs">VS</div>
        <Fighter
          p={b}
          voted={bt.voted}
          mogged={bt.voted && bt.loser === b.id}
          won={bt.voted && bt.winner === b.id}
          onVote={() => actions.battleVote(b.id)}
        />
      </div>
    </section>
  );
}
