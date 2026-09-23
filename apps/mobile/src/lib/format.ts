/** "2024. 10. 12" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
}

/** "방금 전", "3분 전", "2시간 전", or a date. */
export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return formatDate(iso);
}

/** "Look 01", "Look 02", ... for unnamed versions. */
export function defaultLookLabel(index: number): string {
  return `Look ${String(Math.max(1, index)).padStart(2, '0')}`;
}
