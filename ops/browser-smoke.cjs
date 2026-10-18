const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const helper = process.env.PLAINSHOW_STAGE_HELPER;
if (!helper) throw new Error('Set PLAINSHOW_STAGE_HELPER to the existing staging session helper.');
const { session, H, sleep } = require(helper);
const { browser } = require(path.join(path.dirname(helper), 'cdp.cjs'));
if (new URL(H).hostname !== 'cloud-staging.plainshow.se') throw new Error('This test only runs on isolated Cloud staging.');
const output = fs.mkdtempSync('/tmp/plainshow-cloud-qa-');
const folder = `pass3-${randomUUID()}`;
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log(`ok ${label}`); }
async function until(page, expression) {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (await page.eval(`!!(${expression})`)) return;
        await sleep(200);
    }
    throw new Error(`Timed out: ${expression}`);
}
async function call(page, url, method = 'GET', body, headers = {}) {
    return page.eval(`(async () => {
        const boot = JSON.parse(document.querySelector('#cloud-boot').textContent);
        const response = await fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, body: ${JSON.stringify(body)}, headers: { requesttoken: boot.requestToken, 'OCS-APIREQUEST': 'true', ...${JSON.stringify(headers)} } });
        return { status: response.status, text: await response.text() };
    })()`);
}
async function main() {
    const signed = await session({ port: 9352 });
    const guest = await browser([], 9353);
    let davRoot;
    try {
        const page = await signed.go('/files');
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        check(await page.eval('location.pathname === "/files"'), 'legacy app address redirects to Files');
        const boot = await page.eval('JSON.parse(document.querySelector("#cloud-boot").textContent)');
        davRoot = `/remote.php/dav/files/${encodeURIComponent(boot.user.id)}/${folder}`;
        check((await call(page, davRoot, 'MKCOL')).status === 201, 'create isolated test folder');
        check((await call(page, davRoot + '/inner', 'MKCOL')).status === 201, 'create nested test folder');
        const filename = 'Notes #?% Å.txt';
        check((await call(page, davRoot + '/' + encodeURIComponent(filename), 'PUT', 'PlainShow test', { 'Content-Type': 'text/plain' })).status === 201, 'upload a filename with reserved characters');
        await page.go(`${H}/files/${folder}?open=${encodeURIComponent(filename)}`);
        await until(page, 'document.querySelector(".cloud-viewer__text")');
        check(await page.eval('document.querySelector(".cloud-viewer__text").value === "PlainShow test"'), 'deep link opens the file, not the folder at the same list index');
        await page.shot(output + '/file-viewer.png');
        await page.go(`${H}/files/${folder}`);
        await until(page, 'document.querySelector(".cloud-table")');
        const upload = await page.eval(`(async () => {
            const input = document.querySelector('input[type=file]:not([webkitdirectory])');
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(10 * 1024 * 1024 + 17)], 'chunked.bin'));
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return !!input;
        })()`);
        check(upload, 'queue large upload through Files UI');
        await until(page, 'Array.from(document.querySelectorAll(".cloud-name__text")).some(node => node.textContent === "chunked.bin")');
        check((await call(page, davRoot + '/chunked.bin', 'PROPFIND', undefined, { Depth: '0' })).status === 207, 'chunked UI upload assembles successfully');

        const makeShare = async (sharePath, permissions, extra = {}) => {
            const body = new URLSearchParams({ path: sharePath, shareType: '3', permissions: String(permissions), ...extra }).toString();
            const response = await call(page, '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', 'POST', body, { 'Content-Type': 'application/x-www-form-urlencoded' });
            check(response.status === 200, 'create test share');
            const share = JSON.parse(response.text).ocs.data;
            if (extra.hideDownload) {
                const updated = await call(page, `/ocs/v2.php/apps/files_sharing/api/v1/shares/${share.id}?format=json`, 'PUT', new URLSearchParams({ hideDownload: extra.hideDownload }).toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
                check(updated.status === 200, 'set hidden-download permission');
            }
            return share;
        };
        const readonly = await makeShare('/' + folder, 1);
        const readPage = await guest.page(`${H}/s/${readonly.token}`, { width: 1280, height: 800 });
        await until(readPage, 'document.querySelectorAll(".cloud-table tbody tr").length === 3');
        check(await readPage.eval('!document.querySelector("input[type=file]")'), 'read-only share has no upload control');
        await readPage.eval(`Array.from(document.querySelectorAll('.cloud-name')).find(node => node.textContent === ${JSON.stringify(filename)}).click()`);
        await until(readPage, 'document.querySelector(".cloud-viewer__text")');
        check(await readPage.eval('document.querySelector(".cloud-viewer__text").readOnly'), 'read-only text cannot be edited');
        await readPage.shot(output + '/readonly-share.png');
        const denied = await call(readPage, `/public.php/dav/files/${readonly.token}/denied.txt`, 'PUT', 'must not be written');
        check(denied.status === 403, 'engine refuses writes to a read-only share');

        const hidden = await makeShare('/' + folder, 1, { hideDownload: 'true' });
        const hiddenPage = await guest.page(`${H}/s/${hidden.token}`);
        await until(hiddenPage, 'document.querySelectorAll(".cloud-table tbody tr").length === 3');
        check(await hiddenPage.eval('!document.querySelector("a[download]")'), 'hidden-download share omits download links');
        await hiddenPage.eval(`Array.from(document.querySelectorAll('.cloud-name')).find(node => node.textContent === ${JSON.stringify(filename)}).click()`);
        await until(hiddenPage, 'document.querySelector(".cloud-viewer")');
        check(await hiddenPage.eval('!document.querySelector(".cloud-viewer a[download]")'), 'viewer also respects hidden-download setting');

        const password = randomUUID();
        const protectedShare = await makeShare('/' + folder, 1, { password });
        const locked = await guest.page(`${H}/s/${protectedShare.token}`);
        await until(locked, 'document.querySelector("#password")');
        await locked.eval('document.querySelector("#password").value = "wrong-test-password"; document.querySelector("form").requestSubmit()');
        await until(locked, 'document.querySelector(".ps-error")');
        check(true, 'wrong share password is rejected');
        await locked.eval(`document.querySelector('#password').value = ${JSON.stringify(password)}; document.querySelector('form').requestSubmit()`);
        await until(locked, 'document.querySelectorAll(".cloud-table tbody tr").length === 3');
        check(true, 'correct password opens the shared folder');

        const drop = await makeShare('/' + folder + '/inner', 4);
        const dropPage = await guest.page(`${H}/s/${drop.token}`, { width: 375, height: 800 });
        await until(dropPage, 'document.querySelector(".cloud-public__drop")');
        check(!await dropPage.eval('!!document.querySelector(".cloud-table")'), 'file drop never lists other files');
        const dropped = await call(dropPage, `/public.php/dav/files/${drop.token}/sent.txt`, 'PUT', 'sent');
        check(dropped.status === 201, 'upload-only share accepts a new file');
        check((await call(dropPage, `/public.php/dav/files/${drop.token}/`, 'PROPFIND', undefined, { Depth: '1' })).status === 405, 'upload-only share refuses directory listing');
        await dropPage.shot(output + '/phone-drop.png');
        guest.close();

        for (const width of [1400, 375]) {
            await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
            for (const route of ['/files', '/photos', '/photos/albums', '/calendar', '/calendar/week', '/calendar/day', '/calendar/agenda', '/calendar/tasks', '/settings', '/settings/devices', '/settings/admin']) {
                await page.go(H + route);
                await until(page, 'document.querySelector("h1") && !document.querySelector(".cloud-loading")');
                check(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), `${width}px ${route} has no horizontal overflow`);
                if (width === 375 || ['/files', '/calendar', '/settings'].includes(route)) await page.shot(output + '/' + width + route.replaceAll('/', '-') + '.png');
            }
        }
        await page.go(H + '/files');
        const fileStat = await call(page, davRoot + '/' + encodeURIComponent(filename), 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>', { Depth: '0', 'Content-Type': 'application/xml' });
        const fileId = fileStat.text.match(/<oc:fileid>(\d+)/)?.[1];
        check(!!fileId, 'read test file identifier');
        await page.go(H + '/index.php/f/' + fileId);
        await until(page, 'document.querySelector(".cloud-viewer__text")');
        check(await page.eval('document.querySelector(".cloud-viewer__text").value === "PlainShow test"'), 'dashboard file-id link reaches the new viewer');
        for (const [oldPath, destination] of [['/index.php/apps/calendar/', '/calendar'], ['/index.php/apps/photos/', '/photos'], ['/index.php/settings/personal/security', '/settings/devices'], ['/index.php/apps/dashboard/', '/']]) {
            await page.go(H + oldPath);
            check(await page.eval(`location.pathname === ${JSON.stringify(destination)}`), `redirect ${oldPath}`);
        }
        const errors = page.errors.filter(message => !/404.*\/core\/preview\?fileId=209&/.test(message) && !(message.includes('status of 405') && message.endsWith(davRoot)));
        check(errors.length === 0, 'no unexpected browser errors: ' + errors.join('\n'));
        console.log(`${checks} browser checks passed. Screenshots: ${output}`);
    } finally {
        if (davRoot) {
            await signed.page.go(H + '/files');
            const response = await call(signed.page, davRoot, 'DELETE');
            console.log('Test folder cleanup:', response.status);
        }
        guest.close();
        signed.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
