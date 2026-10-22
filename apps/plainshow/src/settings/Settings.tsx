import { ReactNode, useCallback, useEffect, useState } from 'react';
import { api, formatBytes } from '../api/http';
import { boot, can } from '../boot';
import { Link } from '../router';
import { PageHead } from '../Shell';
import { failed, toast } from '../toast';
import { Badge, Button, Empty, Field, Frame, FrameHead, Meter, Modal, Switch, relativeTime } from '../ui';

type Rules = { links: boolean; upload: boolean; passwordDefault: boolean; passwordRequired: boolean; expireDefault: boolean; expireRequired: boolean; expireDays: number };
type Retention = { trash: string; versions: string; choices: string[] };
type Mine = {
    storage: { files: number; trash: number; versions: number; total: number | null };
    sharing: { accept: boolean; acceptEnforced: boolean; folder: string; folderAllowed: boolean };
    rules: Rules;
    retention: Retention;
};
type Device = { id: number; name: string; lastActivity: number; kind: 'app' | 'browser'; current: boolean };
type Person = { id: string; name: string; quota: string; used: number; lastLogin: number; enabled: boolean };
type Job = { id: number; name: string; app: string; lastRun: number; duration: number; stuck: boolean };
type Admin = { people: Person[]; rules: Rules; retention: Retention; jobs: { mode: string; lastCron: number; list: Job[] }; free: number | null };

const ago = (ms: number) => (ms > 0 ? relativeTime(new Date(ms).toISOString()) : 'Never');

export default function Settings({ path }: { path: string }) {
    const hasFiles = can('cloud.files.view');
    const tab = path === '/settings/admin' && boot.user.admin ? 'admin' : path === '/settings/devices' || !hasFiles ? 'devices' : 'you';
    return (
        <div className="cloud-settings">
            <PageHead title="Settings" />
            <nav className="ps-tabs cloud-settings__tabs" aria-label="Settings">
                {hasFiles && <Link to="/settings" className={`ps-tab${tab === 'you' ? ' is-active' : ''}`}>Storage and sharing</Link>}
                <Link to="/settings/devices" className={`ps-tab${tab === 'devices' ? ' is-active' : ''}`}>Devices</Link>
                {boot.user.admin && <Link to="/settings/admin" className={`ps-tab${tab === 'admin' ? ' is-active' : ''}`}>Admin</Link>}
            </nav>
            {tab === 'you' && <You />}
            {tab === 'devices' && <Devices />}
            {tab === 'admin' && <AdminPage />}
        </div>
    );
}

function Loading() {
    return <div className="cloud-loading"><span className="ps-loader" /></div>;
}

/* ---------- Storage and sharing ---------- */

export function retentionLabel(value: string, what: 'trash' | 'versions'): string {
    const days = value.match(/^auto, (\d+)$/)?.[1];
    if (value === 'auto') return what === 'trash' ? '30 days, sooner if space runs low' : 'Thinned out over time, sooner if space runs low';
    if (days) return `Up to ${days === '365' ? 'a year' : `${days} days`}, sooner if space runs low`;
    if (value === 'disabled') return 'Kept until removed by hand';
    return `Custom rule: ${value}`;
}

