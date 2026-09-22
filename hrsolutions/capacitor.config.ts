import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || 'https://app.pixbe.in';

const config: CapacitorConfig = {
  appId: 'in.pixbe.hrsolutions',
  appName: 'HR Solutions',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    allowNavigation: [
      'app.pixbe.in',
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
