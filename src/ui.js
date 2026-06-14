import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Animated, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C, F } from './theme';

/* ---------------- toast ---------------- */
let toastFn = null;
export function toast(msg) { if (toastFn) toastFn(msg); }

export function ToastHost() {
  const [msg, setMsg] = useState('');
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    toastFn = (m) => {
      setMsg(m);
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(op, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    };
    return () => { toastFn = null; };
  }, []);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="none" style={[st.toast, { opacity: op }]}>
      <Text style={st.toastTxt}>{msg}</Text>
    </Animated.View>
  );
}

/* ---------------- buttons & cards ---------------- */
export function Btn({ title, onPress, ghost, style, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        st.btn, ghost && st.btnGhost, style,
        pressed && { transform: [{ scale: 0.97 }] },
        disabled && { opacity: 0.4 },
      ]}>
      <Text style={[st.btnTxt, ghost && { color: C.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function Seg({ options, value, onChange }) {
  return (
    <View style={st.seg}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[st.segBtn, value === o.value && st.segSel]}>
          <Text style={[st.segTxt, value === o.value && { color: C.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Input(props) {
  return (
    <TextInput
      placeholderTextColor={C.muted}
      {...props}
      style={[st.input, props.style]}
    />
  );
}

export function Label({ children }) {
  return <Text style={st.label}>{children}</Text>;
}

/* ---------------- macro bar ---------------- */
export function MacroBar({ name, value, max, color }) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100);
  return (
    <View style={{ marginBottom: 13 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={st.mbName}>{name}</Text>
        <Text style={st.mbVal}>{value} / {max}g</Text>
      </View>
      <View style={st.track}>
        <View style={[st.fill, { width: pct + '%', backgroundColor: color }]} />
      </View>
    </View>
  );
}

/* ---------------- calorie ring ---------------- */
export function Ring({ size = 158, stroke = 13, pct = 0, children }) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.gradA} />
            <Stop offset="0.55" stopColor={C.gradB} />
            <Stop offset="1" stopColor={C.gradC} />
          </LinearGradient>
        </Defs>
        <Circle cx={cx} cy={cx} r={r} stroke={C.card2} strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx} cy={cx} r={r}
          stroke="url(#rg)" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={String(circ)}
          strokeDashoffset={off}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>{children}</View>
    </View>
  );
}

/* ---------------- bottom sheet ---------------- */
export function Sheet({ visible, onClose, children, title }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
        pointerEvents="box-none">
        <View style={st.sheet}>
          <View style={st.grab} />
          {title ? <Text style={st.sheetTitle}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------- styles ---------------- */
const st = StyleSheet.create({
  btn: {
    backgroundColor: C.gradB,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.gradB, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnGhost: {
    backgroundColor: C.card2,
    borderWidth: 1, borderColor: C.line,
    shadowOpacity: 0, elevation: 0,
  },
  btnTxt: { color: '#fff', fontFamily: F.bold, fontSize: 16 },
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, padding: 18,
  },
  seg: {
    flexDirection: 'row', backgroundColor: C.card2, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 4, gap: 4,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segSel: { backgroundColor: C.card },
  segTxt: { color: C.muted, fontFamily: F.bold, fontSize: 13.5 },
  input: {
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.line, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, color: C.text, fontSize: 16, fontFamily: F.semi,
  },
  label: { color: C.muted, fontFamily: F.bold, fontSize: 12.5, marginTop: 14, marginBottom: 7 },
  mbName: { color: C.text, fontFamily: F.bold, fontSize: 12.5 },
  mbVal: { color: C.muted, fontFamily: F.semi, fontSize: 12.5 },
  track: { height: 7, borderRadius: 99, backgroundColor: C.card2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    backgroundColor: '#17171f', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 34,
    maxHeight: '88%',
  },
  grab: { width: 42, height: 5, borderRadius: 99, backgroundColor: C.card2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: C.text, fontFamily: F.extra, fontSize: 20, marginBottom: 14 },
  toast: {
    position: 'absolute', bottom: 120, alignSelf: 'center',
    backgroundColor: '#262633', borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, zIndex: 100,
    maxWidth: '88%',
  },
  toastTxt: { color: C.text, fontFamily: F.bold, fontSize: 13.5, textAlign: 'center' },
});
