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
