import { STICKERS, MARKET } from "./data";
import { getPerson, getAura, pick, fmt } from "./helpers";

export const KEY = "rizzaura_v1";

/* ------------------------- state ------------------------- */
export const defaultState = () => ({
  profile: null,
  coins: 25,
  owned: [],
  sticker: null,
  myVotes: {},
  votes: { date: "", used: 0 },
  // server-synced global data
  pAura: {},
  censusCounts: {},
  feed: [],
  battle: {},
  players: 12847,
  bids: [],
  battleLock: false,
  // authenticated session (from Authentik via /api/me)
  me: null,
  // ui
  toast: null,
  claimOpen: false,
  goldenOpen: false,
  bidOpen: false,
  confettiN: 0,
});

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Defensive: old saves (pre-backend) stored `owned` as an object and could
      // be missing fields — sanitize so stale localStorage can never crash render.
      const profile =
        s.profile && typeof s.profile === "object"
          ? {
              name: String(s.profile.name || "NPC"),
              avatar: String(s.profile.avatar || "😎"),
              aura: Number.isFinite(s.profile.aura) ? s.profile.aura : 100,
            }
          : null;
      return {
        profile,
        coins: Number.isFinite(s.coins) ? s.coins : 25,
        owned: Array.isArray(s.owned) ? s.owned : [],
        sticker: typeof s.sticker === "string" ? s.sticker : null,
        myVotes: s.myVotes && typeof s.myVotes === "object" ? s.myVotes : {},
        votes:
          s.votes && typeof s.votes === "object"
            ? {
                date: String(s.votes.date || ""),
                used: Number.isFinite(s.votes.used) ? s.votes.used : 0,
              }
            : { date: "", used: 0 },
      };
    }
  } catch (e) {
    /* fresh state */
  }
  return {};
}
export function saveLocal(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        profile: state.profile,
        coins: state.coins,
        owned: state.owned,
        sticker: state.sticker,
        myVotes: state.myVotes,
        votes: state.votes,
      }),
    );
  } catch (e) {
    /* storage unavailable */
  }
}

