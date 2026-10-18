/** What a file is, for its icon and how it opens. */
export type Kind = 'folder' | 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'sheet' | 'doc' | 'slides' | 'code' | 'other';

export function kindOf(mime: string, name = ''): Kind {
    if (mime === 'httpd/unix-directory') return 'folder';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (/zip|tar|gzip|7z|rar|compressed/.test(mime)) return 'archive';
    if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx?|ods|csv)$/i.test(name)) return 'sheet';
    if (/presentation|powerpoint/.test(mime) || /\.(pptx?|odp|key)$/i.test(name)) return 'slides';
    if (/word|opendocument\.text|rtf/.test(mime) || /\.(docx?|odt|rtf)$/i.test(name)) return 'doc';
    if (/\.(js|ts|tsx|jsx|php|py|sh|json|xml|html|css|tex|c|cpp|h|java|rs|go|yml|yaml|toml)$/i.test(name)) return 'code';
    if (mime.startsWith('text/') || /\.(md|txt|log|ini|conf)$/i.test(name)) return 'text';
    return 'other';
}

export const ICONS: Record<Kind, string> = {
    folder: 'bxs-folder', image: 'bx-image', video: 'bx-movie', audio: 'bx-music', pdf: 'bxs-file-pdf', text: 'bx-file',
    archive: 'bx-archive', sheet: 'bx-spreadsheet', doc: 'bxs-file-doc', slides: 'bx-slideshow', code: 'bx-code-alt', other: 'bx-file-blank',
};

/** Files the viewer can show. Text files it can also edit. */
export function viewable(kind: Kind): boolean {
    return ['image', 'video', 'audio', 'pdf', 'text', 'code'].includes(kind);
}
