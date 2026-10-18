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

## In the window

1. **Backups** to `/mnt/texlive/backups/cloud-<date>/`: `mariadb-dump nextcloud`,
   `config/config.php`, a tarball of `/var/www/html/cloud` without data.
2. **Code becomes a checkout of this repository, at the baseline commit**
   (`36d924ba`, which is the code that runs today):
   clone into `/var/www/html/cloud-new`, copy `config/config.php` and
   `data/` (logs), set ownership and ACLs as today (www-data writes `config/`
   and `custom_apps/`), then swap the folders: `cloud` becomes `cloud-old`.
   The data folder (`/mnt/cloud/cloud/cloud`) is not touched.
3. **`ops/switch.sh /var/www/html/cloud origin/main`**: maintenance mode, the
   removed apps switched off on the old code, the new code, settings (no app
   store, no updates, no integrity check), caches cleared, the PlainShow app
   (drops the removed apps' tables, cleans their settings and jobs, moves the
   albums), theming, device passwords only, every Nextcloud password random,
   and every sign-in revoked.
4. **Widget secret**: `occ config:app:set plainshow widget_secret` with the
   `cloud` entry of Core's `storage/app/widget-secrets.json`.
5. `sudo systemctl restart notify_push`.
6. **Core**: install the release with the Cloud widgets (Updates).

## Checks

- `ops/smoke.sh https://cloud.plainshow.se` with a test account's device password.
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

Talk was already removed on 2026-10-18: app off, `nextcloud-talk-hpb` container
and image gone, ports 3478 and 49160 to 49260 closed, its Apache proxy lines gone
(backup of the site file in `/mnt/texlive/backups/cloud-2026-10-18/`).
