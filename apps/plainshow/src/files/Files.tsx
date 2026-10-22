import { CSSProperties, DragEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as dav from '../api/dav';
import { Entry } from '../api/dav';
import { formatBytes } from '../api/http';
import { Share, sharedByMe, sharedWithMe } from '../api/shares';
import { fileRoute, Link, navigate } from '../router';
import { PageHead } from '../Shell';
import { failed, toast } from '../toast';
import { Button, Empty, Frame, relativeTime } from '../ui';
import { FolderDialog, NameDialog, ShareDialog, TagsDialog, VersionsDialog } from './dialogs';
import { ICONS, kindOf } from './kinds';
import { UploadPanel, droppedFiles, onUploaded, queueUploads } from './uploads';
import Viewer from './Viewer';
import { t, locale } from '../i18n';

type View = 'folder' | 'recent' | 'favorites' | 'with-you' | 'by-you';
type Sort = { by: 'name' | 'modified' | 'size'; down: boolean };
type Dialog =
    | { kind: 'new-folder' } | { kind: 'rename'; entry: Entry } | { kind: 'move'; entries: Entry[]; copy: boolean }
    | { kind: 'share'; entry: Entry } | { kind: 'versions'; entry: Entry } | { kind: 'tags'; entry: Entry } | null;

const TITLES: Record<View, string> = { folder: t('Files'), recent: t('Recent'), favorites: t('Favorites'), 'with-you': t('Shared with you'), 'by-you': t('Shared by you') };
const store = { get: (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private */ } } };

function fromShare(share: Share, mine: boolean): Entry {
    const path = (mine ? share.path : share.file_target).replace(/^\/+/, '');
    return {
        id: share.file_source, path, name: path.split('/').pop() || path, folder: share.item_type === 'folder',
        mime: share.item_type === 'folder' ? 'httpd/unix-directory' : share.mimetype, size: 0, modified: share.stime * 1000, etag: String(share.stime),
        permissions: share.permissions & 2 ? 'RGDNVW' : 'RG', favorite: false, preview: share.mimetype?.startsWith('image/') ?? false,
        shared: [share.share_type], owner: share.displayname_owner, taken: null,
    };
}

