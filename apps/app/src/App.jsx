import { useEffect } from "react";
import { StoreProvider, useStore } from "./store";
import Ticker from "./components/Ticker";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import How from "./components/How";
import Leaderboard from "./components/Leaderboard";
import Battles from "./components/Battles";
import Feed from "./components/Feed";
import Census from "./components/Census";
import Market from "./components/Market";
import Profile from "./components/Profile";
import ClaimModal from "./components/ClaimModal";
import GoldenModal from "./components/GoldenModal";
import BidModal from "./components/BidModal";
import Toast from "./components/Toast";
import Confetti from "./components/Confetti";

function Shell() {
  const { state, actions } = useStore();

  // Auto-open the claim modal on first visit
  useEffect(() => {
    if (!state.profile) {
      const t = setTimeout(() => actions.openClaim(), 600);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After Stripe redirects back (?session=...), confirm the order, apply
  // local cosmetics, then clean the URL. Retries a few times in case the
  // webhook hasn't landed yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session");
    if (params.get("paid") === "0") {
      window.history.replaceState({}, "", window.location.pathname);
      actions.toast("Didn't pay? No flex 💀 The board stays unowned.");
      return;
    }
    if (!session) return;
    let tries = 0;
    const check = async () => {
      const done = await actions.applyPaidOrder(session);
      if (!done && tries < 4) {
        tries++;
        setTimeout(check, 2500);
        return;
      }
      window.history.replaceState({}, "", window.location.pathname);
      if (!done) actions.toast("Payment received — flex deploying soon ⚡");
    };
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Ticker />
      <Nav />
      <Hero />
      <main>
        <How />
        <Leaderboard />
        <Battles />
        <Feed />
        <Census />
        <Market />
        <Profile />
      </main>
      <footer>
        <div>
          <b>Rizz Aura</b> — "Got Aura? Prove It."
        </div>
        <div>
          Fan-made meme project. Not affiliated with any of the people, brands, or games mentioned.
          All aura is fictional. 💀
        </div>
        <div>Climb the Clout. Collect the W. Rizz Up or Get Mogged.</div>
      </footer>
      <ClaimModal />
      <GoldenModal />
      <BidModal />
      <Toast />
      {state.confettiN > 0 && <Confetti key={state.confettiN} onDone={actions.resetConfetti} />}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
