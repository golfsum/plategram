import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, Image, Animated,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Icon from '../icon';
import { C, F } from '../theme';
import { Btn, Sheet, Input, Label, toast } from '../ui';
import {
  useStore, todayKey, geminiAnalyze, geminiLookupFood, refineFoods, aiEnabled, DEMO_MEALS,
  FREE_SCANS_PER_DAY, EXERCISES, exerciseKcal, mealTotals, DRINKS,
} from '../store';

function newId() { return Math.random().toString(36).slice(2); }

/* ================= add sheet ================= */
export function AddSheet({ visible, onClose, onScan, onQuick, onExercise, onDrink, onPaywall }) {
  const { state } = useStore();
  const used = state.scan.date === todayKey() ? state.scan.count : 0;
  const scansLeft = Math.max(0, FREE_SCANS_PER_DAY - used);

  const tryScan = (fromCamera) => {
    if (!state.pro && scansLeft <= 0) { onClose(); setTimeout(onPaywall, 350); return; }
    onClose();
    setTimeout(() => onScan(fromCamera), 350);
  };

  const Item = ({ icon, tint, bg, title, sub, onPress }) => (
    <Pressable onPress={onPress} style={s.addOpt}>
      <View style={[s.addIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.addTitle}>{title}</Text>
        <Text style={s.addSub}>{sub}</Text>
      </View>
      <Icon name="forward" size={16} color={C.muted} />
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Log something">
      <Item icon="scan" tint={C.orange} bg={C.orangeSoft}
        title="Scan a meal" sub="Point the camera at your plate"
        onPress={() => tryScan(true)} />
      <Item icon="library" tint={C.orange} bg={C.orangeSoft}
        title="From photo library" sub="Pick a food photo you already took"
        onPress={() => tryScan(false)} />
      <Item icon="drink" tint={C.protein} bg="rgba(94,155,255,0.12)"
        title="Log a drink" sub="Water, coffee, soda, beer and more"
        onPress={() => { onClose(); setTimeout(onDrink, 350); }} />
      <Item icon="workout" tint={C.green} bg={C.greenSoft}
        title="Log a workout" sub="Walks, runs, gym, whatever you did"
        onPress={() => { onClose(); setTimeout(onExercise, 350); }} />
      <Item icon="quickadd" tint={C.protein} bg="rgba(94,155,255,0.12)"
        title="Quick add" sub="Type calories and macros yourself"
        onPress={() => { onClose(); setTimeout(onQuick, 350); }} />
      <Text style={s.scansNote}>
        {state.pro ? 'Pro: unlimited scans' : scansLeft + (scansLeft === 1 ? ' free scan' : ' free scans') + ' left today'}
      </Text>
    </Sheet>
  );
}

/* ================= scan modal ================= */
const STATUS_MSGS = ['Looking at the photo', 'Working out portion sizes', 'Adding up the macros', 'Checking the USDA database', 'Nearly there'];

export function ScanModal({ visible, fromCamera, onClose }) {
  const { state, update } = useStore();
  const [phase, setPhase] = useState('idle'); // idle | scanning | result
  const [imgUri, setImgUri] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [result, setResult] = useState(null);
  const [mult, setMult] = useState(1);
  const [statusIdx, setStatusIdx] = useState(0);
  const [editIdx, setEditIdx] = useState(null); // index being edited, -1 = adding, null = closed
  const [editItem, setEditItem] = useState(null);
  const scanY = useRef(new Animated.Value(0)).current;
  const statusTimer = useRef(null);
  const closedRef = useRef(false);

  useEffect(() => {
    // let the modal finish presenting before the system camera comes up
    if (visible) { closedRef.current = false; setTimeout(pick, 450); }
    else {
      clearInterval(statusTimer.current);
      setPhase('idle'); setImgUri(null); setResult(null); setMult(1);
      setEditIdx(null); setEditItem(null);
    }
  }, [visible]);

  const openEdit = (i) => { setEditItem(result.foods[i]); setEditIdx(i); };
  const openAdd = () => { setEditItem({ name: '', qty: '', cal: 0, p: 0, c: 0, f: 0 }); setEditIdx(-1); };
  const closeEdit = () => { setEditIdx(null); setEditItem(null); };
  const saveIngredient = (updated) => {
    setResult((r) => {
      const foods = [...r.foods];
      if (editIdx === -1) foods.push(updated); else foods[editIdx] = updated;
      return { ...r, foods };
    });
    closeEdit();
  };
  const removeIngredient = () => {
    if (result.foods.length <= 1) { toast('A meal needs at least one ingredient'); return; }
    setResult((r) => ({ ...r, foods: r.foods.filter((_, i) => i !== editIdx) }));
    closeEdit();
  };

  const pick = async () => {
    try {
      let res;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { toast('Camera access is needed to scan meals'); onClose(); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { toast('Photo access is needed to pick a picture'); onClose(); return; }
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      }
      if (res.canceled || !res.assets || !res.assets.length) { onClose(); return; }
      analyze(res.assets[0].uri);
    } catch (e) {
      toast('Could not open the camera');
      onClose();
    }
  };

  const analyze = async (uri) => {
    setImgUri(uri);
    setPhase('scanning');
    setStatusIdx(0);
    Animated.loop(Animated.sequence([
      Animated.timing(scanY, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(scanY, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ])).start();
    clearInterval(statusTimer.current);
    statusTimer.current = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_MSGS.length), 1700);

    try {
      // small thumbnail that becomes the meal icon
      const th = await ImageManipulator.manipulateAsync(
        uri, [{ resize: { width: 140 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const thumbUri = 'data:image/jpeg;base64,' + th.base64;
      setThumb(thumbUri);

      let r = null;
      if (aiEnabled()) {
        try {
          const big = await ImageManipulator.manipulateAsync(
            uri, [{ resize: { width: 1024 } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          r = await geminiAnalyze(big.base64);
        } catch (e) {
          toast('Analysis failed, showing an estimate instead');
        }
      }
      if (closedRef.current) return;
      // the AI looked and found no food, so reject rather than guess
      if (r && r.notFood) {
        clearInterval(statusTimer.current);
        toast("That doesn't look like food. Try another photo.");
        handleClose();
        return;
      }
      // refine the AI's macros against the USDA database
      if (r && r.foods) {
        try {
          const out = await refineFoods(r.foods);
          r = { ...r, foods: out.foods, refined: out.refined };
        } catch (e) { /* keep the AI numbers if FDC is unavailable */ }
        if (closedRef.current) return;
      }
      if (!r) {
        await new Promise((ok) => setTimeout(ok, 2300));
        r = JSON.parse(JSON.stringify(DEMO_MEALS[Math.floor(Math.random() * DEMO_MEALS.length)]));
      }
      if (closedRef.current) return;
      update((st) => {
        if (st.scan.date !== todayKey()) st.scan = { date: todayKey(), count: 0 };
        st.scan.count++;
        return st;
      });
      clearInterval(statusTimer.current);
      setResult(r);
      setMult(1);
      setPhase('result');
    } catch (e) {
      toast('Something went wrong with that photo');
      onClose();
    }
  };

  const log = () => {
    update((s2) => {
      const k = todayKey();
      if (!s2.meals[k]) s2.meals[k] = [];
      s2.meals[k].push({
        id: newId(), ts: Date.now(),
        name: result.name, foods: result.foods, mult, img: thumb,
      });
      return s2;
    });
    toast('Meal logged');
    handleClose();
  };

  const handleClose = () => { closedRef.current = true; clearInterval(statusTimer.current); onClose(); };

  const totals = result ? mealTotals({ foods: result.foods, mult }) : null;
  const lineY = scanY.interpolate({ inputRange: [0, 1], outputRange: [8, 244] });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={s.scanPage}>
        <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 64, paddingBottom: 40 }}>
          <View style={s.scanHead}>
            <Text style={s.scanTitle}>Meal scan</Text>
            <Pressable onPress={handleClose} style={s.xBtn}>
              <Icon name="close" size={18} color={C.text} />
            </Pressable>
          </View>

          <View style={s.frame}>
            {imgUri
              ? <Image source={{ uri: imgUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : <View style={s.framePh}><ActivityIndicator color={C.orange} /></View>}
            {phase === 'scanning' && (
              <Animated.View style={[s.scanline, { transform: [{ translateY: lineY }] }]} />
            )}
          </View>

          {phase === 'scanning' && (
            <View style={s.statusRow}>
              <ActivityIndicator size="small" color={C.orange} />
              <Text style={s.statusTxt}>{STATUS_MSGS[statusIdx]}</Text>
            </View>
          )}

          {phase === 'result' && result && (
            <View style={{ marginTop: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.scanTitle, { flex: 1, paddingRight: 10 }]}>{result.name}</Text>
                <View style={s.confBadge}>
                  <Text style={s.confTxt}>{Math.round((result.conf || 0.9) * 100)}% match</Text>
                </View>
              </View>

              {result.notes ? <Text style={s.scanNotes}>{result.notes}</Text> : null}
              {result.refined > 0 ? (
                <View style={s.fdcRow}>
                  <Icon name="check" size={13} color={C.green} />
                  <Text style={s.fdcTxt}>
                    {result.refined} {result.refined > 1 ? 'items' : 'item'} matched to USDA nutrition data
                  </Text>
                </View>
              ) : null}

              <Text style={s.editHint}>Tap an ingredient to fix the amount or macros</Text>
              <View style={s.foodCard}>
                {result.foods.map((fd, i) => (
                  <Pressable key={i} onPress={() => openEdit(i)} style={s.foodRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.foodName}>{fd.name}</Text>
                      <Text style={s.foodQty}>{fd.qty ? fd.qty + ' · ' : ''}P {fd.p} · C {fd.c} · F {fd.f}</Text>
                    </View>
                    <Text style={s.foodCal}>{fd.cal} kcal</Text>
                    <Icon name="forward" size={15} color={C.muted} />
                  </Pressable>
                ))}
                <Pressable onPress={openAdd} style={s.addIngRow}>
                  <Icon name="add" size={16} color={C.orange} />
                  <Text style={s.addIngTxt}>Add ingredient</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginVertical: 16 }}>
                {[
                  [totals.cal, 'kcal', C.text],
                  [totals.p + 'g', 'protein', C.protein],
                  [totals.c + 'g', 'carbs', C.carbs],
                  [totals.f + 'g', 'fat', C.fat],
                ].map(([v, l, col]) => (
                  <View key={l} style={s.totCell}>
                    <Text style={[s.totVal, { color: col }]}>{v}</Text>
                    <Text style={s.totLbl}>{l}</Text>
                  </View>
                ))}
              </View>

              <View style={s.portionRow}>
                <Text style={s.portionLbl}>Portion</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Pressable style={s.pmBtn} onPress={() => setMult((m) => Math.max(0.5, +(m - 0.5).toFixed(1)))}>
                    <Icon name="remove" size={18} color={C.text} />
                  </Pressable>
                  <Text style={s.pmVal}>{mult}x</Text>
                  <Pressable style={s.pmBtn} onPress={() => setMult((m) => Math.min(3, +(m + 0.5).toFixed(1)))}>
                    <Icon name="add" size={18} color={C.text} />
                  </Pressable>
                </View>
              </View>

              <Btn title="Log this meal" onPress={log} />
              <Btn ghost title="Discard" onPress={handleClose} style={{ marginTop: 10 }} />
            </View>
          )}
        </ScrollView>

        {editIdx !== null && editItem ? (
          <IngredientEditor
            item={editItem}
            isNew={editIdx === -1}
            onSave={saveIngredient}
            onRemove={removeIngredient}
            onClose={closeEdit}
          />
        ) : null}
      </View>
    </Modal>
  );
}

/* ================= ingredient editor (overlay) ================= */
function IngredientEditor({ item, isNew, onSave, onRemove, onClose }) {
  const [name, setName] = useState(item.name || '');
  const [cal, setCal] = useState(String(item.cal || 0));
  const [p, setP] = useState(String(item.p || 0));
  const [c, setC] = useState(String(item.c || 0));
  const [f, setF] = useState(String(item.f || 0));
  const [amount, setAmount] = useState(1);
  const [looking, setLooking] = useState(false);
  const base = useRef({ cal: item.cal || 0, p: item.p || 0, c: item.c || 0, f: item.f || 0 });

  // type a food name (e.g. "2 slices white bread") and pull its nutrition
  const lookup = async () => {
    const q = name.trim();
    if (!q) { toast('Type a food name first'); return; }
    setLooking(true);
    try {
      const res = await geminiLookupFood(q);
      setName(res.name || q);
      setCal(String(res.cal)); setP(String(res.p)); setC(String(res.c)); setF(String(res.f));
      base.current = { cal: res.cal, p: res.p, c: res.c, f: res.f };
      setAmount(1);
      toast('Nutrition filled in');
    } catch (e) {
      toast('Could not look that up, enter it by hand');
    } finally {
      setLooking(false);
    }
  };

  // a manual edit rebases the stepper so it scales from the new value
  const onField = (key, setter) => (v) => {
    setter(v);
    const n = parseInt(v, 10) || 0;
    base.current = { ...base.current, [key]: amount ? n / amount : n };
  };
  const bump = (d) => {
    const a = Math.max(0.25, +(amount + d).toFixed(2));
    setAmount(a);
    const b = base.current;
    setCal(String(Math.round(b.cal * a)));
    setP(String(Math.round(b.p * a)));
    setC(String(Math.round(b.c * a)));
    setF(String(Math.round(b.f * a)));
  };
  const save = () => onSave({
    name: name.trim() || 'Ingredient',
    qty: amount === 1 ? (item.qty || '') : '',
    cal: parseInt(cal, 10) || 0,
    p: parseInt(p, 10) || 0,
    c: parseInt(c, 10) || 0,
    f: parseInt(f, 10) || 0,
  });

  return (
    <View style={s.editOverlay}>
      <Pressable style={s.editBackdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
        <View style={s.editCard}>
          <View style={s.grab} />
          <Text style={s.scanTitle}>{isNew ? 'Add ingredient' : 'Edit ingredient'}</Text>
          <Label>Name</Label>
          <Input value={name} onChangeText={setName} placeholder="e.g. white bread, 2 slices" />
          {aiEnabled() ? (
            <Pressable onPress={lookup} disabled={looking} style={s.lookupBtn}>
              {looking ? <ActivityIndicator size="small" color={C.orange} /> : <Icon name="scan" size={15} color={C.orange} />}
              <Text style={s.lookupTxt}>{looking ? 'Looking it up' : 'Look up nutrition for this name'}</Text>
            </Pressable>
          ) : null}
          <Label>Amount</Label>
          <View style={s.amtRow}>
            <Pressable style={s.pmBtn} onPress={() => bump(-0.5)}><Icon name="remove" size={18} color={C.text} /></Pressable>
            <Text style={s.pmVal}>x{amount}</Text>
            <Pressable style={s.pmBtn} onPress={() => bump(0.5)}><Icon name="add" size={18} color={C.text} /></Pressable>
            <Text style={s.amtHint}>scales the numbers below</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Label>Calories</Label><Input value={cal} onChangeText={onField('cal', setCal)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Label>Protein (g)</Label><Input value={p} onChangeText={onField('p', setP)} keyboardType="number-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Label>Carbs (g)</Label><Input value={c} onChangeText={onField('c', setC)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Label>Fat (g)</Label><Input value={f} onChangeText={onField('f', setF)} keyboardType="number-pad" /></View>
          </View>
          <Btn title={isNew ? 'Add ingredient' : 'Save changes'} onPress={save} style={{ marginTop: 18 }} />
          {!isNew ? <Btn ghost title="Remove ingredient" onPress={onRemove} style={{ marginTop: 10 }} /> : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ================= edit an already logged meal ================= */
export function MealEditModal({ visible, dayKey, mealId, onClose }) {
  const { state, update } = useStore();
  const [name, setName] = useState('');
  const [foods, setFoods] = useState([]);
  const [editIdx, setEditIdx] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [totalsOpen, setTotalsOpen] = useState(false);
  // editable totals for the whole meal (override the ingredient sum if changed)
  const [tCal, setTCal] = useState('0');
  const [tP, setTP] = useState('0');
  const [tC, setTC] = useState('0');
  const [tF, setTF] = useState('0');

  const sumOf = (arr) => arr.reduce((t, x) => ({ cal: t.cal + x.cal, p: t.p + x.p, c: t.c + x.c, f: t.f + x.f }), { cal: 0, p: 0, c: 0, f: 0 });
  const setTotals = (sum) => { setTCal(String(sum.cal)); setTP(String(sum.p)); setTC(String(sum.c)); setTF(String(sum.f)); };
  // change the ingredient list, then point the total fields at the new sum
  const applyFoods = (arr) => { setFoods(arr); setTotals(sumOf(arr)); };

  useEffect(() => {
    if (!visible) { setEditIdx(null); setEditItem(null); setTotalsOpen(false); return; }
    const meal = (state.meals[dayKey] || []).find((m) => m.id === mealId);
    if (!meal) return;
    const mu = meal.mult || 1;
    setName(meal.name);
    // bake any whole meal multiplier into each ingredient so the numbers are real
    const flat = meal.foods.map((f) => ({
      name: f.name, qty: mu === 1 ? (f.qty || '') : '',
      cal: Math.round(f.cal * mu), p: Math.round(f.p * mu),
      c: Math.round(f.c * mu), f: Math.round(f.f * mu),
    }));
    setFoods(flat);
    // start the total fields from the override if there is one, else the sum
    setTotals(meal.override || sumOf(flat));
  }, [visible, mealId]);

  const openEdit = (i) => { setEditItem(foods[i]); setEditIdx(i); };
  const openAdd = () => { setEditItem({ name: '', qty: '', cal: 0, p: 0, c: 0, f: 0 }); setEditIdx(-1); };
  const closeEdit = () => { setEditIdx(null); setEditItem(null); };
  const saveIngredient = (updated) => {
    const a = [...foods]; if (editIdx === -1) a.push(updated); else a[editIdx] = updated;
    applyFoods(a);
    closeEdit();
  };
  const removeIngredient = () => {
    if (foods.length <= 1) { toast('A meal needs at least one ingredient'); return; }
    applyFoods(foods.filter((_, i) => i !== editIdx));
    closeEdit();
  };

  const saveMeal = () => {
    const sum = sumOf(foods);
    const typed = { cal: parseInt(tCal, 10) || 0, p: parseInt(tP, 10) || 0, c: parseInt(tC, 10) || 0, f: parseInt(tF, 10) || 0 };
    const differ = typed.cal !== sum.cal || typed.p !== sum.p || typed.c !== sum.c || typed.f !== sum.f;
    update((s) => {
      const arr = s.meals[dayKey] || [];
      const idx = arr.findIndex((m) => m.id === mealId);
      if (idx >= 0) arr[idx] = { ...arr[idx], name: name.trim() || arr[idx].name, foods, mult: 1, override: differ ? typed : null };
      return s;
    });
    toast('Meal updated');
    onClose();
  };
  const deleteMeal = () => {
    update((s) => { s.meals[dayKey] = (s.meals[dayKey] || []).filter((m) => m.id !== mealId); return s; });
    toast('Meal removed');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.scanPage}>
        <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 64, paddingBottom: 40 }}>
          <View style={s.scanHead}>
            <Text style={s.scanTitle}>Edit meal</Text>
            <Pressable onPress={onClose} style={s.xBtn}><Icon name="close" size={18} color={C.text} /></Pressable>
          </View>

          <Label>Meal name</Label>
          <Input value={name} onChangeText={setName} placeholder="Meal name" />

          <Text style={s.editHint}>Tap an ingredient to fix the amount or macros</Text>
          <View style={s.foodCard}>
            {foods.map((fd, i) => (
              <Pressable key={i} onPress={() => openEdit(i)} style={s.foodRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.foodName}>{fd.name}</Text>
                  <Text style={s.foodQty}>{fd.qty ? fd.qty + ' · ' : ''}P {fd.p} · C {fd.c} · F {fd.f}</Text>
                </View>
                <Text style={s.foodCal}>{fd.cal} kcal</Text>
                <Icon name="forward" size={15} color={C.muted} />
              </Pressable>
            ))}
            <Pressable onPress={openAdd} style={s.addIngRow}>
              <Icon name="add" size={16} color={C.orange} />
              <Text style={s.addIngTxt}>Add ingredient</Text>
            </Pressable>
          </View>

          <Text style={s.editHint}>Tap the totals to set the whole meal at once</Text>
          <Pressable onPress={() => setTotalsOpen(true)} style={{ flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 16 }}>
            <View style={s.totCell}><Text style={[s.totVal, { color: C.text }]}>{(parseInt(tCal, 10) || 0).toLocaleString()}</Text><Text style={s.totLbl}>kcal</Text></View>
            <View style={s.totCell}><Text style={[s.totVal, { color: C.protein }]}>{parseInt(tP, 10) || 0}g</Text><Text style={s.totLbl}>protein</Text></View>
            <View style={s.totCell}><Text style={[s.totVal, { color: C.carbs }]}>{parseInt(tC, 10) || 0}g</Text><Text style={s.totLbl}>carbs</Text></View>
            <View style={s.totCell}><Text style={[s.totVal, { color: C.fat }]}>{parseInt(tF, 10) || 0}g</Text><Text style={s.totLbl}>fat</Text></View>
          </Pressable>

          <Btn title="Save changes" onPress={saveMeal} />
          <Btn ghost title="Delete meal" onPress={deleteMeal} style={{ marginTop: 10 }} />
        </ScrollView>

        {editIdx !== null && editItem ? (
          <IngredientEditor
            item={editItem}
            isNew={editIdx === -1}
            onSave={saveIngredient}
            onRemove={removeIngredient}
            onClose={closeEdit}
          />
        ) : null}

        {totalsOpen ? (
          <TotalsEditor
            initial={{ cal: parseInt(tCal, 10) || 0, p: parseInt(tP, 10) || 0, c: parseInt(tC, 10) || 0, f: parseInt(tF, 10) || 0 }}
            onClose={() => setTotalsOpen(false)}
            onSave={(v) => {
              setTCal(String(v.cal)); setTP(String(v.p)); setTC(String(v.c)); setTF(String(v.f));
              setTotalsOpen(false);
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

/* ================= meal totals editor (overlay) ================= */
function TotalsEditor({ initial, onSave, onClose }) {
  const [cal, setCal] = useState(String(initial.cal));
  const [p, setP] = useState(String(initial.p));
  const [c, setC] = useState(String(initial.c));
  const [f, setF] = useState(String(initial.f));
  return (
    <View style={s.editOverlay}>
      <Pressable style={s.editBackdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
        <View style={s.editCard}>
          <View style={s.grab} />
          <Text style={s.scanTitle}>Meal totals</Text>
          <Text style={s.editHint}>Set the calories and macros for the whole meal</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <View style={{ flex: 1 }}><Label>Calories</Label><Input value={cal} onChangeText={setCal} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Label>Protein (g)</Label><Input value={p} onChangeText={setP} keyboardType="number-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Label>Carbs (g)</Label><Input value={c} onChangeText={setC} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Label>Fat (g)</Label><Input value={f} onChangeText={setF} keyboardType="number-pad" /></View>
          </View>
          <Btn title="Save totals" style={{ marginTop: 18 }}
            onPress={() => onSave({ cal: parseInt(cal, 10) || 0, p: parseInt(p, 10) || 0, c: parseInt(c, 10) || 0, f: parseInt(f, 10) || 0 })} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ================= drinks sheet ================= */
export function DrinksSheet({ visible, onClose }) {
  const { update } = useStore();
  const log = (d) => {
    update((s) => {
      const k = todayKey();
      if (!s.meals[k]) s.meals[k] = [];
      s.meals[k].push({
        id: newId(), ts: Date.now(), name: d.name, mult: 1, img: null,
        foods: [{ name: d.name, qty: '', cal: d.cal, p: d.p, c: d.c, f: d.f }],
      });
      if (d.water && d.ml) s.water[k] = (s.water[k] || 0) + d.ml;
      return s;
    });
    toast(d.name + ' logged');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Log a drink">
      {DRINKS.map((d) => (
        <Pressable key={d.name} style={s.drinkRow} onPress={() => log(d)}>
          <View style={s.drinkIcon}>
            <Icon name={d.water ? 'water' : 'drink'} size={18} color={C.protein} />
          </View>
          <Text style={s.drinkName}>{d.name}</Text>
          <Text style={s.drinkCal}>{d.cal} kcal</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

/* ================= exercise sheet ================= */
export function ExerciseSheet({ visible, onClose }) {
  const { state, update } = useStore();
  const [sel, setSel] = useState(EXERCISES[0]);
  const [mins, setMins] = useState('30');
  const kcal = exerciseKcal(sel.met, state.profile.weightKg, parseInt(mins, 10) || 0);

  const save = () => {
    const m = parseInt(mins, 10);
    if (!m) { toast('How many minutes?'); return; }
    update((s2) => {
      const k = todayKey();
      if (!s2.exercises[k]) s2.exercises[k] = [];
      s2.exercises[k].push({
        id: newId(), ts: Date.now(), key: sel.key, label: sel.label, minutes: m,
        kcal: exerciseKcal(sel.met, s2.profile.weightKg, m),
      });
      return s2;
    });
    toast('Workout logged, ' + kcal + ' kcal');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Log a workout">
      <View style={s.exGrid}>
        {EXERCISES.map((e) => (
          <Pressable key={e.key} onPress={() => setSel(e)}
            style={[s.exChip, sel.key === e.key && s.exChipSel]}>
            <Icon name={e.icon} size={16} color={sel.key === e.key ? C.green : C.muted} />
            <Text style={[s.exChipTxt, sel.key === e.key && { color: C.text }]}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
      <Label>Minutes</Label>
      <Input value={mins} onChangeText={setMins} keyboardType="number-pad" placeholder="30" />
      <View style={s.burnPreview}>
        <Icon name="burn" size={17} color={C.green} fill={C.green} />
        <Text style={s.burnPreviewTxt}>
          About {kcal} kcal at your weight ({state.profile.weightKg} kg)
        </Text>
      </View>
      <Btn title="Log workout" onPress={save} style={{ marginTop: 6 }} />
    </Sheet>
  );
}

/* ================= quick add sheet ================= */
export function QuickAddSheet({ visible, onClose }) {
  const { update } = useStore();
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');

  const save = () => {
    const calN = parseInt(cal, 10);
    if (!calN) { toast('Calories are the one thing we need'); return; }
    update((s2) => {
      const k = todayKey();
      if (!s2.meals[k]) s2.meals[k] = [];
      s2.meals[k].push({
        id: newId(), ts: Date.now(), name: name.trim() || 'Quick add', mult: 1, img: null,
        foods: [{ name: name.trim() || 'Quick add', qty: '', cal: calN, p: parseInt(p, 10) || 0, c: parseInt(c, 10) || 0, f: parseInt(f, 10) || 0 }],
      });
      return s2;
    });
    setName(''); setCal(''); setP(''); setC(''); setF('');
    toast('Logged');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Quick add">
      <Label>Name</Label>
      <Input value={name} onChangeText={setName} placeholder="Protein shake" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Calories</Label>
          <Input value={cal} onChangeText={setCal} keyboardType="number-pad" placeholder="320" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Protein (g)</Label>
          <Input value={p} onChangeText={setP} keyboardType="number-pad" placeholder="30" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Carbs (g)</Label>
          <Input value={c} onChangeText={setC} keyboardType="number-pad" placeholder="25" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Fat (g)</Label>
          <Input value={f} onChangeText={setF} keyboardType="number-pad" placeholder="10" />
        </View>
      </View>
      <Btn title="Log meal" onPress={save} style={{ marginTop: 20 }} />
    </Sheet>
  );
}

/* ================= paywall ================= */
const FEATURES = [
  ['scan', 'Unlimited photo scans'],
  ['progress', 'Trends and weekly reports'],
  ['cloud', 'Dashboard sync'],
  ['fast', 'Faster analysis queue'],
  ['noads', 'No ads, ever'],
];

export function Paywall({ visible, onClose }) {
  const { update } = useStore();
  const [plan, setPlan] = useState('yearly');

  const buy = () => {
    // Swap this for RevenueCat's purchasePackage call before shipping.
    update((s2) => { s2.pro = true; return s2; });
    toast('Pro unlocked. This is a sandbox purchase.');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={s.scanPage} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 44 }}>
        <Pressable onPress={onClose} style={[s.xBtn, { alignSelf: 'flex-end' }]}>
          <Icon name="close" size={18} color={C.text} />
        </Pressable>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Image source={require('../../assets/emblem.png')} style={s.pwMark} />
          <Text style={s.pwTitle}>Plategram Pro</Text>
          <Text style={s.pwSub}>Everything unlocked, nothing held back.</Text>
        </View>

        <View style={{ marginBottom: 22 }}>
          {FEATURES.map(([ic, label]) => (
            <View key={label} style={s.featRow}>
              <View style={s.featIcon}><Icon name={ic} size={16} color={C.orange} /></View>
              <Text style={s.featTxt}>{label}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => setPlan('yearly')}
          style={[s.plan, plan === 'yearly' && s.planSel]}>
          <View style={s.planBadge}><Text style={s.planBadgeTxt}>SAVE 67% + 3 DAYS FREE</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.planName}>Yearly</Text>
            <Text style={s.planSub}>12 months, billed once</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.planPrice}>$39.99</Text>
            <Text style={s.planSub}>$0.77 a week</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setPlan('monthly')}
          style={[s.plan, plan === 'monthly' && s.planSel]}>
          <View style={{ flex: 1 }}>
            <Text style={s.planName}>Monthly</Text>
            <Text style={s.planSub}>Cancel whenever</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.planPrice}>$9.99</Text>
            <Text style={s.planSub}>$2.31 a week</Text>
          </View>
        </Pressable>

        <Btn title={plan === 'yearly' ? 'Start my 3-day free trial' : 'Subscribe for $9.99 a month'}
          onPress={buy} style={{ marginTop: 10 }} />
        <Text style={s.fine}>
          Nothing is charged until the trial ends. Cancel anytime from Settings.
        </Text>
      </ScrollView>
    </Modal>
  );
}

/* ================= styles ================= */
const s = StyleSheet.create({
  addOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 18, padding: 15, marginBottom: 11,
  },
  addIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addTitle: { color: C.text, fontFamily: F.bold, fontSize: 15.5 },
  addSub: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, marginTop: 1 },
  scansNote: { color: C.muted, fontFamily: F.bold, fontSize: 12, textAlign: 'center', marginTop: 6 },
  drinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: C.line,
  },
  drinkIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(94,155,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  drinkName: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  drinkCal: { color: C.muted, fontFamily: F.bold, fontSize: 13 },

  scanPage: { flex: 1, backgroundColor: C.bg },
  scanHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  scanTitle: { color: C.text, fontFamily: F.extra, fontSize: 21 },
  xBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center',
  },
  frame: {
    height: 260, borderRadius: 24, overflow: 'hidden',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  framePh: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanline: {
    position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: C.orange,
    shadowColor: C.orange, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20 },
  statusTxt: { color: C.muted, fontFamily: F.bold, fontSize: 14.5 },
  confBadge: { backgroundColor: C.greenSoft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 99 },
  confTxt: { color: C.green, fontFamily: F.bold, fontSize: 11.5 },
  scanNotes: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  fdcRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  fdcTxt: { color: C.green, fontFamily: F.bold, fontSize: 12 },
  foodCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 18, paddingHorizontal: 16, marginTop: 14,
  },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13,
    borderBottomWidth: 1, borderColor: C.line,
  },
  foodName: { color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  foodQty: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  foodCal: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  editHint: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, marginTop: 14, marginBottom: -2 },
  addIngRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  addIngTxt: { color: C.orange, fontFamily: F.bold, fontSize: 14 },
  editOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 50 },
  editBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  editCard: {
    backgroundColor: '#17171f', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 22, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 22,
  },
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  amtHint: { flex: 1, color: C.muted, fontFamily: F.semi, fontSize: 12 },
  lookupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, paddingVertical: 11, borderRadius: 12,
    backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: 'rgba(255,122,47,0.4)',
  },
  lookupTxt: { color: C.orange, fontFamily: F.bold, fontSize: 13.5 },
  totCell: { flex: 1, backgroundColor: C.card2, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  totVal: { fontFamily: F.extra, fontSize: 16.5 },
  totLbl: { color: C.muted, fontFamily: F.bold, fontSize: 10.5, marginTop: 1, textTransform: 'uppercase' },
  portionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16,
  },
  portionLbl: { color: C.text, fontFamily: F.bold, fontSize: 15 },
  pmBtn: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: C.card2,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center',
  },
  pmVal: { color: C.text, fontFamily: F.extra, fontSize: 16, minWidth: 38, textAlign: 'center' },

  exGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  exChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line,
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10,
  },
  exChipSel: { borderColor: C.green, backgroundColor: C.greenSoft },
  exChipTxt: { color: C.muted, fontFamily: F.bold, fontSize: 13 },
  burnPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.greenSoft, borderRadius: 13, padding: 13, marginVertical: 16,
  },
  burnPreviewTxt: { color: C.text, fontFamily: F.semi, fontSize: 13 },

  pwMark: {
    width: 76, height: 76, borderRadius: 23, overflow: 'hidden', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  pwTitle: { color: C.text, fontFamily: F.extra, fontSize: 26 },
  pwSub: { color: C.muted, fontFamily: F.semi, fontSize: 14, marginTop: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  featIcon: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: C.orangeSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  featTxt: { color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  plan: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.line,
    borderRadius: 18, padding: 17, marginBottom: 12,
  },
  planSel: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  planBadge: {
    position: 'absolute', top: -11, right: 14, backgroundColor: C.gradB,
    paddingHorizontal: 11, paddingVertical: 4, borderRadius: 99,
  },
  planBadgeTxt: { color: '#fff', fontFamily: F.extra, fontSize: 10, letterSpacing: 0.4 },
  planName: { color: C.text, fontFamily: F.extra, fontSize: 16 },
  planSub: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, marginTop: 1 },
  planPrice: { color: C.text, fontFamily: F.extra, fontSize: 16 },
  fine: { color: C.muted, fontFamily: F.semi, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
