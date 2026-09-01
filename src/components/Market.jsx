import { MARKET } from "../data";
import { useStore, fmt } from "../store";

export default function Market() {
  const { state, actions } = useStore();
  return (
    <section id="market">
      <div className="sec-head">
        <div className="tag">Aura Market</div>
        <h2>
          Spend Coins. <span className="grad-text">Gain Clout.</span>
        </h2>
        <p>
          Earn coins by voting, battling, and answering the census. Then buy your way up the board.
          💸
        </p>
      </div>
      <div className="cash-strip card">
        <div className="cash-strip-txt">
          <b>Broke but famous? Out of coins but full of main-character energy?</b>
          <p>
            The <b>Cash Shop</b> is where the bag lives: board slots (rank is what you pay), cash
            Golden Upvotes (+500 aura), and the permanent Flex Frame. Stripe-secured. Zero shame.
          </p>
        </div>
        <button className="btn cash" onClick={actions.openBid}>
          💸 Open Cash Shop
        </button>
      </div>
      <div className="market-grid">
        {MARKET.map((m) => {
          const owned = state.owned.includes(m.id);
          return (
            <div className="market-card card" key={m.id}>
              <span className="ico">{m.emoji}</span>
              <h3>{m.name}</h3>
              <p>{m.desc}</p>
              {owned ? (
                <span className="owned-tag">✅ OWNED</span>
              ) : (
                <span className="price">
                  {fmt(m.price)} <small>COINS</small>
                </span>
              )}
              <button className="btn ghost" disabled={owned} onClick={() => actions.buy(m.id)}>
                {owned ? "Unlocked" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
