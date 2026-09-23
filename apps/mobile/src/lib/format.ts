/** "9월 23일" (this year) or "2025년 9월 23일". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${d.getFullYear()}년 `}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "방금 전", "3분 전", "2시간 전", or a date. */
export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return formatDate(iso);
}
