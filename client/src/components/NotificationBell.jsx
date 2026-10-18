import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await api.get('/notifications?limit=15');
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNew = ({ notification }) => {
      setItems((prev) => [notification, ...prev].slice(0, 15));
      setUnread((n) => n + 1);
    };
    socket.on('notification:new', onNew);
    socket.on('connect', load); // catch up after a reconnect
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('notification:new', onNew);
      socket.off('connect', load);
    };
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* ignore */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    if (n.project_id && n.task_id) navigate(`/projects/${n.project_id}?task=${n.task_id}`);
  };

  const markAll = async () => {
    try { await api.post('/notifications/read-all'); } catch { /* ignore */ }
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
        aria-label="Notifications"
      >
        Alerts
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${n.is_read ? 'text-slate-500' : 'font-medium'}`}
                  >
                    {n.message}
                    <div className="mt-0.5 text-xs font-normal text-slate-400">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}