'use client';

import { Browser } from '@capacitor/browser';
import { isNativePlatform } from './platform';

/**
 * Open an external URL. Uses Capactor Browser on native so links leave the WebView cleanly.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  if (isNativePlatform()) {
    await Browser.open({ url });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
