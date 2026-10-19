import { canUseNativePhotoPicker, pickAvatarPhoto } from '@/lib/native/camera';
import { compressAvatarFromDataUrl, compressAvatarImage } from '@/utils/imageUtils';

/**
 * Resolve an avatar data URL from either:
 * - native Capacitor Camera/Photos picker, or
 * - a File from an HTML file input (web / fallback).
 *
 * Returns null when the user cancels the native picker.
 */
export async function resolveAvatarDataUrl(file?: File | null): Promise<string | null> {
  if (file) {
    return compressAvatarImage(file);
  }

  if (!canUseNativePhotoPicker()) {
    return null;
  }

  try {
    const raw = await pickAvatarPhoto();
    return compressAvatarFromDataUrl(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Capacitor cancels with various messages depending on platform
    if (
      /cancel|cancelled|canceled|user cancelled|User cancelled|No image picked/i.test(message)
    ) {
      return null;
    }
    throw err;
  }
}

export function shouldUseNativeAvatarPicker(): boolean {
  return canUseNativePhotoPicker();
}
