import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Icon from '../icon';
import { C, F } from '../theme';
import { Card, Input, Btn, toast } from '../ui';
import { useStore, dayTotals, dayBurned, streakOf, lastDays, todayKey, calcTargets } from '../store';
import History from './History';

function dayLabel(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'narrow' });
}

export default function Progress() {
  const { state, update } = useStore();
  const [w, setW] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const tg = state.targets;
  const days = lastDays(7);
  const vals = days.map((k) => dayTotals(state, k).cal);
  const burnVals = days.map((k) => dayBurned(state, k).total);
  const maxV = Math.max(tg.kcal * 1.15, ...vals, 1);

  let totalMeals = 0, onTarget = 0, pSum = 0, pDays = 0;
  Object.keys(state.meals).forEach((k) => {
    const ms = state.meals[k];
    if (!ms || !ms.length) return;
    totalMeals += ms.length;
    const t = dayTotals(state, k);
    if (t.cal >= tg.kcal * 0.85 && t.cal <= tg.kcal * 1.1) onTarget++;
    pSum += t.p; pDays++;
  });

  const logged = vals.filter((v) => v > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;

  const ws = state.weights.slice(-6).reverse();
  let delta = null;
  if (state.weights.length >= 2) {
    delta = +(state.weights[state.weights.length - 1].kg - state.weights[0].kg).toFixed(1);
  }

  const logWeight = () => {
    const v = parseFloat(w);
    if (!v) { toast('Type a weight first'); return; }
    let recalced = false;
    update((s) => {
      s.weights = s.weights.filter((x) => x.date !== todayKey());
      s.weights.push({ date: todayKey(), kg: v });
      s.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
      // keep the profile weight current so calories track your real weight
      s.profile.weightKg = v;
      if (s.targetsAuto) { s.targets = calcTargets(s.profile); recalced = true; }
      return s;
    });
    setW('');
    toast(recalced
      ? 'Weight saved, target now ' + calcTargets({ ...state.profile, weightKg: v }).kcal + ' kcal'
      : 'Weight saved');
  };

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingBottom: 130 }}>
      <Card>
        <View style={s.headRow}>
          <Text style={s.title}>Last 7 days</Text>
          {avg > 0 && <Text style={s.sub}>avg {avg.toLocaleString()} kcal</Text>}
        </View>
        <View style={s.chart}>
          <View style={[s.targetLine, { bottom: 20 + (tg.kcal / maxV) * 130 }]}>
            <Text style={s.targetTxt}>{tg.kcal.toLocaleString()}</Text>
          </View>
          {days.map((k, i) => (
            <View key={k} style={s.barCol}>
              <View style={[
                s.bar,
                { height: Math.max(4, (vals[i] / maxV) * 130) },
                vals[i] === 0 && { backgroundColor: C.card2 },
              ]} />
              <Text style={s.barLbl}>{dayLabel(k)}</Text>
            </View>
          ))}
        </View>
        <Text style={s.burnNote}>
          Burned this week: {burnVals.reduce((a, b) => a + b, 0).toLocaleString()} kcal from steps and workouts
        </Text>
      </Card>

      <View style={s.grid}>
        {[
          [streakOf(state), 'Day streak'],
          [totalMeals, 'Meals logged'],
          [onTarget, 'Days on target'],
          [(pDays ? Math.round(pSum / pDays) : 0) + 'g', 'Avg daily protein'],
        ].map(([v, l]) => (
          <View key={l} style={s.statCell}>
            <Text style={s.statVal}>{v}</Text>
            <Text style={s.statLbl}>{l}</Text>
          </View>
        ))}
      </View>

      <View style={s.headRow2}>
        <Text style={s.secTitle}>Weight</Text>
        {delta !== null && (
          <Text style={[s.sub, { color: delta <= 0 ? C.green : C.muted }]}>
            {(delta > 0 ? '+' : '') + delta} kg since you started
          </Text>
        )}
      </View>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input value={w} onChangeText={setW} keyboardType="decimal-pad"
            placeholder="Today's weight (kg)" style={{ flex: 1 }} />
          <Btn title="Log" onPress={logWeight} style={{ paddingHorizontal: 24, paddingVertical: 14 }} />
        </View>
        <View style={{ marginTop: 8 }}>
          {ws.map((x) => (
            <View key={x.date} style={s.wRow}>
              <Text style={s.wDate}>{x.date}</Text>
              <Text style={s.wKg}>{x.kg} kg</Text>
            </View>
          ))}
        </View>
      </Card>

      <Pressable style={s.histBtn} onPress={() => setHistoryOpen(true)}>
        <Icon name="meal" size={16} color={C.orange} />
        <Text style={s.histTxt}>View full history</Text>
        <Icon name="forward" size={15} color={C.muted} />
      </Pressable>
    </ScrollView>
    <History visible={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  histBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16,
  },
  histTxt: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 15 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 11 },
  title: { color: C.text, fontFamily: F.extra, fontSize: 16 },
  secTitle: { color: C.text, fontFamily: F.extra, fontSize: 17 },
  sub: { color: C.muted, fontFamily: F.bold, fontSize: 12.5 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 152, position: 'relative' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  bar: { width: '100%', maxWidth: 32, borderRadius: 7, backgroundColor: C.gradB },
  barLbl: { color: C.muted, fontFamily: F.bold, fontSize: 10 },
  targetLine: {
    position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed', zIndex: 2,
  },
  targetTxt: { position: 'absolute', right: 0, top: -16, color: C.muted, fontFamily: F.bold, fontSize: 10 },
  burnNote: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 12 },
  statCell: {
    width: '47%', flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 15,
  },
  statVal: { color: C.text, fontFamily: F.extra, fontSize: 21, letterSpacing: -0.5 },
  statLbl: { color: C.muted, fontFamily: F.bold, fontSize: 11.5, marginTop: 2 },
  wRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11,
    borderBottomWidth: 1, borderColor: C.line,
  },
  wDate: { color: C.muted, fontFamily: F.semi, fontSize: 14 },
  wKg: { color: C.text, fontFamily: F.bold, fontSize: 14 },
});
