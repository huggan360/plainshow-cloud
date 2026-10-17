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

- `apps/plainshow`: the dashboard widgets, signed thumbnails and the read API
  behind plainshow.se/api/cloud/v1. Needs `composer install` in that folder.
- `ops/switch.sh`: from Nextcloud to PlainShow Cloud, in place.
- `ops/smoke.sh`: the engine end to end, as the apps use it.
- `ops/SWITCH.md`: the production switch, step by step.

The first commit is Nextcloud as it ran on cloud.plainshow.se; the history
after it is what PlainShow changed. Nextcloud is AGPL-3.0; so is this fork.
