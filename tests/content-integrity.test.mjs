import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('../veeva-master-class/index.html', import.meta.url), 'utf8');
const { getCasePacket } = await import('../veeva-master-class/server/cases.mjs');

const rare = getCasePacket(2, 'math');
assert.equal(rare.math.expected, 12, 'rare-disease rescue accounts for activation lag');
assert.match(rare.math.equation, /240 - 22×8/);
assert.ok(rare.math.fact_ids.includes('fact_activation'));

const safety = getCasePacket(0, 'synthesis');
assert.ok(safety.facts.some(f => /1,550 closures per month/.test(f.text)), '12-month safety target is explicit');
assert.match(html, /short by roughly 233 per month/);

assert.match(html, /Incremental budget impact = future-scenario cost − current-scenario cost/);
assert.doesNotMatch(html, /Net budget impact = eligible patients × uptake × net drug cost/);
assert.match(html, /risk-adjusted contribution NPV remains positive/);
assert.doesNotMatch(html, /probability-weighted revenue exceeds the \$80M remaining spend/);
assert.match(html, /Within the specialist-controlled workflow, the biggest absolute loss is at testing/);
assert.doesNotMatch(html, /The biggest absolute loss is at testing, not at prescribing/);
assert.doesNotMatch(html, /Three reviews are free after sign-in/);
assert.doesNotMatch(html, /Sign in for 3 free reviews/);
assert.match(html, /Partner Review is currently closed during the private beta/);
assert.match(html, /Partner Review is closed during the private beta/);

assert.match(html, /PV of forecast cash \$381M \+ PV terminal value \$971M = \$1\.352B EV/);
assert.match(html, /Unnamed companies, products, markets, and scenario numbers are synthetic unless a source is linked/);

console.log('Content integrity tests passed:', {
  rareDiseaseSites: rare.math.expected,
  safetyTarget: '1,550/month',
  budgetImpact: 'future minus current treatment mix',
  dcfExample: 'aligned',
  privateBetaCopy: 'closed'
});
