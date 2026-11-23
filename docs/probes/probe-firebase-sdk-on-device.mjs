// Probe 5: the same device model reached through Firebase's hybrid SDK (firebase 13.0.0 from the workspace's node_modules),
// with every network request recorded. The page and the SDK files are served by request interception; anything else is
// refused and listed, so nothing can leave this computer during the probe. The project config is a placeholder, not the real one.
// usage: node probe5.mjs <chrome binary> <profile dir> <workspace> <out json>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const [,, bin, profile, workspace, outFile = 'probe5-result.json'] = process.argv;
const require = createRequire(workspace + '/');
const { chromium } = require('playwright');
const FB = workspace + '/node_modules/firebase/';
const args = [`--user-data-dir=${profile}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic', '--headless=new', 'about:blank'];
const out = { started: new Date().toISOString(), requests: [] };
const tLaunch = Date.now();
const ctx = await chromium.launchPersistentContext(profile, { executablePath: bin, ignoreDefaultArgs: true, args });
const page = ctx.pages()[0];

const PAGE = `<!doctype html><title>probe</title><button id=go>go</button><canvas id=c width=900 height=260></canvas>
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js';
const NOTE = 'tue 3pm - saw Mrs Okafor at flat 12 w her son Daniel. boiler out since fri, no hot water. she missed the benefits appt mon bc bus didnt come. agreed: i ring landlord tmrw, rebook appt. next visit mon 10am. kitchen damp near window';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['visit_day', 'people_present', 'seen', 'agreed', 'next_steps'],
  properties: { visit_day: { type: 'string' }, people_present: { type: 'array', items: { type: 'string' } }, seen: { type: 'array', items: { type: 'string' } },
    agreed: { type: 'array', items: { type: 'string' } }, next_steps: { type: 'array', items: { type: 'string' } } } };
window.__r = { stage: 'loaded', steps: {} };
const step = async (name, fn) => { const t = performance.now(); try { window.__r.steps[name] = { ...(await fn()), ms: Math.round(performance.now() - t) }; } catch (e) { window.__r.steps[name] = { error: String(e).slice(0, 400), ms: Math.round(performance.now() - t) }; } };
document.getElementById('go').addEventListener('click', async () => {
  window.__r.stage = 'running';
  const app = initializeApp({ apiKey: 'placeholder-not-a-key', projectId: 'placeholder-project', appId: '1:000000000000:web:0000000000000000' });
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  await step('initializeDeviceModel', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE }); const p = []; await m.initializeDeviceModel(f => p.push(f)); return { progressCalls: p.length }; });
  await step('ONLY_ON_DEVICE text', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE }); const r = await m.generateContent('Reply with the single word ready.'); return { text: r.response.text(), source: r.response.inferenceSource }; });
  await step('PREFER_ON_DEVICE text', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE }); const r = await m.generateContent('Rewrite in plainer words: The tenant has been without hot water since Friday.'); return { text: r.response.text(), source: r.response.inferenceSource }; });
  await step('ONLY_ON_DEVICE structured (promptOptions.responseConstraint)', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { promptOptions: { responseConstraint: SCHEMA } } }); const r = await m.generateContent('Turn this rough visit note into the record. Note: ' + NOTE); const text = r.response.text(); let parsed = null; try { parsed = JSON.parse(text); } catch (e) {} return { text, parses: parsed !== null, keys: parsed ? Object.keys(parsed) : null, source: r.response.inferenceSource }; });
  await step('ONLY_ON_DEVICE system prompt (createOptions.initialPrompts)', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: { initialPrompts: [{ role: 'system', content: [{ type: 'text', value: 'You answer with exactly one word in capital letters.' }] }] } } }); const r = await m.generateContent('Is water wet?'); return { text: r.response.text(), source: r.response.inferenceSource }; });
  await step('ONLY_ON_DEVICE image (inlineData PNG drawn on a canvas)', async () => {
    const c = document.getElementById('c'), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 260); g.fillStyle = '#111'; g.font = '34px Georgia';
    g.fillText('12/11 visit flat 3. Mould in back bedroom.', 20, 70); g.fillText('Landlord not replied to 2 emails.', 20, 130); g.fillText('Agreed: ring landlord Monday.', 20, 190);
    const data = c.toDataURL('image/png').split(',')[1];
    const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text' }, { type: 'image' }] } } });
    const r = await m.generateContent(['Type out the text in this picture, line by line.', { inlineData: { data, mimeType: 'image/png' } }]); return { text: r.response.text(), source: r.response.inferenceSource, pngBase64Chars: data.length }; });
  await step('ONLY_IN_CLOUD text (expected to fail: every outside request is refused in this probe)', async () => { const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD }); const r = await m.generateContent('Reply with the single word ready.'); return { text: r.response.text(), source: r.response.inferenceSource }; });
  window.__r.stage = 'done';
});
</script>`;

await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u === 'https://probe.test/') { out.requests.push({ url: u, served: 'probe page' }); return route.fulfill({ contentType: 'text/html', body: PAGE }); }
  const m = u.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/13\.0\.0\/(firebase-[a-z-]+\.js)$/);
  if (m) { out.requests.push({ url: u, served: 'local file ' + m[1] }); return route.fulfill({ contentType: 'text/javascript', body: readFileSync(FB + m[1]) }); }
  const q = u.indexOf('?');
  out.requests.push({ url: (q > 0 ? u.slice(0, q) + '?<query removed>' : u).slice(0, 200), method: route.request().method(), served: 'REFUSED', bodyBytes: (route.request().postData() || '').length });
  return route.abort();
});
page.on('pageerror', e => { (out.pageErrors ||= []).push(String(e).slice(0, 300)); });
await page.goto('https://probe.test/');
await page.waitForFunction(() => window.__r && window.__r.stage === 'loaded', null, { timeout: 30000 });
const tClick = Date.now();
await page.click('#go');
await page.waitForFunction(() => window.__r.stage === 'done', null, { timeout: 420000 }).catch(() => {});
out.result = await page.evaluate(() => window.__r);
out.secondsLaunchToPage = Math.round((tClick - tLaunch) / 100) / 10;
out.secondsClickToAllDone = Math.round((Date.now() - tClick) / 100) / 10;
out.userAgent = await page.evaluate(() => navigator.userAgent);
out.finished = new Date().toISOString();
writeFileSync(outFile, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.result.steps || {})) console.log(k + ' => ' + JSON.stringify(v).slice(0, 620));
console.log('requests: ' + out.requests.map(r => r.served + (r.served === 'REFUSED' ? ' ' + r.method + ' ' + r.url + ' body ' + r.bodyBytes + ' B' : '')).join(' | ').slice(0, 1800));
console.log('launch to page ' + out.secondsLaunchToPage + ' s · click to all done ' + out.secondsClickToAllDone + ' s' + (out.pageErrors ? ' · page errors: ' + out.pageErrors.join(' ; ') : ''));
await Promise.race([ctx.close(), new Promise(r => setTimeout(r, 15000))]);
process.exit(0);
