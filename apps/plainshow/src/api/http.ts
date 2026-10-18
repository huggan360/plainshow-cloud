import { boot } from '../boot';

/** A request to this Cloud with the session and its request token (Nextcloud's CSRF check). */
export async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('requesttoken', boot.requestToken);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    const response = await fetch(url.startsWith('http') ? url : boot.webroot + url, { credentials: 'same-origin', ...init, headers });
    if (response.status === 401 && !boot.public) {
        // The session ended: sign in again and come back here.
        window.location.href = boot.webroot + '/index.php/login?redirect_url=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
    return response;
}

export class CloudError extends Error {
    constructor(message: string, public status = 0) { super(message); }
}

/** Nextcloud's OCS API, answering in JSON. */
export async function ocs<T>(path: string, init: RequestInit & { form?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
    const url = path + (path.includes('?') ? '&' : '?') + 'format=json';
    const headers = new Headers(init.headers);
    headers.set('OCS-APIREQUEST', 'true');
    headers.set('Accept', 'application/json');
    let body = init.body;
    if (init.form) {
        const form = new URLSearchParams();
        Object.entries(init.form).forEach(([key, value]) => { if (value !== undefined) form.set(key, String(value)); });
        body = form;
    }
    const response = await request('/ocs/v2.php' + url, { ...init, headers, body });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new CloudError(data?.ocs?.meta?.message || `Cloud answered ${response.status}.`, response.status);
    return data.ocs.data as T;
}

/** PlainShow's own endpoints in this Cloud. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    let body = init.body;
    if (init.json !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(init.json);
    }
    const response = await request(boot.apiBase.slice(boot.webroot.length) + path, { ...init, headers, body });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CloudError(data?.message || `Cloud answered ${response.status}.`, response.status);
    return data as T;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
