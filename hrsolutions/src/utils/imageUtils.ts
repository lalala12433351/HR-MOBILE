function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image. Try a JPG or PNG.'));
    img.src = dataUrl;
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  try {
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (jpeg.startsWith('data:image/jpeg')) return jpeg;
  } catch {
    // Some canvases cannot encode JPEG.
  }
  try {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
  } catch {
    // Fall through to PNG.
  }
  return canvas.toDataURL('image/png');
}

/** Resize a data URL for avatar storage. */
export async function compressAvatarFromDataUrl(
  dataUrl: string,
  maxWidth = 256,
  maxHeight = 256,
  quality = 0.85
): Promise<string> {
  if (!dataUrl) {
    throw new Error('No image data provided');
  }
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
  if (!ctx) return dataUrl;

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
 * Utility to compress uploaded avatar images to small data URLs
 * to prevent HTTP payload size errors and ensure fast rendering & storage.
 */
export async function compressAvatarImage(
  file: File,
  maxWidth = 256,
  maxHeight = 256,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve('');
        return;
      }

      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        try {
          const compressed = canvas.toDataURL('image/webp', quality);
          if (compressed.startsWith('data:image/webp')) {
            resolve(compressed);
            return;
          }
        } catch (_) {}

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };

    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}
