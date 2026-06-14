import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ImageBackground, Image, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from '../icon';
import { C, F } from '../theme';
import { Btn, Seg, Input, Label, toast } from '../ui';
import { useStore, calcTargets, todayKey, RESTRICTIONS } from '../store';

// Photo by Brooke Lark on Unsplash, free to use under the Unsplash license.
const HERO = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1100&q=70';

const GOALS = [
  { key: 'lose', icon: 'goal-lose', title: 'Lose weight', sub: 'Steady, sustainable fat loss' },
  { key: 'maintain', icon: 'goal-maintain', title: 'Maintain', sub: 'Stay where you are, eat smarter' },
  { key: 'gain', icon: 'goal-gain', title: 'Build muscle', sub: 'Lean bulk with plenty of protein' },
];
const ACTS = [
  { v: 1.2, icon: 'act-sitting', title: 'Mostly sitting', sub: 'Desk job, not much movement' },
  { v: 1.375, icon: 'act-light', title: 'Lightly active', sub: 'Walks, light exercise 1 to 3 times a week' },
  { v: 1.55, icon: 'act-active', title: 'Active', sub: 'Exercise 3 to 5 times a week' },
  { v: 1.725, icon: 'act-very', title: 'Very active', sub: 'Hard training or a physical job' },
];
const DIET_OPTS = [
  { key: 'balanced', icon: 'meal', title: 'Balanced', sub: 'A bit of everything' },
  { key: 'highprotein', icon: 'workout', title: 'High protein', sub: 'Protein at every meal' },
  { key: 'lowcarb', icon: 'goal-lose', title: 'Low carb', sub: 'Lighter on carbs' },
  { key: 'keto', icon: 'burn', title: 'Keto', sub: 'Very low carb, higher fat' },
];

