# PlainShow Cloud: notes for developers and AI agents

Cloud is cloud.plainshow.se: files, photos, calendar, tasks and contacts. It is
a **fork of Nextcloud 34.0.3, frozen**: no upstream updates, ever. Unused apps
were removed from the code, not switched off. Our own app is `apps/plainshow`;
the rest is the engine (WebDAV, CalDAV, CardDAV, sharing, previews, the phone
and desktop app endpoints).

## Layout

- `apps/plainshow/`: everything people see.
  - `src/` React + TypeScript (Vite). `npm run build` writes hashed bundles and
    `js/.vite/manifest.json` into `js/`; **commit `js/`**, the server does not build.
  - `lib/Controller`: the page (`PageController`, every pretty address), web
    API under `/api/web/...` (photos, albums, settings, devices, calendar,
    directory), the signed API v1 for core (`ApiController`, widgets, thumbs).
  - `lib/Share/PublicPage.php`: share links; `templates/shareauth.php`: their
    password page; `templates/error.php`: error pages.
  - `lib/Repair/Cleanup.php` + `lib/Removed.php`: removes what removed apps left
    in the database. Runs on install and upgrade.
  - `composer.json`: the kit. Run Composer as the checkout's owner (it reads a
    private GitHub repo), not as www-data.
- `core/shipped.json`: the apps that exist. Engine patches are marked with
  comments mentioning PlainShow.
- `ops/`: `switch.sh` and `SWITCH.md` (the one-time move from Nextcloud),
  `smoke.sh` (checks against a running Cloud), `frontend-test.cjs`.

## Work

- Sign-in is PlainShow only (user_oidc). Cloud passwords are random; phones and
  calendar apps use app passwords (Settings, Devices; iPhones get a
  configuration profile there) or the Nextcloud app's sign-in flow.
- After adding or removing controllers or routes, reload Apache (routes are
  cached in APCu). Updates does this.
- `occ` runs as www-data: `sudo -u www-data php occ ...`.
- Release: build, commit `js/`, update `CHANGELOG.md`, tag, push, install via
  Updates (it runs composer, `occ upgrade`, repair, reloads Apache and
  restarts notify_push).
- Never change, move or scan files under `/mnt/cloud` yourself; go through the
  engine. Keep the mobile apps working (status.php, login flow v1/v2,
  `remote.php/dav`, OCS).

## The PlainShow platform

PlainShow is a set of web services on one server, each in its own git repo on
GitHub (`huggan360/plainshow-*`, public). They share one account system and
one look. `plainshow-install` sets up a new server with them (any Linux, any
domain); every address comes from `/etc/plainshow/platform.json` (kit `Platform`).

| Repo | Site | What it is |
|---|---|---|
| core | plainshow.se | Dashboard, accounts, groups, roles, admin, **Updates**. Laravel + Inertia/React. |
| login | login.plainshow.se | The only sign-in. OAuth2/OpenID Connect server, 2FA, device approval. Laravel. |
| kit | (library) | Shared PHP (auth, signed requests, widgets, access rules) and UI (CSS, JS, fonts, brand, error pages). Used by every app through Composer. |
| cloud | cloud.plainshow.se | Files, photos, calendar, tasks. A frozen Nextcloud 34.0.3 fork; our app is `apps/plainshow`. |
| latex | latex.plainshow.se | Collaborative LaTeX projects. Plain PHP + a websocket server. |
| blog | blog.plainshow.se | Posts, albums, films. Plain PHP. Swedish UI. |
| split | split.plainshow.se | Shared expenses. Plain PHP. Swedish UI. |
| install | (installer) | Interactive installer for a new server: packages, apps at their newest release, certificates, first admin. |

### Versions and releases (all repos)

- Versions are semver tags `vX.Y.Z` (patch: fixes; minor: features; major:
  breaking data or API changes). Only tags are installed, never branches.
- A release is: update `CHANGELOG.md` (a `## vX.Y.Z` section at the top, in
  plain words; the Updates page shows it), commit, `git tag -a vX.Y.Z -m vX.Y.Z`,
  `git push origin HEAD vX.Y.Z`.
