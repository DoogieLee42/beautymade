import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Opens the system share sheet for a rendered image (file:// URI). Returns false if sharing is unavailable. */
export async function shareImage(uri: string, _fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: '비교 이미지 공유' });
  return true;
}

/** Downloads an image from the API and opens the share sheet for it. */
export async function shareRemoteImage(url: string, fileName: string): Promise<boolean> {
  const dir = new Directory(Paths.cache, 'shared');
  if (!dir.exists) dir.create();
  const target = new File(dir, fileName);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  return shareImage(file.uri, fileName);
}
