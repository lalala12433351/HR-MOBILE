import type { CapacitorConfig } from '@capacitor/cli';

// Local development loads this repository's Next.js UI, never the older website.
// Use the platform-specific npm scripts for iOS or an explicit URL for devices/CI.
const configuredUrl = process.env.CAPACITOR_SERVER_URL?.trim();
if (process.env.CI && !configuredUrl) {
  throw new Error('CAPACITOR_SERVER_URL must point to the deployed mobile UI from this repository.');
}
const serverUrl = configuredUrl || 'http://10.0.2.2:3010';
const frontendUrl = new URL(serverUrl);
if (!['http:', 'https:'].includes(frontendUrl.protocol)) {
  throw new Error('CAPACITOR_SERVER_URL must be an HTTP or HTTPS frontend URL.');
}

const config: CapacitorConfig = {
  appId: 'in.pixbe.hrsolutions',
  appName: 'HR Solutions',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    allowNavigation: [
      frontendUrl.hostname,
      'masteradmin.pixbe.in',
      'localhost',
      '10.0.2.2',
      '*.amazonaws.com',
      '*.google.com',
      '*.googleapis.com',
      '*.firebaseapp.com',
      'accounts.google.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#f8fafc',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f8fafc',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      iconColor: '#2563eb',
      sound: 'default',
    },
  },
  android: {
    allowMixedContent: serverUrl.startsWith('http://'),
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
