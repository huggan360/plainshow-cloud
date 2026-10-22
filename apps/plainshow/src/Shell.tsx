import { ReactNode, useEffect, useRef, useState } from 'react';
import { formatBytes } from './api/http';
import { boot, can } from './boot';
import { Link, usePath } from './router';
import { Toasts } from './toast';
import { Avatar, Meter } from './ui';

function useTheme(): [string, () => void] {
    const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
    const toggle = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('plainshow-theme', next); } catch { /* private mode */ }
        setTheme(next);
    };
    return [theme, toggle];
}

export function useOutside<T extends HTMLElement = HTMLDivElement>(open: boolean, close: () => void) {
    const ref = useRef<T>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open, close]);
    return ref;
}

const APPS = [
    { id: 'core', href: 'https://plainshow.se', icon: 'bx-grid-alt', name: 'Dashboard' },
    { id: 'blog', href: 'https://blog.plainshow.se', icon: 'bx-news', name: 'Blog' },
    { id: 'split', href: 'https://split.plainshow.se', icon: 'bx-wallet', name: 'Split' },
    { id: 'latex', href: 'https://latex.plainshow.se', icon: 'bx-code-curly', name: 'LaTeX' },
    { id: 'web', href: 'https://web.plainshow.se', icon: 'bx-server', name: 'Web' },
    { id: 'cloud', href: boot.base + '/', icon: 'bx-cloud', name: 'Cloud', current: true },
].filter((app) => app.id === 'core' || boot.user.services?.includes(app.id));

function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

/** Extra sidebar content a page provides (Calendar puts its calendars there). */
let sidebarExtra: ReactNode = null;
const extraListeners = new Set<() => void>();
export function setSidebarExtra(node: ReactNode) { sidebarExtra = node; extraListeners.forEach((listener) => listener()); }
function useSidebarExtra(): ReactNode {
    const [, force] = useState(0);
    useEffect(() => { const listener = () => force((n) => n + 1); extraListeners.add(listener); return () => { extraListeners.delete(listener); }; }, []);
    return sidebarExtra;
}

