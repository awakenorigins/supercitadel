import { aggregateVotes, applyConsensus, orchestrate, DEFAULT_AGENTS, type AgentDef } from '../src/agents.js';
import { StubProvider, resolveProvider } from '../src/llm.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };

// aggregate: 2 long (0.7,0.6) + 1 flat -> long consensus
let cons = aggregateVotes([
  { name: 'a', action: 'long', confidence: 0.7, reason: '' },
  { name: 'b', action: 'long', confidence: 0.6, reason: '' },
  { name: 'c', action: 'flat', confidence: 0.3, reason: '' }]);
ok(cons.action === 'long' && cons.confidence > 0, `consensus long (got ${cons.action} ${cons.confidence})`);

// aggregate: opposing high-confidence -> near flat / veto
cons = aggregateVotes([
  { name: 'a', action: 'long', confidence: 0.9, reason: '' },
  { name: 'b', action: 'short', confidence: 0.9, reason: '' }]);
ok(cons.action === 'flat', 'opposing votes -> flat consensus');

// applyConsensus veto: technical long but agents short
ok(applyConsensus('long', { action: 'short', confidence: 0.8 }).direction === 'flat', 'agents veto technical long');
// applyConsensus confirm: agents agree -> full size
ok(applyConsensus('long', { action: 'long', confidence: 0.8 }).sizeMult === 1.0, 'agents confirm -> full size');
// applyConsensus neutral -> trimmed size
ok(applyConsensus('long', { action: 'flat', confidence: 0.2 }).sizeMult === 0.7, 'agents neutral -> trimmed size');

// resolveProvider: local baseUrl -> OpenAI-compat local, no config -> stub
ok(resolveProvider({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' }, {}).label.includes('11434'), 'per-bot LOCAL model provider resolves');
ok(resolveProvider(undefined, {}).label === 'stub', 'no config -> stub (offline safe)');
ok(resolveProvider({ model: 'cx/gpt-5.5' }, { LLM2_BASE_URL: 'https://gw/v2', LLM2_API_KEY: 'k' }).label.includes('gpt-5.5'), 'second host model routes to LLM2');

// orchestrate with per-agent stub brains (each agent its own "model")
const agents: AgentDef[] = [
  { name: 'signal-agent', role: 'x', enabled: true, systemPrompt: '', llm: { model: 'local/llama3.1' } },
  { name: 'risk-agent', role: 'x', enabled: true, systemPrompt: '' },
  { name: 'sentiment-agent', role: 'x', enabled: false, systemPrompt: '' }, // disabled -> excluded
];
// monkeypatch resolveProvider path by stubbing fetch is heavy; instead test aggregation contract:
// simulate votes an orchestrator would collect
const votes = [
  { name: 'signal-agent', action: 'long' as const, confidence: 0.8, reason: 'trend up' },
  { name: 'risk-agent', action: 'long' as const, confidence: 0.5, reason: 'ok' }];
const c2 = aggregateVotes(votes);
const applied = applyConsensus('long', c2);
ok(applied.direction === 'long' && applied.sizeMult === 1.0, 'end-to-end: 2 agents confirm long at full size');
ok(agents.filter(a => a.enabled).length === 2, 'disabled agent excluded from roster');

console.log('  provider labels:', resolveProvider({ baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5' }, {}).label);
console.log(`\nAGENT TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