function You() {
    const [data, setData] = useState<Mine | null>(null);
    const [folder, setFolder] = useState('');
    const load = useCallback(() => api<Mine>('/api/web/settings').then((d) => { setData(d); setFolder(d.sharing.folder); }).catch(failed), []);
    useEffect(() => { void load(); }, [load]);
    if (!data) return <Loading />;
    const { storage, sharing, rules } = data;
    const used = storage.total ? Math.round(storage.files / storage.total * 100) : 0;
    const save = async (changes: { accept?: boolean; folder?: string }) => {
        try { await api('/api/web/settings/sharing', { method: 'PUT', json: changes }); toast('Saved.'); void load(); } catch (error) { failed(error); }
    };

    return (
        <div className="cloud-settings__grid">
            <Frame>
                <FrameHead title="Storage" text={storage.total ? `${formatBytes(storage.files)} of ${formatBytes(storage.total)} used` : `${formatBytes(storage.files)} used`} />
                {storage.total !== null && <Meter value={used} label="Storage used" />}
                <ul className="ps-chain cloud-settings__list">
                    <Line icon="bx-folder" title="Your files" meta={formatBytes(storage.files)} />
                    <Line icon="bx-trash" title="Trash" meta={formatBytes(storage.trash)} action={<Link to="/trash" className="ps-btn ps-btn--sm">Open</Link>} />
                    <Line icon="bx-history" title="Old versions" meta={formatBytes(storage.versions)} />
                </ul>
            </Frame>
            <Frame>
                <FrameHead title="Sharing" />
                <div className="ps-stack">
                    {!sharing.acceptEnforced && (
                        <label className="cloud-setting">
                            <span><strong>Accept shares automatically</strong></span>
                            <Switch checked={sharing.accept} label="Accept shares right away" onChange={(accept) => save({ accept })} />
                        </label>
                    )}
                    {sharing.folderAllowed && (
                        <Field label="Put shared files in" htmlFor="share-folder">
                            <form className="cloud-inline" onSubmit={(event) => { event.preventDefault(); void save({ folder }); }}>
                                <input id="share-folder" className="ps-input" value={folder} onChange={(event) => setFolder(event.target.value)} />
                                <Button type="submit" disabled={folder === sharing.folder}>Save</Button>
                            </form>
                        </Field>
                    )}
                    <div className="cloud-settings__rules">
                        <h3 className="cloud-subhead">Public links</h3>
                        {!rules.links ? <p className="ps-small">Public links are turned off for this Cloud.</p> : (
                            <ul className="ps-small ps-muted">
                                <li>{rules.passwordRequired ? 'Password required' : rules.passwordDefault ? 'Password suggested' : 'Password optional'}</li>
                                <li>{rules.expireRequired ? `Expires within ${rules.expireDays} days` : rules.expireDefault ? `${rules.expireDays}-day expiry by default` : 'No default expiry'}</li>
                                {!rules.upload && <li>Uploads off</li>}
                            </ul>
                        )}
                    </div>
                </div>
            </Frame>
        </div>
    );
}

function Line({ icon, title, meta, text, action }: { icon: string; title: ReactNode; meta?: ReactNode; text?: ReactNode; action?: ReactNode }) {
    return (
        <li className="ps-row">
            <span className="ps-row__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>
            <span className="ps-row__body"><span className="ps-row__title">{title}</span>{text && <span className="ps-row__meta">{text}</span>}</span>
            {meta && <span className="cloud-settings__meta">{meta}</span>}
            {action && <span className="ps-row__action">{action}</span>}
        </li>
    );
}

/* ---------- Devices ---------- */