export default function Shell({ children }: { children: ReactNode }) {
    const path = usePath();
    const extra = useSidebarExtra();
    const [menuOpen, setMenuOpen] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [theme, toggleTheme] = useTheme();
    const switcherRef = useOutside(switcherOpen, () => setSwitcherOpen(false));
    const accountRef = useOutside(accountOpen, () => setAccountOpen(false));

    useEffect(() => { setMenuOpen(false); }, [path]);

    const hasFiles = can('cloud.files.view');
    const hasPhotos = can('cloud.photos.view');
    const hasCalendar = can('cloud.calendar.view');
    const files = hasFiles && !/^\/(photos|calendar|settings)/.test(path);
    const is = (target: string) => (target === '/' ? path === '/' || path.startsWith('/files') : path === target || path.startsWith(target + '/'));
    const item = (to: string, icon: string, label: string, sub = false, active = is(to)) => (
        <Link to={to} className={`ps-nav__item${sub ? ' ps-nav__item--sub' : ''}${active ? ' is-active' : ''}`}><i className={`bx ${icon}`} aria-hidden="true" />{label}</Link>
    );
    const used = boot.quota.total ? Math.round((boot.quota.used / boot.quota.total) * 100) : 0;

    return (
        <div className={`ps-shell${menuOpen ? ' is-menu-open' : ''}`}>
            <aside className="ps-sidebar" aria-label="Cloud">
                <div className="ps-sidebar__brand">
                    <a href="https://plainshow.se" className="ps-brand">
                        <img className="ps-brand__logo" src={`${boot.assets}/ui/brand/plainshow-logo.webp?v=${boot.version}`} alt="PlainShow" width="92" height="30" />
                        <span className="ps-brand__suffix">Cloud</span>
                    </a>
                </div>
                <nav className="ps-nav">
                    {hasFiles && item('/', 'bx-folder', 'Files', false, files && is('/'))}
                    {files && <>
                        {item('/recent', 'bx-time-five', 'Recent', true)}
                        {item('/favorites', 'bx-star', 'Favorites', true)}
                        {item('/shared/with-you', 'bx-share-alt', 'Shared with you', true)}
                        {item('/shared/by-you', 'bx-link', 'Shared by you', true)}
                        {item('/trash', 'bx-trash', 'Trash', true)}
                    </>}
                    {hasPhotos && item('/photos', 'bx-images', 'Photos', false, path === '/photos' || (path.startsWith('/photos') && !path.startsWith('/photos/albums')) || path.startsWith('/photos/albums'))}
                    {hasPhotos && path.startsWith('/photos') && <>
                        {item('/photos', 'bx-grid', 'Timeline', true, path === '/photos')}
                        {item('/photos/albums', 'bx-photo-album', 'Albums', true)}
                    </>}
                    {hasCalendar && item('/calendar', 'bx-calendar', 'Calendar', false, path.startsWith('/calendar'))}
                    {hasCalendar && path.startsWith('/calendar') && extra}
                    {item('/settings', 'bx-cog', 'Settings')}
                </nav>
                <div className="ps-sidebar__foot">
                    {hasFiles && boot.quota.total !== null && (
                        <div className="cloud-quota">
                            <Meter value={used} label="Storage used" />
                            <span className="ps-small ps-muted">{formatBytes(boot.quota.used)} of {formatBytes(boot.quota.total)} used</span>
                        </div>
                    )}
                    {hasFiles && boot.quota.total === null && <span className="cloud-quota ps-small ps-muted">{formatBytes(boot.quota.used)} used</span>}
                    <div className={`ps-dropdown ps-me${accountOpen ? ' is-open' : ''}`} ref={accountRef}>
                        <button type="button" className="ps-me__button" aria-expanded={accountOpen} aria-label="Account menu" onClick={() => setAccountOpen((open) => !open)}>
                            <Avatar src={boot.user.avatar} initials={initials(boot.user.name)} size="sm" />
                            <span className="ps-me__text"><span className="ps-me__name">{boot.user.name}</span><span className="ps-me__meta">@{boot.user.id}</span></span>
                            <i className={`bx ${accountOpen ? 'bx-chevron-down' : 'bx-chevron-up'} ps-me__chevron`} aria-hidden="true" />
                        </button>
                        {accountOpen && (
                            <div className="ps-dropdown__menu ps-dropdown__menu--up">
                                <a href="https://plainshow.se/account" className="ps-dropdown__item"><i className="bx bx-user" />Account</a>
                                <Link to="/settings/devices" className="ps-dropdown__item"><i className="bx bx-mobile" />Devices</Link>
                                <button type="button" className="ps-dropdown__item" onClick={toggleTheme}><i className={`bx ${theme === 'light' ? 'bx-moon' : 'bx-sun'}`} />{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>
                                <div className="ps-dropdown__sep" />
                                <a href={boot.logout} className="ps-dropdown__item"><i className="bx bx-log-out" />Sign out</a>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <div className="ps-main">
                <header className="ps-topbar">
                    <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(true)}><i className="bx bx-menu" /></button>
                    <a href="https://plainshow.se" className="ps-brand cloud-topbar-mark" aria-label="PlainShow"><img className="ps-brand__mark" src={`${boot.assets}/ui/brand/plainshow-icon.webp?v=${boot.version}`} alt="" /></a>
                    <span className="ps-topbar__spacer" />
                    <div className="ps-switcher" ref={switcherRef}>
                        <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-switcher__trigger" aria-label="Switch service" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}><i className="bx bx-grid" /></button>
                        {switcherOpen && (
                            <div className="ps-switcher__panel">
                                <div className="ps-switcher__grid">
                                    {APPS.map((app) => <a key={app.name} href={app.href} className={`ps-switcher__app${app.current ? ' is-current' : ''}`}><i className={`bx ${app.icon}`} aria-hidden="true" />{app.name}</a>)}
                                </div>
                            </div>
                        )}
                    </div>
                </header>
                <main className="ps-content ps-content--wide cloud-content">{children}</main>
            </div>

            <nav className="ps-tabbar" aria-label="Quick navigation">
                {hasFiles && <Link to="/" className={`ps-tabbar__item${files ? ' is-active' : ''}`}><i className="bx bx-folder" />Files</Link>}
                {hasPhotos && <Link to="/photos" className={`ps-tabbar__item${path.startsWith('/photos') ? ' is-active' : ''}`}><i className="bx bx-images" />Photos</Link>}
                {hasCalendar && <Link to="/calendar" className={`ps-tabbar__item${path.startsWith('/calendar') ? ' is-active' : ''}`}><i className="bx bx-calendar" />Calendar</Link>}
                <Link to="/settings" className={`ps-tabbar__item${path.startsWith('/settings') ? ' is-active' : ''}`}><i className="bx bx-cog" />Settings</Link>
            </nav>
            {menuOpen && <div className="cloud-scrim" onClick={() => setMenuOpen(false)} />}
            <Toasts />
        </div>
    );
}

/** The heading every page starts with. */
export function PageHead({ title, text, actions }: { title: ReactNode; text?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="ps-page-head">
            <div>
                <h1 className="ps-page-head__title">{title}</h1>
                {text && <p className="ps-page-head__text">{text}</p>}
            </div>
            {actions && <div className="ps-page-head__actions">{actions}</div>}
        </div>
    );
}
