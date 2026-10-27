import { useMemo, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CHIP = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-blue-100 text-blue-800',
};
const MAX_PER_DAY = 3;

export default function CalendarView({ tasks, onOpen }) {
  const now = new Date();
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [expanded, setExpanded] = useState({});

  // Tasks grouped by their due date (YYYY-MM-DD). Tasks without one go in a separate list.
  const { byDay, undated } = useMemo(() => {
    const map = {};
    const none = [];
    tasks.forEach((t) => {
      if (!t.due_date) {
        none.push(t);
        return;
      }
      const day = t.due_date.slice(0, 10);
      (map[day] = map[day] || []).push(t);
    });
    return { byDay: map, undated: none };
  }, [tasks]);

  const { year, month } = cursor;
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const title = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const move = (delta) => {
    const next = new Date(year, month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const chip = (t, dayKey) => {
    const done = t.status === 'done';
    const overdue = !done && dayKey < todayKey;
    return (
      <button
        key={t.id}
        onClick={() => onOpen(t.id)}
        title={t.title}
        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${CHIP[t.priority] || 'bg-slate-100 text-slate-800'} ${
          done ? 'line-through opacity-60' : ''
        } ${overdue ? 'border border-red-400' : ''}`}
      >
        {t.title}
      </button>
    );
  };

  const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50';

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="mr-2 text-lg font-semibold">{title}</h3>
        <button className={btn} onClick={() => move(-1)}>Prev</button>
        <button className={btn} onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>Today</button>
        <button className={btn} onClick={() => move(1)}>Next</button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-slate-50 px-2 py-1 text-xs font-semibold uppercase text-slate-500">{w}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} className="min-h-[6rem] bg-slate-50" />;
            const dayKey = keyOf(year, month, day);
            const list = byDay[dayKey] || [];
            const open = expanded[dayKey];
            const shown = open ? list : list.slice(0, MAX_PER_DAY);
            const hidden = list.length - shown.length;
            const isToday = dayKey === todayKey;
            return (
              <div key={dayKey} className="min-h-[6rem] space-y-1 bg-white p-1.5">
                <div className={`text-xs ${isToday ? 'inline-block rounded-full bg-indigo-600 px-1.5 font-bold text-white' : 'text-slate-500'}`}>
                  {day}
                </div>
                {shown.map((t) => chip(t, dayKey))}
                {hidden > 0 && (
                  <button onClick={() => setExpanded({ ...expanded, [dayKey]: true })} className="text-xs text-indigo-600 hover:underline">
                    +{hidden} more
                  </button>
                )}
                {open && list.length > MAX_PER_DAY && (
                  <button onClick={() => setExpanded({ ...expanded, [dayKey]: false })} className="text-xs text-indigo-600 hover:underline">
                    Show less
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-sm font-semibold">No due date ({undated.length})</h4>
        {undated.length === 0 ? (
          <p className="text-sm text-slate-500">Every work item has a due date.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <div key={t.id} className="max-w-[16rem]">{chip(t, todayKey)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}