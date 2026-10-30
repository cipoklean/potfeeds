// The "agent" layer: decides submit / skip / pause and explains why.
// Deterministic policy first (safe, testable); optional LLM writes a short
// rationale and can veto on anomalies. Works with no LLM key at all.
import { cfg, log } from "./config";
import type { Quote } from "./sources";

export type Decision = { action: "submit" | "skip" | "pause"; reason: string };

export function policy(p: {
  feed: string; quotes: Quote[]; mid: number; spreadBps: number;
  last?: number; lastUpdated?: number; now: number;
}): Decision {
  if (p.quotes.length < 2) return { action: "skip", reason: `only ${p.quotes.length} live source(s)` };
  if (p.spreadBps > cfg.maxSpreadBps * 2 && p.quotes.length >= 3)
    return { action: "pause", reason: `sources disagree ${(p.spreadBps / 100).toFixed(2)}%` };
  if (p.last === undefined || !p.lastUpdated) return { action: "submit", reason: "first round" };
  const devBps = Math.abs(p.mid - p.last) / p.last * 1e4;
  if (devBps >= cfg.deviationBps) return { action: "submit", reason: `moved ${(devBps / 100).toFixed(2)}%` };
  if (p.now - p.lastUpdated >= cfg.heartbeatSec) return { action: "submit", reason: "heartbeat" };
  return { action: "skip", reason: `moved ${(devBps / 100).toFixed(3)}% < threshold` };
}

export async function review(feed: string, d: Decision, quotes: Quote[]): Promise<Decision> {
  if (!cfg.llm.apiKey || d.action === "skip") return d;
  try {
    const r = await fetch(`${cfg.llm.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.llm.apiKey}` },
      body: JSON.stringify({
        model: cfg.llm.model,
        temperature: 0,
        max_tokens: 120,
        messages: [
          { role: "system", content: "You are an oracle feeder risk agent. Reply JSON {\"veto\":bool,\"note\":string}. Veto only for clear manipulation or broken data." },
          { role: "user", content: JSON.stringify({ feed, proposed: d, quotes }) },
        ],
      }),
    });
    const txt = (await r.json() as any).choices?.[0]?.message?.content || "";
    const m = txt.match(/\{[\s\S]*\}/);
    const v = m ? JSON.parse(m[0]) : {};
    if (v.veto) return { action: "skip", reason: `LLM veto: ${v.note}` };
    return { ...d, reason: `${d.reason}; ${v.note || "llm ok"}` };
  } catch (e: any) {
    log("brain", "llm unavailable, using policy only", e.message);
    return d;
  }
}
