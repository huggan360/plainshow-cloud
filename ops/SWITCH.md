# Switching cloud.plainshow.se to PlainShow Cloud

One announced window, after the new Cloud frontend (pass 3) is ready. Rehearsed
on a restored copy of the real database and on staging (`cloud-staging.plainshow.se`,
Pi-only), where `ops/smoke.sh` passes after the switch.

## Before the window

- [ ] Devices that sign in with a Nextcloud password get a device password first
      (`occ user:auth-tokens:add <user>`), because those passwords stop working:
      - hugo: the KDE calendar sync ("KDE DAV groupware client")
      - maaike: the iPhone's own Calendar and Reminders (iOS `dataaccessd`, `remindd`)
- [ ] Simon gets his PlainShow reset link (Admin, Users; it lasts an hour).
- [ ] OK for the firewall change: Talk's TURN ports 3478 and 49160 to 49260 close,
      and the `nextcloud-talk-hpb` container and its image go.
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
   albums), theming, device passwords only, every Nextcloud password random.
4. **Widget secret**: `occ config:app:set plainshow widget_secret` with the
   `cloud` entry of Core's `storage/app/widget-secrets.json`.
5. **Talk's servers**: stop and remove `nextcloud-talk-hpb`, its image, the
   proxy lines for `/standalone-signaling/` in the Apache site, and the firewall rules.
6. `sudo systemctl restart notify_push`.
7. **Core**: install the release with the Cloud widgets (Updates).

## Checks

- `ops/smoke.sh https://cloud.plainshow.se` with a test account's device password.
- The data comparison against the baseline taken before (per account: files
  and sizes, calendars and events, contacts, shares, albums, tags, devices):
  only Talk's room shares may be missing.
- A phone that was already signed in keeps syncing; a new sign-in on iPhone and
  on Android goes through PlainShow; an auto-uploaded photo appears.
- The dashboard's calendar, files and photos widgets.

## The way back

Before step 3 nothing has changed but the folder name: swap `cloud-old` back.
After it: restore the database dump (rehearsed), swap `cloud-old` back,
`occ maintenance:mode --off`, reload Apache. The data folder never changed.
