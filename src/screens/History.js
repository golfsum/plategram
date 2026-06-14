import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Modal } from 'react-native';
import Icon from '../icon';
import { C, F } from '../theme';
import { useStore, dayTotals, dayBurned, mealTotals, todayKey } from '../store';

function label(key) {
  const today = todayKey();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === todayKey(y)) return 'Yesterday';
  const [yr, m, d] = key.split('-').map(Number);
  return new Date(yr, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function History({ visible, onClose }) {
  const { state } = useStore();
  const [open, setOpen] = useState(null);

  // every day that has any logged data, newest first
  const dates = Array.from(new Set([
    ...Object.keys(state.meals || {}),
    ...Object.keys(state.exercises || {}),
    ...Object.keys(state.steps || {}),
    ...Object.keys(state.water || {}),
  ].filter((k) => (
    (state.meals[k] && state.meals[k].length) ||
    (state.exercises[k] && state.exercises[k].length) ||
    state.steps[k] || state.water[k]
  )))).sort((a, b) => (a < b ? 1 : -1));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.page}>
        <View style={s.head}>
          <Text style={s.title}>History</Text>
          <Pressable onPress={onClose} style={s.xBtn}><Icon name="close" size={18} color={C.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          {dates.length === 0 ? (
            <Text style={s.empty}>Nothing logged yet. Your past days will show up here.</Text>
          ) : dates.map((k) => {
            const t = dayTotals(state, k);
            const b = dayBurned(state, k);
            const meals = state.meals[k] || [];
            const workouts = state.exercises[k] || [];
            const st = state.steps[k];
            const w = state.water[k] || 0;
            const isOpen = open === k;
            return (
              <View key={k} style={s.dayCard}>
                <Pressable style={s.dayHead} onPress={() => setOpen(isOpen ? null : k)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dayLabel}>{label(k)}</Text>
                    <Text style={s.daySub}>
                      {t.cal.toLocaleString()} kcal · {meals.length} meal{meals.length === 1 ? '' : 's'}
                      {b.total ? ' · ' + b.total.toLocaleString() + ' burned' : ''}
                      {w ? ' · ' + (w / 1000).toFixed(1) + 'L water' : ''}
                    </Text>
                  </View>
                  <Icon name={isOpen ? 'remove' : 'add'} size={16} color={C.muted} />
                </Pressable>

                {isOpen ? (
                  <View style={s.dayBody}>
                    {meals.map((m) => {
                      const x = mealTotals(m);
                      return (
                        <View key={m.id} style={s.row}>
                          {m.img
                            ? <Image source={{ uri: m.img }} style={s.thumb} />
                            : <View style={[s.thumb, s.thumbPh]}><Icon name="meal" size={18} color={C.muted} /></View>}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                            <Text style={s.rowSub}>P {x.p} · C {x.c} · F {x.f}</Text>
                          </View>
                          <Text style={s.rowKcal}>{x.cal}</Text>
                        </View>
                      );
                    })}
                    {workouts.map((wk) => (
                      <View key={wk.id} style={s.row}>
                        <View style={[s.thumb, s.thumbPh, { backgroundColor: C.greenSoft }]}><Icon name="workout" size={18} color={C.green} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowName}>{wk.label}</Text>
                          <Text style={s.rowSub}>{wk.minutes} min</Text>
                        </View>
                        <Text style={[s.rowKcal, { color: C.green }]}>-{wk.kcal}</Text>
                      </View>
                    ))}
                    {st && st.count ? (
                      <View style={s.row}>
                        <View style={[s.thumb, s.thumbPh, { backgroundColor: C.greenSoft }]}><Icon name="steps" size={18} color={C.green} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowName}>Steps</Text>
                          <Text style={s.rowSub}>{st.count.toLocaleString()} steps</Text>
                        </View>
                        <Text style={[s.rowKcal, { color: C.green }]}>-{st.kcal}</Text>
                      </View>
                    ) : null}
                    {w ? (
                      <View style={s.row}>
                        <View style={[s.thumb, s.thumbPh, { backgroundColor: 'rgba(94,155,255,0.12)' }]}><Icon name="water" size={18} color={C.protein} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowName}>Water</Text>
                          <Text style={s.rowSub}>{(w / 1000).toFixed(1)} litres</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8 },
  title: { color: C.text, fontFamily: F.extra, fontSize: 22 },
  xBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.muted, fontFamily: F.semi, fontSize: 14, textAlign: 'center', marginTop: 40 },
  dayCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, marginBottom: 11 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayLabel: { color: C.text, fontFamily: F.extra, fontSize: 15.5 },
  daySub: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, marginTop: 2 },
  dayBody: { marginTop: 10, borderTopWidth: 1, borderColor: C.line, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
  thumb: { width: 42, height: 42, borderRadius: 11 },
  thumbPh: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  rowSub: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  rowKcal: { color: C.text, fontFamily: F.extra, fontSize: 14 },
});
