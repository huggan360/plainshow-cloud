import { boot } from '../boot';
import { CloudError, request } from './http';

/** One file or folder, as WebDAV describes it. */
export type Entry = {
    id: number;
    path: string;          // inside your files: "Documents/plan.pdf"
    name: string;
    folder: boolean;
    mime: string;
    size: number;
    modified: number;      // ms
    etag: string;
    permissions: string;   // R S M G D N V C K (share, mount, ..., write, create, delete)
    favorite: boolean;
    preview: boolean;
    shared: number[];      // share types on it
    owner: string;
    taken: number | null;  // photo taken date (ms), when known
    src?: string;          // where to load it, when not from your own files (a shared album)
    large?: string;        // a large preview to show first
};

const NS = { d: 'DAV:', oc: 'http://owncloud.org/ns', nc: 'http://nextcloud.org/ns' };
const PROPS = `<d:prop>
    <d:displayname/><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/><d:getetag/><d:resourcetype/>
    <oc:fileid/><oc:size/><oc:permissions/><oc:favorite/><oc:share-types/><oc:owner-display-name/>
    <nc:has-preview/><nc:metadata-photos-original_date_time/>
</d:prop>`;

export const filesRoot = () => `/remote.php/dav/files/${encodeURIComponent(boot.user.id)}`;

export function davPath(path: string): string {
    return filesRoot() + '/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function text(node: Element, ns: string, name: string): string {
    return node.getElementsByTagNameNS(ns, name)[0]?.textContent ?? '';
}

function parse(xml: string, root = filesRoot()): Entry[] {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response')).map((response) => {
        const href = decodeURIComponent(text(response, NS.d, 'href'));
        const prefix = decodeURIComponent(boot.webroot + root);
        const path = href.startsWith(prefix) ? href.slice(prefix.length) : href;
        const folder = response.getElementsByTagNameNS(NS.d, 'collection').length > 0;
        const clean = path.replace(/^\/+|\/+$/g, '');
        const taken = text(response, NS.nc, 'metadata-photos-original_date_time');
        return {
            id: Number(text(response, NS.oc, 'fileid')) || 0,
            path: clean,
            name: text(response, NS.d, 'displayname') || clean.split('/').pop() || '',
            folder,
            mime: folder ? 'httpd/unix-directory' : text(response, NS.d, 'getcontenttype'),
            size: Number(folder ? text(response, NS.oc, 'size') : text(response, NS.d, 'getcontentlength')) || 0,
            modified: Date.parse(text(response, NS.d, 'getlastmodified')) || 0,
            etag: text(response, NS.d, 'getetag').replace(/"/g, ''),
            permissions: text(response, NS.oc, 'permissions'),
            favorite: text(response, NS.oc, 'favorite') === '1',
            preview: text(response, NS.nc, 'has-preview') === 'true',
            shared: Array.from(response.getElementsByTagNameNS(NS.oc, 'share-type')).map((node) => Number(node.textContent)),
            owner: text(response, NS.oc, 'owner-display-name'),
            taken: taken ? Number(taken) * 1000 : null,
        };
    });
}

async function dav(url: string, init: RequestInit & { depth?: string } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.depth !== undefined) headers.set('Depth', init.depth);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/xml; charset=utf-8');
    const response = await request(url, { ...init, headers });
    if (!response.ok && response.status !== 207) {
        const xml = await response.text();
        const message = xml.match(/<s:message>([^<]*)<\/s:message>/)?.[1];
        throw new CloudError(message || messages[response.status] || `Cloud answered ${response.status}.`, response.status);
    }
    return response;
}

const messages: Record<number, string> = {
    403: 'You may not do that here.', 404: 'It is not there any more.', 405: 'Something with that name is already there.',
    409: 'The folder it should go in is gone.', 412: 'Something with that name is already there.', 423: 'Someone is using it right now. Try again in a moment.',
    507: 'There is not enough space left.',
};

/** A folder and what is in it. The folder itself comes first. */
export async function list(path: string): Promise<{ folder: Entry; items: Entry[] }> {
    const response = await dav(davPath(path), { method: 'PROPFIND', depth: '1', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${PROPS}</d:propfind>` });
    const [folder, ...items] = parse(await response.text());
    return { folder, items };
}

export async function stat(path: string): Promise<Entry> {
    const response = await dav(davPath(path), { method: 'PROPFIND', depth: '0', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${PROPS}</d:propfind>` });
    return parse(await response.text())[0];
}

