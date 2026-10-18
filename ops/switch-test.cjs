const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

function run(failure, confirmation = true) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plainshow-switch-test-'));
    const bin = path.join(root, 'bin');
    const install = path.join(root, 'install');
    const backup = path.join(root, 'backup');
    for (const directory of [bin, path.join(install, 'core'), backup]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(install, 'core/shipped.json'), JSON.stringify({ alwaysEnabled: ['dav'] }));
    fs.writeFileSync(path.join(backup, 'config.php'), '<?php');
    for (const name of ['nextcloud.sql.gz', 'cloud-code.tgz']) fs.writeFileSync(path.join(backup, name), zlib.gzipSync('test backup only'));
    const executable = (name, body) => fs.writeFileSync(path.join(bin, name), '#!/bin/bash\nset -eu\nprintf "%s\\n" "' + name + ' $*" >> "$TEST_LOG"\n' + body, { mode: 0o755 });
    executable('git', `case "$1" in
fetch) [ "\${FAIL_STEP:-}" != fetch ];;
rev-parse) echo test-commit;;
status) [ "\${FAIL_STEP:-}" != dirty ] || echo ' M changed.php';;
show) case "$2" in *:.htaccess) echo plainshow-switching;; *) printf "REMOVED_APPS = [\\n 'spreed',\\n];\\n";; esac;;
checkout|clean) :;;
*) exit 90;;
esac\n`);
    executable('composer', '[ "${FAIL_STEP:-}" != install ]\n');
    executable('sudo', `if [ "$1" = mariadb ]; then exit 0; fi
if [ "$1" = systemctl ]; then exit 0; fi
while [ "$1" != occ ]; do shift; done
shift
case "$1" in
app:list) echo '{"enabled":{"spreed":"1"}}';;
upgrade) [ "\${FAIL_STEP:-}" != upgrade ];;
maintenance:repair) [ "\${FAIL_STEP:-}" != repair ];;
user:list) echo '{"test-user":"Test"}';;
config:system:get) if [ "$2" = dbname ]; then echo staging; else echo oc_; fi;;
status) echo '{"installed":true,"maintenance":false,"needsDbUpgrade":false}';;
*) :;;
esac\n`);
    const args = [path.join(__dirname, 'switch.sh'), install, 'v-test', backup];
    if (confirmation) args.push('--confirm-signout');
    const result = spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_LOG: path.join(root, 'calls'), FAIL_STEP: failure } });
    const calls = fs.existsSync(path.join(root, 'calls')) ? fs.readFileSync(path.join(root, 'calls'), 'utf8') : '';
    const blocked = fs.existsSync(path.join(install, '.plainshow-switching'));
    fs.rmSync(root, { recursive: true, force: true });
    return { result, calls, blocked };
}

test('switch requires explicit sign-out confirmation before commands run', () => {
    const { result, calls } = run('', false);
    assert.equal(result.status, 2);
    assert.equal(calls, '');
});
for (const failure of ['fetch', 'dirty']) {
    test(`switch preflight refuses ${failure} without changing maintenance`, () => {
        const { result, calls } = run(failure);
        assert.notEqual(result.status, 0);
        assert.ok(!calls.includes('maintenance:mode'));
    });
}
for (const failure of ['install', 'upgrade', 'repair']) {
    test(`switch fails closed after ${failure}`, () => {
        const { result, calls, blocked } = run(failure);
        assert.notEqual(result.status, 0);
        assert.ok(blocked);
        assert.match(calls.trim().split('\n').at(-1), /maintenance:mode --on/);
        assert.ok(!calls.includes('DELETE FROM'));
    });
}
test('successful switch revokes sessions and removes the HTTP block last', () => {
    const { result, calls, blocked } = run('');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(calls.includes('DELETE FROM `oc_authtoken`'));
    assert.equal(blocked, false);
    assert.equal(calls.match(/maintenance:mode --off/g)?.length, 1);
});
