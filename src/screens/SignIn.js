import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Icon from '../icon';
import { C, F } from '../theme';
import { Btn, Input, Label, toast } from '../ui';
import { useAuth } from '../auth';

export default function SignIn({ visible, onClose }) {
  const a = useAuth();
  const [mode, setMode] = useState('in'); // in | up
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn) => {
    setErr(''); setBusy(true);
    try { await fn(); toast('Signed in'); onClose(); }
    catch (e) { setErr(prettyError(e)); }
    finally { setBusy(false); }
  };
  const doEmail = () => {
    if (!email.trim() || !pw) { setErr('Enter your email and password'); return; }
    run(() => (mode === 'in' ? a.signInEmail(email.trim(), pw) : a.signUpEmail(email.trim(), pw)));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60 }} keyboardShouldPersistTaps="handled">
          <View style={s.head}>
            <View style={s.mark}><Icon name="burn" size={30} color="#fff" /></View>
            <Pressable onPress={onClose} style={s.xBtn}><Icon name="close" size={18} color={C.text} /></Pressable>
          </View>
          <Text style={s.title}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={s.sub}>Sign in to back up your meals and sync across devices.</Text>

          {!a.configured ? (
            <Text style={s.warn}>Sign-in is not configured yet. Add your Firebase keys to .env (see the README).</Text>
          ) : null}

          <Label>Email</Label>
          <Input value={email} onChangeText={setEmail} placeholder="you@email.com"
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Label>Password</Label>
          <Input value={pw} onChangeText={setPw} placeholder="Your password" secureTextEntry />
          {err ? <Text style={s.err}>{err}</Text> : null}

          <Btn title={busy ? 'Please wait…' : (mode === 'in' ? 'Sign in' : 'Create account')}
            onPress={doEmail} disabled={busy || !a.configured} style={{ marginTop: 18 }} />
          <Pressable onPress={() => { setErr(''); setMode(mode === 'in' ? 'up' : 'in'); }} style={{ alignSelf: 'center', marginTop: 14 }}>
            <Text style={s.toggle}>{mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Text>
          </Pressable>

          <View style={s.divider}><View style={s.line} /><Text style={s.or}>or</Text><View style={s.line} /></View>

          {a.appleAvailable ? (
            <Pressable style={[s.social, { backgroundColor: '#000' }]} disabled={busy} onPress={() => run(a.signInApple)}>
              <Icon name="check" size={16} color="#fff" />
              <Text style={[s.socialTxt, { color: '#fff' }]}>Continue with Apple</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.social, { backgroundColor: C.card, borderWidth: 1, borderColor: C.line }]} disabled={busy} onPress={() => run(a.signInGoogle)}>
            <Icon name="check" size={16} color={C.text} />
            <Text style={[s.socialTxt, { color: C.text }]}>Continue with Google</Text>
          </Pressable>
          <Text style={s.note}>Apple and Google sign-in work in a built app, not Expo Go.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function prettyError(e) {
  const c = (e && e.code) || '';
  if (c.indexOf('invalid-credential') >= 0 || c.indexOf('wrong-password') >= 0) return 'That email or password is not right.';
  if (c.indexOf('email-already-in-use') >= 0) return 'That email already has an account. Try signing in.';
  if (c.indexOf('weak-password') >= 0) return 'Use a password of at least 6 characters.';
  if (c.indexOf('invalid-email') >= 0) return 'That email address looks off.';
  if (c.indexOf('network') >= 0) return 'Network problem. Check your connection.';
  return (e && e.message) || 'Could not sign in.';
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  mark: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.gradB, alignItems: 'center', justifyContent: 'center' },
  xBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontFamily: F.extra, fontSize: 26, letterSpacing: -0.5 },
  sub: { color: C.muted, fontFamily: F.semi, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 8 },
  warn: { color: C.carbs, fontFamily: F.semi, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  err: { color: C.fat, fontFamily: F.semi, fontSize: 13, marginTop: 10 },
  toggle: { color: C.orange, fontFamily: F.bold, fontSize: 13.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: C.line },
  or: { color: C.muted, fontFamily: F.bold, fontSize: 12 },
  social: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  socialTxt: { fontFamily: F.bold, fontSize: 15 },
  note: { color: C.muted, fontFamily: F.semi, fontSize: 11.5, textAlign: 'center', marginTop: 8 },
});
