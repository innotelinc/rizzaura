import { useStore } from "../store";

export default function Nav() {
  const { state, actions } = useStore();
  const handleCta = (e) => {
    e.preventDefault();
    if (state.profile) {
      document.getElementById("profile")?.scrollIntoView({ behavior: "smooth" });
      actions.toast("Already claimed, king 👑");
    } else {
      actions.openClaim();
    }
  };
  return (
    <nav>
      <a className="logo" href="#home">
        Rizz <b>Aura</b>
      </a>
      <span className="live">
        <i></i>LIVE
      </span>
      <div className="navlinks">
        <a href="#leaderboard">Leaderboard</a>
        <a href="#battles">Battles</a>
        <a href="#feed">Mogged Feed</a>
        <a href="#census">Census</a>
        <a href="#market">Market</a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            actions.openBid();
          }}
          style={{ color: "#ffd76a" }}
        >
          💰 Cash Shop
        </a>
        <a href="https://rankings.rizzaura.net" target="_blank" rel="noreferrer">
          Rankings
        </a>
        <a href="https://community.rizzaura.net" target="_blank" rel="noreferrer">
          Community
        </a>
        {state.me ? (
          <span className={`user-chip ${state.me.isAdmin ? "admin" : ""}`}>
            <i className="dot"></i>
            {state.me.name}
            <button
              className="link"
              onClick={(e) => {
                e.preventDefault();
                actions.signOut();
              }}
              title="Sign out"
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            className="link nav-cta"
            onClick={(e) => {
              e.preventDefault();
              actions.signIn();
            }}
          >
            Sign In
          </button>
        )}
        <a className="nav-cta" href="#profile" onClick={handleCta}>
          Claim Your Aura
        </a>
      </div>
    </nav>
  );
}
