# Switching cloud.plainshow.se to PlainShow Cloud

One announced window, after the new Cloud frontend (pass 3) is ready. Rehearsed
on a restored copy of the real database and on staging (`cloud-staging.plainshow.se`,
Pi-only), where `ops/smoke.sh` passes after the switch.

## Before the window

- [ ] Tell everyone: after the switch every phone, computer and calendar app
      signs in again, with PlainShow (decided 2026-10-18: everyone is signed out).
- [ ] Simon gets his PlainShow reset link (Admin, Users; it lasts an hour).
- [ ] Core's `cloud-engine` branch is merged and tagged, ready to install
      (Cloud widgets straight from Cloud, no connect step, Updates knows Cloud).
- [ ] Run `php ops/routes-test.php`, `node --test ops/frontend-test.cjs`, the
      staging browser checks and `ops/smoke.sh`. The browser checks use only
      temporary staging files; they must never run on production.
- [ ] Commit and tag the reviewed Cloud release. Pass that immutable tag to
      the switch, not a moving branch. Do not overwrite the unfinished worktree.

## In the window

1. **Backups** to `/mnt/texlive/backups/cloud-<date>/`: `nextcloud.sql.gz`,
   `config.php`, and `cloud-code.tgz` (code only, without data). Rehearse restoring
   the fresh database dump into a scratch database. Record metadata-only counts
   before the switch, including calendars, calendar objects, accounts, file
   cache entries, shares, albums, tags and device tokens.
   Turn maintenance mode on before the final dump and metadata snapshot so no
   client can change the baseline between the backup and the switch.
2. **Code becomes a checkout of this repository, at the baseline commit**
   (`36d924ba`, which is the code that runs today):
   clone into `/var/www/html/cloud-new`, copy `config/config.php` and
   `data/` (logs), set ownership and ACLs as today (www-data writes `config/`
   and `custom_apps/`), then swap the folders: `cloud` becomes `cloud-old`.
   The data folder (`/mnt/cloud/cloud/cloud`) is not touched.
3. **Run the reviewed script from the development checkout**, outside the
   installation being switched:
   `bash ops/switch.sh /var/www/html/cloud <release-tag> <backup-directory> --confirm-signout`:
   maintenance mode, the
   removed apps switched off on the old code, the new code, settings (no app
   store, no updates, no integrity check), caches cleared, the PlainShow app
   (drops the removed apps' tables, cleans their settings and jobs, moves the
   albums), theming, device passwords only, every Nextcloud password random,
   and every sign-in revoked. A `.plainshow-switching` marker blocks HTTP while
   CLI migrations require maintenance mode to be off. A failed command leaves
   the marker in place and turns maintenance mode back on. Failed upgrades,
   dependency installation or cleanup must never be ignored.
4. **Widget secret**: `occ config:app:set plainshow widget_secret` with the
   `cloud` entry of Core's `storage/app/widget-secrets.json`.
5. `sudo systemctl restart notify_push`.
6. **Core**: install the release with the Cloud widgets (Updates).

## Checks

- Run write-based smoke tests only on staging. Production checks are read-only:
  app health, login redirects, signed widgets and the database comparison.
- The data comparison against the baseline taken before (per account: files
  and sizes, calendars and events, contacts, shares, albums, tags): only Talk's
  room shares may be missing. Devices are zero: everyone signs in again.
- A new sign-in on iPhone and on Android goes through PlainShow; photo
  auto-upload is turned back on and an uploaded photo appears.
- The dashboard's calendar, files and photos widgets.

## The way back

Before step 3 nothing has changed but the folder name: swap `cloud-old` back.
After it: restore the database dump (rehearsed), swap `cloud-old` back,
`occ maintenance:mode --off`, reload Apache. The data folder never changed.
If restoring in place instead, keep `.plainshow-switching` until the database
and code have both been restored and checked; remove it only when reopening.

Talk was already removed on 2026-10-18: app off, `nextcloud-talk-hpb` container
and image gone, ports 3478 and 49160 to 49260 closed, its Apache proxy lines gone
(backup of the site file in `/mnt/texlive/backups/cloud-2026-10-18/`).
