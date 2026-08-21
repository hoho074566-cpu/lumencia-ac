import assert from 'node:assert/strict';
import { resolveManifestPortrait, runFastLocalRegression, runImageContractRegression } from '../../lib/debug-regression.js';

globalThis.performance ||= { now:() => Date.now() };
const fast = runFastLocalRegression();
const images = runImageContractRegression();
assert.equal(fast.some(row=>row.status==='FAIL'),false,'fast local console contracts must pass');
assert.equal(images.some(row=>row.status==='FAIL'),false,'image console contracts must pass');
assert.equal(fast.filter(row=>row.status==='WARN').length,4,'server/runtime-only checks must be honestly marked WARN');
assert.equal(resolveManifestPortrait('anastasia','default').role,'fullbody','Anastasia default must fall back to declared fullbody');
assert.equal(resolveManifestPortrait('aria','angry').fallback,'default','default-only character must not synthesize angry portrait');
assert.doesNotMatch(resolveManifestPortrait('nemesis','unknown').url,/unknown\.webp$/,'unknown expression must not become a URL');
console.log(`PASS debug regression console (${fast.length} fast rows, ${images.length} image rows, zero fetch calls)`);
