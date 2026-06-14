import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Icon from './src/icon';
import {
  useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { C, F } from './src/theme';
import { StoreProvider, useStore, streakOf } from './src/store';
import { AuthProvider } from './src/auth';
import { ToastHost } from './src/ui';
import Onboarding from './src/screens/Onboarding';
import Today from './src/screens/Today';
import Progress from './src/screens/Progress';
import Settings from './src/screens/Settings';
import Account from './src/screens/Account';
import { AddSheet, ScanModal, ExerciseSheet, QuickAddSheet, DrinksSheet, Paywall } from './src/screens/Modals';

function Main() {
  const { state } = useStore();
  const [tab, setTab] = useState('today');
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCamera, setScanCamera] = useState(true);
  const [exOpen, setExOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [drinkOpen, setDrinkOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  if (!state.onboarded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Onboarding onDone={() => setTab('today')} onPaywall={() => setPaywallOpen(true)} />
        <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
        <ToastHost />
      </View>
    );
  }

  const dateStr = new Date()
    .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
  const titles = { today: 'Today', progress: 'Progress', settings: 'Settings' };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* header */}
        <View style={s.head}>
          <View>
            <Text style={s.headDate}>{dateStr}</Text>
            <Text style={s.headTitle}>{titles[tab]}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <View style={s.chip}>
              <Icon name="burn" size={15} color={C.orange} fill={C.orange} />
              <Text style={s.chipTxt}>{streakOf(state)}</Text>
            </View>
            <Pressable style={s.chip} onPress={() => setTab('settings')}>
              <Icon name="settings" size={15} color={tab === 'settings' ? C.orange : C.muted} />
            </Pressable>
            <Pressable style={s.avatarChip} onPress={() => setAccountOpen(true)}>
              {state.avatar
                ? <Image source={{ uri: state.avatar }} style={s.avatarImg} />
                : <Icon name="account" size={20} color={C.muted} />}
            </Pressable>
          </View>
        </View>

        {tab === 'today' && <Today />}
        {tab === 'progress' && <Progress />}
        {tab === 'settings' && <Settings onPaywall={() => setPaywallOpen(true)} />}
      </SafeAreaView>

      {/* tab bar */}
      <View style={s.tabbar}>
        <Pressable style={s.tab} onPress={() => setTab('today')}>
          <Icon name="home" size={23} color={tab === 'today' ? C.text : C.muted}
            strokeWidth={tab === 'today' ? 2.5 : 2} />
          <Text style={[s.tabTxt, tab === 'today' && { color: C.text }]}>Today</Text>
        </Pressable>
        <Pressable style={s.fab} onPress={() => setAddOpen(true)}>
          <Icon name="add" size={30} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <Pressable style={s.tab} onPress={() => setTab('progress')}>
          <Icon name="progress" size={23} color={tab === 'progress' ? C.text : C.muted}
            strokeWidth={tab === 'progress' ? 2.5 : 2} />
          <Text style={[s.tabTxt, tab === 'progress' && { color: C.text }]}>Progress</Text>
        </Pressable>
      </View>

      {/* modals */}
      <AddSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onScan={(cam) => { setScanCamera(cam); setScanOpen(true); }}
        onQuick={() => setQuickOpen(true)}
        onExercise={() => setExOpen(true)}
        onDrink={() => setDrinkOpen(true)}
        onPaywall={() => setPaywallOpen(true)}
      />
      <ScanModal visible={scanOpen} fromCamera={scanCamera} onClose={() => setScanOpen(false)} />
      <ExerciseSheet visible={exOpen} onClose={() => setExOpen(false)} />
      <QuickAddSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />
      <DrinksSheet visible={drinkOpen} onClose={() => setDrinkOpen(false)} />
      <Account visible={accountOpen} onClose={() => setAccountOpen(false)} />
      <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <ToastHost />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <StoreProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Main />
      </AuthProvider>
    </StoreProvider>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6,
  },
  headDate: { color: C.muted, fontFamily: F.extra, fontSize: 11.5, letterSpacing: 1 },
  headTitle: { color: C.text, fontFamily: F.extra, fontSize: 23, marginTop: 1 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 99,
  },
  chipTxt: { color: C.text, fontFamily: F.extra, fontSize: 14 },
  avatarChip: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  tabbar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end',
    backgroundColor: 'rgba(15,15,22,0.97)', borderTopWidth: 1, borderColor: C.line,
    paddingTop: 10, paddingBottom: 28,
  },
  tab: { alignItems: 'center', gap: 3, width: 80 },
  tabTxt: { color: C.muted, fontFamily: F.bold, fontSize: 10.5 },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: C.gradB,
    alignItems: 'center', justifyContent: 'center', marginTop: -32,
    shadowColor: C.gradB, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
