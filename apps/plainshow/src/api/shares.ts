import { ocs } from './http';

const BASE = '/apps/files_sharing/api/v1';

/** Share types this Cloud uses: 0 a person, 1 a group, 3 a public link. */
export type Share = {
    id: string;
    share_type: number;
    path: string;
    item_type: 'file' | 'folder';
    file_source: number;
    file_target: string;
    permissions: number;
    share_with?: string | null;
    share_with_displayname?: string | null;
    uid_owner: string;
    displayname_owner: string;
    token?: string | null;
    url?: string | null;
    expiration?: string | null;
    password?: string | null;
    label?: string | null;
    mimetype: string;
    stime: number;
    hide_download?: number;
};

export const PERMISSION = { read: 1, update: 2, create: 4, delete: 8, share: 16 };

export function sharesOf(path: string): Promise<Share[]> {
    return ocs<Share[]>(`${BASE}/shares?path=${encodeURIComponent('/' + path)}&reshares=true`);
}

export function sharedWithMe(): Promise<Share[]> {
    return ocs<Share[]>(`${BASE}/shares?shared_with_me=true`);
}

export function sharedByMe(): Promise<Share[]> {
    return ocs<Share[]>(`${BASE}/shares`);
}

export function shareWith(path: string, person: string, permissions: number, type = 0): Promise<Share> {
    return ocs<Share>(`${BASE}/shares`, { method: 'POST', form: { path: '/' + path, shareType: type, shareWith: person, permissions } });
}

export function shareLink(path: string, options: { password?: string; expireDate?: string; permissions?: number } = {}): Promise<Share> {
    return ocs<Share>(`${BASE}/shares`, { method: 'POST', form: { path: '/' + path, shareType: 3, permissions: options.permissions ?? PERMISSION.read, password: options.password || undefined, expireDate: options.expireDate || undefined } });
}

export function updateShare(id: string, changes: { permissions?: number; password?: string; expireDate?: string; label?: string }): Promise<Share> {
    return ocs<Share>(`${BASE}/shares/${id}`, { method: 'PUT', form: changes });
}

export function unshare(id: string): Promise<void> {
    return ocs<void>(`${BASE}/shares/${id}`, { method: 'DELETE' });
}

export type Sharee = { label: string; value: { shareType: number; shareWith: string }; shareWithDisplayNameUnique?: string };

/** People (and groups) to share with, by name. */
export async function findPeople(search: string, itemType: 'file' | 'folder'): Promise<Sharee[]> {
    const data = await ocs<{ exact: { users: Sharee[]; groups: Sharee[] }; users: Sharee[]; groups: Sharee[] }>(`${BASE}/sharees?search=${encodeURIComponent(search)}&itemType=${itemType}&perPage=20&shareType[]=0&shareType[]=1`);
    return [...data.exact.users, ...data.exact.groups, ...data.users, ...data.groups];
}
