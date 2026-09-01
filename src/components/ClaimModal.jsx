import { useState } from "react";
import { AVATARS } from "../data";
import { useStore } from "../store";

export default function ClaimModal() {
  const { state, actions } = useStore();
  const [ava, setAva] = useState(state.profile?.avatar || "😎");
  const [name, setName] = useState(state.profile?.name || "");
  if (!state.claimOpen) return null;

  const submit = () => {
    const n = name.trim();
    if (!n) {
      actions.toast("You need a name, legend 💀");
      return;
    }
    actions.claim(n, ava);
  };

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.closeClaim();
      }}
    >
      <div className="modal card">
        <h2>
          Claim Your <span className="grad-text">Aura</span>
        </h2>
        <p>
          Pick an avatar, drop your name, and enter the leaderboard with <b>100 Aura</b> and{" "}
          <b>25 coins</b> to start your climb.
        </p>
        <div className="ava-grid">
          {AVATARS.map((a) => (
            <button key={a} className={a === ava ? "sel" : ""} onClick={() => setAva(a)}>
              {a}
            </button>
          ))}
        </div>
        <input
          className="name-input"
          maxLength={20}
          placeholder="Your internet name..."
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button className="btn" style={{ width: "100%" }} onClick={submit}>
          ⚡ CLAIM MY AURA
        </button>
      </div>
    </div>
  );
}
