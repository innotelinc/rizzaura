import { CENSUS } from "../data";
import { useStore } from "../store";

export default function Census() {
  const { state, actions } = useStore();
  return (
    <section id="census">
      <div className="sec-head">
        <div className="tag">Daily Internet Census</div>
        <h2>
          The Internet Has <span className="grad-text">Opinions</span>
        </h2>
        <p>Vote on today's questions. Results become trending rankings. +2 coins per vote.</p>
      </div>
      <div className="census-grid">
        {CENSUS.map((q) => {
          const counts = (state.censusCounts[q.id] || q.options.map(() => 0)).slice();
          const my = state.myVotes[q.id];
          if (my != null) counts[my]++;
          const total = counts.reduce((s, c) => s + c, 0) || 1;
          return (
            <div className="census-card card" key={q.id}>
              <h3>{q.q}</h3>
              {q.options.map((opt, i) => {
                const voted = my === i;
                const pct = Math.round((counts[i] / total) * 100);
                return (
                  <div className={`opt ${voted ? "voted" : ""}`} key={i}>
                    <div className="row">
                      <span>{opt}</span>
                      <b>{pct}%</b>
                    </div>
                    <div className="bar">
                      <i style={{ width: pct + "%" }}></i>
                    </div>
                    <button disabled={voted} onClick={() => actions.censusVote(q.id, i)}>
                      {voted ? "✅ Your pick" : "Vote"}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
