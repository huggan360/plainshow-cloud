# PlainShow Cloud

cloud.plainshow.se: your files, photos and calendar, as a PlainShow extension.
A private fork of Nextcloud 34.0.3, frozen there: no app store, no updates.

What is left of Nextcloud is the engine (storage, WebDAV, CalDAV and CardDAV,
sharing, trash, versions, locks, notifications and push, tags, theming and
user_oidc), so the Nextcloud phone and desktop apps keep working. Signing in is
PlainShow's only. Everything else (Talk, Office, Contacts, Dashboard, the
enterprise and federation apps, two-factor, the updater) was removed from the
code, and the PlainShow app (`apps/plainshow`) removes what they left in the
database.

- `apps/plainshow`: the React/TypeScript frontend, dashboard widgets, signed
  thumbnails and the read API behind plainshow.se/api/cloud/v1. The frontend
  uses PlainShow Kit's fonts, orange branding, glass frames and glyph backdrop.
  Its PHP dependencies are installed from `composer.lock` in that folder.
- `/`, `/files`, `/photos`, `/calendar` and `/settings`: the Cloud interface.
  Old web addresses redirect; DAV, OCS and both device login flows stay intact.
- `/s/<token>`: file, folder, password-protected and upload-only public shares.
- `ops/switch.sh`: from Nextcloud to PlainShow Cloud, in place.
- `ops/smoke.sh`: the engine end to end, as the apps use it.
- `ops/SWITCH.md`: the production switch, step by step.
- `ops/data-snapshot.php`: hashes preserved database rows without accessing
  the cloud drive. Compare its output before and after the switch.

## Verification

With the existing dependencies installed:

```sh
php ops/routes-test.php
node --test ops/frontend-test.cjs ops/switch-test.cjs
cd apps/plainshow && npm run build
```

`ops/browser-smoke.cjs` and `ops/device-smoke.cjs` reuse the staging browser
session helper named by `PLAINSHOW_STAGE_HELPER`. They require the existing
Chromium installation and isolated staging accounts. They refuse production;
test fixtures and newly issued device passwords are removed after use.
Physical iPhone/Android photo uploads still need an owner/device check after
the production switch.

The first commit is Nextcloud as it ran on cloud.plainshow.se; the history
after it is what PlainShow changed. Nextcloud is AGPL-3.0; so is this fork.
