/** What the page hands the app: who you are, where things are, the request token. */
export type Boot = {
    base: string;
    webroot: string;
    assets: string;
    version: string;
    requestToken: string;
    user: { id: string; name: string; email: string | null; admin: boolean; avatar: string };
    quota: { used: number; total: number | null };
    logout: string;
    public?: { token: string; name: string; owner: string; folder: boolean; canUpload: boolean; password: boolean };
};

export const boot: Boot = JSON.parse(document.getElementById('cloud-boot')?.textContent || '{}');