/** A readable name for what a device calls itself. */
export function describeDevice(name: string): { title: string; icon: string } {
    const ua = name;
    if (/Nextcloud-iOS|\(iOS\) Nextcloud/i.test(ua)) return { title: 'Cloud app on iPhone or iPad', icon: 'bx-mobile' };
    if (/Nextcloud-android/i.test(ua)) return { title: 'Cloud app on Android', icon: 'bx-mobile' };
    if (/mirall|Nextcloud desktop|csyncoC/i.test(ua)) return { title: 'Desktop sync', icon: 'bx-desktop' };
    if (/dataaccessd|accountsd|remindd|iOS\/[\d.]+ \(/i.test(ua)) return { title: 'Calendar and contacts on iPhone', icon: 'bx-mobile' };
    if (/DAVx5|DAVdroid/i.test(ua)) return { title: 'DAVx⁵ on Android', icon: 'bx-mobile' };
    if (/Thunderbird/i.test(ua)) return { title: 'Thunderbird', icon: 'bx-envelope' };
    if (/^Mozilla\//.test(ua)) {
        const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrom(e|ium)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
        const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux|X11/.test(ua) ? 'Linux' : '';
        return { title: os ? `${browser} on ${os}` : browser, icon: /iPhone|Android/.test(ua) ? 'bx-mobile' : 'bx-globe' };
    }
    return { title: name, icon: /iphone|android|phone/i.test(name) ? 'bx-mobile' : 'bx-key' };
}

function Devices() {
    const [list, setList] = useState<Device[] | null>(null);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [made, setMade] = useState<{ loginName: string; password: string; name: string } | null>(null);
    const [asking, setAsking] = useState<number | null>(null);
    const load = useCallback(() => api<Device[]>('/api/web/settings/devices').then(setList).catch((error) => { failed(error); setList([]); }), []);
    useEffect(() => { void load(); }, [load]);

    const create = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            const result = await api<{ loginName: string; password: string }>('/api/web/settings/devices', { method: 'POST', json: { name: name.trim() } });
            setMade({ ...result, name: name.trim() }); setName(''); void load();
        } catch (error) { failed(error); } finally { setBusy(false); }
    };
    const revoke = async (device: Device) => {
        try { await api(`/api/web/settings/devices/${device.id}`, { method: 'DELETE' }); toast('Signed out.'); setAsking(null); void load(); } catch (error) { failed(error); }
    };
    const apps = (list ?? []).filter((d) => d.kind === 'app');
    const browsers = (list ?? []).filter((d) => d.kind === 'browser');
    const server = window.location.origin + boot.webroot;
    const calendarOnly = can('cloud.calendar.view') && !can('cloud.files.view') && !can('cloud.photos.view');

    const row = (device: Device) => {
        const { title, icon } = describeDevice(device.name);
        return (
            <li key={device.id} className="ps-row">
                <span className="ps-row__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>
                <span className="ps-row__body">
                    <span className="ps-row__title">{title}{device.current && <> <Badge tone="green">This browser</Badge></>}</span>
                    <span className="ps-row__meta">{title !== device.name && device.kind === 'app' ? `${device.name}, ` : ''}last used {ago(device.lastActivity)}</span>
                </span>
                {!device.current && <span className="ps-row__action">{asking === device.id
                    ? <span className="cloud-inline"><Button size="sm" variant="danger" onClick={() => revoke(device)}>Sign out</Button><Button size="sm" variant="ghost" onClick={() => setAsking(null)}>Keep</Button></span>
                    : <Button size="sm" variant="ghost" onClick={() => setAsking(device.id)}>Sign out</Button>}</span>}
            </li>
        );
    };

    return (
        <div className="cloud-settings__grid">
            <Frame>
                <FrameHead title="Connect a device" />
                <Field label="Cloud address">
                    <div className="cloud-inline">
                        <input className="ps-input" readOnly value={server} onFocus={(event) => event.target.select()} />
                        <Button iconOnly icon="bx-copy" aria-label="Copy the address" onClick={() => navigator.clipboard.writeText(server).then(() => toast('Copied.'))} />
                    </div>
                </Field>
                <p className="ps-small ps-muted">{calendarOnly ? 'Calendar and contacts apps sign in with this address, your username and an app password made below. Your PlainShow password does not work there.' : 'Use this address in the Nextcloud phone or desktop app. Sign in with PlainShow.'}</p>
            </Frame>
            <Frame>
                <FrameHead title="iPhone, iPad or Mac" text="Adds your calendars, reminders and contacts in one step. Open this page in Safari on the device." />
                <form method="post" action={`${boot.base}/api/web/settings/devices/apple`} className="cloud-inline" onSubmit={() => window.setTimeout(() => void load(), 3000)}>
                    <input type="hidden" name="requesttoken" value={boot.requestToken} />
                    <input className="ps-input" name="name" defaultValue="iPhone calendar and contacts" aria-label="Device name" maxLength={120} required />
                    <Button type="submit" variant="primary" icon="bxl-apple">Add to device</Button>
                </form>
                <p className="ps-small ps-muted">Then open Settings on the device, tap <strong>Profile Downloaded</strong> and install it.</p>
            </Frame>
            <Frame>
                <FrameHead title="App passwords" text="For calendar and contacts apps." />
                <form className="cloud-inline" onSubmit={(event) => { event.preventDefault(); void create(); }}>
                    <input className="ps-input" placeholder="Name this device" value={name} onChange={(event) => setName(event.target.value)} aria-label="App password name" />
                    <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Create</Button>
                </form>
            </Frame>
            <Frame className="ps-span-all cloud-settings__sessions">
                <FrameHead title="Signed in" />
                {list === null ? <Loading /> : list.length === 0 ? <Empty icon="bx-mobile">Nothing yet.</Empty> : (
                    <>
                        {apps.length > 0 && <><h3 className="cloud-subhead">Apps and devices</h3><ul className="ps-chain">{apps.map(row)}</ul></>}
                        {browsers.length > 0 && <><h3 className="cloud-subhead">Browsers</h3><ul className="ps-chain">{browsers.map(row)}</ul></>}
                    </>
                )}
            </Frame>
            {made && (
                <Modal open title="Your new app password" onClose={() => setMade(null)} footer={<div className="cloud-dialog-actions"><Button variant="primary" onClick={() => setMade(null)}>Done</Button></div>}>
                    <div className="ps-stack">
                        <p>Enter these in <strong>{made.name}</strong>. The password is shown only now.</p>
                        <Copyable label="Server" value={server} />
                        <Copyable label="Username" value={made.loginName} />
                        <Copyable label="Password" value={made.password} mono />
                    </div>
                </Modal>
            )}
        </div>
    );
}

