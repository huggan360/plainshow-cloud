import { lazy, Suspense, useEffect } from 'react';
import { can } from './boot';
import Files, { Trash } from './files/Files';
import { navigate, usePath } from './router';
import Shell from './Shell';
import { Empty } from './ui';
import { t } from './i18n';

const Photos = lazy(() => import('./photos/Photos'));
const Calendar = lazy(() => import('./calendar/Calendar'));
const Settings = lazy(() => import('./settings/Settings'));

/** Which part of Cloud the address asks for. */
function Page({ path }: { path: string }) {
    if (path === '/' || path === '/files') return <Files view="folder" path="" />;
    if (path.startsWith('/files/')) return <Files view="folder" path={path.slice('/files/'.length)} />;
    if (path === '/recent') return <Files view="recent" path="" />;
    if (path === '/favorites') return <Files view="favorites" path="" />;
    if (path === '/shared/with-you') return <Files view="with-you" path="" />;
    if (path === '/shared/by-you') return <Files view="by-you" path="" />;
    if (path === '/trash') return <Trash />;
    if (path.startsWith('/photos')) return <Photos path={path} />;
    if (path.startsWith('/calendar')) return <Calendar path={path} />;
    if (path.startsWith('/settings')) return <Settings path={path} />;
    return <Empty icon="bx-map">{t('Nothing lives at this address.')}</Empty>;
}

function requiredCapability(path: string): string | null {
    if (/^\/(files|recent|favorites|shared|trash)/.test(path) || path === '/') return 'cloud.files.view';
    if (path.startsWith('/photos')) return 'cloud.photos.view';
    if (path.startsWith('/calendar')) return 'cloud.calendar.view';
    return null;
}

function firstAvailablePage(): string {
    if (can('cloud.files.view')) return '/';
    if (can('cloud.calendar.view')) return '/calendar';
    if (can('cloud.photos.view')) return '/photos';
    return '/settings';
}

export default function App() {
    const path = usePath();
    const required = requiredCapability(path);
    const denied = required !== null && !can(required);
    useEffect(() => { if (denied) navigate(firstAvailablePage(), true); }, [denied, path]);
    return (
        <Shell>
            <Suspense fallback={<div className="cloud-loading"><span className="ps-loader" /></div>}>
                {denied ? <div className="cloud-loading"><span className="ps-loader" /></div> : <Page path={path} />}
            </Suspense>
        </Shell>
    );
}
