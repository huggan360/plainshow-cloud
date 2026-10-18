import { FormEvent, useEffect, useState } from 'react';
import { Entry, Tag, Version, addTag, allTags, list, removeTag, restoreVersion, tagsOf, versions } from '../api/dav';
import { formatBytes } from '../api/http';
import { PERMISSION, Share, Sharee, findPeople, shareLink, shareWith, sharesOf, unshare, updateShare } from '../api/shares';
import { failed, toast } from '../toast';
import { Badge, Button, Empty, Field, Modal, Switch, relativeTime } from '../ui';

/** Ask for a name (new folder, rename). */
export function NameDialog({ title, initial, action, onClose, onDone }: { title: string; initial: string; action: string; onClose: () => void; onDone: (name: string) => Promise<void> }) {
    const [name, setName] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const clean = name.trim();
        if (!clean || clean.includes('/')) { setError('A name cannot be empty or contain /.'); return; }
        setBusy(true);
        try { await onDone(clean); onClose(); } catch (problem) { setError(problem instanceof Error ? problem.message : 'That did not work.'); } finally { setBusy(false); }
    };
    return (
        <Modal open title={title} size="sm" onClose={onClose}>
            <form onSubmit={submit} className="ps-stack">
                <Field label="Name" error={error}>
                    <input className="ps-input" value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => { const dot = event.target.value.lastIndexOf('.'); event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length); }} autoFocus />
                </Field>
                <div className="cloud-dialog-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" loading={busy}>{action}</Button></div>
            </form>
        </Modal>
    );
}

/** Pick a folder to move or copy into. */
export function FolderDialog({ title, action, onClose, onPick }: { title: string; action: string; onClose: () => void; onPick: (folder: string) => Promise<void> }) {
    const [path, setPath] = useState('');
    const [folders, setFolders] = useState<Entry[] | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setFolders(null);
        list(path).then(({ items }) => setFolders(items.filter((item) => item.folder).sort((a, b) => a.name.localeCompare(b.name)))).catch((error) => { failed(error); setFolders([]); });
    }, [path]);
    const parts = path.split('/').filter(Boolean);
    return (
        <Modal open title={title} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { await onPick(path); onClose(); } catch (error) { failed(error); } finally { setBusy(false); } }}>{action} to {parts.length ? parts[parts.length - 1] : 'Files'}</Button></>}>
            <nav className="cloud-crumbs cloud-crumbs--small">
                <button type="button" onClick={() => setPath('')}><i className="bx bx-home-alt" />Files</button>
                {parts.map((part, index) => <button key={index} type="button" onClick={() => setPath(parts.slice(0, index + 1).join('/'))}><i className="bx bx-chevron-right" />{part}</button>)}
            </nav>
            <ul className="ps-chain cloud-picker">
                {folders === null && <li className="ps-row"><span className="ps-loader" /></li>}
                {folders?.length === 0 && <li className="ps-row ps-muted">No folders here.</li>}
                {folders?.map((folder) => (
                    <li key={folder.path}><button type="button" className="ps-row cloud-picker__row" onClick={() => setPath(folder.path)}>
                        <span className="ps-row__icon"><i className="bx bxs-folder cloud-icon--folder" /></span><span className="ps-row__body"><span className="ps-row__title">{folder.name}</span></span><i className="bx bx-chevron-right" />
                    </button></li>
                ))}
            </ul>
        </Modal>
    );
}

function permissionsLabel(share: Share): string {
    return share.permissions & (PERMISSION.update | PERMISSION.create | PERMISSION.delete) ? 'Can edit' : 'Can view';
}