/** Search your files: recent changes, or pictures and videos, newest first. */
export async function search(where: string, limit = 100, order = '<d:prop><d:getlastmodified/></d:prop>'): Promise<Entry[]> {
    const body = `<?xml version="1.0"?>
<d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
<d:basicsearch>
  <d:select>${PROPS}</d:select>
  <d:from><d:scope><d:href>/files/${encodeURIComponent(boot.user.id)}</d:href><d:depth>infinity</d:depth></d:scope></d:from>
  <d:where>${where}</d:where>
  <d:orderby><d:order>${order}<d:descending/></d:order></d:orderby>
  <d:limit><d:nresults>${limit}</d:nresults></d:limit>
</d:basicsearch>
</d:searchrequest>`;
    const response = await dav('/remote.php/dav/', { method: 'SEARCH', body, headers: { 'Content-Type': 'text/xml' } });
    return parse(await response.text());
}

export function recent(): Promise<Entry[]> {
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30;
    return search(`<d:and><d:not><d:is-collection/></d:not><d:gt><d:prop><d:getlastmodified/></d:prop><d:literal>${since}</d:literal></d:gt></d:and>`, 100);
}

export async function favorites(): Promise<Entry[]> {
    const response = await dav(filesRoot() + '/', { method: 'REPORT', depth: '1', body: `<?xml version="1.0"?><oc:filter-files xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${PROPS}<oc:filter-rules><oc:favorite>1</oc:favorite></oc:filter-rules></oc:filter-files>` });
    return parse(await response.text());
}

export async function setFavorite(path: string, favorite: boolean): Promise<void> {
    await dav(davPath(path), { method: 'PROPPATCH', body: `<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:set><d:prop><oc:favorite>${favorite ? 1 : 0}</oc:favorite></d:prop></d:set></d:propertyupdate>` });
}

export async function mkdir(path: string): Promise<void> {
    await dav(davPath(path), { method: 'MKCOL' });
}

export async function remove(path: string): Promise<void> {
    await dav(davPath(path), { method: 'DELETE' });
}

export async function move(from: string, to: string, copy = false, overwrite = false): Promise<void> {
    await dav(davPath(from), { method: copy ? 'COPY' : 'MOVE', headers: { Destination: window.location.origin + boot.webroot + davPath(to), Overwrite: overwrite ? 'T' : 'F' } });
}

export async function readText(path: string): Promise<string> {
    return (await dav(davPath(path))).text();
}

export async function writeText(path: string, content: string): Promise<void> {
    await dav(davPath(path), { method: 'PUT', body: content, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export function fileUrl(path: string): string {
    return boot.webroot + davPath(path);
}

export function previewUrl(entry: Pick<Entry, 'id' | 'etag'>, size = 256, crop = true): string {
    return `${boot.webroot}/index.php/core/preview?fileId=${entry.id}&x=${size}&y=${size}&a=${crop ? 0 : 1}&forceIcon=0&c=${encodeURIComponent(entry.etag)}`;
}

/** A whole folder, or some items in it, as one zip. */
export function zipUrl(folder: string, names?: string[]): string {
    const url = `${boot.webroot}${davPath(folder)}?accept=zip`;
    return names ? `${url}&files=${encodeURIComponent(JSON.stringify(names))}` : url;
}

/* ---------- Uploads ---------- */

export type Progress = (sent: number, total: number) => void;
const CHUNK = 10 * 1024 * 1024;

function put(url: string, body: Blob, headers: Record<string, string>, onProgress?: (sent: number) => void, method = 'PUT'): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, boot.webroot + url);
        xhr.setRequestHeader('requesttoken', boot.requestToken);
        Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
        xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new CloudError(messages[xhr.status] || `Upload failed (${xhr.status}).`, xhr.status)));
        xhr.onerror = () => reject(new CloudError('The connection dropped during the upload.'));
        xhr.send(body);
    });
}