- Install it through **Updates** in core (Admin, Updates, Install). The cron
  runner (`php artisan plainshow:updates --run`, every minute, in
  `/srv/plainshow/core/current`) fetches tags from GitHub, builds, switches,
  health-checks and rolls back by itself on failure. From a shell you can
  queue a job: insert into `core_update_jobs` (`component`, `action` = update,
  `target` = the tag, `status` = queued) and run the command above.
- While a component installs, visitors of its site see the "updating" page
  (flag file `/srv/plainshow/updating/<host>`, served by
  `core/ops/apache/plainshow-errors.conf`). Old releases are deleted after a
  successful update; nothing legacy is kept.
- Never copy files into `/srv/plainshow` or a live checkout by hand, never
  deploy a working tree (`--worktree` exists for emergencies only), never edit
  `vendor/`. Uncommitted changes in a checkout block its updates.

### Where things are on the server

- Release apps (core, login, blog, split): `/srv/plainshow/<app>/releases/<timestamp>-<tag>`,
  `current` symlink, shared state in `/srv/plainshow/<app>/shared` (`.env` or
  `config/`, `storage/`). Each runs in its own PHP-FPM pool as `plainshow-<app>`
  (the blog runs as www-data).
- Checkout apps: cloud in `/var/www/html/cloud`, latex in
  `/var/www/html/projects/hugohansson/plainshow-latex`. Updates moves them
  forward to a tag and runs their steps (see `core/config/updates.php`).
- Development sources: `/home/hugohansson/projects/plainshow/<repo>`.
- Error and updating pages: made in kit (`ui/errors`, `php bin/errors.php`),
  installed by core's deploy into `/srv/plainshow/errors`, shown by Apache for
  every site and by the apps themselves.
- Backups go to `/mnt/texlive/backups`. **Never touch `/mnt/cloud`** (Cloud's data).

### House rules

- Accounts live in login/core only. Services read identity from Login (OIDC)
  and permissions from core; never add a local password system.
- UI text: short and plain; never use the middle dot character as a
  separator.

- Design: kit CSS (`ps-*` classes, `--ps-*` tokens), Outfit for UI text, Bree
  Serif for titles, nested "frame" boxes. The primary colour is a theme colour
  (orange `#FC5000` by default, or teal, indigo, red, yellow): use `--ps-accent`,
  `--ps-accent-text`, `--ps-gradient` and `--ps-gradient-ring`, never a fixed
  orange. Text uses `--ps-text-strong` (titles), `--ps-text`, `--ps-text-soft`,
  `--ps-text-muted`, `--ps-text-faint`: dark greys in the light theme, never black.
- Secrets: never commit `.env`, `config/*.php` with credentials, keys or
  tokens, and never print them in logs or output.
- Test what you change with the repo's own tests (below) before tagging.

### Languages (English, Dutch, Swedish)

- Every page speaks English, Dutch or Swedish. The choice is the `ps_lang`
  cookie for the whole domain, set by the language switch in every account
  menu; without it the browser's language decides, then English (kit `Lang`).
- Texts are written in one source language (English in core, login, cloud and
  latex; Swedish in blog and split) and looked up by that text in
  `lang/<code>.json` ({"Source text": "Translation"}). `{name}` placeholders
  are filled in after translating (Laravel's `__()` uses `:name`).
- Wrap every visible text: React `t('...')` and `tn(count, 'one', '{n} many')`
  from the app's `i18n.ts`; Laravel `__('...')`; plain PHP `ps_h('...')` in HTML
  and `ps_t('...')` elsewhere; plain JS `psT('...')`. Never build a sentence
  from pieces; use one text with placeholders. Dates use the chosen locale.
- After adding texts, add their translations and check:
  `python3 vendor/plainshow/kit/bin/i18n-check.py lang/nl.json <code folders>`
  (also `sv.json`, or `en.json` for blog and split).
- The account menu is the same everywhere: Account, the app's own items,
  Language, Theme, then Sign out.
