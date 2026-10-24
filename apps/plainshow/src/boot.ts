/** What the page hands the app: who you are, where things are, the request token. */
export type Boot = {
    base: string;
    apiBase: string;
    webroot: string;
    assets: string;
    version: string;
    requestToken: string;
    user: { id: string; name: string; email: string | null; admin: boolean; avatar: string; services: string[]; capabilities: string[] };
    quota: { used: number; total: number | null };
    logout: string;
    /** Every installed PlainShow app's address, by app id (core, login, blog, ...). */
    platform: Record<string, string>;
    /** On a share link's page: the link. */
    public?: {
        token: string; name: string; owner: string; folder: boolean;
        canRead: boolean; canUpload: boolean; canEdit: boolean; hideDownload: boolean;
        note: string; expires: number | null; mime: string; size: number; path: string;
    };
};

export const boot: Boot = JSON.parse(document.getElementById('cloud-boot')?.textContent || '{}');

export function can(capability: string): boolean {
    return boot.user.capabilities?.includes('*') || boot.user.capabilities?.includes(capability);
}
