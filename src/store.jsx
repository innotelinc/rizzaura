import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { api } from "./api";
import reducer, { defaultState, loadLocal, saveLocal } from "./reducer";
import { MARKET } from "./data";
import { getPerson, fmt, votesLeftToday } from "./helpers";

// Re-export shared helpers/constants so components can keep importing from "../store"
export { KEY } from "./reducer";
export {
  fmt,
  getPerson,
  getAura,
  makeEvent,
  ago,
  rankOf,
  percentile,
  votesLeftToday,
} from "./helpers";

/* ------------------------- context ------------------------- */
const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...defaultState(),
    ...loadLocal(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncNow = useCallback(async () => {
    try {
      const d = await api("/api/state");
      dispatch({ type: "SYNC", payload: d });
    } catch (e) {
      /* server unreachable — keep last known state */
    }
  }, [dispatch]);

  // persist local-only data
  useEffect(() => {
    saveLocal(state);
  }, [state]);
  // poll the shared server state
  useEffect(() => {
    syncNow();
    const iv = setInterval(syncNow, 5000);
    return () => clearInterval(iv);
  }, [syncNow]);
  // toast auto-dismiss
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), 2600);
    return () => clearTimeout(t);
  }, [state.toast]);

  const actions = useMemo(
    () => ({
      claim: (name, avatar) => {
        dispatch({ type: "CLAIM", payload: { name, avatar } });
        api("/api/claim", { method: "POST", body: JSON.stringify({ name }) }).catch(() => {});
      },
      votePerson: async (id, dir) => {
        const st = stateRef.current;
        if (votesLeftToday(st) <= 0) {
          dispatch({
            type: "TOAST",
            payload: "No votes left today 💀 — buy a Vote Refill in the Market",
          });
          return;
        }
        try {
          const res = await api("/api/vote", { method: "POST", body: JSON.stringify({ id, dir }) });
          if (res.ok)
            dispatch({
              type: "VOTE_OK",
              payload: { id, aura: res.aura, remaining: res.remaining, dir },
            });
          else dispatch({ type: "VOTE_REJECT", payload: { reason: res.reason } });
        } catch {
          dispatch({ type: "TOAST", payload: "Can't reach the Rizz Aura server 💀" });
        }
      },
      battleVote: (id) => {
        const st = stateRef.current;
        if (!st.battle || !st.battle.a || st.battle.voted || st.battleLock) return;
        const a = getPerson(st.battle.a),
          b = getPerson(st.battle.b);
        const winner = id === a.id ? a : b;
        const loser = id === a.id ? b : a;
        dispatch({
          type: "BATTLE_LOCAL",
          payload: { winner: winner.id, loser: loser.id, cat: st.battle.cat },
        });
        api("/api/battle", { method: "POST", body: JSON.stringify({ winnerId: id }) }).catch(() => {
          dispatch({ type: "BATTLE_UNLOCK" });
        });
        setTimeout(() => {
          dispatch({ type: "BATTLE_UNLOCK" });
          syncNow();
        }, 2200);
      },
      censusVote: async (qid, o) => {
        try {
          const res = await api("/api/census", {
            method: "POST",
            body: JSON.stringify({ qid, option: o }),
          });
          if (res.ok) dispatch({ type: "CENSUS_OK", payload: { qid, counts: res.counts, o } });
          else dispatch({ type: "TOAST", payload: "You already voted on that one 💀" });
        } catch {
          dispatch({ type: "TOAST", payload: "Can't reach the Rizz Aura server 💀" });
        }
      },
      goldenGift: async (target) => {
        const st = stateRef.current;
        if (st.owned.includes("golden")) {
          dispatch({ type: "CLOSE_GOLDEN" });
          dispatch({ type: "TOAST", payload: "Golden Upvote already used 🏆" });
          return;
        }
        const m = MARKET.find((x) => x.id === "golden");
        if (st.coins < m.price) {
          dispatch({
            type: "TOAST",
            payload: `Broke 😭 You need ${fmt(m.price - st.coins)} more coins`,
          });
          return;
        }
        try {
          const res = await api("/api/golden", {
            method: "POST",
            body: JSON.stringify({ target, name: st.profile?.name || "Someone" }),
          });
          dispatch({ type: "GOLDEN_OK", payload: { target, aura: res.aura } });
          syncNow();
        } catch {
          dispatch({ type: "TOAST", payload: "Can't reach the Rizz Aura server 💀" });
        }
      },
      buy: async (id) => {
        const st = stateRef.current;
        if (!st.profile) {
          dispatch({ type: "OPEN_CLAIM" });
          dispatch({ type: "TOAST", payload: "Claim your Aura first 😎" });
          return;
        }
        if (id === "refill") {
          const m = MARKET.find((x) => x.id === "refill");
          if (st.coins < m.price) {
            dispatch({
              type: "TOAST",
              payload: `Broke 😭 You need ${fmt(m.price - st.coins)} more coins`,
            });
            return;
          }
          dispatch({ type: "SPEND", payload: { price: m.price } });
          try {
            await api("/api/voterefill", { method: "POST" });
          } catch {
            /* server offline */
          }
          dispatch({ type: "REFILL_OK" });
          return;
        }
        dispatch({ type: "BUY", payload: { id } });
      },
      toast: (msg) => dispatch({ type: "TOAST", payload: msg }),
      openClaim: () => dispatch({ type: "OPEN_CLAIM" }),
      closeClaim: () => dispatch({ type: "CLOSE_CLAIM" }),
      closeGolden: () => dispatch({ type: "CLOSE_GOLDEN" }),
      resetConfetti: () => dispatch({ type: "RESET_CONFETTI" }),
    }),
    [dispatch, syncNow],
  );

  return <StoreCtx.Provider value={{ state, actions }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  return useContext(StoreCtx);
}
