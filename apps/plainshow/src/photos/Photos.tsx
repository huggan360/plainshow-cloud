import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as dav from '../api/dav';
import { Entry, previewUrl } from '../api/dav';
import * as photos from '../api/photos';
import { Album, AlbumPhoto, Photo } from '../api/photos';
import { PeoplePicker, plainShowSharee } from '../PeoplePicker';
import { boot } from '../boot';
import { NameDialog, ShareDialog } from '../files/dialogs';
import Viewer from '../files/Viewer';
import { Link, navigate } from '../router';
import { PageHead } from '../Shell';
import { failed, toast } from '../toast';
import { Button, Empty, Modal } from '../ui';
import { t, tn, locale } from '../i18n';

export default function Photos({ path }: { path: string }) {
    if (path === '/photos/albums') return <Albums />;
    const match = path.match(/^\/photos\/albums\/(\d+)/);
    if (match) return <AlbumPage id={Number(match[1])} />;
    return <Timeline />;
}

const monthLabel = (month: string) => new Date(month + '-01T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });
const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const albumUrl = (album: number, photo: number, size = 0) => `${boot.apiBase}/api/web/albums/${album}/photos/${photo}${size ? `?size=${size}` : ''}`;

/** Every photo and video you own, newest first, month by month. */
function Timeline() {
    const [items, setItems] = useState<Photo[]>([]);
    const [next, setNext] = useState<string | null | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [monthList, setMonthList] = useState<{ month: string; count: number }[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [viewing, setViewing] = useState<number | null>(null);
    const [picking, setPicking] = useState(false);
    const [sharing, setSharing] = useState<Entry | null>(null);
    const sentinel = useRef<HTMLDivElement>(null);

    const load = useCallback(async (cursor: string | null, reset = false) => {
        setLoading(true);
        try {
            const page = await photos.timeline(cursor);
            setItems((current) => (reset ? page.items : [...current, ...page.items]));
            setNext(page.next);
        } catch (error) { failed(error); setNext(null); } finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(null, true); photos.months().then(setMonthList).catch(() => undefined); }, [load]);
    useEffect(() => {
        const node = sentinel.current;
        if (!node) return;
        const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && next && !loading) void load(next); }, { rootMargin: '1200px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, [next, loading, load]);

    const groups = useMemo(() => {
        const out: { month: string; photos: Photo[] }[] = [];
        items.forEach((photo) => {
            const month = monthOf(photo.taken);
            if (out[out.length - 1]?.month !== month) out.push({ month, photos: [] });
            out[out.length - 1].photos.push(photo);
        });
        return out;
    }, [items]);
    const entries = useMemo(() => items.map(photos.asEntry), [items]);

    // Jump: start the timeline at the end of that month.
    const jump = (month: string) => {
        const [y, m] = month.split('-').map(Number);
        const end = Math.floor(new Date(y, m, 1).getTime() / 1000);
        setItems([]); setNext(undefined);
        void load(`${end}:9223372036854775807`, true);
        window.scrollTo({ top: 0 });
    };
    const toggle = (id: number) => setSelected((current) => { const set = new Set(current); if (set.has(id)) set.delete(id); else set.add(id); return set; });
    const chosen = items.filter((photo) => selected.has(photo.id));

    return (
        <div className="cloud-photos">
            <PageHead title={t('Photos')} text={monthList.length ? t('{n} photos and videos', { n: monthList.reduce((sum, m) => sum + m.count, 0).toLocaleString(locale) }) : undefined} />
            {chosen.length > 0 && (
                <div className="cloud-selection">
                    <strong>{chosen.length} selected</strong>
                    <Button size="sm" icon="bx-photo-album" onClick={() => setPicking(true)}>{t('Add to album')}</Button>
                    {chosen.length === 1 && <Button size="sm" icon="bx-share-alt" onClick={() => setSharing(photos.asEntry(chosen[0]))}>{t('Share')}</Button>}
                    <Button size="sm" variant="danger" icon="bx-trash" onClick={async () => {
                        if (!window.confirm(tn(chosen.length, 'Move one photo to the trash?', 'Move {n} photos to the trash?'))) return;
                        try { for (const photo of chosen) await dav.remove(photo.path); setItems((current) => current.filter((p) => !selected.has(p.id))); setSelected(new Set()); toast(t('Moved to the trash.')); } catch (error) { failed(error); }
                    }}>{t('Delete')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('Clear')}</Button>
                </div>
            )}
            <div className="cloud-photos__body">
                <div className="cloud-photos__main">
                    {next === undefined && loading && <div className="cloud-loading"><span className="ps-loader" /></div>}
                    {next !== undefined && items.length === 0 && <Empty icon="bx-images">{t('No photos yet. Turn on auto upload in the phone app, or upload pictures in Files.')}</Empty>}
                    {groups.map((group) => (
                        <section key={group.month} className="cloud-photos__month">
                            <h2 className="cloud-photos__heading">{monthLabel(group.month)}</h2>
                            <div className="cloud-photo-grid">
                                {group.photos.map((photo) => (
                                    <PhotoTile key={photo.id} photo={photo} thumb={previewUrl(photo, 256)} selected={selected.has(photo.id)} selecting={selected.size > 0}
                                        onOpen={() => setViewing(items.indexOf(photo))} onToggle={() => toggle(photo.id)} />
                                ))}
                            </div>
                        </section>
                    ))}
                    <div ref={sentinel} />
                    {loading && items.length > 0 && <div className="cloud-loading cloud-loading--small"><span className="ps-loader" /></div>}
                </div>
                {monthList.length > 1 && (
                    <nav className="cloud-months" aria-label={t('Months')}>
                        <button type="button" onClick={() => { setItems([]); void load(null, true); window.scrollTo({ top: 0 }); }}>{t('Newest')}</button>
                        {monthList.map((month, index) => {
                            const year = month.month.slice(0, 4);
                            const showYear = index === 0 || monthList[index - 1].month.slice(0, 4) !== year;
                            return <button key={month.month} type="button" onClick={() => jump(month.month)} title={t('{month}: {count}', { month: monthLabel(month.month), count: month.count })}>{showYear ? <strong>{year}</strong> : new Date(month.month + '-01T12:00:00').toLocaleDateString(locale, { month: 'short' })}</button>;
                        })}
                    </nav>
                )}
            </div>
            {viewing !== null && entries[viewing] && <Viewer items={entries} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} onShare={setSharing} title={(entry) => `${entry.name}, ${new Date(entry.taken ?? entry.modified).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`} />}
            {picking && <AlbumPicker ids={chosen.map((p) => p.id)} onClose={() => setPicking(false)} onDone={() => { setPicking(false); setSelected(new Set()); }} />}
            {sharing && <ShareDialog entry={sharing} onClose={() => setSharing(null)} onChanged={() => undefined} />}
        </div>
    );
}

function PhotoTile({ photo, thumb, selected, selecting, onOpen, onToggle }: { photo: Pick<Photo, 'id' | 'name' | 'mime'>; thumb: string; selected: boolean; selecting: boolean; onOpen: () => void; onToggle: () => void }) {
    const [broken, setBroken] = useState(false);
    const video = photo.mime.startsWith('video/');
    return (
        <div className={`cloud-photo${selected ? ' is-selected' : ''}`}>
            <button type="button" className="cloud-photo__open" aria-label={photo.name} onClick={selecting ? onToggle : onOpen}>
                {broken ? <span className="cloud-photo__none"><i className={`bx ${video ? 'bx-movie-play' : 'bx-image'}`} aria-hidden="true" /><span>{photo.name}</span></span> : <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} />}
                {video && !broken && <i className="bx bx-play-circle cloud-photo__video" aria-hidden="true" />}
            </button>
            <button type="button" className="cloud-photo__check" aria-label={selected ? t('Unselect') : t('Select')} aria-pressed={selected} onClick={onToggle}><i className={`bx ${selected ? 'bxs-check-circle' : 'bx-circle'}`} /></button>
        </div>
    );
}

/** Add photos to an album, or to a new one. */
function AlbumPicker({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
    const [list, setList] = useState<Album[] | null>(null);
    const [naming, setNaming] = useState(false);
    useEffect(() => { photos.albums().then(setList).catch((error) => { failed(error); setList([]); }); }, []);
    const add = async (album: Album) => {
        try { const { added } = await photos.addToAlbum(album.id, ids); toast(t('{added} added to {name}.', { added: added, name: album.name })); onDone(); } catch (error) { failed(error); }
    };
    if (naming) return <NameDialog title={t('New album')} initial="" action="Create and add" onClose={() => setNaming(false)} onDone={async (name) => { const album = await photos.createAlbum(name); await add(album); }} />;
    return (
        <Modal open title={t('Add {n} to an album', { n: ids.length })} onClose={onClose} footer={<Button icon="bx-plus" onClick={() => setNaming(true)}>{t('New album')}</Button>}>
            {list === null ? <span className="ps-loader" /> : list.length === 0 ? <p className="ps-muted">{t('No albums yet.')}</p> : (
                <ul className="ps-chain cloud-picker">{list.map((album) => (
                    <li key={album.id}><button type="button" className="ps-row cloud-picker__row" onClick={() => add(album)}>
                        <span className="ps-row__icon cloud-album-mini">{album.cover ? <img src={album.mine ? `${boot.webroot}/index.php/core/preview?fileId=${album.cover}&x=64&y=64&a=0` : albumUrl(album.id, album.cover, 64)} alt="" /> : <i className="bx bx-photo-album" />}</span>
                        <span className="ps-row__body"><span className="ps-row__title">{album.name}</span><span className="ps-row__meta">{album.count} photos{album.mine ? '' : t(', {ownerName}\'s', { ownerName: album.ownerName })}</span></span>
                    </button></li>
                ))}</ul>
            )}
        </Modal>
    );
}

function Albums() {
    const [list, setList] = useState<Album[] | null>(null);
    const [naming, setNaming] = useState(false);
    const load = () => photos.albums().then(setList).catch((error) => { failed(error); setList([]); });
    useEffect(() => { void load(); }, []);
    return (
        <div>
            <PageHead title={t('Albums')} actions={<Button variant="primary" icon="bx-plus" onClick={() => setNaming(true)}>{t('New album')}</Button>} />
            {list === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : list.length === 0 ? <Empty icon="bx-photo-album">{t('No albums yet. Make one, then add photos from the timeline.')}</Empty> : (
                <div className="cloud-albums">{list.map((album) => (
                    <Link key={album.id} to={`/photos/albums/${album.id}`} className="cloud-album">
                        <span className="cloud-album__cover">{album.cover ? <img src={album.mine ? `${boot.webroot}/index.php/core/preview?fileId=${album.cover}&x=512&y=512&a=0` : albumUrl(album.id, album.cover, 512)} alt="" loading="lazy" /> : <i className="bx bx-photo-album" />}</span>
                        <span className="cloud-album__name">{album.name}</span>
                        <span className="cloud-album__meta">{album.count} photos{album.location ? t(', {location}', { location: album.location }) : ''}{album.mine ? '' : t(', from {ownerName}', { ownerName: album.ownerName })}</span>
                    </Link>
                ))}</div>
            )}
            {naming && <NameDialog title={t('New album')} initial="" action="Create" onClose={() => setNaming(false)} onDone={async (name) => { const album = await photos.createAlbum(name); navigate(`/photos/albums/${album.id}`); }} />}
        </div>
    );
}

function AlbumPage({ id }: { id: number }) {
    const [data, setData] = useState<Awaited<ReturnType<typeof photos.album>> | null>(null);
    const [viewing, setViewing] = useState<number | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [people, setPeople] = useState(false);
    const load = () => photos.album(id).then(setData).catch((error) => { failed(error); navigate('/photos/albums', true); });
    useEffect(() => { void load(); }, [id]);
    if (!data) return <div className="cloud-loading"><span className="ps-loader" /></div>;
    const { album } = data;
    const entries: Entry[] = data.photos.map((photo: AlbumPhoto) => ({
        id: photo.id, path: '', name: photo.name, folder: false, mime: photo.mime, size: photo.size, modified: photo.modified, etag: photo.etag,
        permissions: 'R', favorite: false, preview: true, shared: [], owner: photo.owner, taken: photo.taken,
        src: albumUrl(id, photo.id), large: albumUrl(id, photo.id, 2048),
    }));
    return (
        <div>
            <PageHead title={album.name} text={[tn(album.count, '1 photo', '{n} photos'), album.location, album.mine ? '' : t("{name}'s album", { name: album.ownerName }), data.people.length ? t('shared with {names}', { names: data.people.map((p) => p.name).join(', ') }) : ''].filter(Boolean).join(', ')}
                actions={album.mine ? <>
                    <Button icon="bx-user-plus" onClick={() => setPeople(true)}>{t('Share')}</Button>
                    <Button icon="bx-rename" onClick={() => setRenaming(true)}>{t('Rename')}</Button>
                    <Button variant="danger" icon="bx-trash" onClick={async () => { if (!window.confirm(t('Delete the album {name}? The photos stay in Files.', { name: album.name }))) return; try { await photos.deleteAlbum(id); navigate('/photos/albums'); } catch (error) { failed(error); } }}>{t('Delete')}</Button>
                </> : undefined} />
            <p className="cloud-back"><Link to="/photos/albums"><i className="bx bx-left-arrow-alt" />{t('All albums')}</Link></p>
            {entries.length === 0 ? <Empty icon="bx-images">{t('This album is empty. Select photos in the timeline and add them here.')}</Empty> : (
                <div className="cloud-photo-grid">{data.photos.map((photo, index) => (
                    <div key={photo.id} className="cloud-photo">
                        <button type="button" className="cloud-photo__open" aria-label={photo.name} onClick={() => setViewing(index)}><img src={albumUrl(id, photo.id, 256)} alt="" loading="lazy" />{photo.mime.startsWith('video/') && <i className="bx bx-play-circle cloud-photo__video" />}</button>
                        {(album.mine || photo.mine) && <button type="button" className="cloud-photo__check" aria-label={t('Take out of the album')} title={t('Take out of the album')} onClick={async () => { try { await photos.removeFromAlbum(id, photo.id); void load(); } catch (error) { failed(error); } }}><i className="bx bx-x-circle" /></button>}
                    </div>
                ))}</div>
            )}
            {viewing !== null && entries[viewing] && <Viewer items={entries} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
            {renaming && <NameDialog title={t('Rename album')} initial={album.name} action="Rename" onClose={() => setRenaming(false)} onDone={async (name) => { await photos.updateAlbum(id, { name }); await load(); }} />}
            {people && <AlbumPeople id={id} people={data.people} onClose={() => setPeople(false)} onChanged={() => void load()} />}
        </div>
    );
}

function AlbumPeople({ id, people, onClose, onChanged }: { id: number; people: { id: string; name: string }[]; onClose: () => void; onChanged: () => void }) {
    const set = async (person: string, on: boolean) => { try { await photos.shareAlbum(id, person, on); onChanged(); } catch (error) { failed(error); } };
    return (
        <Modal open title={t('Share the album')} onClose={onClose}>
            <div className="ps-stack">
                <p className="ps-small ps-muted">{t('People you share it with see its photos and can add their own.')}</p>
                <PeoplePicker itemType="file" filter={plainShowSharee} onPick={(sharee) => set(sharee.value.shareWith, true)} />
                {people.length === 0 ? <p className="ps-muted ps-small">{t('Only you see this album.')}</p> : <ul className="ps-chain">{people.map((person) => (
                    <li key={person.id} className="ps-row"><span className="ps-row__icon"><i className="bx bx-user" /></span><span className="ps-row__body"><span className="ps-row__title">{person.name}</span></span><span className="ps-row__action"><Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Stop sharing with {name}', { name: person.name })} onClick={() => set(person.id, false)} /></span></li>
                ))}</ul>}
            </div>
        </Modal>
    );
}
