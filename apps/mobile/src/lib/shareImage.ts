import * as Sharing from 'expo-sharing';

/** Opens the system share sheet for a rendered image (file:// URI). Returns false if sharing is unavailable. */
export async function shareImage(uri: string, _fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: '비교 이미지 공유' });
  return true;
}
