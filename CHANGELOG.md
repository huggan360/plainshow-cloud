# Changelog

## v1.4.1

- Page headings sit in a frame of their own, so they read well on any backdrop (kit 1.11).

## v1.4.0

- Dashboard widgets: the calendar widget can ask for a range of days (`from`, `days`) for its month view, and calendar and files widgets for more rows (`limit`) as their lists are scrolled.

## v1.3.2

- Background: large soft orange blobs that fade in, drift and fade out, lighting only the glyphs (kit 1.10).

## v1.3.1

- New background: embers from orange to yellow that move away from the pointer, so you can chase them (kit 1.9).

## v1.3.0

- English, Dutch and Swedish: the browser's language by default, or chosen in the account menu (the choice follows you to every PlainShow site).
- The account menu is the same in every app: Account, the app's own items, Language, Theme, Sign out.
- A new upload panel: larger, with speed and time left, every file's state, retry and cancel; make it smaller or hide it while uploads carry on.

## v1.2.0

- iPhone, iPad and Mac: Settings, Devices, Add to device installs your calendars, reminders and contacts in one step (a configuration profile with its own app password).
- Clearer device text: calendar apps use an app password, not the PlainShow password.
- PlainShow's error pages for pages that do not exist.
- Kit 1.6. AGENTS.md for developers.

<!--
 - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->
Changelog
=========

## 1.0.1

- Phone and desktop device approval now uses PlainShow Login for both login flows, with the Cloud engine still issuing and validating app passwords.
- PlainShow sign-out revokes Cloud browser sessions; direct Cloud sign-out goes through the same account session.
- Settings has shorter labels and a mobile layout that keeps controls visible. Direct `/index.php` visits return to Cloud's home page.

## 1.0.0

- PlainShow Cloud replaces the Nextcloud web interface with Files, Photos, Calendar, Tasks and Settings, using PlainShow's shared design system.
- Public links support passwords, expiry, read-only viewing, editing and upload-only folders.
- PlainShow accounts are the only sign-in method. Existing accounts, files, calendars, contacts, ordinary shares, albums and tags are preserved; devices sign in again.
- Keep WebDAV, CalDAV, CardDAV and mobile/desktop login flows. Remove unused applications and upstream update mechanisms from the frozen Nextcloud 34.0.3 engine.
- Preserve calendar timezones and imported reminders when editing events; support encoded filenames and existing file links.
- Add migration snapshots, staging browser/device checks and a fail-closed production switch with mandatory backups.

Earlier upstream history: [Nextcloud changelog](https://nextcloud.com/changelog/).
