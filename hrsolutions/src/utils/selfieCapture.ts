/** Mirrored, downscaled JPEG so a webcam frame fits the punch photo column. */
export function captureMirroredSelfie(video: HTMLVideoElement, maxEdge = 960): string | null {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH || video.readyState < 2) return null;

  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);
  ctx.restore();

  let quality = 0.72;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > 1_500_000 && quality > 0.4) {
    quality -= 0.12;
    url = canvas.toDataURL('image/jpeg', Number(quality.toFixed(2)));
  }
  return url;
}
