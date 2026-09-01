import { useMemo, useState } from "react";
import { AVATARS, PERSONALITIES, CASH_SHOP } from "../data";
import { useStore, getAura, fmt } from "../store";

const TABS = [
  { id: "slot", label: "💼 Board Slot" },
  { id: "golden", label: "💸 Golden Upvote" },
  { id: "frame", label: "✨ Flex Frame" },
];

export default function BidModal() {
  const { state, actions } = useStore();
  const [tab, setTab] = useState("slot");
  // slot form
  const [ava, setAva] = useState("😎");
  const [name, setName] = useState(state.profile?.name || "");
  const [handle, setHandle] = useState("");
  const [tier, setTier] = useState(CASH_SHOP.slot.tiers[1]); // $5 default
  const [custom, setCustom] = useState("");
  // golden form
  const [target, setTarget] = useState("");
  const [adult, setAdult] = useState(false);

  const sorted = useMemo(
    () => [...PERSONALITIES].sort((a, b) => getAura(state, b.id) - getAura(state, a.id)),
    [state.pAura], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bids = useMemo(
    () => [...(state.bids || [])].sort((a, b) => b.cents - a.cents || a.ts - b.ts),
    [state.bids],
  );
  const topBid = bids[0];

  if (!state.bidOpen) return null;

  const customCents = Math.round(Number(custom) * 100);
  const slotCents =
    custom && Number.isFinite(customCents) && customCents > 0
      ? Math.max(CASH_SHOP.slot.minCents, customCents)
      : tier;

  const submit = (product) => {
    if (!adult) {
      actions.toast("Gotta confirm you're 18+ first, champ 💀");
      return;
    }
    if (product === "slot") {
      const n = name.trim();
      if (!n) {
        actions.toast("You need a name on the board, legend 💀");
        return;
      }
      actions.checkout({
        product: "slot",
        name: n,
        handle: handle.trim(),
        emoji: ava,
        amount: slotCents,
      });
    } else if (product === "golden") {
      const t = target || sorted[0]?.id;
      if (!t) {
        actions.toast("Pick someone to glaze 💀");
        return;
      }
      actions.checkout({ product: "golden", target: t });
    } else {
      actions.checkout({ product: "frame" });
    }
  };

  const money = (cents) =>
    "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.closeBid();
      }}
    >
      <div className="modal card bid-modal">
        <h2>
          The <span className="grad-text">Cash Shop</span> 💰
        </h2>
        <p>
          No ads. No revenue share. Just cold hard flexes. <b>Rank is what you pay</b> — skip the
          grind, buy the bag, stand above everyone.
        </p>

        <div className="bid-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "sel" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "slot" && (
          <div className="bid-pane">
            <div className="bid-teaser">
              {topBid ? (
                <>
                  <b>{money(topBid.cents)}</b> is the current #1 by {topBid.name} {topBid.emoji} —
                  beat them. Mog the whole board. 👑
                </>
              ) : (
                <>No bids yet. Be the first to buy #1. The whole board is yours. 👑</>
              )}
            </div>
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
              placeholder="Name on the board (e.g. Lil Bro Inc.)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="name-input"
              maxLength={20}
              placeholder="Handle (optional) — @you"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <div className="tier-grid">
              {CASH_SHOP.slot.tiers.map((c) => (
                <button
                  key={c}
                  className={custom ? "" : tier === c ? "sel" : ""}
                  onClick={() => {
                    setTier(c);
                    setCustom("");
                  }}
                >
                  {money(c)}
                </button>
              ))}
            </div>
            <div className="amount-row">
              <input
                className="amount-input"
                type="number"
                min="3"
                placeholder="Custom flex $"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <span className="min-note">min ${(CASH_SHOP.slot.minCents / 100).toFixed(0)}</span>
            </div>
            <div className="slot-summary">
              You'll pay <b>{money(slotCents)}</b> → ranked{" "}
              <b>#{bids.filter((b) => b.cents > slotCents).length + 1}</b> on the board, above every
              celeb, with the ✓ Aura Verified badge.
            </div>
            <button className="btn" style={{ width: "100%" }} onClick={() => submit("slot")}>
              💳 PAY {money(slotCents)} — BUY THE BOARD
            </button>
          </div>
        )}

        {tab === "golden" && (
          <div className="bid-pane">
            <div className="bid-teaser">
              Drop <b>{money(CASH_SHOP.golden.price)}</b> on a <b>+500 Aura</b> Golden Upvote for
              any celebrity. Public feed shoutout. Glaze responsibly. 🏆
            </div>
            <select
              value={target || sorted[0]?.id || ""}
              onChange={(e) => setTarget(e.target.value)}
            >
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name} ({fmt(getAura(state, p.id))} aura)
                </option>
              ))}
            </select>
            <button className="btn" style={{ width: "100%" }} onClick={() => submit("golden")}>
              💸 SEND +500 AURA FOR {money(CASH_SHOP.golden.price)}
            </button>
          </div>
        )}

        {tab === "frame" && (
          <div className="bid-pane">
            <div className="bid-teaser">
              {state.owned.includes("flexframe") ? (
                <>You already glow ✨ Flex Frame is yours forever.</>
              ) : (
                <>
                  A <b>permanent golden glow</b> around your profile card for{" "}
                  {money(CASH_SHOP.frame.price)}. One time. Forever. The ultimate paid flex. ✨
                </>
              )}
            </div>
            <button
              className="btn"
              style={{ width: "100%" }}
              disabled={state.owned.includes("flexframe")}
              onClick={() => submit("frame")}
            >
              ✨ UNLOCK PERMANENT GLOW — {money(CASH_SHOP.frame.price)}
            </button>
          </div>
        )}

        <label className="adult-row">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I'm 18+ and this is a totally legit purchase of fictional internet aura 😌</span>
        </label>
        <div className="bid-note">
          Payments are handled by Stripe. All aura is fictional — paid spots are fan hype, not
          endorsements, and don't belong to the people ranked on the free board.
        </div>
      </div>
    </div>
  );
}
