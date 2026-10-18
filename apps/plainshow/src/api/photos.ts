import { Entry } from './dav';
import { api } from './http';

export type Photo = { id: number; path: string; name: string; mime: string; etag: string; size: number; modified: number; taken: number };
export type Album = { id: number; name: string; owner: string; ownerName: string; mine: boolean; created: number; location: string; count: number; cover: number | null };
export type AlbumPhoto = Omit<Photo, 'path'> & { owner: string; mine: boolean };

export const timeline = (before: string | null) => api<{ items: Photo[]; next: string | null }>(`/api/web/photos?limit=240${before ? `&before=${encodeURIComponent(before)}` : ''}`);
export const months = () => api<{ month: string; count: number }[]>('/api/web/photos/months');
export const albums = () => api<Album[]>('/api/web/albums');
export const album = (id: number) => api<{ album: Album; photos: AlbumPhoto[]; people: { id: string; name: string }[] }>(`/api/web/albums/${id}`);
export const createAlbum = (name: string, location = '') => api<Album>('/api/web/albums', { method: 'POST', json: { name, location } });
export const updateAlbum = (id: number, changes: { name?: string; location?: string }) => api<Album>(`/api/web/albums/${id}`, { method: 'PUT', json: changes });
export const deleteAlbum = (id: number) => api(`/api/web/albums/${id}`, { method: 'DELETE' });
export const addToAlbum = (id: number, ids: number[]) => api<{ added: number }>(`/api/web/albums/${id}/photos`, { method: 'POST', json: { ids } });
export const removeFromAlbum = (id: number, fileId: number) => api(`/api/web/albums/${id}/photos/${fileId}`, { method: 'DELETE' });
export const shareAlbum = (id: number, person: string, on: boolean) => api<{ id: string; name: string }[]>(`/api/web/albums/${id}/people`, { method: 'POST', json: { person, on } });

/** A timeline photo as a file the viewer and menus understand. */
export function asEntry(photo: Photo): Entry {
    return { ...photo, folder: false, permissions: 'RGDNVW', favorite: false, preview: true, shared: [], owner: '', taken: photo.taken };
}
