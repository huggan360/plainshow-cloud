import { FormEvent, useEffect, useState } from 'react';
import { Entry, Tag, Version, addTag, allTags, list, removeTag, restoreVersion, tagsOf, versions } from '../api/dav';
import { formatBytes } from '../api/http';
import { PERMISSION, Share, Sharee, shareLink, shareWith, sharesOf, unshare, updateShare } from '../api/shares';
import { PeoplePicker, plainShowSharee } from '../PeoplePicker';
import { failed, toast } from '../toast';
import { Badge, Button, Empty, Field, Modal, Switch, relativeTime } from '../ui';
import { t, locale } from '../i18n';

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
        try { await onDone(clean); onClose(); } catch (problem) { setError(problem instanceof Error ? problem.message : t('That did not work.')); } finally { setBusy(false); }
    };
    return (
        <Modal open title={title} size="sm" onClose={onClose}>
            <form onSubmit={submit} className="ps-stack">
                <Field label={t('Name')} error={error}>
                    <input className="ps-input" value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => { const dot = event.target.value.lastIndexOf('.'); event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length); }} autoFocus />
                </Field>
                <div className="cloud-dialog-actions"><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" type="submit" loading={busy}>{action}</Button></div>
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
        <Modal open title={title} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { await onPick(path); onClose(); } catch (error) { failed(error); } finally { setBusy(false); } }}>{action} to {parts.length ? parts[parts.length - 1] : t('Files')}</Button></>}>
            <nav className="cloud-crumbs cloud-crumbs--small">
                <button type="button" onClick={() => setPath('')}><i className="bx bx-home-alt" />{t('Files')}</button>
                {parts.map((part, index) => <button key={index} type="button" onClick={() => setPath(parts.slice(0, index + 1).join('/'))}><i className="bx bx-chevron-right" />{part}</button>)}
            </nav>
            <ul className="ps-chain cloud-picker">
                {folders === null && <li className="ps-row"><span className="ps-loader" /></li>}
                {folders?.length === 0 && <li className="ps-row ps-muted">{t('No folders here.')}</li>}
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
    return share.permissions & (PERMISSION.update | PERMISSION.create | PERMISSION.delete) ? t('Can edit') : t('Can view');
}

