import { ACHIEVEMENTS } from "./data.mjs";
import { getState, getUser, pushFeed, saveState } from "./state.mjs";
import { escapeHtml } from "./state.mjs";
import { broadcast } from "./sse.mjs";

/* Evaluate a user against every badge and grant the newly-earned ones.
 * Returns the list of freshly granted badge ids. Called after any
 * state-changing action for an authenticated user. */
export function evaluateAchievements(sub) {
  const state = getState();
  const u = getUser(sub);
  if (!u || !u.name) return [];
  const earned = new Set(u.badges || []);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (earned.has(a.id)) continue;
    if (a.check(u)) {
      earned.add(a.id);
      fresh.push(a.id);
      state.achievements.push({ player: sub, badge: a.id, ts: Date.now() });
      pushFeed({
        icon: a.emoji,
        text: `<b>${escapeHtml(u.name)}</b> unlocked the <b>${a.name}</b> badge ${a.emoji} (${a.tier})`,
        ts: Date.now(),
      });
    }
  }
  if (fresh.length) {
    u.badges = [...earned];
    saveState();
    broadcast({ type: "badge", payload: { player: sub, badges: fresh, name: u.name } });
  }
  return fresh;
}

/* Rule-based fallback: recommend unearned badges the user is close to. */
export function ruleBasedRecommendations(u) {
  return ACHIEVEMENTS.filter((a) => !(u.badges || []).includes(a.id))
    .map((a) => {
      const near =
        (a.id === "first-vote" && u.votesCast === 0) ||
        (a.id === "voice-heard" && u.votesCast >= 15) ||
        (a.id === "electoral-college" && u.votesCast >= 70) ||
        (a.id === "centurion" && u.aura >= 80) ||
        (a.id === "influencer" && u.aura >= 400) ||
        (a.id === "aura-god" && u.aura >= 1600) ||
        (a.id === "mogul" && u.aura >= 4000) ||
        (a.id === "battle-winner" && u.battlesWon === 0) ||
        (a.id === "census-voter" && u.censusVotes === 0);
      return { badge: a.id, name: a.name, emoji: a.emoji, reason: a.desc, near };
    })
    .sort((x, y) => Number(y.near) - Number(x.near))
    .slice(0, 5);
}

/* AI-powered recommendations via any OpenAI-compatible /chat/completions
 * endpoint (OpenAI, Groq, Together, or a self-hosted Ollama). Falls back to
 * the rule-based list when no key is configured or the call fails. */
export async function aiRecommendations(u) {
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!key) return { source: "rules", items: ruleBasedRecommendations(u) };

  const unearned = ACHIEVEMENTS.filter((a) => !(u.badges || []).includes(a.id)).map((a) => a.name);
  const profile = {
    name: u.name,
    aura: u.aura,
    votesCast: u.votesCast,
    battlesWon: u.battlesWon,
    censusVotes: u.censusVotes,
    goldenGifts: u.goldenGifts,
    prestige: u.prestige,
    badges: (u.badges || []).length,
  };
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You recommend achievement badges for a gamified leaderboard platform. " +
              "Given a player's stats and the available badges, pick the 3 best badges to aim for. " +
              'Reply with ONLY JSON: {"recommendations":[{"badge":"<badge name>","reason":"<one sentence>"}]}.',
          },
          {
            role: "user",
            content: JSON.stringify({ profile, availableBadges: unearned }),
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || "HTTP " + r.status);
    const text = j.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const items = (parsed.recommendations || []).slice(0, 5).map((rec) => {
      const def = ACHIEVEMENTS.find(
        (a) => a.name.toLowerCase() === String(rec.badge).toLowerCase(),
      );
      return {
        badge: def?.id || String(rec.badge),
        name: def?.name || String(rec.badge),
        emoji: def?.emoji || "🎯",
        reason: String(rec.reason || ""),
      };
    });
    return { source: "ai", items: items.length ? items : ruleBasedRecommendations(u) };
  } catch (e) {
    return { source: "rules", items: ruleBasedRecommendations(u), error: e.message };
  }
}
