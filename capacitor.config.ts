import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.whocalled.app',
  appName: 'Who Called?',
  webDir: 'dist/who-called/browser',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#111b21' },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_who_called',
      iconColor: '#59c88c',
    },
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: '#111b21',
      showSpinner: false,
    },
  },
};

export default config;
