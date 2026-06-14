import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, EmailAuthProvider,
  signOut as fbSignOut, GoogleAuthProvider, OAuthProvider,
  signInWithCredential, linkWithCredential, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, firebaseReady } from './firebase';

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const isAnon = () => auth && auth.currentUser && auth.currentUser.isAnonymous;

// link a credential to the current anonymous user (convert), or fall back to
// a normal sign-in if that account already exists
async function linkOrSignIn(cred) {
  if (isAnon()) {
    try {
      return await linkWithCredential(auth.currentUser, cred);
    } catch (e) {
      if (e && e.code && (e.code.indexOf('credential-already-in-use') >= 0 || e.code.indexOf('email-already-in-use') >= 0)) {
        return signInWithCredential(auth, cred);
      }
      throw e;
    }
  }
  return signInWithCredential(auth, cred);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!firebaseReady);

  useEffect(() => {
    if (!firebaseReady || !auth) { setReady(true); return; }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
      // no user yet, sign in silently so there is always an account to attach data to
      if (!u) signInAnonymously(auth).catch(() => {});
    });
    return unsub;
  }, []);

  const signUpEmail = async (email, pw) => {
    if (isAnon()) {
      try {
        return await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, pw));
      } catch (e) {
        if (e && e.code && e.code.indexOf('email-already-in-use') >= 0) return signInWithEmailAndPassword(auth, email, pw);
        throw e;
      }
    }
    return createUserWithEmailAndPassword(auth, email, pw);
  };

  const signInGoogle = async () => {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    if (GOOGLE_IOS_CLIENT_ID) GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID });
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    const idToken = res.idToken || (res.data && res.data.idToken);
    if (!idToken) throw new Error('No Google idToken');
    return linkOrSignIn(GoogleAuthProvider.credential(idToken));
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
    return linkOrSignIn(provider.credential({ idToken: creds.identityToken, rawNonce }));
  };

  const value = {
    user,
    ready,
    configured: firebaseReady,
    isAnonymous: !!(user && user.isAnonymous),
    signedIn: !!(user && !user.isAnonymous),
    appleAvailable: Platform.OS === 'ios',
    googleConfigured: !!GOOGLE_IOS_CLIENT_ID,
    signInEmail: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    signUpEmail,
    signInGoogle,
    signInApple,
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    signOut: () => fbSignOut(auth), // becomes anonymous again on next tick
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