/* ------------------------- reducer ------------------------- */
export function reducer(state, action) {
  switch (action.type) {
    case "CLAIM": {
      const { name, avatar } = action.payload;
      const isNew = !state.profile;
      return {
        ...state,
        profile: { name, avatar, aura: isNew ? 100 : state.profile.aura },
        coins: isNew ? 25 : state.coins,
        claimOpen: false,
        confettiN: isNew ? state.confettiN + 1 : state.confettiN,
      };
    }
    case "SET_ME":
      return { ...state, me: action.payload };
    case "SYNC": {
      const d = action.payload;
      const st = {
        ...state,
        pAura: d.pAura || state.pAura,
        censusCounts: d.censusCounts || state.censusCounts,
        feed: d.feed || state.feed,
        players: d.players ?? state.players,
        bids: Array.isArray(d.bids) ? d.bids : state.bids,
      };
      if (!state.battleLock && d.battle) st.battle = d.battle;
      return st;
    }
    case "PAID_ORDER": {
      // A real-money order confirmed via Stripe (reported back through /api/order/:id)
      const product = action.payload.product;
      if (product === "frame") {
        if (state.owned.includes("flexframe")) return state;
        return {
          ...state,
          owned: [...state.owned, "flexframe"],
          confettiN: state.confettiN + 1,
          toast: "Permanent Flex Frame unlocked ✨ You glow forever now.",
        };
      }
      if (product === "slot") {
        return {
          ...state,
          confettiN: state.confettiN + 1,
          toast: "💰 You're on the board. Rank is what you pay. Check the top.",
        };
      }
      if (product === "golden") {
        return {
          ...state,
          confettiN: state.confettiN + 1,
          toast: "💸 Cash Golden Upvote sent. +500 Aura deployed. Pure glaze.",
        };
      }
      return state;
    }
    case "VOTE_OK": {
      const { id, aura, remaining, dir } = action.payload;
      const today = new Date().toISOString().slice(0, 10);
      const p = getPerson(id);
      return {
        ...state,
        pAura: { ...state.pAura, [id]: aura },
        votes: { date: today, used: Math.max(0, 10 - remaining) },
        coins: state.coins + 1,
        toast:
          dir > 0 ? `+5 Aura to ${p.name} ⬆️ (+1 coin)` : `-5 Aura from ${p.name} ⬇️ (+1 coin)`,
      };
    }
    case "VOTE_REJECT":
      return {
        ...state,
        toast:
          action.payload.reason === "limit"
            ? "No votes left today 💀 — buy a Vote Refill in the Market"
            : "Server said no 💀",
      };
    case "BATTLE_LOCAL": {
      const { winner, loser, cat } = action.payload;
      const wp = getPerson(winner);
      return {
        ...state,
        battle: { ...state.battle, voted: true, winner, loser },
        pAura: {
          ...state.pAura,
          [winner]: getAura(state, winner) + 60,
          [loser]: Math.max(100, getAura(state, loser) - 15),
        },
        coins: state.coins + 3,
        battleLock: true,
        toast: `${wp.name} wins ${cat} 🏆 (+3 coins)`,
      };
    }
    case "BATTLE_UNLOCK":
      return { ...state, battleLock: false };
    case "CENSUS_OK": {
      const { qid, counts, o } = action.payload;
      return {
        ...state,
        censusCounts: { ...state.censusCounts, [qid]: counts },
        myVotes: { ...state.myVotes, [qid]: o },
        coins: state.coins + 2,
        toast: "Vote counted ✅ (+2 coins)",
      };
    }
    case "GOLDEN_OK": {
      const { target, aura } = action.payload;
      return {
        ...state,
        coins: state.coins - 150,
        owned: [...state.owned, "golden"],
        goldenOpen: false,
        pAura: { ...state.pAura, [target]: aura },
        confettiN: state.confettiN + 1,
        toast: `+250 Aura to ${getPerson(target).name} 🏆 Pure glaze.`,
      };
    }
    case "SPEND":
      return { ...state, coins: state.coins - action.payload.price };
    case "REFILL_OK": {
      const today = new Date().toISOString().slice(0, 10);
      const used = state.votes.date === today ? state.votes.used : 0;
      return {
        ...state,
        votes: { date: today, used: Math.max(0, used - 10) },
        toast: "+10 votes for today 🔋 Democracy restored.",
      };
    }
    case "BUY": {
      const id = action.payload.id;
      if (state.owned.includes(id)) return state;
      const m = MARKET.find((x) => x.id === id);
      if (state.coins < m.price)
        return {
          ...state,
          toast: `Broke 😭 You need ${fmt(m.price - state.coins)} more coins — go vote!`,
        };
      const coins = state.coins - m.price;
      switch (id) {
        case "auraboost":
          return {
            ...state,
            coins,
            profile: { ...state.profile, aura: state.profile.aura + 100 },
            confettiN: state.confettiN + 1,
            toast: "+100 Aura ⚡ Buy the bag, buy the board.",
          };
        case "golden":
          return { ...state, goldenOpen: true };
        case "memepack":
          return {
            ...state,
            coins,
            owned: [...state.owned, id],
            sticker: state.sticker ?? pick(STICKERS),
            toast: "Meme Pack unlocked 🎭 Aesthetic acquired.",
          };
        case "clouthack":
          return {
            ...state,
            coins,
            profile: { ...state.profile, aura: Math.round(state.profile.aura * 1.25) },
            confettiN: state.confettiN + 1,
            toast: "+25% Aura 🚀 The market has been cooked.",
          };
        case "flexframe":
          return {
            ...state,
            coins,
            owned: [...state.owned, id],
            toast: "Flex Frame unlocked ✨ You're glowing now.",
          };
        default:
          return state;
      }
    }
    case "TOAST":
      return { ...state, toast: action.payload };
    case "CLEAR_TOAST":
      return { ...state, toast: null };
    case "OPEN_CLAIM":
      return { ...state, claimOpen: true };
    case "CLOSE_CLAIM":
      return { ...state, claimOpen: false };
    case "CLOSE_GOLDEN":
      return { ...state, goldenOpen: false };
    case "OPEN_BID":
      return { ...state, bidOpen: true };
    case "CLOSE_BID":
      return { ...state, bidOpen: false };
    case "RESET_CONFETTI":
      return { ...state, confettiN: 0 };
    default:
      return state;
  }
}

export default reducer;