export default function Files({ view, path }: { view: View; path: string }) {
    const [items, setItems] = useState<Entry[] | null>(null);
    const [folder, setFolder] = useState<Entry | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [layout, setLayout] = useState(() => store.get('cloud-layout', 'list'));
    const [sort, setSort] = useState<Sort>(() => JSON.parse(store.get('cloud-sort', '{"by":"name","down":false}')));
    const [filter, setFilter] = useState('');
    const [dialog, setDialog] = useState<Dialog>(null);
    const [viewing, setViewing] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const picker = useRef<HTMLInputElement>(null);
    const folderPicker = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setError('');
        try {
            if (view === 'folder') {
                const result = await dav.list(path);
                setFolder(result.folder);
                setItems(result.items);
            } else {
                setFolder(null);
                if (view === 'recent') setItems(await dav.recent());
                if (view === 'favorites') setItems(await dav.favorites());
                if (view === 'with-you') setItems((await sharedWithMe()).map((share) => fromShare(share, false)));
                if (view === 'by-you') {
                    const seen = new Map<string, Entry>();
                    (await sharedByMe()).forEach((share) => {
                        const entry = fromShare(share, true);
                        const known = seen.get(entry.path);
                        if (known) known.shared = [...new Set([...known.shared, share.share_type])];
                        else seen.set(entry.path, entry);
                    });
                    setItems([...seen.values()]);
                }
            }
        } catch (problem) {
            setItems([]);
            setError(problem instanceof Error ? problem.message : t('Could not load this.'));
        }
    }, [view, path]);

    useEffect(() => { setItems(null); setSelected(new Set()); setFilter(''); setViewing(null); void load(); }, [load]);
    useEffect(() => onUploaded((into) => { if (view === 'folder' && into === path) void load(); }), [view, path, load]);
    useEffect(() => { const open = new URLSearchParams(window.location.search).get('open'); if (open && items) { const at = files.findIndex((item) => item.name === open); if (at >= 0) setViewing(at); } }, [items]);

    const sorted = useMemo(() => {
        const list = (items ?? []).filter((item) => !filter || item.name.toLowerCase().includes(filter.toLowerCase()));
        const factor = sort.down ? -1 : 1;
        return list.sort((a, b) => {
            if (a.folder !== b.folder) return a.folder ? -1 : 1;
            const value = sort.by === 'name' ? a.name.localeCompare(b.name, 'sv', { numeric: true }) : sort.by === 'size' ? a.size - b.size : a.modified - b.modified;
            return value * factor;
        });
    }, [items, filter, sort]);

    const files = sorted.filter((item) => !item.folder);
    const canWrite = view !== 'folder' || !folder || folder.permissions.includes('C') || folder.permissions.includes('K');
    const chosen = sorted.filter((item) => selected.has(item.path));

    const open = (entry: Entry) => {
        if (entry.folder) { navigate(fileRoute(entry.path)); return; }
        setViewing(files.indexOf(entry));
    };
    const toggleSort = (by: Sort['by']) => { const next = { by, down: sort.by === by ? !sort.down : by !== 'name' }; setSort(next); store.set('cloud-sort', JSON.stringify(next)); };
    const setView = (next: string) => { setLayout(next); store.set('cloud-layout', next); };

    const removeMany = async (entries: Entry[]) => {
        if (!entries.length) return;
        try {
            for (const entry of entries) await dav.remove(entry.path);
            toast(entries.length === 1 ? t('{name} is in the trash.', { name: entries[0].name }) : t('{n} items are in the trash.', { n: entries.length }));
            setSelected(new Set());
            await load();
        } catch (problem) { failed(problem); void load(); }
    };
    const favorite = async (entry: Entry) => {
        try { await dav.setFavorite(entry.path, !entry.favorite); entry.favorite = !entry.favorite; setItems([...(items ?? [])]); if (view === 'favorites') void load(); } catch (problem) { failed(problem); }
    };

    const onDrop = async (event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        if (!canWrite || view !== 'folder') { toast(t('Open a folder of yours to upload into it.'), 'error'); return; }
        if (!event.dataTransfer.types.includes('Files')) return;
        queueUploads(path, await droppedFiles(event.dataTransfer));
    };

    const crumbs = path.split('/').filter(Boolean);
    const title = view === 'folder' ? (crumbs.length ? crumbs[crumbs.length - 1] : t('Files')) : TITLES[view];

    return (
        <div className={`cloud-files${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => { if (view === 'folder' && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={onDrop}>
            <PageHead title={title} actions={view === 'folder' && canWrite ? <>
                <Button icon="bx-folder-plus" onClick={() => setDialog({ kind: 'new-folder' })}>{t('New folder')}</Button>
                <Button variant="primary" icon="bx-upload" onClick={() => picker.current?.click()}>{t('Upload')}</Button>
            </> : undefined} />
            <input ref={picker} type="file" multiple hidden onChange={(event) => { queueUploads(path, Array.from(event.target.files ?? []).map((file) => ({ file }))); event.target.value = ''; }} />
            <input ref={folderPicker} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(event) => { queueUploads(path, Array.from(event.target.files ?? []).map((file) => ({ file, relative: (file as File & { webkitRelativePath: string }).webkitRelativePath }))); event.target.value = ''; }} />

            <div className="cloud-toolbar">
                {view === 'folder' ? (
                    <nav className="cloud-crumbs" aria-label={t('Folders')}>
                        <Link to="/" className="cloud-crumbs__item"><i className="bx bx-home-alt" />{t('Files')}</Link>
                        {crumbs.map((part, index) => (
                            <Link key={index} to={fileRoute(crumbs.slice(0, index + 1).join('/'))} className="cloud-crumbs__item"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={async (event) => { event.preventDefault(); event.stopPropagation(); const from = event.dataTransfer.getData('text/cloud-path'); if (from) { try { await dav.move(from, crumbs.slice(0, index + 1).join('/') + '/' + from.split('/').pop()); void load(); } catch (problem) { failed(problem); } } }}>
                                <i className="bx bx-chevron-right" />{part}
                            </Link>
                        ))}
                    </nav>
                ) : <span className="cloud-toolbar__spacer" />}
                <input className="ps-input cloud-filter" placeholder={t('Filter')} value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t('Filter by name')} />
                <div className="cloud-segment" role="group" aria-label={t('Layout')}>
                    <button type="button" className={layout === 'list' ? 'is-active' : ''} aria-label={t('List')} onClick={() => setView('list')}><i className="bx bx-list-ul" /></button>
                    <button type="button" className={layout === 'grid' ? 'is-active' : ''} aria-label={t('Grid')} onClick={() => setView('grid')}><i className="bx bx-grid-alt" /></button>
                </div>
            </div>

            {chosen.length > 0 && (
                <div className="cloud-selection">
                    <strong>{chosen.length} selected</strong>
                    <a className="ps-btn ps-btn--sm" href={dav.zipUrl(view === 'folder' ? path : '', chosen.map((entry) => entry.name))} download><i className="bx bx-download" />{t('Download')}</a>
                    {view === 'folder' && <>
                        <Button size="sm" icon="bx-move" onClick={() => setDialog({ kind: 'move', entries: chosen, copy: false })}>{t('Move')}</Button>
                        <Button size="sm" icon="bx-copy" onClick={() => setDialog({ kind: 'move', entries: chosen, copy: true })}>{t('Copy')}</Button>
                        <Button size="sm" variant="danger" icon="bx-trash" onClick={() => removeMany(chosen)}>{t('Delete')}</Button>
                    </>}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('Clear')}</Button>
                </div>
            )}

            <Frame flush className="cloud-files__frame">
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div>
                    : error ? <Empty icon="bx-error-circle">{error}</Empty>
                    : sorted.length === 0 ? <Empty icon={view === 'folder' ? 'bx-folder-open' : 'bx-ghost'}>{filter ? t('Nothing matches.') : EMPTY[view]}{view === 'folder' && canWrite && !filter && <div className="cloud-empty-actions"><Button size="sm" onClick={() => picker.current?.click()}>{t('Upload files')}</Button><Button size="sm" variant="ghost" onClick={() => folderPicker.current?.click()}>{t('Upload a folder')}</Button></div>}</Empty>
                    : layout === 'grid'
                        ? <div className="cloud-grid">{sorted.map((entry) => <Tile key={entry.path} entry={entry} selected={selected.has(entry.path)} onOpen={() => open(entry)} onSelect={(on) => setSelected((current) => { const next = new Set(current); if (on) next.add(entry.path); else next.delete(entry.path); return next; })} menu={<ItemMenu entry={entry} view={view} onFavorite={() => favorite(entry)} onDialog={setDialog} onDelete={() => removeMany([entry])} />} />)}</div>
                        : <table className="ps-table cloud-table">
                            <thead><tr>
                                <th className="cloud-col-check"><input type="checkbox" aria-label={t('Select all')} checked={chosen.length === sorted.length} onChange={(event) => setSelected(event.target.checked ? new Set(sorted.map((item) => item.path)) : new Set())} /></th>
                                <th><button type="button" className="cloud-sort" onClick={() => toggleSort('name')}>{t('Name')}{sort.by === 'name' && <i className={`bx ${sort.down ? 'bx-chevron-up' : 'bx-chevron-down'}`} />}</button></th>
                                {view === 'with-you' && <th className="cloud-col-meta">{t('Shared by')}</th>}
                                <th className="cloud-col-size"><button type="button" className="cloud-sort" onClick={() => toggleSort('size')}>{t('Size')}{sort.by === 'size' && <i className={`bx ${sort.down ? 'bx-chevron-down' : 'bx-chevron-up'}`} />}</button></th>
                                <th className="cloud-col-date"><button type="button" className="cloud-sort" onClick={() => toggleSort('modified')}>{view === 'with-you' || view === 'by-you' ? t('Shared') : t('Changed')}{sort.by === 'modified' && <i className={`bx ${sort.down ? 'bx-chevron-down' : 'bx-chevron-up'}`} />}</button></th>
                                <th className="cloud-col-actions" aria-label={t('Actions')} />
                            </tr></thead>
                            <tbody>{sorted.map((entry) => (
                                <Row key={entry.path} entry={entry} view={view} selected={selected.has(entry.path)} onOpen={() => open(entry)}
                                    onSelect={(on) => setSelected((current) => { const next = new Set(current); if (on) next.add(entry.path); else next.delete(entry.path); return next; })}
                                    onDropInto={async (from) => { try { await dav.move(from, entry.path + '/' + from.split('/').pop()); toast(t('Moved into {name}.', { name: entry.name })); void load(); } catch (problem) { failed(problem); } }}
                                    onUploadInto={(dropped) => queueUploads(entry.path, dropped)}
                                    menu={<ItemMenu entry={entry} view={view} onFavorite={() => favorite(entry)} onDialog={setDialog} onDelete={() => removeMany([entry])} />} />
                            ))}</tbody>
                        </table>}
            </Frame>
            {view === 'folder' && sorted.length > 0 && <p className="cloud-summary ps-small ps-muted">{sorted.filter((item) => item.folder).length} {' '}{t('folders,')}{' '}{files.length} {' '}{t('files,')}{' '}{formatBytes(sorted.reduce((sum, item) => sum + item.size, 0))}</p>}

            {dragging && <div className="cloud-dropzone"><i className="bx bx-cloud-upload" />{t('Drop to upload into')}{' '}{title}</div>}
            <UploadPanel />

            {dialog?.kind === 'new-folder' && <NameDialog title={t('New folder')} initial="New folder" action="Create" onClose={() => setDialog(null)} onDone={async (name) => { await dav.mkdir([path, name].filter(Boolean).join('/')); await load(); }} />}
            {dialog?.kind === 'rename' && <NameDialog title={t('Rename {name}', { name: dialog.entry.name })} initial={dialog.entry.name} action="Rename" onClose={() => setDialog(null)} onDone={async (name) => { await dav.move(dialog.entry.path, [dialog.entry.path.split('/').slice(0, -1).join('/'), name].filter(Boolean).join('/')); await load(); }} />}
            {dialog?.kind === 'move' && <FolderDialog title={dialog.entries.length === 1 ? t(dialog.copy ? 'Copy {name}' : 'Move {name}', { name: dialog.entries[0].name }) : t(dialog.copy ? 'Copy {n} items' : 'Move {n} items', { n: dialog.entries.length })} action={dialog.copy ? t('Copy') : t('Move')} onClose={() => setDialog(null)} onPick={async (target) => {
                for (const entry of dialog.entries) await dav.move(entry.path, [target, entry.name].filter(Boolean).join('/'), dialog.copy);
                toast(t(dialog.copy ? 'Copied to {name}.' : 'Moved to {name}.', { name: target.split('/').pop() || t('Files') }));
                setSelected(new Set());
                await load();
            }} />}
            {dialog?.kind === 'share' && <ShareDialog entry={dialog.entry} onClose={() => setDialog(null)} onChanged={() => void load()} />}
            {dialog?.kind === 'versions' && <VersionsDialog entry={dialog.entry} onClose={() => setDialog(null)} onRestored={() => void load()} />}
            {dialog?.kind === 'tags' && <TagsDialog entry={dialog.entry} onClose={() => setDialog(null)} />}
            {viewing !== null && files[viewing] && <Viewer items={files} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} onShare={(entry) => setDialog({ kind: 'share', entry })} onChanged={() => void load()} />}
        </div>
    );
}

const EMPTY: Record<View, string> = {
    folder: t('This folder is empty. Drop files here to upload them.'), recent: t('Nothing changed in the last month.'), favorites: t('Star files and folders to find them here.'),
    'with-you': t('Nobody has shared anything with you yet.'), 'by-you': t('You have not shared anything yet.'),
};

function Thumb({ entry, size }: { entry: Entry; size: number }) {
    const kind = kindOf(entry.mime, entry.name);
    const [broken, setBroken] = useState(false);
    if ((entry.preview || kind === 'image') && !broken && entry.id) return <img className="cloud-thumb" src={dav.previewUrl(entry, size)} alt="" loading="lazy" onError={() => setBroken(true)} />;
    return <i className={`bx ${ICONS[kind]} cloud-icon--${kind}`} aria-hidden="true" />;
}

function SharedMark({ entry }: { entry: Entry }) {
    if (!entry.shared.length) return null;
    return <i className={`bx ${entry.shared.includes(3) ? 'bx-link' : 'bx-share-alt'} cloud-shared-mark`} title={entry.shared.includes(3) ? t('Shared by link') : t('Shared')} aria-label={t('Shared')} />;
}

function Row({ entry, view, selected, onOpen, onSelect, onDropInto, onUploadInto, menu }: {
    entry: Entry; view: View; selected: boolean; onOpen: () => void; onSelect: (on: boolean) => void;
    onDropInto: (from: string) => void; onUploadInto: (files: { file: File; relative: string }[]) => void; menu: ReactNode;
}) {
    const [over, setOver] = useState(false);
    return (
        <tr className={`${selected ? 'is-selected' : ''}${over ? ' is-drop' : ''}`}
            draggable={view === 'folder'} onDragStart={(event) => { event.dataTransfer.setData('text/cloud-path', entry.path); event.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(event) => { if (entry.folder) { event.preventDefault(); event.stopPropagation(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={async (event) => {
                if (!entry.folder) return;
                event.preventDefault(); event.stopPropagation(); setOver(false);
                const from = event.dataTransfer.getData('text/cloud-path');
                if (from && from !== entry.path) onDropInto(from);
                else if (event.dataTransfer.types.includes('Files')) onUploadInto(await droppedFiles(event.dataTransfer));
            }}>
            <td className="cloud-col-check"><input type="checkbox" checked={selected} aria-label={t('Select {name}', { name: entry.name })} onChange={(event) => onSelect(event.target.checked)} /></td>
            <td>
                <button type="button" className="cloud-name" onClick={onOpen}>
                    <span className="cloud-name__icon"><Thumb entry={entry} size={64} /></span>
                    <span className="cloud-name__text"><span className="cloud-name__title">{entry.name}</span>{view === 'with-you' && <span className="cloud-name__where"><i className="bx bx-link" /> {' '}{t('Shared by')}{' '}{entry.owner}</span>}{view !== 'folder' && view !== 'with-you' && entry.path.includes('/') && <span className="cloud-name__where">{entry.path.split('/').slice(0, -1).join('/')}</span>}</span>
                    {entry.favorite && <i className="bx bxs-star cloud-star" aria-label={t('Favorite')} />}
                    <SharedMark entry={entry} />
                </button>
            </td>
            {view === 'with-you' && <td className="cloud-col-meta ps-muted">{entry.owner}</td>}
            <td className="cloud-col-size ps-muted">{view === 'with-you' || view === 'by-you' ? '' : formatBytes(entry.size)}</td>
            <td className="cloud-col-date ps-muted" title={new Date(entry.modified).toLocaleString(locale)}>{relativeTime(new Date(entry.modified).toISOString())}</td>
            <td className="cloud-col-actions">{menu}</td>
        </tr>
    );
}

function Tile({ entry, selected, onOpen, onSelect, menu }: { entry: Entry; selected: boolean; onOpen: () => void; onSelect: (on: boolean) => void; menu: ReactNode }) {
    return (
        <div className={`cloud-tile${selected ? ' is-selected' : ''}`}>
            <button type="button" className="cloud-tile__open" onClick={onOpen} aria-label={entry.name}><span className="cloud-tile__thumb"><Thumb entry={entry} size={256} /></span></button>
            <input type="checkbox" className="cloud-tile__check" checked={selected} aria-label={t('Select {name}', { name: entry.name })} onChange={(event) => onSelect(event.target.checked)} />
            <div className="cloud-tile__foot"><span className="cloud-tile__name" title={entry.name}>{entry.name}</span>{entry.favorite && <i className="bx bxs-star cloud-star" />}<SharedMark entry={entry} />{menu}</div>
        </div>
    );
}

function ItemMenu({ entry, view, onFavorite, onDialog, onDelete }: { entry: Entry; view: View; onFavorite: () => void; onDialog: (dialog: Dialog) => void; onDelete: () => void }) {
    const [open, setOpen] = useState(false);
    const [place, setPlace] = useState<CSSProperties>({ top: 'auto', right: 'auto', bottom: 'auto', left: 8 });
    const ref = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const mine = view !== 'with-you';
    // The menu floats over everything, below the button or above it near the bottom of the screen.
    const toggle = (button: HTMLElement) => {
        const box = button.getBoundingClientRect();
        const width = Math.min(240, window.innerWidth - 16);
        const left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8));
        setPlace(box.bottom > window.innerHeight - 380 ? { top: 'auto', right: 'auto', bottom: window.innerHeight - box.top + 4, left } : { top: box.bottom + 4, right: 'auto', bottom: 'auto', left });
        setOpen((value) => !value);
    };
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        const outside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) close();
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [open]);
    const act = (fn: () => void) => () => { setOpen(false); fn(); };
    const where = entry.path.split('/').slice(0, -1).join('/');
    return (
        <div className={`ps-dropdown cloud-menu${open ? ' is-open' : ''}`} ref={ref}>
            <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-btn--sm" aria-label={t('Actions for {name}', { name: entry.name })} aria-expanded={open} onClick={(event) => { event.stopPropagation(); toggle(event.currentTarget); }}><i className="bx bx-dots-horizontal-rounded" /></button>
            {open && createPortal(<div ref={panelRef} className="ps-dropdown__menu cloud-menu__panel" style={place}>
                {view !== 'folder' && <button type="button" className="ps-dropdown__item" onClick={act(() => navigate(fileRoute(where, entry.folder ? undefined : entry.name)))}><i className="bx bx-folder-open" />{t('Show in its folder')}</button>}
                {entry.folder
                    ? <a className="ps-dropdown__item" href={dav.zipUrl(entry.path)} onClick={() => setOpen(false)}><i className="bx bx-download" />{t('Download as zip')}</a>
                    : <a className="ps-dropdown__item" href={dav.fileUrl(entry.path)} download={entry.name} onClick={() => setOpen(false)}><i className="bx bx-download" />{t('Download')}</a>}
                <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'share', entry }))}><i className="bx bx-share-alt" />{t('Share')}</button>
                <button type="button" className="ps-dropdown__item" onClick={act(onFavorite)}><i className={`bx ${entry.favorite ? 'bxs-star' : 'bx-star'}`} />{entry.favorite ? t('Remove from favorites') : t('Add to favorites')}</button>
                {mine && <>
                    <div className="ps-dropdown__sep" />
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'rename', entry }))}><i className="bx bx-rename" />{t('Rename')}</button>
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'move', entries: [entry], copy: false }))}><i className="bx bx-move" />{t('Move')}</button>
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'move', entries: [entry], copy: true }))}><i className="bx bx-copy" />{t('Copy')}</button>
                </>}
                {!entry.folder && <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'versions', entry }))}><i className="bx bx-history" />{t('Versions')}</button>}
                <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'tags', entry }))}><i className="bx bx-purchase-tag" />{t('Tags')}</button>
                {mine && <><div className="ps-dropdown__sep" /><button type="button" className="ps-dropdown__item cloud-danger" onClick={act(onDelete)}><i className="bx bx-trash" />{t('Delete')}</button></>}
            </div>, document.body)}
        </div>
    );
}

/** Deleted files, until they are restored or the trash empties itself. */
export function Trash() {
    const [items, setItems] = useState<dav.TrashItem[] | null>(null);
    const load = () => dav.trash().then(setItems).catch((error) => { failed(error); setItems([]); });
    useEffect(() => { void load(); }, []);
    return (
        <div>
            <PageHead title={t('Trash')} text={t('Deleted files stay here for a while, then go for good.')} actions={items && items.length > 0 ? <Button variant="danger" icon="bx-trash" onClick={async () => { if (!window.confirm(t('Delete everything in the trash for good?'))) return; try { await dav.emptyTrash(); toast(t('Trash emptied.')); void load(); } catch (error) { failed(error); } }}>{t('Empty trash')}</Button> : undefined} />
            <Frame flush>
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : items.length === 0 ? <Empty icon="bx-trash">{t('The trash is empty.')}</Empty> : (
                    <table className="ps-table cloud-table">
                        <thead><tr><th>{t('Name')}</th><th className="cloud-col-meta">{t('Was in')}</th><th className="cloud-col-date">{t('Deleted')}</th><th className="cloud-col-actions" aria-label={t('Actions')} /></tr></thead>
                        <tbody>{items.map((item) => (
                            <tr key={item.href}>
                                <td><span className="cloud-name"><span className="cloud-name__icon"><i className={`bx ${ICONS[kindOf(item.mime, item.name)]} cloud-icon--${kindOf(item.mime, item.name)}`} /></span><span className="cloud-name__text">{item.name}</span></span></td>
                                <td className="cloud-col-meta ps-muted">{item.original.split('/').slice(0, -1).join('/') || t('Files')}</td>
                                <td className="cloud-col-date ps-muted">{relativeTime(new Date(item.deleted).toISOString())}</td>
                                <td className="cloud-col-actions cloud-row-actions">
                                    <Button size="sm" onClick={async () => { try { await dav.restore(item); toast(t('{name} is back.', { name: item.name })); void load(); } catch (error) { failed(error); } }}>{t('Restore')}</Button>
                                    <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Delete for good')} onClick={async () => { if (!window.confirm(t('Delete {name} for good?', { name: item.name }))) return; try { await dav.deleteForever(item); void load(); } catch (error) { failed(error); } }} />
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </Frame>
        </div>
    );
}

