<!--
 - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->
Changelog
=========

## 1.0.0

- PlainShow Cloud replaces the Nextcloud web interface with Files, Photos, Calendar, Tasks and Settings, using PlainShow's shared design system.
- Public links support passwords, expiry, read-only viewing, editing and upload-only folders.
- PlainShow accounts are the only sign-in method. Existing accounts, files, calendars, contacts, ordinary shares, albums and tags are preserved; devices sign in again.
- Keep WebDAV, CalDAV, CardDAV and mobile/desktop login flows. Remove unused applications and upstream update mechanisms from the frozen Nextcloud 34.0.3 engine.
- Preserve calendar timezones and imported reminders when editing events; support encoded filenames and existing file links.
- Add migration snapshots, staging browser/device checks and a fail-closed production switch with mandatory backups.

Earlier upstream history: [Nextcloud changelog](https://nextcloud.com/changelog/).
