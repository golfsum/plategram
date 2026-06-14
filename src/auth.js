import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, GoogleAuthProvider, OAuthProvider, signInWithCredential,
} from 'firebase/auth';
import { auth, firebaseReady } from './firebase';

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!firebaseReady);

  useEffect(() => {
    if (!firebaseReady || !auth) { setReady(true); return; }
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
    return unsub;
  }, []);

  const signInGoogle = async () => {
    // lazy require so the app still loads in Expo Go (native module is dev-build only)
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    if (GOOGLE_IOS_CLIENT_ID) GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID });
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    const idToken = res.idToken || (res.data && res.data.idToken);
    if (!idToken) throw new Error('No Google idToken');
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  };

  const signInApple = async () => {
    const AppleAuthentication = require('expo-apple-authentication');
    const Crypto = require('expo-crypto');
    const rawNonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const creds = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    const provider = new OAuthProvider('apple.com');
    const cred = provider.credential({ idToken: creds.identityToken, rawNonce });
    return signInWithCredential(auth, cred);
  };

  const value = {
    user,
    ready,
    configured: firebaseReady,
    appleAvailable: Platform.OS === 'ios',
    googleConfigured: !!GOOGLE_IOS_CLIENT_ID,
    signInEmail: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    signUpEmail: (email, pw) => createUserWithEmailAndPassword(auth, email, pw),
    signOut: () => fbSignOut(auth),
    signInGoogle,
    signInApple,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
