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

/** Web: fetches the image (the API allows cross-origin reads) and downloads it. */
export async function shareRemoteImage(url: string, fileName: string): Promise<boolean> {
  const blob = await (await fetch(url)).blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await shareImage(objectUrl, fileName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
