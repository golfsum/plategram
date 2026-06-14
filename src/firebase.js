import { initializeApp, getApps } from 'firebase/app';
import * as fbAuth from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECT = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: PROJECT ? PROJECT + '.firebaseapp.com' : undefined,
  projectId: PROJECT,
  storageBucket: PROJECT ? PROJECT + '.appspot.com' : undefined,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MSG_SENDER_ID,
};

// auth needs at least these three; appId is recommended
export const firebaseReady = !!(cfg.apiKey && cfg.projectId);

let auth = null;
if (firebaseReady) {
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  try {
    auth = fbAuth.getReactNativePersistence
      ? fbAuth.initializeAuth(app, { persistence: fbAuth.getReactNativePersistence(AsyncStorage) })
      : fbAuth.getAuth(app);
  } catch (e) {
    auth = fbAuth.getAuth(app);
  }
}

export { auth };