function Copyable({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <Field label={label}>
            <div className="cloud-inline">
                <input className={`ps-input${mono ? ' cloud-mono' : ''}`} readOnly value={value} onFocus={(event) => event.target.select()} />
                <Button iconOnly icon="bx-copy" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast('Copied.'))} />
            </div>
        </Field>
    );
}

/* ---------- Admin ---------- */

const QUOTAS = ['none', '1 GB', '5 GB', '10 GB', '25 GB', '50 GB', '100 GB', '250 GB', '500 GB', '1 TB'];

function AdminPage() {
    const [data, setData] = useState<Admin | null>(null);
    const [allJobs, setAllJobs] = useState(false);
    const [days, setDays] = useState('');
    const load = useCallback(() => api<Admin>('/api/web/settings/admin').then((d) => { setData(d); setDays(String(d.rules.expireDays)); }).catch(failed), []);
    useEffect(() => { void load(); }, [load]);
    if (!data) return <Loading />;

    const setQuota = async (person: Person, quota: string) => {
        try { await api('/api/web/settings/admin/quota', { method: 'PUT', json: { person: person.id, quota } }); toast(`Limit for ${person.name} saved.`); void load(); } catch (error) { failed(error); }
    };
    const setRule = async (changes: Partial<Rules>) => {
        setData((current) => current && { ...current, rules: { ...current.rules, ...changes } });
        try { await api('/api/web/settings/admin/sharing', { method: 'PUT', json: changes }); toast('Saved.'); } catch (error) { failed(error); void load(); }
    };
    const setRetention = async (changes: { trash?: string; versions?: string }) => {
        try { const retention = await api<Retention>('/api/web/settings/admin/retention', { method: 'PUT', json: changes }); setData((current) => current && { ...current, retention }); toast('Saved.'); } catch (error) { failed(error); }
    };

    const { rules, retention, jobs } = data;
    const cronAge = Date.now() - jobs.lastCron;
    const late = jobs.mode !== 'cron' || cronAge > 20 * 60000;
    const stuck = jobs.list.filter((j) => j.stuck);
    const shownJobs = allJobs ? [...jobs.list].sort((a, b) => b.lastRun - a.lastRun) : stuck;
    const retentionChoice = (value: string, what: 'trash' | 'versions') => (
        <select className="ps-select" value={value} onChange={(event) => setRetention({ [what]: event.target.value })}>
            {!retention.choices.includes(value) && <option value={value}>{retentionLabel(value, what)}</option>}
            {retention.choices.map((choice) => <option key={choice} value={choice}>{retentionLabel(choice, what)}</option>)}
        </select>
    );
    const toggle = (key: keyof Rules, title: string, disabled = false) => (
        <label className={`cloud-setting${disabled ? ' is-disabled' : ''}`}>
            <span><strong>{title}</strong></span>
            <Switch checked={!!rules[key]} disabled={disabled} label={title} onChange={(value) => setRule({ [key]: value })} />
        </label>
    );

    return (
        <div className="cloud-settings__grid">
            <Frame className="ps-span-all">
                <FrameHead title="People and storage" text={data.free !== null ? `${formatBytes(data.free)} free on the cloud drive.` : undefined} />
                <div className="ps-table-wrap">
                    <table className="ps-table cloud-settings__people">
                        <thead><tr><th>Person</th><th>Used</th><th>Limit</th><th>Last seen</th></tr></thead>
                        <tbody>
                            {data.people.map((person) => {
                                const limit = person.quota === 'default' ? 'none' : person.quota;
                                const choices = QUOTAS.includes(limit) ? QUOTAS : [limit, ...QUOTAS];
                                return (
                                    <tr key={person.id}>
                                        <td><strong>{person.name}</strong><div className="ps-small ps-muted">@{person.id}{!person.enabled && ', turned off'}</div></td>
                                        <td>{formatBytes(person.used)}</td>
                                        <td>
                                            <select className="ps-select cloud-select--small" value={limit} aria-label={`Limit for ${person.name}`} onChange={(event) => setQuota(person, event.target.value)}>
                                                {choices.map((q) => <option key={q} value={q}>{q === 'none' ? 'No limit' : q}</option>)}
                                            </select>
                                        </td>
                                        <td className="ps-small ps-muted">{ago(person.lastLogin)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Frame>
            <Frame>
                <FrameHead title="Public links" />
                <div className="ps-stack">
                    {toggle('links', 'Allow public links')}
                    {toggle('upload', 'Allow uploads to shared folders', !rules.links)}
                    {toggle('passwordDefault', 'Suggest a password', !rules.links || rules.passwordRequired)}
                    {toggle('passwordRequired', 'Require a password', !rules.links)}
                    {toggle('expireDefault', 'Set an end date', !rules.links)}
                    {toggle('expireRequired', 'Require an end date', !rules.links || !rules.expireDefault)}
                    <Field label="Days until a link stops working" htmlFor="expire-days">
                        <form className="cloud-inline" onSubmit={(event) => { event.preventDefault(); void setRule({ expireDays: Number(days) }); }}>
                            <input id="expire-days" type="number" min={1} max={3650} className="ps-input" value={days} disabled={!rules.links || !rules.expireDefault} onChange={(event) => setDays(event.target.value)} />
                            <Button type="submit" disabled={!rules.links || !rules.expireDefault || Number(days) === rules.expireDays}>Save</Button>
                        </form>
                    </Field>
                </div>
            </Frame>
            <Frame>
                <FrameHead title="Trash and old versions" />
                <div className="ps-stack">
                    <Field label="Trash">{retentionChoice(retention.trash, 'trash')}</Field>
                    <Field label="Old versions">{retentionChoice(retention.versions, 'versions')}</Field>
                </div>
            </Frame>
            <Frame className="ps-span-all">
                <FrameHead title="Background jobs" action={<Button size="sm" variant="ghost" onClick={() => setAllJobs((v) => !v)}>{allJobs ? 'Problems only' : `Show all ${jobs.list.length}`}</Button>} />
                <ul className="ps-chain">
                    <Line icon={late ? 'bx-error-circle' : 'bx-check-circle'} title={late ? <span className="cloud-danger">Jobs are not running on time</span> : 'Running on time'} text={`Runs by ${jobs.mode === 'cron' ? 'the system timer every 5 minutes' : jobs.mode}. Last run ${ago(jobs.lastCron)}.`} />
                    {stuck.length > 0 && !allJobs && <Line icon="bx-error" title={<span className="cloud-danger">{stuck.length} stuck</span>} text="Started over an hour ago and not finished." />}
                </ul>
                {shownJobs.length > 0 && (
                    <div className="ps-table-wrap">
                        <table className="ps-table cloud-settings__jobs">
                            <thead><tr><th>Job</th><th>Part</th><th>Last run</th><th>Took</th></tr></thead>
                            <tbody>{shownJobs.map((job) => (
                                <tr key={job.id}><td>{job.name}{job.stuck && <> <Badge tone="red">Stuck</Badge></>}</td><td className="ps-muted">{job.app}</td><td>{ago(job.lastRun)}</td><td className="ps-muted">{job.duration ? `${job.duration} s` : ''}</td></tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </Frame>
        </div>
    );
}
