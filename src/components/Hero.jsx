import { useMemo } from "react";
import { PERSONALITIES } from "../data";
import { useStore, getAura, fmt } from "../store";

export default function Hero() {
  const { state, actions } = useStore();
  // only pAura drives the total — recomputing on every state change is wasteful
  const totalAura = useMemo(
    () => PERSONALITIES.reduce((s, p) => s + getAura(state, p.id), 0),
    [state.pAura], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const auraStr =
    totalAura >= 1e6 ? (totalAura / 1e6).toFixed(1) + "M" : (totalAura / 1e3).toFixed(1) + "K";

  const handleClaim = () => {
    if (state.profile) {
      document.getElementById("profile")?.scrollIntoView({ behavior: "smooth" });
      actions.toast("Already claimed, king 👑");
    } else {
      actions.openClaim();
    }
  };

  return (
    <header id="home">
      <span className="hero-badge">🔥 THE INTERNET'S OFFICIAL AURA LEADERBOARD</span>
      <h1>
        The Global <span className="grad-text">Aura</span> Leaderboard.
      </h1>
      <p className="sub">
        Rank creators, brands, streamers, athletes, and your friends. Earn clout, collect aura, and
        prove who's really the main character.
      </p>
      <div className="hero-stats">
        <span>
          <b>{fmt(state.players)}</b> Players
        </span>
        <span>
          <b>{auraStr}</b> Aura Earned
        </span>
        <span>
          <b>8,491</b> Mogged
        </span>
        <span>
          <b>99%</b> Rizz Guaranteed
        </span>
      </div>
      <div className="cta-row">
        <button className="btn" onClick={handleClaim}>
          Claim Your Aura
        </button>
        <a className="btn ghost" href="#leaderboard">
          View Leaderboard
        </a>
      </div>
      <span className="float-emoji" style={{ top: "14%", left: "6%", fontSize: "2rem" }}>
        😎
      </span>
      <span
        className="float-emoji"
        style={{ top: "24%", right: "8%", fontSize: "2.6rem", animationDelay: "1.2s" }}
      >
        🔥
      </span>
      <span
        className="float-emoji"
        style={{ bottom: "12%", left: "12%", fontSize: "1.8rem", animationDelay: "2.1s" }}
      >
        👑
      </span>
      <span
        className="float-emoji"
        style={{ bottom: "18%", right: "14%", fontSize: "2rem", animationDelay: ".6s" }}
      >
        💀
      </span>
    </header>
  );
}