/** Upload a file; big ones go in 10 MB pieces that Cloud puts together at the end. */
export async function upload(path: string, file: File, onProgress?: Progress): Promise<void> {
    const mtime = String(Math.floor(file.lastModified / 1000));
    if (file.size <= CHUNK) {
        await put(davPath(path), file, { 'X-OC-Mtime': mtime }, (sent) => onProgress?.(sent, file.size));
        onProgress?.(file.size, file.size);
        return;
    }
    const destination = window.location.origin + boot.webroot + davPath(path);
    const folder = `/remote.php/dav/uploads/${encodeURIComponent(boot.user.id)}/web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await dav(folder, { method: 'MKCOL', headers: { Destination: destination } });
    let done = 0;
    for (let index = 0, offset = 0; offset < file.size; index++, offset += CHUNK) {
        const part = file.slice(offset, offset + CHUNK);
        await put(`${folder}/${String(index + 1).padStart(5, '0')}`, part, { Destination: destination, 'OC-Total-Length': String(file.size) }, (sent) => onProgress?.(done + sent, file.size));
        done += part.size;
    }
    await dav(`${folder}/.file`, { method: 'MOVE', headers: { Destination: destination, 'OC-Total-Length': String(file.size), 'X-OC-Mtime': mtime } });
    onProgress?.(file.size, file.size);
}

/* ---------- Trash and versions ---------- */

export type TrashItem = { id: number; href: string; name: string; original: string; deleted: number; size: number; folder: boolean; mime: string };

export async function trash(): Promise<TrashItem[]> {
    const root = `/remote.php/dav/trashbin/${encodeURIComponent(boot.user.id)}/trash`;
    const response = await dav(root, { method: 'PROPFIND', depth: '1', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><nc:trashbin-filename/><nc:trashbin-original-location/><nc:trashbin-deletion-time/><oc:fileid/><oc:size/><d:getcontentlength/><d:resourcetype/><d:getcontenttype/></d:prop></d:propfind>` });
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response')).slice(1).map((node) => {
        const folder = node.getElementsByTagNameNS(NS.d, 'collection').length > 0;
        return {
            id: Number(text(node, NS.oc, 'fileid')),
            href: text(node, NS.d, 'href').replace(boot.webroot, ''),
            name: text(node, NS.nc, 'trashbin-filename'),
            original: text(node, NS.nc, 'trashbin-original-location'),
            deleted: Number(text(node, NS.nc, 'trashbin-deletion-time')) * 1000,
            size: Number(folder ? text(node, NS.oc, 'size') : text(node, NS.d, 'getcontentlength')) || 0,
            folder,
            mime: folder ? 'httpd/unix-directory' : text(node, NS.d, 'getcontenttype'),
        };
    }).sort((a, b) => b.deleted - a.deleted);
}

export async function restore(item: TrashItem): Promise<void> {
    const target = `/remote.php/dav/trashbin/${encodeURIComponent(boot.user.id)}/restore/${encodeURIComponent(item.href.split('/').pop() || '')}`;
    await dav(item.href, { method: 'MOVE', headers: { Destination: window.location.origin + boot.webroot + target } });
}

export async function deleteForever(item: TrashItem): Promise<void> {
    await dav(item.href, { method: 'DELETE' });
}

export async function emptyTrash(): Promise<void> {
    await dav(`/remote.php/dav/trashbin/${encodeURIComponent(boot.user.id)}/trash`, { method: 'DELETE' });
}

export type Version = { href: string; modified: number; size: number; label: string; author: string };

export async function versions(id: number): Promise<Version[]> {
    const response = await dav(`/remote.php/dav/versions/${encodeURIComponent(boot.user.id)}/versions/${id}`, { method: 'PROPFIND', depth: '1', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getlastmodified/><d:getcontentlength/><nc:version-label/><nc:version-author/></d:prop></d:propfind>` });
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response')).slice(1).map((node) => ({
        href: text(node, NS.d, 'href').replace(boot.webroot, ''),
        modified: Date.parse(text(node, NS.d, 'getlastmodified')),
        size: Number(text(node, NS.d, 'getcontentlength')) || 0,
        label: text(node, NS.nc, 'version-label'),
        author: text(node, NS.nc, 'version-author'),
    })).sort((a, b) => b.modified - a.modified);
}

export async function restoreVersion(version: Version): Promise<void> {
    await dav(version.href, { method: 'MOVE', headers: { Destination: window.location.origin + boot.webroot + `/remote.php/dav/versions/${encodeURIComponent(boot.user.id)}/restore/target` } });
}

/* ---------- Tags ---------- */

export type Tag = { id: number; name: string };

export async function tagsOf(id: number): Promise<Tag[]> {
    const response = await dav(`/remote.php/dav/systemtags-relations/files/${id}`, { method: 'PROPFIND', depth: '1', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:id/><oc:display-name/></d:prop></d:propfind>` });
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response')).slice(1).map((node) => ({ id: Number(text(node, NS.oc, 'id')), name: text(node, NS.oc, 'display-name') }));
}

export async function allTags(): Promise<Tag[]> {
    const response = await dav('/remote.php/dav/systemtags/', { method: 'PROPFIND', depth: '1', body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:id/><oc:display-name/><oc:user-visible/></d:prop></d:propfind>` });
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response')).slice(1).filter((node) => text(node, NS.oc, 'user-visible') !== 'false').map((node) => ({ id: Number(text(node, NS.oc, 'id')), name: text(node, NS.oc, 'display-name') }));
}

export async function addTag(id: number, name: string, existing: Tag[]): Promise<void> {
    let tag = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
        const response = await dav('/remote.php/dav/systemtags/', { method: 'POST', body: JSON.stringify({ name, userVisible: true, userAssignable: true }), headers: { 'Content-Type': 'application/json' } });
        tag = { id: Number(response.headers.get('Content-Location')?.split('/').pop()), name };
    }
    await dav(`/remote.php/dav/systemtags-relations/files/${id}/${tag.id}`, { method: 'PUT' });
}

export async function removeTag(id: number, tag: Tag): Promise<void> {
    await dav(`/remote.php/dav/systemtags-relations/files/${id}/${tag.id}`, { method: 'DELETE' });
}
