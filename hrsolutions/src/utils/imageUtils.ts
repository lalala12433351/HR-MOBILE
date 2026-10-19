/**
 * Compress avatar images to small data URLs for storage and API payloads.
 * Prefers JPEG (universal on mobile WebViews); rejects undecodable / empty results.
 */

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

function isLikelyHeic(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image. Try a JPG or PNG.'));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result) {
        reject(new Error('Failed to read image file'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  try {
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (jpeg.startsWith('data:image/jpeg')) return jpeg;
  } catch {
    // fall through
  }
  try {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
  } catch {
    // fall through
  }
  return canvas.toDataURL('image/png');
}

/**
 * Resize/compress a data URL for avatar storage.
 */
export async function compressAvatarFromDataUrl(
  dataUrl: string,
  maxWidth = 256,
  maxHeight = 256,
  quality = 0.85
): Promise<string> {
  if (!dataUrl) {
    throw new Error('No image data provided');
  }

  // Pass through small SVGs unchanged
  if (dataUrl.startsWith('data:image/svg+xml')) {
    return dataUrl;
  }

  const img = await loadImageFromDataUrl(dataUrl);
  let width = img.width;
  let height = img.height;

  if (!width || !height) {
    throw new Error('Invalid image dimensions');
  }

  if (width > height) {
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
  } else if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrl;
  }

  // White background so transparent PNGs don't become black in JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const compressed = canvasToJpegDataUrl(canvas, quality);
  if (!compressed || compressed === 'data:,') {
    throw new Error('Failed to compress image');
  }
  return compressed;
}

/**
 * Compress an uploaded File for avatar use.
 */
export async function compressAvatarImage(
  file: File,
  maxWidth = 256,
  maxHeight = 256,
  quality = 0.85
): Promise<string> {
  if (!file) {
    throw new Error('No image selected');
  }

  if (isLikelyHeic(file)) {
    throw new Error('HEIC photos are not supported here. Choose a JPG or PNG, or pick from Camera.');
  }

  if (file.type === 'image/svg+xml') {
    return readFileAsDataUrl(file);
  }

  const dataUrl = await readFileAsDataUrl(file);
  return compressAvatarFromDataUrl(dataUrl, maxWidth, maxHeight, quality);
}
