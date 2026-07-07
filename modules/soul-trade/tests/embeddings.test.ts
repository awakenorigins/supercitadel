import { StubEmbeddings, cosine, decisionToText, toVectorLiteral } from '../src/embeddings.js';

let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const emb = new StubEmbeddings(64);

// determinism
const [a1] = await emb.embed(['BTC long breakout momentum']);
const [a2] = await emb.embed(['BTC long breakout momentum']);
ok(a1.length === 64 && cosine(a1, a2) > 0.999, 'stub embedder deterministic + right dim');

// cosine bounds
ok(Math.abs(cosine(a1, a1) - 1) < 1e-9, 'cosine(self)=1');
const orth = [1, 0, 0, 0], orth2 = [0, 1, 0, 0];
ok(Math.abs(cosine(orth, orth2)) < 1e-9, 'orthogonal -> 0');

// semantic ranking: a query is closest to the most similar text
const texts = ['BTC long breakout strong uptrend', 'ETH short reversion overbought', 'BTC long pullback uptrend'];
const vecs = await emb.embed(texts);
const [q] = await emb.embed(['BTC long uptrend breakout']);
const ranked = vecs.map((v, i) => ({ i, s: cosine(q, v) })).sort((a, b) => b.s - a.s);
ok(ranked[0].i === 0, `nearest neighbour is the BTC-breakout text (got idx ${ranked[0].i})`);
ok(ranked[ranked.length - 1].i === 1, 'ETH-short is the least similar');

// text builder + vector literal
const txt = decisionToText({ symbol: 'BTC/USDT:USDT', strategy: 'rsi_ema', finalAction: 'long', note: 'AI confirms', features: { rsi: 32.1 } });
ok(txt.includes('BTC/USDT:USDT') && txt.includes('rsi=32.1'), 'decisionToText includes symbol + features');
ok(toVectorLiteral([1, 2, 3]) === '[1,2,3]', 'pgvector literal format');

console.log(`  ranking: [${ranked.map(r => r.i + ':' + r.s.toFixed(2)).join(', ')}] (query="BTC long uptrend breakout")`);
console.log(`\nEMBEDDINGS TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
