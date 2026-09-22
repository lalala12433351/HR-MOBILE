'use client';

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativePlatform } from './platform';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Download a Blob. On native, write to cache and open the share sheet.
 * On web, use the classic object-URL + anchor download pattern.
 */
export async function downloadBlob(
  blob: Blob,
  filename: string
): Promise<void> {
  if (isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const path = filename.replace(/[\\/]/g, '_');
    const result = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: 'Save or share file',
      });
    } catch {
      // User cancelled share sheet — file is still in cache
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Write a plain-text file (CSV/JSON) and share/download it.
 */
export async function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/plain'
): Promise<void> {
  if (isNativePlatform()) {
    const path = filename.replace(/[\\/]/g, '_');
    const result = await Filesystem.writeFile({
      path,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    try {
      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: 'Save or share file',
      });
    } catch {
      // cancelled
    }
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  await downloadBlob(blob, filename);
}
