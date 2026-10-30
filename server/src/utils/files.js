const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];

// Total file storage per project. Read at request time, so it can be changed with an environment variable.
const projectLimitBytes = () => Number(process.env.ATTACHMENT_PROJECT_LIMIT_BYTES) || 50 * 1024 * 1024;

const at = (buf, offset, bytes) => buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

// The type comes from the file's own first bytes, never from its name or from what the browser says
function detectType(buf) {
  if (at(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(buf, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(buf, 0, ascii('GIF87a')) || at(buf, 0, ascii('GIF89a'))) return 'image/gif';
  if (at(buf, 0, ascii('RIFF')) && at(buf, 8, ascii('WEBP'))) return 'image/webp';
  if (at(buf, 0, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

// Keeps only a plain file name: no folders, no control characters, no leading dots
function cleanName(raw) {
  let name = '';
  try {
    name = decodeURIComponent(String(raw || ''));
  } catch {
    name = '';
  }
  name = name.split(/[\\/]/).pop();
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[:*?"<>|]+/g, '_').replace(/^\.+/, '').trim();
  if (name.length > 150) name = name.slice(0, 150);
  return name || 'file';
}

// "attachment" makes the browser download the file, "inline" lets it show a photo in the page
function contentDisposition(kind, name) {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  ALLOWED_TYPES,
  projectLimitBytes,
  detectType,
  cleanName,
  contentDisposition,
};