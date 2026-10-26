import type { CapacitorConfig } from '@capacitor/cli';

// Production packages the exported UI; a URL is optional for live reload only.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const frontendUrl = serverUrl ? new URL(serverUrl) : undefined;
if (frontendUrl && !['http:', 'https:'].includes(frontendUrl.protocol)) {
  throw new Error('CAPACITOR_SERVER_URL must use HTTP or HTTPS.');
}

const config: CapacitorConfig = {
  appId: 'in.pixbe.hrsolutions',
  appName: 'HR Solutions',
  webDir: 'out',
  ...(serverUrl ? {
    server: {
      url: serverUrl,
      cleartext: frontendUrl!.protocol === 'http:',
      allowNavigation: [frontendUrl!.hostname],
    },
  } : {}),
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
    allowMixedContent: Boolean(serverUrl?.startsWith('http://')),
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
