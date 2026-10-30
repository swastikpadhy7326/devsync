const DAY = 24 * 60 * 60 * 1000;
const toMs = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const toStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const round = (n) => Math.round(n * 100) / 100;

// Dates are plain YYYY-MM-DD strings (UTC days). completedDays holds the day each finished work item was completed.
// days = the work still open at the end of each day from the start until today (or the end date, if it has passed)
// ideal = a straight line from the full amount to zero across the whole sprint, or null when there is no end date
function buildBurndown({ start, end = null, today, total, completedDays = [] }) {
  const startMs = toMs(start);
  const todayMs = toMs(today);
  const endMs = end ? toMs(end) : null;

  const lastActual = endMs !== null ? Math.min(endMs, todayMs) : todayMs;
  const days = [];
  for (let ms = startMs; ms <= lastActual; ms += DAY) {
    const date = toStr(ms);
    const done = completedDays.filter((d) => d <= date).length;
    days.push({ date, remaining: Math.max(total - done, 0) });
  }

  let ideal = null;
  if (endMs !== null && endMs >= startMs) {
    const count = Math.round((endMs - startMs) / DAY) + 1;
    ideal = [];
    for (let i = 0; i < count; i += 1) {
      ideal.push({
        date: toStr(startMs + i * DAY),
        remaining: count === 1 ? 0 : round((total * (count - 1 - i)) / (count - 1)),
      });
    }
  }

  return { days, ideal };
}

module.exports = { buildBurndown };