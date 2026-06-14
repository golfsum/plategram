import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert } from 'react-native';
import Icon from '../icon';
import { C, F } from '../theme';
import { Card, Input, Label, Seg, toast } from '../ui';
import { useStore, calcTargets, targetBreakdown, actLabel, ACTIVITY, RESTRICTIONS } from '../store';
import { useAuth } from '../auth';
import SignIn from './SignIn';

export default function Settings({ onPaywall }) {
  const { state, update, reset } = useStore();
  const auth = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [kcal, setKcal] = useState(String(state.targets.kcal));
  const [p, setP] = useState(String(state.targets.p));
  const [c, setC] = useState(String(state.targets.c));
  const [f, setF] = useState(String(state.targets.f));

  // editable copy of your stats, seeded from the profile
  const [sex, setSex] = useState(state.profile.sex);
  const [goal, setGoal] = useState(state.profile.goal);
  const [act, setAct] = useState(state.profile.act);
  const [age, setAge] = useState(String(state.profile.age));
  const [heightCm, setHeightCm] = useState(String(state.profile.heightCm));
  const [weightKg, setWeightKg] = useState(String(state.profile.weightKg));
  const [diet, setDiet] = useState(state.profile.diet || 'balanced');
  const [restrictions, setRestrictions] = useState(state.profile.restrictions || []);
  // diet and restrictions persist the moment you pick them, no separate save needed
  const applyDiet = (d) => {
    setDiet(d);
    update((s) => { s.profile.diet = d; return s; });
  };
  const toggleRestriction = (k) => {
    const next = restrictions.indexOf(k) >= 0 ? restrictions.filter((x) => x !== k) : [...restrictions, k];
    setRestrictions(next);
    update((s) => { s.profile.restrictions = next; return s; });
  };

  // live preview of the target as the stats are changed, before saving
  const draft = {
    sex, goal, act, diet, restrictions,
    age: parseInt(age, 10) || state.profile.age,
    heightCm: parseInt(heightCm, 10) || state.profile.heightCm,
    weightKg: parseFloat(weightKg) || state.profile.weightKg,
  };
  const bd = targetBreakdown(draft);
  const lb = Math.round(draft.weightKg * 2.20462);
  const ft = Math.floor(draft.heightCm / 30.48);
  const inch = Math.round((draft.heightCm / 2.54) - ft * 12);

  const saveStats = () => {
    const t = calcTargets(draft);
    update((s) => {
      s.profile = { ...s.profile, ...draft };
      s.targets = t;
      s.targetsAuto = true;
      return s;
    });
    setKcal(String(t.kcal)); setP(String(t.p)); setC(String(t.c)); setF(String(t.f));
    toast('Target recalculated, ' + t.kcal + ' kcal a day');
  };

  const saveTargets = () => {
    update((s) => {
      s.targets.kcal = Math.max(800, parseInt(kcal, 10) || s.targets.kcal);
      s.targets.p = parseInt(p, 10) || s.targets.p;
      s.targets.c = parseInt(c, 10) || s.targets.c;
      s.targets.f = parseInt(f, 10) || s.targets.f;
      s.targetsAuto = false; // you set your own, so stop auto recalculating
      return s;
    });
    toast('Saved your own targets');
  };

  const removeFav = (id) => update((s) => { s.favorites = (s.favorites || []).filter((f) => f.id !== id); return s; });
  const clearFavs = () => { update((s) => { s.favorites = []; return s; }); toast('Cleared saved recipes'); };

  const exportData = async () => {
    // strip photos so the export stays small, and never include sync state
    const copy = JSON.parse(JSON.stringify(state));
    Object.keys(copy.meals).forEach((k) => copy.meals[k].forEach((m) => { delete m.img; }));
    delete copy.sync;
    try { await Share.share({ message: JSON.stringify(copy) }); } catch (e) {}
  };

  const confirmReset = () => {
    Alert.alert('Reset Plategram', 'This erases everything stored on this phone. There is no undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: reset },
    ]);
  };

  const togglePro = () => {
    update((s2) => { s2.pro = !s2.pro; return s2; });
    toast(state.pro ? 'Pro turned off' : 'Pro turned on for testing');
  };

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingBottom: 130 }}>
      {/* pro banner */}
      <Pressable onPress={state.pro ? undefined : onPaywall} style={s.proBanner}>
        <View style={{ flex: 1 }}>
          <Text style={s.proTitle}>{state.pro ? 'Plategram Pro is active' : 'Upgrade to Plategram Pro'}</Text>
          <Text style={s.proSub}>
            {state.pro ? 'Unlimited scans and every feature unlocked' : 'Unlimited photo scans, trends and sync'}
          </Text>
        </View>
        <Icon name={state.pro ? 'check' : 'sparkles'} size={26} color="#fff" />
      </Pressable>

      <Text style={s.secTitle}>Account</Text>
      <Card>
        {auth && auth.user ? (
          <>
            <View style={s.acctRow}>
              <View style={s.acctAvatar}><Icon name="check" size={18} color={C.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.acctName}>{auth.user.email || 'Signed in'}</Text>
                <Text style={s.acctSub}>Your data backs up to your account</Text>
              </View>
            </View>
            <Pressable onPress={() => { auth.signOut(); toast('Signed out'); }} style={s.saveRow}>
              <Text style={s.saveTxt}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.hint}>Sign in to back up your meals and sync across devices.</Text>
            <Pressable onPress={() => setSignInOpen(true)} style={[s.saveRow, { backgroundColor: C.gradB }]}>
              <Text style={[s.saveTxt, { color: '#fff' }]}>Sign in or create account</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Text style={s.secTitle}>Your stats</Text>
      <Card>
        <Label>Goal</Label>
        <Seg value={goal} onChange={setGoal}
          options={[{ value: 'lose', label: 'Lose' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain', label: 'Gain' }]} />
        <Label>Activity</Label>
        <Seg value={act} onChange={setAct} options={ACTIVITY.map((a) => ({ value: a.v, label: a.short }))} />
        <Label>Sex</Label>
        <Seg value={sex} onChange={setSex}
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Label>Age</Label><Input value={age} onChangeText={setAge} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Label>Height (cm)</Label><Input value={heightCm} onChangeText={setHeightCm} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Label>Weight (kg)</Label><Input value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" /></View>
        </View>
        <Text style={s.convo}>{ft}ft {inch}in, about {lb.toLocaleString()} lb</Text>

        <View style={s.breakdown}>
          <Text style={s.bdBig}>{bd.target.toLocaleString()} <Text style={s.bdUnit}>kcal a day</Text></Text>
          <Text style={s.bdLine}>
            Your resting burn is about {bd.bmr.toLocaleString()}. Being {actLabel(act)} puts a full day near {bd.maintenance.toLocaleString()}.
            {' '}{goal === 'lose' ? 'Taking off 500 to lose' : goal === 'gain' ? 'Adding 300 to build' : 'No change to maintain'} leaves {bd.target.toLocaleString()}.
          </Text>
        </View>

        <Label>Diet</Label>
        <Seg value={diet} onChange={applyDiet} options={[
          { value: 'balanced', label: 'Balanced' },
          { value: 'highprotein', label: 'Protein' },
          { value: 'lowcarb', label: 'Low carb' },
          { value: 'keto', label: 'Keto' },
        ]} />
        <Label>Restrictions</Label>
        <View style={s.chipWrap}>
          {RESTRICTIONS.map((r) => {
            const on = restrictions.indexOf(r.key) >= 0;
            return (
              <Pressable key={r.key} onPress={() => toggleRestriction(r.key)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipTxt, on && { color: C.orange }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[s.hint, { fontSize: 12, marginTop: 10 }]}>Diet and restrictions shape your meal ideas in Plan your day.</Text>

        <Pressable onPress={saveStats} style={s.saveRow}>
          <Text style={s.saveTxt}>Save and recalculate</Text>
        </Pressable>
        <Text style={[s.hint, { fontSize: 12, marginTop: 10 }]}>
          {state.targetsAuto ? 'This updates on its own each time you log a new weight.' : 'Auto update is off because you set your own numbers below.'}
        </Text>
      </Card>

      <Text style={s.secTitle}>Adjust targets</Text>
      <Card>
        <Text style={[s.hint, { marginBottom: 4 }]}>Override the numbers by hand. Doing this turns off the automatic recalculation above.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Calories</Label>
            <Input value={kcal} onChangeText={setKcal} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Protein (g)</Label>
            <Input value={p} onChangeText={setP} keyboardType="number-pad" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Carbs (g)</Label>
            <Input value={c} onChangeText={setC} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Fat (g)</Label>
            <Input value={f} onChangeText={setF} keyboardType="number-pad" />
          </View>
        </View>
        <Pressable onPress={saveTargets} style={s.saveRow}>
          <Text style={s.saveTxt}>Save my own targets</Text>
        </Pressable>
      </Card>

      <Text style={s.secTitle}>Saved recipes</Text>
      <Card>
        {(state.favorites || []).length === 0 ? (
          <Text style={s.hint}>Tap the heart on a recipe in Plan your day to save it here.</Text>
        ) : (
          (state.favorites || []).map((r) => (
            <View key={r.id} style={s.favRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.favName} numberOfLines={1}>{r.name}</Text>
                <Text style={s.favMeta}>{r.kcal} kcal · {r.p}g protein{r.minutes ? ' · ' + r.minutes + ' min' : ''}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => removeFav(r.id)} style={{ padding: 4 }}>
                <Icon name="fav" size={18} color={C.fat} />
              </Pressable>
            </View>
          ))
        )}
        {(state.favorites || []).length > 1 ? (
          <Pressable onPress={clearFavs} style={[s.saveRow, { backgroundColor: 'transparent', paddingHorizontal: 0 }]}>
            <Text style={[s.saveTxt, { color: C.muted }]}>Clear all saved recipes</Text>
          </Pressable>
        ) : null}
      </Card>

      <Text style={s.secTitle}>Data</Text>
      <Card>
        <Pressable style={s.row} onPress={exportData}>
          <Icon name="download" size={19} color={C.muted} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Export my data</Text>
            <Text style={s.rowSub}>Share a JSON copy, photos excluded</Text>
          </View>
          <Icon name="forward" size={16} color={C.muted} />
        </Pressable>
        <Pressable style={[s.row, { borderBottomWidth: 0 }]} onPress={confirmReset}>
          <Icon name="trash" size={19} color={C.fat} />
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: C.fat }]}>Reset app</Text>
            <Text style={s.rowSub}>Erase everything on this phone</Text>
          </View>
        </Pressable>
      </Card>

      <Text style={s.secTitle}>Testing</Text>
      <Card>
        <Text style={s.hint}>
          Flip Pro on or off without going through checkout, so you can try the locked features.
        </Text>
        <Pressable onPress={togglePro} style={[s.testBtn, state.pro && s.testBtnOn]}>
          <Icon name={state.pro ? 'check' : 'sparkles'} size={17} color={state.pro ? C.green : C.orange} />
          <Text style={[s.testTxt, state.pro && { color: C.green }]}>
            {state.pro ? 'Pro is on, tap to turn off' : 'Turn on Pro for testing'}
          </Text>
        </Pressable>
      </Card>

      <Text style={s.foot}>
        Plategram 1.0{'\n'}Calorie and burn numbers are estimates, not medical advice.
      </Text>
    </ScrollView>
    <SignIn visible={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  proBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.gradB, borderRadius: 20, padding: 18, marginBottom: 8,
    shadowColor: C.gradB, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  proTitle: { color: '#fff', fontFamily: F.extra, fontSize: 16.5 },
  proSub: { color: 'rgba(255,255,255,0.85)', fontFamily: F.semi, fontSize: 12.5, marginTop: 2 },
  secTitle: { color: C.text, fontFamily: F.extra, fontSize: 16, marginTop: 22, marginBottom: 10 },
  hint: { color: C.muted, fontFamily: F.semi, fontSize: 13, lineHeight: 19 },
  saveRow: { marginTop: 14, alignSelf: 'flex-start', backgroundColor: C.orangeSoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  saveTxt: { color: C.orange, fontFamily: F.bold, fontSize: 13.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: C.card2, borderWidth: 1.5, borderColor: C.line },
  chipOn: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  chipTxt: { color: C.muted, fontFamily: F.bold, fontSize: 13 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acctAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  acctName: { color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  acctSub: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line },
  favName: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  favMeta: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  convo: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 8 },
  breakdown: {
    backgroundColor: C.card2, borderRadius: 14, padding: 14, marginTop: 14,
  },
  bdBig: { color: C.orange, fontFamily: F.extra, fontSize: 26, letterSpacing: -0.5 },
  bdUnit: { color: C.muted, fontFamily: F.bold, fontSize: 13, letterSpacing: 0 },
  bdLine: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    marginTop: 14, paddingVertical: 13, borderRadius: 13,
    backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: 'rgba(255,122,47,0.4)',
  },
  testBtnOn: { backgroundColor: C.greenSoft, borderColor: 'rgba(52,210,123,0.4)' },
  testTxt: { color: C.orange, fontFamily: F.bold, fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 9, height: 9, borderRadius: 99 },
  statusTxt: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  codeLbl: { color: C.muted, fontFamily: F.bold, fontSize: 11 },
  code: { color: C.text, fontFamily: F.extra, fontSize: 18, letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: C.line,
  },
  rowTitle: { color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  rowSub: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  foot: { color: C.muted, fontFamily: F.semi, fontSize: 11.5, textAlign: 'center', marginTop: 26, lineHeight: 18 },
});