export default function Onboarding({ onDone, onPaywall }) {
  const { update } = useStore();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(null);
  const [sex, setSex] = useState('male');
  const [units, setUnits] = useState('metric');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [hCm, setHCm] = useState('');
  const [hFt, setHFt] = useState('');
  const [hIn, setHIn] = useState('');
  const [act, setAct] = useState(null);
  const [diet, setDiet] = useState('balanced');
  const [restrictions, setRestrictions] = useState([]);
  const [plan, setPlan] = useState(null);

  const toggleRestriction = (key) =>
    setRestrictions((r) => (r.indexOf(key) >= 0 ? r.filter((x) => x !== key) : [...r, key]));

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  const saveBody = () => {
    const a = parseInt(age, 10);
    const w = parseFloat(weight);
    let h;
    if (units === 'imperial') {
      h = Math.round(((parseInt(hFt, 10) || 0) * 12 + (parseInt(hIn, 10) || 0)) * 2.54);
    } else {
      h = parseInt(hCm, 10);
    }
    if (!a || !w || !h) { toast('Fill in all the fields first'); return; }
    next();
  };

  const finishCalc = () => {
    const w = parseFloat(weight);
    const profile = {
      goal, sex,
      age: parseInt(age, 10),
      weightKg: units === 'imperial' ? +(w * 0.453592).toFixed(1) : w,
      heightCm: units === 'imperial'
        ? Math.round(((parseInt(hFt, 10) || 0) * 12 + (parseInt(hIn, 10) || 0)) * 2.54)
        : parseInt(hCm, 10),
      act, diet, restrictions,
    };
    const targets = calcTargets(profile);
    setPlan({ profile, targets });
    next();
  };

  const start = () => {
    update((s) => {
      s.profile = plan.profile;
      s.targets = plan.targets;
      s.weights = [{ date: todayKey(), kg: plan.profile.weightKg }];
      s.onboarded = true;
      return s;
    });
    onDone();
    setTimeout(onPaywall, 700);
  };

  const Progress = ({ pct }) => (
    <View style={st.topRow}>
      <Pressable style={st.backBtn} onPress={back}>
        <Icon name="back" size={20} color={C.text} />
      </Pressable>
      <View style={st.progTrack}><View style={[st.progFill, { width: pct + '%' }]} /></View>
    </View>
  );

  /* step 0, welcome */
  if (step === 0) {
    return (
      <ImageBackground source={{ uri: HERO }} style={{ flex: 1 }} imageStyle={{ opacity: 0.45 }}>
        <View style={st.heroShade}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 26, paddingBottom: 44 }}>
            <Image source={require('../../assets/emblem.png')} style={st.mark} />
            <Text style={st.h1}>Know what you eat,{'\n'}without the spreadsheet.</Text>
            <Text style={st.sub}>
              Take a photo of your plate and we estimate the calories, protein, carbs and fat.
              Log walks and workouts to see both sides of the ledger.
            </Text>
            <Btn title="Get started" onPress={next} style={{ marginTop: 26 }} />
            <Btn ghost title="I already have an account" style={{ marginTop: 10 }}
              onPress={() => toast('Account sign-in is coming with cloud sync')} />
          </View>
        </View>
      </ImageBackground>
    );
  }

  /* step 1, goal */
  if (step === 1) {
    return (
      <ScrollView style={st.page} contentContainerStyle={st.pageInner}>
        <Progress pct={20} />
        <Text style={st.h1}>What are you here for?</Text>
        <Text style={[st.sub, { marginBottom: 22 }]}>Your daily calorie budget is built around this.</Text>
        {GOALS.map((g) => (
          <Pressable key={g.key} onPress={() => setGoal(g.key)}
            style={[st.opt, goal === g.key && st.optSel]}>
            <View style={st.optIcon}><Icon name={g.icon} size={21} color={goal === g.key ? C.orange : C.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.optTitle}>{g.title}</Text>
              <Text style={st.optSub}>{g.sub}</Text>
            </View>
          </Pressable>
        ))}
        <Btn title="Continue" onPress={next} disabled={!goal} style={{ marginTop: 16 }} />
      </ScrollView>
    );
  }

  /* step 2, body */
  if (step === 2) {
    const imp = units === 'imperial';
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.page} contentContainerStyle={st.pageInner} keyboardShouldPersistTaps="handled">
          <Progress pct={40} />
          <Text style={st.h1}>About you</Text>
          <Text style={st.sub}>Used once to work out your metabolism. It stays on your phone.</Text>
          <Label>Biological sex</Label>
          <Seg value={sex} onChange={setSex}
            options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
          <Label>Units</Label>
          <Seg value={units} onChange={setUnits}
            options={[{ value: 'metric', label: 'kg / cm' }, { value: 'imperial', label: 'lb / ft' }]} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label>Age</Label>
              <Input value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="28" />
            </View>
            <View style={{ flex: 1 }}>
              <Label>{imp ? 'Weight (lb)' : 'Weight (kg)'}</Label>
              <Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={imp ? '165' : '75'} />
            </View>
          </View>
          {imp ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label>Height (ft)</Label>
                <Input value={hFt} onChangeText={setHFt} keyboardType="number-pad" placeholder="5" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Height (in)</Label>
                <Input value={hIn} onChangeText={setHIn} keyboardType="number-pad" placeholder="10" />
              </View>
            </View>
          ) : (
            <View>
              <Label>Height (cm)</Label>
              <Input value={hCm} onChangeText={setHCm} keyboardType="number-pad" placeholder="178" />
            </View>
          )}
          <Btn title="Continue" onPress={saveBody} style={{ marginTop: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* step 3, activity */
  if (step === 3) {
    return (
      <ScrollView style={st.page} contentContainerStyle={st.pageInner}>
        <Progress pct={60} />
        <Text style={st.h1}>How active are you?</Text>
        <Text style={[st.sub, { marginBottom: 22 }]}>Day to day, outside of workouts you log.</Text>
        {ACTS.map((a) => (
          <Pressable key={a.v} onPress={() => setAct(a.v)}
            style={[st.opt, act === a.v && st.optSel]}>
            <View style={st.optIcon}><Icon name={a.icon} size={21} color={act === a.v ? C.orange : C.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.optTitle}>{a.title}</Text>
              <Text style={st.optSub}>{a.sub}</Text>
            </View>
          </Pressable>
        ))}
        <Btn title="Continue" onPress={next} disabled={!act} style={{ marginTop: 16 }} />
      </ScrollView>
    );
  }

  /* step 4, diet and restrictions */
  if (step === 4) {
    return (
      <ScrollView style={st.page} contentContainerStyle={st.pageInner}>
        <Progress pct={80} />
        <Text style={st.h1}>How do you eat?</Text>
        <Text style={[st.sub, { marginBottom: 18 }]}>We tailor meal ideas to this. You can change it later.</Text>
        {DIET_OPTS.map((d) => (
          <Pressable key={d.key} onPress={() => setDiet(d.key)}
            style={[st.opt, diet === d.key && st.optSel]}>
            <View style={st.optIcon}><Icon name={d.icon} size={20} color={diet === d.key ? C.orange : C.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.optTitle}>{d.title}</Text>
              <Text style={st.optSub}>{d.sub}</Text>
            </View>
          </Pressable>
        ))}
        <Label>Any restrictions?</Label>
        <View style={st.chipWrap}>
          {RESTRICTIONS.map((r) => {
            const on = restrictions.indexOf(r.key) >= 0;
            return (
              <Pressable key={r.key} onPress={() => toggleRestriction(r.key)}
                style={[st.chip, on && st.chipOn]}>
                <Text style={[st.chipTxt, on && { color: C.orange }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Btn title="See my plan" onPress={finishCalc} style={{ marginTop: 22 }} />
      </ScrollView>
    );
  }

  /* step 5, plan reveal */
  return (
    <ScrollView style={st.page} contentContainerStyle={[st.pageInner, { justifyContent: 'center' }]}>
      <Text style={[st.h1, { textAlign: 'center' }]}>Your daily plan</Text>
      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <Text style={st.bigNum}>{plan ? plan.targets.kcal.toLocaleString() : ''}</Text>
        <Text style={st.bigLbl}>CALORIES A DAY</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 11 }}>
        {plan && [
          ['Protein', plan.targets.p, C.protein],
          ['Carbs', plan.targets.c, C.carbs],
          ['Fat', plan.targets.f, C.fat],
        ].map(([name, v, col]) => (
          <View key={name} style={st.macroCell}>
            <Text style={st.macroVal}>{v}g</Text>
            <Text style={st.macroName}>{name}</Text>
            <View style={[st.macroDot, { backgroundColor: col }]} />
          </View>
        ))}
      </View>
      <View style={st.tipCard}>
        <Icon name="scan" size={22} color={C.orange} />
        <Text style={st.tipTxt}>
          No food scales needed. Photograph each meal and the numbers fill themselves in.
        </Text>
      </View>
      <Btn title="Start tracking" onPress={start} style={{ marginTop: 26 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pageInner: { padding: 24, paddingTop: 64, paddingBottom: 40, flexGrow: 1 },
  heroShade: { flex: 1, backgroundColor: 'rgba(7,7,11,0.55)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  backBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center',
  },
  progTrack: { flex: 1, height: 5, borderRadius: 99, backgroundColor: C.card2, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 99, backgroundColor: C.orange },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  chip: {
    paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line,
  },
  chipOn: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  chipTxt: { color: C.muted, fontFamily: F.bold, fontSize: 13.5 },
  mark: {
    width: 80, height: 80, borderRadius: 24, overflow: 'hidden', marginBottom: 22,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  h1: { color: C.text, fontFamily: F.extra, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  sub: { color: C.muted, fontFamily: F.semi, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line,
    borderRadius: 18, padding: 16, marginBottom: 11,
  },
  optSel: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  optIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  optTitle: { color: C.text, fontFamily: F.bold, fontSize: 15.5 },
  optSub: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, marginTop: 1 },
  bigNum: { color: C.orange, fontFamily: F.extra, fontSize: 60, letterSpacing: -2 },
  bigLbl: { color: C.muted, fontFamily: F.bold, fontSize: 11.5, letterSpacing: 1.5 },
  macroCell: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
  },
  macroVal: { color: C.text, fontFamily: F.extra, fontSize: 19 },
  macroName: { color: C.muted, fontFamily: F.bold, fontSize: 11.5, marginTop: 2 },
  macroDot: { width: 26, height: 4, borderRadius: 99, marginTop: 8 },
  tipCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 18, padding: 16, marginTop: 18,
  },
  tipTxt: { flex: 1, color: C.muted, fontFamily: F.semi, fontSize: 13, lineHeight: 19 },
});
