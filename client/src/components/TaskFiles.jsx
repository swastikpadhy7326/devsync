import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';
import { prepareFile } from '../lib/images';
import AttachmentView from './AttachmentView';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';

export default function TaskFiles({ taskId, yourRole, userId }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const load = async () => {
    try {
      const data = await api.get(`/tasks/${taskId}/attachments`);
      setFiles(data.attachments);
    } catch { /* the section stays as it is */ }
  };

  // Load the files, and reload them when a teammate adds or removes one
  useEffect(() => {
    load();
    const socket = getSocket();
    const onChange = (p) => { if (!p || p.taskId === taskId) load(); };
    socket.on('attachment:changed', onChange);
    return () => socket.off('attachment:changed', onChange);
  }, [taskId]);

  const upload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const { blob, name, type } = await prepareFile(file);
      await api.upload(`/tasks/${taskId}/attachments`, blob, {
        'Content-Type': type,
        'X-Filename': encodeURIComponent(name),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.filename}"?`)) return;
    setError('');
    try {
      await api.delete(`/attachments/${f.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Attachments ({files.length})</h3>
        <div>
          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={upload} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current && input.current.click()}
            className="rounded-lg border border-indigo-200 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
          >
            {busy ? 'Uploading...' : 'Add a photo or PDF'}
          </button>
        </div>
      </div>

      {error && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {files.length === 0 && <p className="text-sm text-slate-500">No files yet. Photos up to 2 MB and PDFs up to 5 MB.</p>}

      <div className="space-y-3">
        {files.map((f) => (
          <div key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <AttachmentView id={f.id} name={f.filename} type={f.content_type} size={f.size_bytes} />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{f.uploader_name || 'Someone'} · {new Date(f.created_at).toLocaleString()}</span>
              {(f.uploaded_by === userId || yourRole !== 'member') && (
                <button onClick={() => remove(f)} className="text-red-600 hover:underline">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}