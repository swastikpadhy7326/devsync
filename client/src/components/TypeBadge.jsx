const TYPES = {
  task: { label: 'Task', color: 'bg-blue-500' },
  bug: { label: 'Bug', color: 'bg-red-500' },
  story: { label: 'Story', color: 'bg-emerald-500' },
};

// A colored square for the type. The label is shown next to it unless showLabel is false.
export default function TypeBadge({ type, showLabel = true }) {
  const t = TYPES[type] || TYPES.task;
  return (
    <span className="inline-flex items-center gap-1" title={t.label}>
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${t.color}`} />
      {showLabel && <span>{t.label}</span>}
    </span>
  );
}