/** Share with people who have Cloud, or by a public link with a password and an end date. */
export function ShareDialog({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
    const [shares, setShares] = useState<Share[] | null>(null);
    const [search, setSearch] = useState('');
    const [found, setFound] = useState<Sharee[]>([]);
    const [edit, setEdit] = useState(false);
    const canShare = entry.permissions.includes('R');
    const load = () => sharesOf(entry.path).then(setShares).catch((error) => { failed(error); setShares([]); });
    useEffect(() => { void load(); }, [entry.path]);
    useEffect(() => {
        if (search.trim().length < 1) { setFound([]); return; }
        const timer = window.setTimeout(() => findPeople(search.trim(), entry.folder ? 'folder' : 'file').then(setFound).catch(() => setFound([])), 250);
        return () => window.clearTimeout(timer);
    }, [search, entry]);

    const write = entry.folder ? PERMISSION.read | PERMISSION.update | PERMISSION.create | PERMISSION.delete : PERMISSION.read | PERMISSION.update;
    const add = async (sharee: Sharee) => {
        try {
            await shareWith(entry.path, sharee.value.shareWith, edit ? write : PERMISSION.read, sharee.value.shareType);
            setSearch(''); setFound([]); await load(); onChanged();
            toast(`Shared with ${sharee.label}.`);
        } catch (error) { failed(error); }
    };
    const people = (shares ?? []).filter((share) => share.share_type === 0 || share.share_type === 1);
    const links = (shares ?? []).filter((share) => share.share_type === 3);

    return (
        <Modal open title={`Share ${entry.name}`} onClose={onClose}>
            {!canShare && <p className="ps-muted">You cannot share this; it was shared with you without permission to share it on.</p>}
            {canShare && <div className="ps-stack">
                <div className="cloud-share-add">
                    <input className="ps-input" placeholder="Name of someone with Cloud" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Share with" />
                    <label className="cloud-inline-switch"><Switch checked={edit} onChange={setEdit} label="Can edit" />Can edit</label>
                </div>
                {found.length > 0 && <ul className="ps-chain">{found.map((sharee) => (
                    <li key={sharee.value.shareType + sharee.value.shareWith}><button type="button" className="ps-row cloud-picker__row" onClick={() => add(sharee)}>
                        <span className="ps-row__icon"><i className={`bx ${sharee.value.shareType === 1 ? 'bx-group' : 'bx-user'}`} /></span>
                        <span className="ps-row__body"><span className="ps-row__title">{sharee.label}</span>{sharee.shareWithDisplayNameUnique && <span className="ps-row__meta">{sharee.shareWithDisplayNameUnique}</span>}</span>
                        <i className="bx bx-plus" />
                    </button></li>
                ))}</ul>}

                <h3 className="cloud-subhead">People</h3>
                {shares === null ? <span className="ps-loader" /> : people.length === 0 ? <p className="ps-muted ps-small">Not shared with anyone yet.</p> : (
                    <ul className="ps-chain">{people.map((share) => (
                        <li key={share.id} className="ps-row">
                            <span className="ps-row__icon"><i className={`bx ${share.share_type === 1 ? 'bx-group' : 'bx-user'}`} /></span>
                            <span className="ps-row__body"><span className="ps-row__title">{share.share_with_displayname || share.share_with}</span><span className="ps-row__meta">{permissionsLabel(share)}</span></span>
                            <span className="ps-row__action cloud-row-actions">
                                <Button size="sm" variant="ghost" onClick={async () => { try { await updateShare(share.id, { permissions: permissionsLabel(share) === 'Can edit' ? PERMISSION.read : write }); await load(); } catch (error) { failed(error); } }}>{permissionsLabel(share) === 'Can edit' ? 'Make view only' : 'Allow editing'}</Button>
                                <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label="Stop sharing" onClick={async () => { try { await unshare(share.id); await load(); onChanged(); } catch (error) { failed(error); } }} />
                            </span>
                        </li>
                    ))}</ul>
                )}

                <h3 className="cloud-subhead">Public links</h3>
                {links.map((share) => <LinkRow key={share.id} share={share} folder={entry.folder} reload={load} onChanged={onChanged} />)}
                <div><Button size="sm" icon="bx-link" onClick={async () => { try { const share = await shareLink(entry.path); await load(); onChanged(); if (share.url) { await navigator.clipboard?.writeText(share.url).catch(() => undefined); toast('Link made and copied.'); } } catch (error) { failed(error); } }}>New public link</Button></div>
            </div>}
        </Modal>
    );
}

function LinkRow({ share, folder, reload, onChanged }: { share: Share; folder: boolean; reload: () => Promise<void>; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [expires, setExpires] = useState(share.expiration ? share.expiration.slice(0, 10) : '');
    const upload = (share.permissions & PERMISSION.create) !== 0;
    const save = async (changes: Parameters<typeof updateShare>[1], message: string) => {
        try { await updateShare(share.id, changes); await reload(); toast(message); } catch (error) { failed(error); }
    };
    return (
        <div className="cloud-link">
            <div className="ps-row">
                <span className="ps-row__icon"><i className="bx bx-link" /></span>
                <span className="ps-row__body">
                    <span className="ps-row__title">{share.label || 'Public link'} {share.password && <Badge>Password</Badge>} {share.expiration && <Badge tone="amber">Until {share.expiration.slice(0, 10)}</Badge>} {upload && <Badge tone="green">Upload</Badge>}</span>
                    <span className="ps-row__meta ps-mono">{share.url}</span>
                </span>
                <span className="ps-row__action cloud-row-actions">
                    <Button size="sm" variant="ghost" iconOnly icon="bx-copy" aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(share.url || '').then(() => toast('Link copied.'))} />
                    <Button size="sm" variant="ghost" iconOnly icon="bx-cog" aria-label="Link settings" onClick={() => setOpen((value) => !value)} />
                    <Button size="sm" variant="ghost" iconOnly icon="bx-trash" aria-label="Delete link" onClick={async () => { try { await unshare(share.id); await reload(); onChanged(); } catch (error) { failed(error); } }} />
                </span>
            </div>
            {open && <div className="cloud-link__settings">
                <Field label="Password" help={share.password ? 'This link has a password. Set a new one to change it.' : 'Anyone with the link needs it.'}>
                    <div className="cloud-inline"><input className="ps-input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><Button size="sm" disabled={!password} onClick={() => save({ password }, 'Password set.').then(() => setPassword(''))}>Set</Button>{share.password && <Button size="sm" variant="ghost" onClick={() => save({ password: '' }, 'Password removed.')}>Remove</Button>}</div>
                </Field>
                <Field label="Works until">
                    <div className="cloud-inline"><input className="ps-input" type="date" value={expires} onChange={(event) => setExpires(event.target.value)} /><Button size="sm" onClick={() => save({ expireDate: expires }, expires ? 'End date set.' : 'End date removed.')}>Save</Button></div>
                </Field>
                {folder && <label className="cloud-inline-switch"><Switch checked={upload} onChange={(value) => save({ permissions: value ? PERMISSION.read | PERMISSION.create | PERMISSION.update : PERMISSION.read }, value ? 'People with the link can upload.' : 'The link is view only.')} label="Allow upload" />Let people with the link upload</label>}
            </div>}
        </div>
    );
}

export function VersionsDialog({ entry, onClose, onRestored }: { entry: Entry; onClose: () => void; onRestored: () => void }) {
    const [items, setItems] = useState<Version[] | null>(null);
    useEffect(() => { versions(entry.id).then(setItems).catch((error) => { failed(error); setItems([]); }); }, [entry.id]);
    return (
        <Modal open title={`Versions of ${entry.name}`} onClose={onClose}>
            {items === null ? <span className="ps-loader" /> : items.length === 0 ? <Empty icon="bx-history">No older versions.</Empty> : (
                <ul className="ps-chain">{items.map((version) => (
                    <li key={version.href} className="ps-row">
                        <span className="ps-row__icon"><i className="bx bx-history" /></span>
                        <span className="ps-row__body"><span className="ps-row__title">{version.label || new Date(version.modified).toLocaleString('sv-SE')}</span><span className="ps-row__meta">{relativeTime(new Date(version.modified).toISOString())}, {formatBytes(version.size)}{version.author ? `, ${version.author}` : ''}</span></span>
                        <span className="ps-row__action cloud-row-actions">
                            <a className="ps-btn ps-btn--sm ps-btn--ghost" href={version.href.startsWith('/') ? version.href : '/' + version.href} download>Download</a>
                            <Button size="sm" onClick={async () => { try { await restoreVersion(version); toast('Version restored.'); onRestored(); onClose(); } catch (error) { failed(error); } }}>Restore</Button>
                        </span>
                    </li>
                ))}</ul>
            )}
        </Modal>
    );
}

export function TagsDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
    const [tags, setTags] = useState<Tag[] | null>(null);
    const [known, setKnown] = useState<Tag[]>([]);
    const [name, setName] = useState('');
    const load = () => tagsOf(entry.id).then(setTags).catch((error) => { failed(error); setTags([]); });
    useEffect(() => { void load(); allTags().then(setKnown).catch(() => undefined); }, [entry.id]);
    const suggestions = known.filter((tag) => name && tag.name.toLowerCase().includes(name.toLowerCase()) && !tags?.some((t) => t.id === tag.id)).slice(0, 6);
    const add = async (tagName: string) => { try { await addTag(entry.id, tagName, known); setName(''); await load(); setKnown(await allTags()); } catch (error) { failed(error); } };
    return (
        <Modal open title={`Tags on ${entry.name}`} size="sm" onClose={onClose}>
            <div className="ps-stack">
                <div className="cloud-tags">{tags === null ? <span className="ps-loader" /> : tags.length === 0 ? <span className="ps-muted ps-small">No tags yet.</span> : tags.map((tag) => (
                    <span key={tag.id} className="cloud-tag">{tag.name}<button type="button" aria-label={`Remove ${tag.name}`} onClick={async () => { try { await removeTag(entry.id, tag); await load(); } catch (error) { failed(error); } }}><i className="bx bx-x" /></button></span>
                ))}</div>
                <form className="cloud-inline" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void add(name.trim()); }}>
                    <input className="ps-input" placeholder="Add a tag" value={name} onChange={(event) => setName(event.target.value)} list="cloud-tag-list" />
                    <Button type="submit" size="sm" disabled={!name.trim()}>Add</Button>
                </form>
                {suggestions.length > 0 && <div className="cloud-tags">{suggestions.map((tag) => <button key={tag.id} type="button" className="cloud-tag cloud-tag--suggest" onClick={() => add(tag.name)}>{tag.name}</button>)}</div>}
            </div>
        </Modal>
    );
}
