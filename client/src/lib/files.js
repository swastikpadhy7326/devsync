export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_SIDE = 1600;

export const isImageType = (type) => typeof type === 'string' && type.startsWith('image/');

// Shrinks a size to fit inside max pixels on its longest side, keeping the shape
export function fitWithin(width, height, max) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Replaces the extension of a file name (or adds one)
export function renameTo(name, ext) {
  const base = String(name || '').replace(/\.[^.\\/]*$/, '') || 'photo';
  return `${base}.${ext}`;
}