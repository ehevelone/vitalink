const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const site = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(site, file), 'utf8');

function runPageScript(file, search) {
  const html = read(file);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(match => match[1].trim());
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { innerText: '', style: {}, href: '' });
    return elements.get(id);
  };
  const context = {
    document: { title: '', getElementById: element },
    window: { location: { search }, navigator: { userAgent: 'iPhone' } },
    navigator: { userAgent: 'iPhone', clipboard: { writeText() {} } },
    URLSearchParams,
    encodeURIComponent,
    setTimeout() {},
    fetch() { throw new Error('Unexpected fetch'); },
  };
  vm.runInNewContext(scripts.at(-1)[1], context, { filename: file });
  return { element, context };
}

test('admin RSM QR opens the pricing-specific RSM registration form', () => {
  const admin = read('core-node/admin_report.html');
  const settings = read('rsm-register.html');
  assert.match(admin, /foundersRegistrationUrl.*regularRegistrationUrl/s);
  assert.match(admin, /encodeURIComponent\(foundersRegistrationUrl\)/);
  assert.match(admin, /encodeURIComponent\(regularRegistrationUrl\)/);
  assert.match(settings, /get\("pricing"\)/);
});

test('RSM invite QR reaches the agent enrollment endpoint and agent app link', () => {
  const rsm = read('core-node/rsm_report.html');
  assert.match(rsm, /agent-enroll-from-invite\?rsm=\$\{data\.invite_code\}/);
  const { element } = runPageScript('core-node/agent_enrolled.html', '?code=AGT-TEST');
  assert.equal(element('agentCode').innerText, 'AGT-TEST');
  assert.equal(element('openAppBtn').href, 'vitalink://activate?code=AGT-TEST&kind=agent');
});

test('agent invite QR shows client copy and opens user registration', () => {
  const { element, context } = runPageScript('agent-success.html', '?code=AGT-CLIENTS');
  assert.equal(context.document.title, 'VitaLink Client Invitation');
  assert.equal(element('pageTitle').innerText, 'Your VitaLink Invitation');
  assert.equal(element('code').innerText, 'AGT-CLIENTS');
  assert.equal(element('openAppBtn').href, 'vitalink://activate?code=AGT-CLIENTS&kind=user');
  assert.equal(element('openAppBtn').style.display, 'inline-flex');
});

test('paid-agent success page keeps its existing copy and does not offer client registration', () => {
  const { element } = runPageScript('agent-success.html', '?session_id=cs_test');
  assert.equal(element('openAppBtn').href, '');
  assert.equal(element('pageTitle').innerText, '');
});
