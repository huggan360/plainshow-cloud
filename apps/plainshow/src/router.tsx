import { AnchorHTMLAttributes, MouseEvent, ReactNode, useEffect, useState } from 'react';
import { boot } from './boot';

/** Addresses inside Cloud, without the app's base: "/", "/photos", "/files/Documents". */
export function currentPath(): string {
    let path = window.location.pathname;
    try { path = decodeURIComponent(path); } catch {}
    const inside = path.startsWith(boot.base) ? path.slice(boot.base.length) : path;
    return inside === '' ? '/' : inside;
}

export function href(path: string): string {
    return boot.base + path;
}

export function fileRoute(path: string, open?: string): string {
    const inside = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return '/files' + (inside ? '/' + inside : '') + (open ? '?open=' + encodeURIComponent(open) : '');
}

const listeners = new Set<() => void>();

export function navigate(path: string, replace = false) {
    const target = href(path);
    if (replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    listeners.forEach((listener) => listener());
}

window.addEventListener('popstate', () => listeners.forEach((listener) => listener()));

export function usePath(): string {
    const [, setLocation] = useState(() => window.location.pathname + window.location.search);
    useEffect(() => {
        const update = () => setLocation(window.location.pathname + window.location.search);
        listeners.add(update);
        return () => { listeners.delete(update); };
    }, []);
    return currentPath();
}

export function useQuery(): URLSearchParams {
    usePath();
    return new URLSearchParams(window.location.search);
}

/** A link inside Cloud: no page load, but middle-click and new tabs still work. */
export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        rest.onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
    };
    return <a {...rest} href={href(to)} onClick={onClick}>{children}</a>;
}
