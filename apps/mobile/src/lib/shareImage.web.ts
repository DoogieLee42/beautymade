/** Web: downloads the rendered image (a data URL) as a file. */
export async function shareImage(uri: string, fileName: string): Promise<boolean> {
  const link = document.createElement('a');
  link.href = uri;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
