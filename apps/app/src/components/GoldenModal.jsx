import { useState } from "react";
import { PERSONALITIES } from "../data";
import { useStore, getAura, fmt } from "../store";

export default function GoldenModal() {
  const { state, actions } = useStore();
  const [target, setTarget] = useState("");
  if (!state.goldenOpen) return null;

  const sorted = [...PERSONALITIES].sort((a, b) => getAura(state, b.id) - getAura(state, a.id));
  const val = target || sorted[0]?.id || "";
  const owned = state.owned.includes("golden");

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.closeGolden();
      }}
    >
      <div className="modal card">
        <h2>
          Golden <span className="grad-text">Upvote</span> 🏆
        </h2>
        <p>
          Pay 150 coins to gift <b>+250 Aura</b> to any player. Pure glaze. Zero shame.
        </p>
        <select value={val} onChange={(e) => setTarget(e.target.value)}>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name} ({fmt(getAura(state, p.id))} aura)
            </option>
          ))}
        </select>
        <button
          className="btn"
          style={{ width: "100%" }}
          disabled={owned}
          onClick={() => actions.goldenGift(val)}
        >
          🏆 GIFT +250 AURA
        </button>
      </div>
    </div>
  );
}
