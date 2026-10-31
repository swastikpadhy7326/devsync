import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatSize, isImageType } from '../lib/files';

// The API needs a login for every file, so files are fetched with it and shown from a temporary local address
export async function saveFile(id, name) {
  const blob = await api.blob(`/attachments/${id}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function AttachmentView({ id, name, type, size }) {
  const image = isImageType(type);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!image) return undefined;
    let stopped = false;
    let objectUrl = null;
    api
      .blob(`/attachments/${id}`)
      .then((blob) => {
        if (stopped) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!stopped) setFailed(true); });
    return () => {
      stopped = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, image]);

  if (image) {
    if (failed) return <span className="text-xs text-red-600">The photo could not be loaded</span>;
    if (!url) return <span className="inline-block h-24 w-32 animate-pulse rounded-lg bg-slate-200" />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={`${name} (${formatSize(size)})`}>
        <img src={url} alt={name} className="max-h-48 max-w-full rounded-lg border border-slate-200" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => saveFile(id, name).catch(() => setFailed(true))}
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
    >
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">PDF</span>
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 text-xs text-slate-500">{failed ? 'failed, try again' : formatSize(size)}</span>
    </button>
  );
}