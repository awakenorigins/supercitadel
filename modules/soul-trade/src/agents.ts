// ── Agent splitting ──────────────────────────────────────────
// A bot's "brain" is split into specialized agents. Each agent can run on its
// OWN model (cloud or local) — configure per bot. A meta-aggregator turns their
// votes into one consensus that then confirms/vetoes the technical signal.
import type { Direction } from './types.js';
import { resolveProvider, type LLMConfig, type HostLLMEnv, type LLMProvider, type ChatMessage } from './llm.js';

export interface AgentDef {
  name: string;
  role: string;               // short description shown to the model
  enabled: boolean;
  systemPrompt: string;
  llm?: LLMConfig;            // per-agent model override (own brain)
}
export interface AgentVote { name: string; action: Direction; confidence: number; reason: string; }

export const DEFAULT_AGENTS: AgentDef[] = [
  { name: 'signal-agent', role: 'technical signal analyst', enabled: true,
    systemPrompt: 'You judge trend + momentum from indicators. Favor the technical setup when momentum confirms it.' },
  { name: 'risk-agent', role: 'risk manager', enabled: true,
    systemPrompt: 'You veto trades in dangerous volatility or against a strong higher-trend. Capital preservation first.' },
  { name: 'sentiment-agent', role: 'market sentiment analyst', enabled: false,
    systemPrompt: 'You weigh recent price action as a proxy for sentiment. Prefer flat when the picture is mixed.' },
];

const VOTE_INSTRUCTION =
  'Respond with STRICT JSON only: {"action":"long"|"short"|"flat","confidence":0.0-1.0,"reason":"<=15 words"}.';

function parseVote(name: string, text: string): AgentVote {
  try {
    const t = text.replace(/```json|```/g, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    const o = JSON.parse(s >= 0 ? t.slice(s, e + 1) : t);
    const action = (['long', 'short', 'flat'].includes(o.action) ? o.action : 'flat') as Direction;
    return { name, action, confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)), reason: String(o.reason ?? '').slice(0, 120) };
  } catch { return { name, action: 'flat', confidence: 0, reason: 'parse error' }; }
}

export interface TurnContext {
  symbol: string; timeframe: string; proposed: Direction; aiScore: number; features: Record<string, number>;
}

async function askAgent(agent: AgentDef, provider: LLMProvider, ctx: TurnContext): Promise<AgentVote> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `You are the ${agent.role} in an automated trading bot. ${agent.systemPrompt} ${VOTE_INSTRUCTION}` },
    { role: 'user', content: 'Market snapshot:\n' + JSON.stringify(ctx, null, 2) + '\n\nReturn your JSON vote.' },
  ];
  try { return parseVote(agent.name, await provider.chat(messages, { json: true, maxTokens: 150 })); }
  catch { return { name: agent.name, action: 'flat', confidence: 0, reason: 'agent error' }; }
}

/** Run all enabled agents (each with its own provider) and aggregate to a consensus. */
export async function orchestrate(agents: AgentDef[], ctx: TurnContext, env: HostLLMEnv):
  Promise<{ votes: AgentVote[]; consensus: { action: Direction; confidence: number } }> {
  const enabled = agents.filter(a => a.enabled);
  const votes = await Promise.all(enabled.map(a => askAgent(a, resolveProvider(a.llm, env), ctx)));
  return { votes, consensus: aggregateVotes(votes) };
}

/** Confidence-weighted consensus across agent votes. */
export function aggregateVotes(votes: AgentVote[]): { action: Direction; confidence: number } {
  if (!votes.length) return { action: 'flat', confidence: 0 };
  let net = 0, tot = 0;
  for (const v of votes) {
    const s = v.action === 'long' ? v.confidence : v.action === 'short' ? -v.confidence : 0;
    net += s; tot += v.confidence;
  }
  const avg = net / votes.length;
  const action: Direction = avg >= 0.15 ? 'long' : avg <= -0.15 ? 'short' : 'flat';
  return { action, confidence: +Math.min(1, Math.abs(avg) * (tot / votes.length ? 1 : 1)).toFixed(3) };
}

/** Apply agent consensus as a confirm/veto layer on the technical direction. */
export function applyConsensus(technical: Direction, consensus: { action: Direction; confidence: number }, minConf = 0.4):
  { direction: Direction; sizeMult: number } {
  if (technical === 'flat') return { direction: 'flat', sizeMult: 0 };
  const opposite = technical === 'long' ? 'short' : 'long';
  if (consensus.action === opposite && consensus.confidence >= minConf) return { direction: 'flat', sizeMult: 0 };
  const agrees = consensus.action === technical;
  return { direction: technical, sizeMult: agrees ? 1.0 : 0.7 };
}
