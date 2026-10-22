const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const app = path.resolve(__dirname, '../apps/plainshow');
const ts = require(path.join(app, 'node_modules/typescript'));

function load(relative, dependencies, globals = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(app, relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require: (name) => {
        if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
        return dependencies[name];
    }, URLSearchParams, URL, Headers, Blob, Date, crypto, ...globals }, { filename: relative });
    return exports;
}

test('navigation preserves folder names and encoded query parameters', () => {
    const boot = { base: '', webroot: '' };
    const window = { location: { pathname: '/files/Holiday%20%23%3F%25', search: '' }, addEventListener() {} };
    const router = load('src/router.tsx', { './boot': { boot }, react: {}, 'react/jsx-runtime': {} }, { window });
    assert.equal(router.currentPath(), '/files/Holiday #?%');
    assert.equal(router.fileRoute('Holiday #?%/Åland', 'test?.txt'), '/files/Holiday%20%23%3F%25/%C3%85land?open=test%3F.txt');
    assert.equal(router.href('/calendar/tasks?list=%2Fremote.php%2Fdav%2F'), '/calendar/tasks?list=%2Fremote.php%2Fdav%2F');
    boot.base = '/cloud';
    assert.equal(router.href('/photos'), '/cloud/photos');
});

test('API requests keep the app endpoint after pretty URLs', async () => {
    let called;
    const boot = { base: '/cloud', webroot: '/cloud', apiBase: '/cloud/index.php/apps/plainshow', requestToken: 'csrf' };
    const http = load('src/api/http.ts', { '../boot': { boot } }, { fetch: async (url, options) => {
        called = { url, options };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    } });
    await http.api('/api/web/settings');
    assert.equal(called.url, '/cloud/index.php/apps/plainshow/api/web/settings');
    assert.equal(called.options.headers.get('requesttoken'), 'csrf');
});

test('chunked upload creates one collection and assembles all bytes', async () => {
    const calls = [];
    const puts = [];
    const boot = { webroot: '', user: { id: 'alice' }, requestToken: 'csrf' };
    class XMLHttpRequest {
        upload = {};
        status = 201;
        headers = {};
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(name, value) { this.headers[name] = value; }
        send(body) { puts.push({ url: this.url, size: body.size, headers: this.headers }); this.onload(); }
    }
    const dav = load('src/api/dav.ts', {
        '../boot': { boot },
        './http': { CloudError: Error, request: async (url, options) => { calls.push({ url, ...options }); return { ok: true, status: 201 }; } },
    }, { XMLHttpRequest, window: { location: { origin: 'https://cloud.example' } } });
    const file = new Blob([new Uint8Array(10 * 1024 * 1024 + 17)]);
    file.lastModified = Date.now();
    const progress = [];
    await dav.upload('Holiday #/clip.mp4', file, (sent) => progress.push(sent));
    assert.equal(calls.filter((call) => call.method === 'MKCOL').length, 1);
    assert.equal(puts.length, 2);
    assert.equal(puts.reduce((total, put) => total + put.size, 0), file.size);
    const assemble = calls.find((call) => call.method === 'MOVE');
    assert.equal(assemble.headers.get('OC-Total-Length'), String(file.size));
    assert.equal(assemble.headers.get('Destination'), 'https://cloud.example/remote.php/dav/files/alice/Holiday%20%23/clip.mp4');
    assert.equal(progress.at(-1), file.size);
});

test('editing an imported event preserves custom repeats, time zone, alarms and unknown data', async () => {
    const ICAL = await import(path.join(app, 'node_modules/ical.js/dist/ical.js'));
    let saved;
    const calendar = load('src/api/caldav.ts', {
        '../boot': { boot: { webroot: '', user: { id: 'alice' } } },
        'ical.js': { default: ICAL.default },
        './http': { CloudError: Error, request: async (url, options) => { saved = { url, ...options }; return { ok: true }; } },
    });
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:imported',
        'DTSTART:20261020T100000Z', 'DTEND:20261020T110000Z', 'SUMMARY:Original',
        'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', 'X-KEEP-ME:existing-data',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'DESCRIPTION:First', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER;VALUE=DATE-TIME:20261019T120000Z', 'DESCRIPTION:Second', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
    const draft = calendar.draftOf(ics);
    await calendar.updateEvent('/calendar/imported.ics', '"revision"', ics, { ...draft, title: 'Renamed' });
    assert.equal(saved.headers['If-Match'], '"revision"');
    assert.match(saved.body, /DTSTART:20261020T100000Z/);
    assert.match(saved.body, /RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH/);
    assert.match(saved.body, /X-KEEP-ME:existing-data/);
    assert.equal(saved.body.match(/BEGIN:VALARM/g).length, 2);
    assert.match(saved.body, /SUMMARY:Renamed/);
});

test('calendar shares use group principals for PlainShow groups', async () => {
    const calls = [];
    const calendar = load('src/api/caldav.ts', {
        '../boot': { boot: { webroot: '', user: { id: 'alice' } } },
        'ical.js': { default: {} },
        './http': { CloudError: Error, request: async (url, options) => { calls.push({ url, ...options }); return { ok: true }; } },
    });
    const item = { href: '/remote.php/dav/calendars/alice/family/' };
    await calendar.shareCalendar(item, 'ps-42', 'write', true);
    await calendar.shareCalendar(item, 'ps-42', null, true);
    await calendar.shareCalendar(item, 'bob', 'read');
    assert.match(calls[0].body, /<oc:set><d:href>principal:principals\/groups\/ps-42<\/d:href><oc:read-write\/><\/oc:set>/);
    assert.match(calls[1].body, /<oc:remove><d:href>principal:principals\/groups\/ps-42<\/d:href><\/oc:remove>/);
    assert.match(calls[2].body, /principal:principals\/users\/bob/);
});