/** Share with people who have Cloud, or by a public link with a password and an end date. */
export function ShareDialog({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
    const [shares, setShares] = useState<Share[] | null>(null);
    const [edit, setEdit] = useState(false);
    const canShare = entry.permissions.includes('R');
    const load = () => sharesOf(entry.path).then(setShares).catch((error) => { failed(error); setShares([]); });
    useEffect(() => { void load(); }, [entry.path]);

    const write = entry.folder ? PERMISSION.read | PERMISSION.update | PERMISSION.create | PERMISSION.delete : PERMISSION.read | PERMISSION.update;
    const add = async (sharee: Sharee) => {
        try {
            await shareWith(entry.path, sharee.value.shareWith, edit ? write : PERMISSION.read, sharee.value.shareType);
            await load(); onChanged();
            toast(t('Shared with {label}.', { label: sharee.label }));
        } catch (error) { failed(error); }
    };
    const people = (shares ?? []).filter((share) => share.share_type === 0 || share.share_type === 1);
    const links = (shares ?? []).filter((share) => share.share_type === 3);

    return (
        <Modal open title={t('Share {name}', { name: entry.name })} onClose={onClose}>
            {!canShare && <p className="ps-muted">{t('You cannot share this; it was shared with you without permission to share it on.')}</p>}
            {canShare && <div className="ps-stack">
                <div className="cloud-share-add">
                    <PeoplePicker itemType={entry.folder ? 'folder' : 'file'} onPick={add} filter={plainShowSharee} />
                    <div className="cloud-share-access">
                        <span><strong>{t('Access for new people')}</strong><small>{edit ? t('They can change this item.') : t('They can only view this item.')}</small></span>
                        <label className="cloud-inline-switch"><Switch checked={edit} onChange={setEdit} label={t('Can edit')} />{t('Can edit')}</label>
                    </div>
                </div>

                <h3 className="cloud-subhead">{t('People')}</h3>
                {shares === null ? <span className="ps-loader" /> : people.length === 0 ? <p className="ps-muted ps-small">{t('Not shared with anyone yet.')}</p> : (
                    <ul className="ps-chain">{people.map((share) => (
                        <li key={share.id} className="ps-row">
                            <span className="ps-row__icon"><i className={`bx ${share.share_type === 1 ? 'bx-group' : 'bx-user'}`} /></span>
                            <span className="ps-row__body"><span className="ps-row__title">{share.share_with_displayname || share.share_with}</span><span className="ps-row__meta">{permissionsLabel(share)}</span></span>
                            <span className="ps-row__action cloud-row-actions">
                                <Button size="sm" variant="ghost" onClick={async () => { try { await updateShare(share.id, { permissions: permissionsLabel(share) === t('Can edit') ? PERMISSION.read : write }); await load(); } catch (error) { failed(error); } }}>{permissionsLabel(share) === t('Can edit') ? t('Make view only') : t('Allow editing')}</Button>
                                <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Stop sharing')} onClick={async () => { try { await unshare(share.id); await load(); onChanged(); } catch (error) { failed(error); } }} />
                            </span>
                        </li>
                    ))}</ul>
                )}

                <h3 className="cloud-subhead">{t('Public links')}</h3>
                {links.map((share) => <LinkRow key={share.id} share={share} folder={entry.folder} reload={load} onChanged={onChanged} />)}
                <div><Button size="sm" icon="bx-link" onClick={async () => { try { const share = await shareLink(entry.path); await load(); onChanged(); if (share.url) { await navigator.clipboard?.writeText(share.url).catch(() => undefined); toast(t('Link made and copied.')); } } catch (error) { failed(error); } }}>{t('New public link')}</Button></div>
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
                    <span className="ps-row__title">{share.label || t('Public link')} {share.password && <Badge>{t('Password')}</Badge>} {share.expiration && <Badge tone="amber">{t('Until')}{' '}{share.expiration.slice(0, 10)}</Badge>} {upload && <Badge tone="green">{t('Upload')}</Badge>}</span>
                    <span className="ps-row__meta ps-mono">{share.url}</span>
                </span>
                <span className="ps-row__action cloud-row-actions">
                    <Button size="sm" variant="ghost" iconOnly icon="bx-copy" aria-label={t('Copy link')} onClick={() => navigator.clipboard?.writeText(share.url || '').then(() => toast(t('Link copied.')))} />
                    <Button size="sm" variant="ghost" iconOnly icon="bx-cog" aria-label={t('Link settings')} onClick={() => setOpen((value) => !value)} />
                    <Button size="sm" variant="ghost" iconOnly icon="bx-trash" aria-label={t('Delete link')} onClick={async () => { try { await unshare(share.id); await reload(); onChanged(); } catch (error) { failed(error); } }} />
                </span>
            </div>
            {open && <div className="cloud-link__settings">
                <Field label={t('Password')} help={share.password ? t('This link has a password. Set a new one to change it.') : t('Anyone with the link needs it.')}>
                    <div className="cloud-inline"><input className="ps-input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><Button size="sm" disabled={!password} onClick={() => save({ password }, t('Password set.')).then(() => setPassword(''))}>{t('Set')}</Button>{share.password && <Button size="sm" variant="ghost" onClick={() => save({ password: '' }, t('Password removed.'))}>{t('Remove')}</Button>}</div>
                </Field>
                <Field label={t('Works until')}>
                    <div className="cloud-inline"><input className="ps-input" type="date" value={expires} onChange={(event) => setExpires(event.target.value)} /><Button size="sm" onClick={() => save({ expireDate: expires }, expires ? t('End date set.') : t('End date removed.'))}>{t('Save')}</Button></div>
                </Field>
                {folder && <label className="cloud-inline-switch"><Switch checked={upload} onChange={(value) => save({ permissions: value ? PERMISSION.read | PERMISSION.create | PERMISSION.update : PERMISSION.read }, value ? t('People with the link can upload.') : t('The link is view only.'))} label={t('Allow upload')} />{t('Let people with the link upload')}</label>}
            </div>}
        </div>
    );
}

export function VersionsDialog({ entry, onClose, onRestored }: { entry: Entry; onClose: () => void; onRestored: () => void }) {
    const [items, setItems] = useState<Version[] | null>(null);
    useEffect(() => { versions(entry.id).then(setItems).catch((error) => { failed(error); setItems([]); }); }, [entry.id]);
    return (
        <Modal open title={t('Versions of {name}', { name: entry.name })} onClose={onClose}>
            {items === null ? <span className="ps-loader" /> : items.length === 0 ? <Empty icon="bx-history">{t('No older versions.')}</Empty> : (
                <ul className="ps-chain">{items.map((version) => (
                    <li key={version.href} className="ps-row">
                        <span className="ps-row__icon"><i className="bx bx-history" /></span>
                        <span className="ps-row__body"><span className="ps-row__title">{version.label || new Date(version.modified).toLocaleString(locale)}</span><span className="ps-row__meta">{relativeTime(new Date(version.modified).toISOString())}, {formatBytes(version.size)}{version.author ? t(', {author}', { author: version.author }) : ''}</span></span>
                        <span className="ps-row__action cloud-row-actions">
                            <a className="ps-btn ps-btn--sm ps-btn--ghost" href={version.href.startsWith('/') ? version.href : '/' + version.href} download>{t('Download')}</a>
                            <Button size="sm" onClick={async () => { try { await restoreVersion(version); toast(t('Version restored.')); onRestored(); onClose(); } catch (error) { failed(error); } }}>{t('Restore')}</Button>
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
        <Modal open title={t('Tags on {name}', { name: entry.name })} size="sm" onClose={onClose}>
            <div className="ps-stack">
                <div className="cloud-tags">{tags === null ? <span className="ps-loader" /> : tags.length === 0 ? <span className="ps-muted ps-small">{t('No tags yet.')}</span> : tags.map((tag) => (
                    <span key={tag.id} className="cloud-tag">{tag.name}<button type="button" aria-label={t('Remove {name}', { name: tag.name })} onClick={async () => { try { await removeTag(entry.id, tag); await load(); } catch (error) { failed(error); } }}><i className="bx bx-x" /></button></span>
                ))}</div>
                <form className="cloud-inline" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void add(name.trim()); }}>
                    <input className="ps-input" placeholder={t('Add a tag')} value={name} onChange={(event) => setName(event.target.value)} list="cloud-tag-list" />
                    <Button type="submit" size="sm" disabled={!name.trim()}>{t('Add')}</Button>
                </form>
                {suggestions.length > 0 && <div className="cloud-tags">{suggestions.map((tag) => <button key={tag.id} type="button" className="cloud-tag cloud-tag--suggest" onClick={() => add(tag.name)}>{tag.name}</button>)}</div>}
            </div>
        </Modal>
    );
}
