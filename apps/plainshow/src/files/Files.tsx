import { DragEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as dav from '../api/dav';
import { Entry } from '../api/dav';
import { formatBytes } from '../api/http';
import { Share, sharedByMe, sharedWithMe } from '../api/shares';
import { Link, navigate } from '../router';
import { PageHead, useOutside } from '../Shell';
import { failed, toast } from '../toast';
import { Button, Empty, Frame, relativeTime } from '../ui';
import { FolderDialog, NameDialog, ShareDialog, TagsDialog, VersionsDialog } from './dialogs';
import { ICONS, kindOf } from './kinds';
import { UploadPanel, droppedFiles, onUploaded, queueUploads } from './uploads';
import Viewer from './Viewer';

type View = 'folder' | 'recent' | 'favorites' | 'with-you' | 'by-you';
type Sort = { by: 'name' | 'modified' | 'size'; down: boolean };
type Dialog =
    | { kind: 'new-folder' } | { kind: 'rename'; entry: Entry } | { kind: 'move'; entries: Entry[]; copy: boolean }
    | { kind: 'share'; entry: Entry } | { kind: 'versions'; entry: Entry } | { kind: 'tags'; entry: Entry } | null;

const TITLES: Record<View, string> = { folder: 'Files', recent: 'Recent', favorites: 'Favorites', 'with-you': 'Shared with you', 'by-you': 'Shared by you' };
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
            setError(problem instanceof Error ? problem.message : 'Could not load this.');
        }
    }, [view, path]);

    useEffect(() => { setItems(null); setSelected(new Set()); setFilter(''); setViewing(null); void load(); }, [load]);
    useEffect(() => onUploaded((into) => { if (view === 'folder' && into === path) void load(); }), [view, path, load]);
    useEffect(() => { const open = new URLSearchParams(window.location.search).get('open'); if (open && items) { const at = sorted.findIndex((item) => item.name === open); if (at >= 0) setViewing(at); } }, [items]);

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
        if (entry.folder) { navigate('/files/' + entry.path); return; }
        setViewing(files.indexOf(entry));
    };
    const toggleSort = (by: Sort['by']) => { const next = { by, down: sort.by === by ? !sort.down : by !== 'name' }; setSort(next); store.set('cloud-sort', JSON.stringify(next)); };
    const setView = (next: string) => { setLayout(next); store.set('cloud-layout', next); };

    const removeMany = async (entries: Entry[]) => {
        if (!entries.length) return;
        try {
            for (const entry of entries) await dav.remove(entry.path);
            toast(entries.length === 1 ? `${entries[0].name} is in the trash.` : `${entries.length} items are in the trash.`);
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
        if (!canWrite || view !== 'folder') { toast('Open a folder of yours to upload into it.', 'error'); return; }
        if (!event.dataTransfer.types.includes('Files')) return;
        queueUploads(path, await droppedFiles(event.dataTransfer));
    };

    const crumbs = path.split('/').filter(Boolean);
    const title = view === 'folder' ? (crumbs.length ? crumbs[crumbs.length - 1] : 'Files') : TITLES[view];

    return (
        <div className={`cloud-files${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => { if (view === 'folder' && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={onDrop}>
            <PageHead title={title} actions={view === 'folder' && canWrite ? <>
                <Button icon="bx-folder-plus" onClick={() => setDialog({ kind: 'new-folder' })}>New folder</Button>
                <Button variant="primary" icon="bx-upload" onClick={() => picker.current?.click()}>Upload</Button>
            </> : undefined} />
            <input ref={picker} type="file" multiple hidden onChange={(event) => { queueUploads(path, Array.from(event.target.files ?? []).map((file) => ({ file }))); event.target.value = ''; }} />
            <input ref={folderPicker} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(event) => { queueUploads(path, Array.from(event.target.files ?? []).map((file) => ({ file, relative: (file as File & { webkitRelativePath: string }).webkitRelativePath }))); event.target.value = ''; }} />

            <div className="cloud-toolbar">
                {view === 'folder' ? (
                    <nav className="cloud-crumbs" aria-label="Folders">
                        <Link to="/" className="cloud-crumbs__item"><i className="bx bx-home-alt" />Files</Link>
                        {crumbs.map((part, index) => (
                            <Link key={index} to={'/files/' + crumbs.slice(0, index + 1).join('/')} className="cloud-crumbs__item"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={async (event) => { event.preventDefault(); event.stopPropagation(); const from = event.dataTransfer.getData('text/cloud-path'); if (from) { try { await dav.move(from, crumbs.slice(0, index + 1).join('/') + '/' + from.split('/').pop()); void load(); } catch (problem) { failed(problem); } } }}>
                                <i className="bx bx-chevron-right" />{part}
                            </Link>
                        ))}
                    </nav>
                ) : <span className="cloud-toolbar__spacer" />}
                <input className="ps-input cloud-filter" placeholder="Filter" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by name" />
                <div className="cloud-segment" role="group" aria-label="Layout">
                    <button type="button" className={layout === 'list' ? 'is-active' : ''} aria-label="List" onClick={() => setView('list')}><i className="bx bx-list-ul" /></button>
                    <button type="button" className={layout === 'grid' ? 'is-active' : ''} aria-label="Grid" onClick={() => setView('grid')}><i className="bx bx-grid-alt" /></button>
                </div>
            </div>

            {chosen.length > 0 && (
                <div className="cloud-selection">
                    <strong>{chosen.length} selected</strong>
                    <a className="ps-btn ps-btn--sm" href={dav.zipUrl(view === 'folder' ? path : '', chosen.map((entry) => entry.name))} download><i className="bx bx-download" />Download</a>
                    {view === 'folder' && <>
                        <Button size="sm" icon="bx-move" onClick={() => setDialog({ kind: 'move', entries: chosen, copy: false })}>Move</Button>
                        <Button size="sm" icon="bx-copy" onClick={() => setDialog({ kind: 'move', entries: chosen, copy: true })}>Copy</Button>
                        <Button size="sm" variant="danger" icon="bx-trash" onClick={() => removeMany(chosen)}>Delete</Button>
                    </>}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                </div>
            )}

            <Frame flush className="cloud-files__frame">
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div>
                    : error ? <Empty icon="bx-error-circle">{error}</Empty>
                    : sorted.length === 0 ? <Empty icon={view === 'folder' ? 'bx-folder-open' : 'bx-ghost'}>{filter ? 'Nothing matches.' : EMPTY[view]}{view === 'folder' && canWrite && !filter && <div className="cloud-empty-actions"><Button size="sm" onClick={() => picker.current?.click()}>Upload files</Button><Button size="sm" variant="ghost" onClick={() => folderPicker.current?.click()}>Upload a folder</Button></div>}</Empty>
                    : layout === 'grid'
                        ? <div className="cloud-grid">{sorted.map((entry) => <Tile key={entry.path} entry={entry} selected={selected.has(entry.path)} onOpen={() => open(entry)} onSelect={(on) => setSelected((current) => { const next = new Set(current); if (on) next.add(entry.path); else next.delete(entry.path); return next; })} menu={<ItemMenu entry={entry} view={view} onFavorite={() => favorite(entry)} onDialog={setDialog} onDelete={() => removeMany([entry])} />} />)}</div>
                        : <table className="ps-table cloud-table">
                            <thead><tr>
                                <th className="cloud-col-check"><input type="checkbox" aria-label="Select all" checked={chosen.length === sorted.length} onChange={(event) => setSelected(event.target.checked ? new Set(sorted.map((item) => item.path)) : new Set())} /></th>
                                <th><button type="button" className="cloud-sort" onClick={() => toggleSort('name')}>Name{sort.by === 'name' && <i className={`bx ${sort.down ? 'bx-chevron-up' : 'bx-chevron-down'}`} />}</button></th>
                                {view === 'with-you' && <th className="cloud-col-meta">Shared by</th>}
                                <th className="cloud-col-size"><button type="button" className="cloud-sort" onClick={() => toggleSort('size')}>Size{sort.by === 'size' && <i className={`bx ${sort.down ? 'bx-chevron-down' : 'bx-chevron-up'}`} />}</button></th>
                                <th className="cloud-col-date"><button type="button" className="cloud-sort" onClick={() => toggleSort('modified')}>{view === 'with-you' || view === 'by-you' ? 'Shared' : 'Changed'}{sort.by === 'modified' && <i className={`bx ${sort.down ? 'bx-chevron-down' : 'bx-chevron-up'}`} />}</button></th>
                                <th className="cloud-col-actions" aria-label="Actions" />
                            </tr></thead>
                            <tbody>{sorted.map((entry) => (
                                <Row key={entry.path} entry={entry} view={view} selected={selected.has(entry.path)} onOpen={() => open(entry)}
                                    onSelect={(on) => setSelected((current) => { const next = new Set(current); if (on) next.add(entry.path); else next.delete(entry.path); return next; })}
                                    onDropInto={async (from) => { try { await dav.move(from, entry.path + '/' + from.split('/').pop()); toast(`Moved into ${entry.name}.`); void load(); } catch (problem) { failed(problem); } }}
                                    onUploadInto={(dropped) => queueUploads(entry.path, dropped)}
                                    menu={<ItemMenu entry={entry} view={view} onFavorite={() => favorite(entry)} onDialog={setDialog} onDelete={() => removeMany([entry])} />} />
                            ))}</tbody>
                        </table>}
            </Frame>
            {view === 'folder' && sorted.length > 0 && <p className="cloud-summary ps-small ps-muted">{sorted.filter((item) => item.folder).length} folders, {files.length} files, {formatBytes(sorted.reduce((sum, item) => sum + item.size, 0))}</p>}

            {dragging && <div className="cloud-dropzone"><i className="bx bx-cloud-upload" />Drop to upload into {title}</div>}
            <UploadPanel />

            {dialog?.kind === 'new-folder' && <NameDialog title="New folder" initial="New folder" action="Create" onClose={() => setDialog(null)} onDone={async (name) => { await dav.mkdir([path, name].filter(Boolean).join('/')); await load(); }} />}
            {dialog?.kind === 'rename' && <NameDialog title={`Rename ${dialog.entry.name}`} initial={dialog.entry.name} action="Rename" onClose={() => setDialog(null)} onDone={async (name) => { await dav.move(dialog.entry.path, [dialog.entry.path.split('/').slice(0, -1).join('/'), name].filter(Boolean).join('/')); await load(); }} />}
            {dialog?.kind === 'move' && <FolderDialog title={`${dialog.copy ? 'Copy' : 'Move'} ${dialog.entries.length === 1 ? dialog.entries[0].name : `${dialog.entries.length} items`}`} action={dialog.copy ? 'Copy' : 'Move'} onClose={() => setDialog(null)} onPick={async (target) => {
                for (const entry of dialog.entries) await dav.move(entry.path, [target, entry.name].filter(Boolean).join('/'), dialog.copy);
                toast(`${dialog.copy ? 'Copied' : 'Moved'} to ${target.split('/').pop() || 'Files'}.`);
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
    folder: 'This folder is empty. Drop files here to upload them.', recent: 'Nothing changed in the last month.', favorites: 'Star files and folders to find them here.',
    'with-you': 'Nobody has shared anything with you yet.', 'by-you': 'You have not shared anything yet.',
};

function Thumb({ entry, size }: { entry: Entry; size: number }) {
    const kind = kindOf(entry.mime, entry.name);
    const [broken, setBroken] = useState(false);
    if ((entry.preview || kind === 'image') && !broken && entry.id) return <img className="cloud-thumb" src={dav.previewUrl(entry, size)} alt="" loading="lazy" onError={() => setBroken(true)} />;
    return <i className={`bx ${ICONS[kind]} cloud-icon--${kind}`} aria-hidden="true" />;
}

function SharedMark({ entry }: { entry: Entry }) {
    if (!entry.shared.length) return null;
    return <i className={`bx ${entry.shared.includes(3) ? 'bx-link' : 'bx-share-alt'} cloud-shared-mark`} title={entry.shared.includes(3) ? 'Shared by link' : 'Shared'} aria-label="Shared" />;
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
            <td className="cloud-col-check"><input type="checkbox" checked={selected} aria-label={`Select ${entry.name}`} onChange={(event) => onSelect(event.target.checked)} /></td>
            <td>
                <button type="button" className="cloud-name" onClick={onOpen}>
                    <span className="cloud-name__icon"><Thumb entry={entry} size={64} /></span>
                    <span className="cloud-name__text">{entry.name}{view !== 'folder' && entry.path.includes('/') && <span className="cloud-name__where">{entry.path.split('/').slice(0, -1).join('/')}</span>}</span>
                    {entry.favorite && <i className="bx bxs-star cloud-star" aria-label="Favorite" />}
                    <SharedMark entry={entry} />
                </button>
            </td>
            {view === 'with-you' && <td className="cloud-col-meta ps-muted">{entry.owner}</td>}
            <td className="cloud-col-size ps-muted">{view === 'with-you' || view === 'by-you' ? '' : formatBytes(entry.size)}</td>
            <td className="cloud-col-date ps-muted" title={new Date(entry.modified).toLocaleString('sv-SE')}>{relativeTime(new Date(entry.modified).toISOString())}</td>
            <td className="cloud-col-actions">{menu}</td>
        </tr>
    );
}

function Tile({ entry, selected, onOpen, onSelect, menu }: { entry: Entry; selected: boolean; onOpen: () => void; onSelect: (on: boolean) => void; menu: ReactNode }) {
    return (
        <div className={`cloud-tile${selected ? ' is-selected' : ''}`}>
            <button type="button" className="cloud-tile__open" onClick={onOpen} aria-label={entry.name}><span className="cloud-tile__thumb"><Thumb entry={entry} size={256} /></span></button>
            <input type="checkbox" className="cloud-tile__check" checked={selected} aria-label={`Select ${entry.name}`} onChange={(event) => onSelect(event.target.checked)} />
            <div className="cloud-tile__foot"><span className="cloud-tile__name" title={entry.name}>{entry.name}</span>{entry.favorite && <i className="bx bxs-star cloud-star" />}<SharedMark entry={entry} />{menu}</div>
        </div>
    );
}

function ItemMenu({ entry, view, onFavorite, onDialog, onDelete }: { entry: Entry; view: View; onFavorite: () => void; onDialog: (dialog: Dialog) => void; onDelete: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useOutside(open, () => setOpen(false));
    const mine = view !== 'with-you';
    const act = (fn: () => void) => () => { setOpen(false); fn(); };
    const where = entry.path.split('/').slice(0, -1).join('/');
    return (
        <div className={`ps-dropdown cloud-menu${open ? ' is-open' : ''}`} ref={ref}>
            <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-btn--sm" aria-label={`Actions for ${entry.name}`} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}><i className="bx bx-dots-horizontal-rounded" /></button>
            {open && <div className="ps-dropdown__menu cloud-menu__panel">
                {view !== 'folder' && <button type="button" className="ps-dropdown__item" onClick={act(() => navigate('/files/' + where + (entry.folder ? '' : '?open=' + encodeURIComponent(entry.name))))}><i className="bx bx-folder-open" />Show in its folder</button>}
                {entry.folder
                    ? <a className="ps-dropdown__item" href={dav.zipUrl(entry.path)} onClick={() => setOpen(false)}><i className="bx bx-download" />Download as zip</a>
                    : <a className="ps-dropdown__item" href={dav.fileUrl(entry.path)} download={entry.name} onClick={() => setOpen(false)}><i className="bx bx-download" />Download</a>}
                <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'share', entry }))}><i className="bx bx-share-alt" />Share</button>
                <button type="button" className="ps-dropdown__item" onClick={act(onFavorite)}><i className={`bx ${entry.favorite ? 'bxs-star' : 'bx-star'}`} />{entry.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
                {mine && <>
                    <div className="ps-dropdown__sep" />
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'rename', entry }))}><i className="bx bx-rename" />Rename</button>
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'move', entries: [entry], copy: false }))}><i className="bx bx-move" />Move</button>
                    <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'move', entries: [entry], copy: true }))}><i className="bx bx-copy" />Copy</button>
                </>}
                {!entry.folder && <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'versions', entry }))}><i className="bx bx-history" />Versions</button>}
                <button type="button" className="ps-dropdown__item" onClick={act(() => onDialog({ kind: 'tags', entry }))}><i className="bx bx-purchase-tag" />Tags</button>
                {mine && <><div className="ps-dropdown__sep" /><button type="button" className="ps-dropdown__item cloud-danger" onClick={act(onDelete)}><i className="bx bx-trash" />Delete</button></>}
            </div>}
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
            <PageHead title="Trash" text="Deleted files stay here for a while, then go for good." actions={items && items.length > 0 ? <Button variant="danger" icon="bx-trash" onClick={async () => { if (!window.confirm('Delete everything in the trash for good?')) return; try { await dav.emptyTrash(); toast('Trash emptied.'); void load(); } catch (error) { failed(error); } }}>Empty trash</Button> : undefined} />
            <Frame flush>
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : items.length === 0 ? <Empty icon="bx-trash">The trash is empty.</Empty> : (
                    <table className="ps-table cloud-table">
                        <thead><tr><th>Name</th><th className="cloud-col-meta">Was in</th><th className="cloud-col-date">Deleted</th><th className="cloud-col-actions" aria-label="Actions" /></tr></thead>
                        <tbody>{items.map((item) => (
                            <tr key={item.href}>
                                <td><span className="cloud-name"><span className="cloud-name__icon"><i className={`bx ${ICONS[kindOf(item.mime, item.name)]} cloud-icon--${kindOf(item.mime, item.name)}`} /></span><span className="cloud-name__text">{item.name}</span></span></td>
                                <td className="cloud-col-meta ps-muted">{item.original.split('/').slice(0, -1).join('/') || 'Files'}</td>
                                <td className="cloud-col-date ps-muted">{relativeTime(new Date(item.deleted).toISOString())}</td>
                                <td className="cloud-col-actions cloud-row-actions">
                                    <Button size="sm" onClick={async () => { try { await dav.restore(item); toast(`${item.name} is back.`); void load(); } catch (error) { failed(error); } }}>Restore</Button>
                                    <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label="Delete for good" onClick={async () => { if (!window.confirm(`Delete ${item.name} for good?`)) return; try { await dav.deleteForever(item); void load(); } catch (error) { failed(error); } }} />
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </Frame>
        </div>
    );
}

