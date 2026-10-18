const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helper = process.env.PLAINSHOW_STAGE_HELPER;
if (!helper) throw new Error('Set PLAINSHOW_STAGE_HELPER to the staging helper.');
const { H, sleep } = require(helper);
const { browser } = require(path.join(path.dirname(helper), 'cdp.cjs'));
if (new URL(H).hostname !== 'cloud-staging.plainshow.se') throw new Error('Staging only.');
const password = fs.readFileSync(path.join(path.dirname(helper), '../e2e-cloud.pass'), 'utf8').trim();
process.env.INSECURE = '1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
async function wait(page, expression) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (await page.eval(`!!(${expression})`)) return;
        await sleep(200);
    }
    throw new Error('Device sign-in page did not become ready.');
}
async function verifyDevice(loginName, appPassword) {
    const headers = { Authorization: 'Basic ' + Buffer.from(loginName + ':' + appPassword).toString('base64'), 'OCS-APIREQUEST': 'true', Depth: '0' };
    try {
        const response = await fetch(`${H}/remote.php/dav/files/${encodeURIComponent(loginName)}/`, { method: 'PROPFIND', headers });
        assert.equal(response.status, 207);
        await response.arrayBuffer();
    } finally {
        const response = await fetch(`${H}/ocs/v2.php/core/apppassword`, { method: 'DELETE', headers });
        assert.equal(response.status, 200);
        await response.arrayBuffer();
    }
}
async function flow(version) {
    const start = version === 2 ? await (await fetch(H + '/index.php/login/v2', { method: 'POST', headers: { 'User-Agent': 'PlainShow staging QA' } })).json() : null;
    const chrome = await browser([], 9355);
    let credentials;
    try {
        const page = await chrome.page('about:blank', { width: version === 1 ? 375 : 1200, height: 800 });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        if (version === 1) await page.send('Network.setExtraHTTPHeaders', { headers: { 'OCS-APIREQUEST': 'true' } });
        await page.go(start?.login ?? H + '/index.php/login/flow');
        const login = `Array.from(document.querySelectorAll('button,a,input[type=submit]')).find(node => /log in|connect/i.test(node.textContent || node.value || ''))`;
        await wait(page, login);
        await page.eval(`(${login}).click()`);
        await wait(page, 'document.querySelector("input[name=login]")');
        assert.equal(await page.eval('location.hostname'), 'login.plainshow.se');
        await page.eval(`document.querySelector('input[name=login]').value='e2e_cloud'; document.querySelector('input[name=password]').value=${JSON.stringify(password)}; document.querySelector('form').requestSubmit()`);
        const grant = `Array.from(document.querySelectorAll('button,input[type=submit]')).find(node => /grant access/i.test(node.textContent || node.value || ''))`;
        await wait(page, grant);
        await page.eval(`(${grant}).click()`);
        await sleep(2000);
        if (version === 1) {
            const match = page.seen.nc?.match(/^nc:\/\/login\/server:(.*)&user:(.*)&password:(.*)$/);
            assert.ok(match, 'Phone flow must return the app credentials through nc://.');
            credentials = { loginName: decodeURIComponent(match[2]), appPassword: decodeURIComponent(match[3]) };
        } else {
            const response = await fetch(start.poll.endpoint, { method: 'POST', body: new URLSearchParams({ token: start.poll.token }) });
            assert.equal(response.status, 200);
            credentials = await response.json();
        }
        assert.ok(credentials.appPassword);
        await verifyDevice(credentials.loginName, credentials.appPassword);
        console.log(`ok Login Flow v${version}: PlainShow sign-in, grant, WebDAV, revoke temporary device`);
    } finally {
        chrome.close();
    }
}
(async () => { await flow(1); await flow(2); })().catch(error => { console.error(error.message); process.exitCode = 1; });
