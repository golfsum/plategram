import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Icon from '../icon';
import { C, F } from '../theme';
import { Btn, toast } from '../ui';
import { useStore } from '../store';
import { useAuth } from '../auth';
import SignIn from './SignIn';

export default function Account({ visible, onClose }) {
  const { state, update } = useStore();
  const auth = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (fromCamera) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast(fromCamera ? 'Camera access needed' : 'Photo access needed'); return; }
      const opts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets || !res.assets.length) return;
      setBusy(true);
      const m = await ImageManipulator.manipulateAsync(
        res.assets[0].uri, [{ resize: { width: 256, height: 256 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      update((s) => { s.avatar = 'data:image/jpeg;base64,' + m.base64; return s; });
      toast('Photo updated');
    } catch (e) {
      toast('Could not set the photo');
    } finally { setBusy(false); }
  };

  const choosePhoto = () => {
    const buttons = [
      { text: 'Take a selfie', onPress: () => pick(true) },
      { text: 'Choose from library', onPress: () => pick(false) },
    ];
    if (state.avatar) buttons.push({ text: 'Remove photo', style: 'destructive', onPress: () => update((s) => { s.avatar = null; return s; }) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile photo', 'After picking, drag and pinch to frame it.', buttons);
  };

  const u = auth && auth.user;
  const signedIn = auth && auth.signedIn;
  const email = u && u.email;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.page}>
        <View style={s.head}>
          <Text style={s.title}>Account</Text>
          <Pressable onPress={onClose} style={s.xBtn}><Icon name="close" size={18} color={C.text} /></Pressable>
        </View>

        <View style={s.center}>
          <Pressable onPress={choosePhoto} style={s.avatarWrap}>
            {state.avatar
              ? <Image source={{ uri: state.avatar }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarPh]}><Icon name="account" size={56} color={C.muted} /></View>}
            <View style={s.camBadge}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="camera2" size={15} color="#fff" />}
            </View>
          </Pressable>
          <Text style={s.name}>{signedIn ? (email || 'Signed in') : 'Guest account'}</Text>
          <Text style={s.sub}>{signedIn ? 'Backed up to your account' : 'Your data is on this phone only'}</Text>
          <Pressable onPress={choosePhoto}><Text style={s.editPhoto}>{state.avatar ? 'Change photo' : 'Add a photo'}</Text></Pressable>
        </View>

        {!signedIn ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Save your progress</Text>
            <Text style={s.cardSub}>Create an account to back up your meals, photos and history, and sync across devices. Everything you have logged so far comes with you.</Text>
            <Btn title="Sign in or create account" onPress={() => setSignInOpen(true)} style={{ marginTop: 16 }} />
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.cardTitle}>Signed in</Text>
            <Text style={s.cardSub}>{email || 'Your account is active.'}</Text>
            <Btn ghost title="Sign out" onPress={() => { auth.signOut(); toast('Signed out'); }} style={{ marginTop: 16 }} />
          </View>
        )}

        {!auth || !auth.configured ? (
          <Text style={s.note}>Add your Firebase keys to .env to enable accounts. The app still works fully without one.</Text>
        ) : null}
      </View>
      <SignIn visible={signInOpen} onClose={() => setSignInOpen(false)} />
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingTop: 56, paddingHorizontal: 22 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: C.text, fontFamily: F.extra, fontSize: 22 },
  xBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingVertical: 24 },
  avatarWrap: { width: 110, height: 110 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPh: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.gradB, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg },
  name: { color: C.text, fontFamily: F.extra, fontSize: 18, marginTop: 14 },
  sub: { color: C.muted, fontFamily: F.semi, fontSize: 13, marginTop: 3 },
  editPhoto: { color: C.orange, fontFamily: F.bold, fontSize: 13.5, marginTop: 12 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18, marginTop: 8 },
  cardTitle: { color: C.text, fontFamily: F.extra, fontSize: 16 },
  cardSub: { color: C.muted, fontFamily: F.semi, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  note: { color: C.muted, fontFamily: F.semi, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 },
});
