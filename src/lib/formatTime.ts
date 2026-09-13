/** Formats seconds as `1:02:03` (or `2:03` for durations shorter than an hour) */
export const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = `${m}`.padStart(h ? 2 : 1, '0');
  const ss = `${s}`.padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
