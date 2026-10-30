import { useEffect, useState } from 'react';
import { api } from '../api';

const W = 640;
const H = 220;
const M = { left: 36, right: 12, top: 12, bottom: 28 };

export default function BurndownChart({ sprintId, signature }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // The signature changes when work items in the sprint change, so the chart stays current
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/sprints/${sprintId}/burndown`)
      .then((d) => { if (!cancelled) { setData(d); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [sprintId, signature]);

  if (error) return <p className="px-3 py-2 text-xs text-red-600">{error}</p>;
  if (!data) return <p className="px-3 py-2 text-xs text-slate-500">Loading burndown...</p>;

  const points = data.ideal ? data.ideal.length : Math.max(data.days.length, 2);
  const max = Math.max(data.total, 1);
  const x = (i) => M.left + (i / Math.max(points - 1, 1)) * (W - M.left - M.right);
  const y = (v) => M.top + (1 - v / max) * (H - M.top - M.bottom);
  const line = (list) => list.map((d, i) => `${x(i)},${y(d.remaining)}`).join(' ');

  const last = data.days.length ? data.days[data.days.length - 1].remaining : data.total;
  const lastDate = data.ideal ? data.ideal[data.ideal.length - 1].date : data.days.length ? data.days[data.days.length - 1].date : data.startDate;

  return (
    <div className="border-b border-slate-100 px-3 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Burndown</span>
        <span>{last} of {data.total} work items remaining</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-indigo-600" /> Actual</span>
        {data.ideal && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> Ideal</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label="Sprint burndown chart">
        <line x1={M.left} y1={y(0)} x2={W - M.right} y2={y(0)} stroke="#cbd5e1" />
        <line x1={M.left} y1={M.top} x2={M.left} y2={y(0)} stroke="#cbd5e1" />
        <text x={M.left - 6} y={y(max) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{max}</text>
        <text x={M.left - 6} y={y(0) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">0</text>
        <text x={M.left} y={H - 8} textAnchor="start" className="fill-slate-500 text-[10px]">{data.startDate}</text>
        <text x={W - M.right} y={H - 8} textAnchor="end" className="fill-slate-500 text-[10px]">{lastDate}</text>
        {data.ideal && data.ideal.length > 1 && (
          <polyline points={line(data.ideal)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4" />
        )}
        {data.days.length > 1 && <polyline points={line(data.days)} fill="none" stroke="#4f46e5" strokeWidth="2.5" />}
        {data.days.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.remaining)} r="3" fill="#4f46e5" />
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        Counts work items, by UTC day. Work added during the sprint counts from the first day.
        {!data.ideal && ' Set an end date on the sprint to see the ideal line.'}
      </p>
    </div>
  );
}