import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'plategram-v1';
// 2.5-flash reasons through the photo (portion size, hidden oils, cooking
// method) far better than 2.0-flash. Swap to 'gemini-2.5-pro' for the most
// accurate, slower analysis.
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const FREE_SCANS_PER_DAY = 3;

/* ---------------- secrets (from .env / EAS) ----------------
   These are read from environment variables, never typed into the app.
   Locally `npx expo start` loads .env automatically; on expo.dev set the
   same EXPO_PUBLIC_ variables in your EAS project. */
export const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
export const FB_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
export const FB_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
// USDA FoodData Central key. DEMO_KEY works for light testing (about 30/hour);
// get a free key at https://fdc.nal.usda.gov/api-key-signup for real use.
export const FDC_KEY = process.env.EXPO_PUBLIC_FDC_API_KEY || 'DEMO_KEY';
// recipeapi.io key (sk_live_...). Blank keeps Plan your day on the offline library.
export const RECIPEAPI_KEY = process.env.EXPO_PUBLIC_RECIPEAPI_KEY || '';
export const aiEnabled = () => GEMINI_KEY.length > 0;
export const syncConfigured = () => FB_PROJECT_ID.length > 0 && FB_API_KEY.length > 0;
export const recipeApiEnabled = () => RECIPEAPI_KEY.length > 0;

/* ---------------- defaults ---------------- */
const DEFAULTS = {
  onboarded: false,
  profile: { goal: 'maintain', sex: 'male', age: 28, weightKg: 75, heightCm: 178, act: 1.375, diet: 'balanced', restrictions: [] },
  targets: { kcal: 2100, p: 140, c: 230, f: 65 },
  targetsAuto: true,   // when true, the target recalculates as weight changes
  meals: {},      // { '2026-06-12': [{ id, ts, name, foods:[{name,qty,cal,p,c,f}], mult, img }] }
  exercises: {},  // { '2026-06-12': [{ id, ts, key, label, minutes, kcal }] }
  steps: {},      // { '2026-06-12': { count, kcal } }
  weights: [],    // [{ date, kg }]
  pro: false,
  favorites: [],   // saved recipes
  water: {},       // { '2026-06-14': ml }
  scan: { date: '', count: 0 },
  sync: { enabled: false, code: '' },   // project id + api key live in .env, not here
};

/* ---------------- date helpers ---------------- */
export function todayKey(d = new Date()) {
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
export function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}

/* ---------------- nutrition math ---------------- */
// Mifflin-St Jeor resting rate, then activity multiplier, then goal adjustment.
export function calcTargets(p) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  let kcal = Math.round(bmr * p.act + (p.goal === 'lose' ? -500 : p.goal === 'gain' ? 300 : 0));
  kcal = Math.max(1200, kcal);
  const protein = Math.round(p.weightKg * (p.goal === 'maintain' ? 1.6 : 1.8));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, p: protein, c: carbs, f: fat };
}

export const ACTIVITY = [
  { v: 1.2, label: 'Mostly sitting', short: 'Sitting' },
  { v: 1.375, label: 'Lightly active', short: 'Light' },
  { v: 1.55, label: 'Active', short: 'Active' },
  { v: 1.725, label: 'Very active', short: 'High' },
];
export function actLabel(v) {
  const a = ACTIVITY.find((x) => x.v === v);
  return a ? a.label.toLowerCase() : 'lightly active';
}

// the pieces behind the daily calorie target, for showing the math
export function targetBreakdown(p) {
  const bmr = Math.round(10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161));
  const maintenance = Math.round(bmr * p.act);
  const adjust = p.goal === 'lose' ? -500 : p.goal === 'gain' ? 300 : 0;
  return { bmr, maintenance, adjust, target: calcTargets(p).kcal };
}

export function mealTotals(m) {
  // a manual override (set by editing the totals directly) wins over the sum
  if (m.override) {
    return {
      cal: Math.round(m.override.cal || 0), p: Math.round(m.override.p || 0),
      c: Math.round(m.override.c || 0), f: Math.round(m.override.f || 0),
    };
  }
  const t = { cal: 0, p: 0, c: 0, f: 0 };
  (m.foods || []).forEach((f) => { t.cal += f.cal; t.p += f.p; t.c += f.c; t.f += f.f; });
  const k = m.mult || 1;
  return { cal: Math.round(t.cal * k), p: Math.round(t.p * k), c: Math.round(t.c * k), f: Math.round(t.f * k) };
}

/* MET values from the Compendium of Physical Activities.
   kcal = MET x 3.5 x kg / 200 per minute. */
export const EXERCISES = [
  { key: 'walk', label: 'Walk (easy)', met: 3.0, icon: 'walk' },
  { key: 'walkb', label: 'Walk (brisk)', met: 4.3, icon: 'walk' },
  { key: 'jog', label: 'Jog', met: 7.0, icon: 'jog' },
  { key: 'run', label: 'Run', met: 9.8, icon: 'run' },
  { key: 'cycle', label: 'Cycling', met: 7.5, icon: 'cycle' },
  { key: 'swim', label: 'Swimming', met: 6.0, icon: 'swim' },
  { key: 'gym', label: 'Weight training', met: 4.5, icon: 'gym' },
  { key: 'hiit', label: 'HIIT', met: 8.0, icon: 'hiit' },
  { key: 'hike', label: 'Hiking', met: 6.0, icon: 'hike' },
  { key: 'yoga', label: 'Yoga', met: 2.5, icon: 'yoga' },
  { key: 'dance', label: 'Dancing', met: 5.0, icon: 'dance' },
  { key: 'sport', label: 'Sports', met: 6.5, icon: 'sport' },
];
export function exerciseKcal(met, weightKg, minutes) {
  return Math.round((met * 3.5 * weightKg) / 200 * minutes);
}
// Rough walking cost per step, scaled by body weight.
export function stepsKcal(steps, weightKg) {
  return Math.round(steps * weightKg * 0.0005);
}

/* ---------------- water and drinks ---------------- */
export const GLASS_ML = 250;
export function todayWater(state, key = todayKey()) { return state.water[key] || 0; }
export function waterGoalMl(state) {
  // U.S. National Academies daily fluid baseline: women ~2.7 L, men ~3.7 L
  return state.profile.sex === 'female' ? 2700 : 3700;
}

// quick drinks log straight into meals so they count toward calories
export const DRINKS = [
  { name: 'Water', cal: 0, p: 0, c: 0, f: 0, ml: 250, water: true },
  { name: 'Coffee, black', cal: 5, p: 0, c: 1, f: 0, ml: 250, water: true },
  { name: 'Latte', cal: 120, p: 8, c: 12, f: 5 },
  { name: 'Diet Coke (can)', cal: 1, p: 0, c: 0, f: 0, ml: 330, water: true },
  { name: 'Coke (can)', cal: 139, p: 0, c: 39, f: 0 },
  { name: 'Orange juice', cal: 112, p: 2, c: 26, f: 0 },
  { name: 'Whole milk', cal: 150, p: 8, c: 12, f: 8 },
  { name: 'Sports drink', cal: 80, p: 0, c: 21, f: 0 },
  { name: 'Energy drink', cal: 110, p: 0, c: 28, f: 0 },
  { name: 'Beer', cal: 153, p: 2, c: 13, f: 0 },
  { name: 'Red wine', cal: 125, p: 0, c: 4, f: 0 },
  { name: 'Tea, unsweetened', cal: 2, p: 0, c: 0, f: 0, ml: 250, water: true },
];

/* ---------------- demo scan results ---------------- */
export const DEMO_MEALS = [
  { name: 'Grilled Chicken Bowl', conf: 0.94, foods: [
    { name: 'Grilled chicken breast', qty: '150 g', cal: 248, p: 46, c: 0, f: 5 },
    { name: 'Brown rice', qty: '1 cup', cal: 218, p: 5, c: 46, f: 2 },
    { name: 'Avocado', qty: 'half', cal: 120, p: 1, c: 6, f: 11 }] },
  { name: 'Margherita Pizza', conf: 0.91, foods: [
    { name: 'Margherita pizza', qty: '3 slices', cal: 645, p: 27, c: 84, f: 24 }] },
  { name: 'Salmon and Veggies', conf: 0.93, foods: [
    { name: 'Baked salmon fillet', qty: '180 g', cal: 367, p: 40, c: 0, f: 22 },
    { name: 'Roasted broccoli', qty: '1 cup', cal: 55, p: 4, c: 11, f: 1 },
    { name: 'Sweet potato', qty: '1 medium', cal: 112, p: 2, c: 26, f: 0 }] },
  { name: 'Avocado Toast and Eggs', conf: 0.92, foods: [
    { name: 'Sourdough toast', qty: '2 slices', cal: 220, p: 8, c: 42, f: 2 },
    { name: 'Avocado', qty: 'half', cal: 120, p: 1, c: 6, f: 11 },
    { name: 'Fried eggs', qty: '2 large', cal: 180, p: 12, c: 1, f: 14 }] },
  { name: 'Burger and Fries', conf: 0.9, foods: [
    { name: 'Cheeseburger', qty: '1', cal: 550, p: 30, c: 42, f: 29 },
    { name: 'French fries', qty: 'medium', cal: 365, p: 4, c: 48, f: 17 }] },
  { name: 'Greek Yogurt Parfait', conf: 0.95, foods: [
    { name: 'Greek yogurt', qty: '200 g', cal: 130, p: 20, c: 8, f: 1 },
    { name: 'Granola', qty: '40 g', cal: 180, p: 4, c: 26, f: 7 },
    { name: 'Mixed berries', qty: 'half cup', cal: 42, p: 1, c: 10, f: 0 }] },
  { name: 'Chicken Caesar Salad', conf: 0.92, foods: [
    { name: 'Romaine and dressing', qty: '1 bowl', cal: 220, p: 5, c: 12, f: 17 },
    { name: 'Grilled chicken', qty: '120 g', cal: 198, p: 37, c: 0, f: 4 },
    { name: 'Parmesan and croutons', qty: '', cal: 140, p: 6, c: 12, f: 8 }] },
  { name: 'Pasta Bolognese', conf: 0.9, foods: [
    { name: 'Spaghetti', qty: '1.5 cups', cal: 330, p: 12, c: 65, f: 2 },
    { name: 'Bolognese sauce', qty: '3/4 cup', cal: 285, p: 19, c: 12, f: 18 }] },
  { name: 'Sushi Plate', conf: 0.89, foods: [
    { name: 'Salmon nigiri', qty: '4 pieces', cal: 230, p: 14, c: 30, f: 6 },
    { name: 'California roll', qty: '6 pieces', cal: 255, p: 9, c: 38, f: 7 },
    { name: 'Miso soup', qty: '1 bowl', cal: 40, p: 3, c: 5, f: 1 }] },
  { name: 'Protein Smoothie', conf: 0.93, foods: [
    { name: 'Whey protein', qty: '1 scoop', cal: 120, p: 24, c: 3, f: 1 },
    { name: 'Banana', qty: '1 medium', cal: 105, p: 1, c: 27, f: 0 },
    { name: 'Peanut butter', qty: '1 tbsp', cal: 95, p: 4, c: 3, f: 8 },
    { name: 'Oat milk', qty: '1 cup', cal: 120, p: 3, c: 16, f: 5 }] },
];

/* ---------------- Gemini photo analysis ---------------- */
// Strict output shape, enforced by the API so the model cannot drift.
const FOOD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meal_name: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    notes: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          serving: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          cooking_method: { type: 'STRING' },
          calories: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
        },
        required: ['name', 'serving', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
  },
  required: ['meal_name', 'confidence', 'items'],
};

const FOOD_PROMPT =
  'You are a registered dietitian with years of experience estimating calories and macros from food photos. ' +
  'Study this photo carefully and give your best nutrition estimate.\n\n' +
  'Work through it like this:\n' +
  '1. Identify every distinct food and drink, including sauces, dressings, cooking oil, butter, cheese and garnishes. These are easy to miss and add real calories.\n' +
  '2. Judge portion size from visual scale cues: the plate or bowl width, fork or spoon size, a hand, or packaging. Give each item an everyday serving and an estimate in grams.\n' +
  '3. Note how each item was cooked, since fried, grilled, roasted and raw differ a lot in calories.\n' +
  '4. Use standard USDA style nutrition values for each food at the weight you estimated, and keep the macros consistent with the calories.\n' +
  '5. For a mixed dish, either give it as one item with full nutrition or break it into its main components, whichever is more accurate.\n' +
  '6. If something is hidden or unclear, make a sensible assumption and say so briefly in notes.\n' +
  '7. Be realistic rather than optimistic. Real world portions are usually bigger than people expect and added fats are common.\n\n' +
  'Set confidence from 0 to 1 for how sure you are overall. ' +
  'If the photo does not clearly show food or drink, for example it shows a person, a pet, an object, a screen, scenery or an empty plate, do not guess. ' +
  'Return meal_name "No food detected", confidence 0 and an empty items list.';

export async function geminiAnalyze(base64Jpeg) {
  const body = {
    contents: [{
      parts: [
        { text: FOOD_PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: FOOD_SCHEMA,
    },
  };
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(GEMINI_KEY),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error('api ' + r.status);
  const j = await r.json();
  const txt = j.candidates && j.candidates[0] && j.candidates[0].content &&
    j.candidates[0].content.parts && j.candidates[0].content.parts[0] &&
    j.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(txt);
  const noFood = !parsed.items || !parsed.items.length ||
    (parsed.meal_name && /no food/i.test(parsed.meal_name));
  if (noFood) return { notFood: true };
  return {
    name: parsed.meal_name || 'Meal',
    conf: parsed.confidence == null ? 0.85 : parsed.confidence,
    notes: parsed.notes || '',
    foods: parsed.items.map((it) => ({
      name: it.name,
      qty: it.serving || (it.grams ? Math.round(it.grams) + ' g' : ''),
      grams: Math.round(it.grams || 0),
      cal: Math.round(it.calories || 0),
      p: Math.round(it.protein_g || 0),
      c: Math.round(it.carbs_g || 0),
      f: Math.round(it.fat_g || 0),
    })),
  };
}

/* ---------------- USDA FoodData Central refinement ----------------
   The AI is good at naming foods and judging grams. FDC has lab grade
   nutrition per 100 g, so we scale FDC values by the AI's gram estimate
   to get more accurate calories and macros. */
function fdcNutrients(arr) {
  const out = { cal: null, p: null, c: null, f: null };
  let energyKcal = null;
  (arr || []).forEach((n) => {
    const num = String(n.nutrientNumber || (n.nutrient && n.nutrient.number) || '');
    const name = String(n.nutrientName || (n.nutrient && n.nutrient.name) || '').toLowerCase();
    const unit = String(n.unitName || (n.nutrient && n.nutrient.unitName) || '').toUpperCase();
    const val = n.value != null ? n.value : n.amount;
    if (val == null) return;
    if (energyKcal == null && unit === 'KCAL' && (num === '208' || name.indexOf('energy') >= 0)) energyKcal = val;
    else if (num === '203') out.p = val;
    else if (num === '204') out.f = val;
    else if (num === '205') out.c = val;
  });
  out.cal = energyKcal;
  return out;
}

export async function fdcLookup(name, grams) {
  if (!name || !grams || grams <= 0) return null;
  const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(FDC_KEY) +
    '&query=' + encodeURIComponent(name) +
    '&pageSize=1&dataType=' + encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS)');
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const food = j.foods && j.foods[0];
  if (!food) return null;
  const per100 = fdcNutrients(food.foodNutrients);
  if (per100.cal == null) return null;
  const k = grams / 100;
  return {
    cal: Math.round(per100.cal * k),
    p: Math.round((per100.p || 0) * k),
    c: Math.round((per100.c || 0) * k),
    f: Math.round((per100.f || 0) * k),
    match: food.description,
  };
}

// Refine a list of AI foods against FDC. Keeps the AI value when there is no
// gram estimate, no match, or the database value looks wildly different.
export async function refineFoods(foods) {
  let refined = 0;
  const out = await Promise.all((foods || []).map(async (f) => {
    if (!f.grams) return f;
    try {
      const fdc = await fdcLookup(f.name, f.grams);
      if (!fdc || !fdc.cal) return f;
      // guard against a bad match: only trust it within a believable range
      if (f.cal > 0 && (fdc.cal < f.cal * 0.33 || fdc.cal > f.cal * 3)) return f;
      refined++;
      return { ...f, cal: fdc.cal, p: fdc.p, c: fdc.c, f: fdc.f, source: 'usda' };
    } catch (e) {
      return f;
    }
  }));
  return { foods: out, refined };
}

// Look up nutrition for a single food typed by name, e.g. "2 slices white bread".
// Used when editing an ingredient so changing the food updates the macros.
const LOOKUP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    serving: { type: 'STRING' },
    calories: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
  },
  required: ['calories', 'protein_g', 'carbs_g', 'fat_g'],
};
export async function geminiLookupFood(text) {
  const prompt =
    'You are a nutrition database. Give realistic nutrition for this food using standard USDA style values. ' +
    'If an amount or count is given (for example "2 slices white bread"), use it. If not, use one typical serving. ' +
    'Keep the macros consistent with the calories. Respond only as JSON.\nFood: "' + text + '"';
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: LOOKUP_SCHEMA },
  };
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(GEMINI_KEY),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error('api ' + r.status);
  const j = await r.json();
  const txt = j.candidates && j.candidates[0] && j.candidates[0].content &&
    j.candidates[0].content.parts && j.candidates[0].content.parts[0] &&
    j.candidates[0].content.parts[0].text;
  const it = JSON.parse(txt);
  return {
    name: it.name || text,
    qty: it.serving || '',
    cal: Math.round(it.calories || 0),
    p: Math.round(it.protein_g || 0),
    c: Math.round(it.carbs_g || 0),
    f: Math.round(it.fat_g || 0),
  };
}

/* ---------------- dashboard sync (Firestore REST) ---------------- */
function buildSyncPayload(state) {
  const days = lastDays(14);
  const meals = {};
  days.forEach((k) => {
    const arr = state.meals[k];
    if (!arr || !arr.length) return;
    meals[k] = arr.map((m) => {
      const t = mealTotals(m);
      return { ts: m.ts, name: m.name, cal: t.cal, p: t.p, c: t.c, f: t.f, img: m.img || null };
    });
  });
  const exercises = {};
  days.forEach((k) => { if (state.exercises[k] && state.exercises[k].length) exercises[k] = state.exercises[k]; });
  const steps = {};
  days.forEach((k) => { if (state.steps[k]) steps[k] = state.steps[k]; });
  return {
    v: 1,
    updated: Date.now(),
    targets: state.targets,
    profile: { goal: state.profile.goal, weightKg: state.profile.weightKg },
    meals, exercises, steps,
    weights: state.weights,
    streak: streakOf(state),
  };
}

export async function pushSync(state) {
  const s = state.sync;
  if (!s.enabled || !syncConfigured() || !s.code) return;
  const payload = JSON.stringify(buildSyncPayload(state));
  const url =
    'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(FB_PROJECT_ID) +
    '/databases/(default)/documents/syncs/' + encodeURIComponent(s.code) +
    '?key=' + encodeURIComponent(FB_API_KEY);
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        data: { stringValue: payload },
        updated: { integerValue: String(Date.now()) },
      },
    }),
  });
}

export function newSyncCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = 'PG-';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ---------------- derived numbers ---------------- */
export function dayTotals(state, key = todayKey()) {
  const t = { cal: 0, p: 0, c: 0, f: 0 };
  (state.meals[key] || []).forEach((m) => {
    const x = mealTotals(m);
    t.cal += x.cal; t.p += x.p; t.c += x.c; t.f += x.f;
  });
  return t;
}
export function dayBurned(state, key = todayKey()) {
  const ex = (state.exercises[key] || []).reduce((a, e) => a + e.kcal, 0);
  const st = state.steps[key] ? state.steps[key].kcal : 0;
  return { total: ex + st, exercise: ex, steps: st };
}
export function streakOf(state) {
  let n = 0;
  const d = new Date();
  const logged = (k) => (state.meals[k] || []).length > 0 || (state.exercises[k] || []).length > 0;
  if (logged(todayKey(d))) n++;
  for (let i = 1; i < 730; i++) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    if (logged(todayKey(dd))) n++; else break;
  }
  return n;
}

/* ---------------- "are you on track" insight ----------------
   Maintenance is the calories you burn in a day at your activity level.
   Eat under it and you lose, over it and you gain. We average the last
   week of logged days, turn that into a weekly weight change (about
   7700 kcal per kg), and project 12 weeks out from your latest weight. */
export function maintenanceKcal(state) {
  const p = state.profile;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  return Math.round(bmr * p.act);
}

function kgStr(kg) {
  return (Math.round(kg * 2) / 2).toFixed(1).replace(/\.0$/, '');
}

export function trackInsight(state) {
  const maint = maintenanceKcal(state);
  const tk = todayKey();
  const eatenToday = dayTotals(state, tk).cal;
  const burnedToday = dayBurned(state, tk).total;
  const todayNet = maint + burnedToday - eatenToday; // positive means under what you burn

  let today;
  if (eatenToday === 0 && burnedToday === 0) {
    today = 'Nothing logged yet today.';
  } else if (todayNet >= 0) {
    today = `Today: ${eatenToday.toLocaleString()} in, ${burnedToday.toLocaleString()} out. About ${todayNet.toLocaleString()} below what you burn so far.`;
  } else {
    today = `Today: ${eatenToday.toLocaleString()} in, ${burnedToday.toLocaleString()} out. About ${(-todayNet).toLocaleString()} above what you burn so far.`;
  }

  // average the last 7 completed days that actually have food logged
  let sum = 0, n = 0;
  lastDays(8).forEach((k) => {
    if (k === tk) return;
    const e = dayTotals(state, k).cal;
    if (e <= 0) return;
    sum += (maint + dayBurned(state, k).total - e);
    n++;
  });

  if (n < 2) {
    return { tone: 'nodata', verdict: 'Building your trend',
      detail: 'Log meals for a couple of days and this will show where your weight is heading.', today };
  }

  const goal = state.profile.goal;
  const startKg = state.weights.length ? state.weights[state.weights.length - 1].kg : state.profile.weightKg;
  let weeklyDeltaKg = -((sum / n) * 7) / 7700;                  // negative means losing
  weeklyDeltaKg = Math.max(-1.5, Math.min(1.5, weeklyDeltaKg)); // keep projections sane
  const projStr = kgStr(Math.max(35, startKg + weeklyDeltaKg * 12));
  const perWeek = Math.abs(weeklyDeltaKg).toFixed(1).replace(/\.0$/, '');
  const losing = weeklyDeltaKg <= -0.1;
  const gaining = weeklyDeltaKg >= 0.1;

  if (goal === 'lose') {
    if (losing) return { tone: 'good', verdict: 'On track to lose weight',
      detail: `Keep up your recent average and you'll be around ${projStr} kg in about 12 weeks, roughly ${perWeek} kg a week.`, today };
    if (gaining) return { tone: 'off', verdict: 'Heading the wrong way',
      detail: `At your recent average you'd slowly gain, near ${projStr} kg in 12 weeks. Worth trimming meals or adding a workout.`, today };
    return { tone: 'warn', verdict: 'Holding steady, not losing yet',
      detail: 'Your intake is about matching what you burn right now. A slightly smaller dinner or a daily walk would get the scale moving.', today };
  }
  if (goal === 'gain') {
    if (gaining) return { tone: 'good', verdict: 'On track to build',
      detail: `Keep this up and you'll be around ${projStr} kg in about 12 weeks, roughly ${perWeek} kg a week.`, today };
    if (losing) return { tone: 'off', verdict: 'Slipping into a deficit',
      detail: `At this average you'd drop to about ${projStr} kg in 12 weeks, the opposite of what you want.`, today };
    return { tone: 'warn', verdict: 'Holding steady, not gaining',
      detail: "You're eating about what you burn. A bit more food, mostly protein, would push things along.", today };
  }
  // maintain
  if (losing) return { tone: 'warn', verdict: 'Drifting down',
    detail: `At this average you'd slide to about ${projStr} kg over 12 weeks.`, today };
  if (gaining) return { tone: 'warn', verdict: 'Drifting up',
    detail: `At this average you'd climb to about ${projStr} kg over 12 weeks.`, today };
  return { tone: 'good', verdict: 'Holding steady',
    detail: `Your intake matches what you burn, so you should stay near ${projStr} kg.`, today };
}

/* ---------------- meal ideas, matched to a slot and the user's diet ----------------
   tags: veg vegetarian, vegan, gf gluten free, df dairy free, nf nut free.
   c is carbs, used for low carb and keto. */
export const DIETS = [
  { key: 'balanced', label: 'Balanced' },
  { key: 'highprotein', label: 'High protein' },
  { key: 'lowcarb', label: 'Low carb' },
  { key: 'keto', label: 'Keto' },
];
export const RESTRICTIONS = [
  { key: 'veg', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gf', label: 'Gluten free' },
  { key: 'df', label: 'Dairy free' },
  { key: 'nf', label: 'Nut free' },
];

const MEAL_IDEAS = {
  breakfast: [
    { name: 'Egg white scramble & turkey bacon', kcal: 320, p: 38, c: 5, tags: ['gf', 'df', 'nf'] },
    { name: 'Tofu scramble with spinach', kcal: 300, p: 22, c: 8, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Scrambled eggs & avocado', kcal: 360, p: 20, c: 8, tags: ['veg', 'gf', 'df', 'nf'] },
    { name: 'Greek yogurt, berries & seeds', kcal: 360, p: 28, c: 30, tags: ['veg', 'gf', 'nf'] },
    { name: 'Protein smoothie with whey, oats & banana', kcal: 380, p: 35, c: 40, tags: ['veg', 'nf'] },
    { name: 'Cottage cheese, fruit & walnuts', kcal: 430, p: 34, c: 28, tags: ['veg', 'gf'] },
    { name: 'Veggie omelette & whole grain toast', kcal: 450, p: 32, c: 35, tags: ['veg', 'nf'] },
    { name: 'Oatmeal with berries & almond butter', kcal: 480, p: 14, c: 70, tags: ['veg', 'vegan', 'df'] },
    { name: 'Avocado & black bean toast', kcal: 520, p: 18, c: 55, tags: ['veg', 'vegan', 'df', 'nf'] },
    { name: 'Overnight oats with protein powder', kcal: 600, p: 40, c: 60, tags: ['veg', 'nf'] },
    { name: 'Smoked salmon & cream cheese bagel', kcal: 640, p: 34, c: 55, tags: ['nf'] },
  ],
  lunch: [
    { name: 'Tuna salad lettuce wraps', kcal: 380, p: 35, c: 8, tags: ['gf', 'df', 'nf'] },
    { name: 'Chicken & avocado salad', kcal: 420, p: 40, c: 10, tags: ['gf', 'df', 'nf'] },
    { name: 'Lentil & vegetable soup', kcal: 360, p: 20, c: 50, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Chickpea & quinoa salad', kcal: 450, p: 18, c: 55, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Tofu & veggie rice bowl', kcal: 560, p: 26, c: 65, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Chicken Caesar wrap', kcal: 560, p: 38, c: 40, tags: ['nf'] },
    { name: 'Turkey & quinoa bowl', kcal: 600, p: 45, c: 55, tags: ['gf', 'df', 'nf'] },
    { name: 'Grilled chicken & rice bowl', kcal: 620, p: 50, c: 60, tags: ['gf', 'df', 'nf'] },
    { name: 'Salmon poke bowl', kcal: 650, p: 40, c: 60, tags: ['gf', 'df', 'nf'] },
    { name: 'Steak burrito bowl', kcal: 720, p: 48, c: 65, tags: ['gf'] },
  ],
  dinner: [
    { name: 'Salmon & greens', kcal: 480, p: 42, c: 10, tags: ['gf', 'df', 'nf'] },
    { name: 'Ribeye & asparagus', kcal: 560, p: 45, c: 8, tags: ['gf', 'df', 'nf'] },
    { name: 'Tofu & broccoli stir fry, light rice', kcal: 520, p: 28, c: 55, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Turkey chili with beans', kcal: 560, p: 45, c: 45, tags: ['gf', 'df', 'nf'] },
    { name: 'White fish tacos', kcal: 580, p: 40, c: 50, tags: ['gf', 'df', 'nf'] },
    { name: 'Baked salmon, sweet potato & broccoli', kcal: 600, p: 45, c: 45, tags: ['gf', 'df', 'nf'] },
    { name: 'Grilled chicken, potatoes & veg', kcal: 620, p: 52, c: 50, tags: ['gf', 'df', 'nf'] },
    { name: 'Lentil dahl with rice', kcal: 560, p: 22, c: 75, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Shrimp pasta', kcal: 640, p: 38, c: 70, tags: ['nf'] },
    { name: 'Lean beef stir fry with rice', kcal: 680, p: 48, c: 65, tags: ['gf', 'df', 'nf'] },
  ],
  snack: [
    { name: 'Hard boiled eggs (2)', kcal: 140, p: 12, c: 1, tags: ['veg', 'gf', 'df', 'nf'] },
    { name: 'Beef jerky', kcal: 120, p: 20, c: 5, tags: ['gf', 'df', 'nf'] },
    { name: 'Protein shake with water', kcal: 150, p: 30, c: 5, tags: ['veg', 'gf', 'nf'] },
    { name: 'Greek yogurt & honey', kcal: 180, p: 18, c: 20, tags: ['veg', 'gf', 'nf'] },
    { name: 'Edamame', kcal: 190, p: 17, c: 15, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Cheese & cucumber', kcal: 200, p: 12, c: 4, tags: ['veg', 'gf', 'nf'] },
    { name: 'Hummus & veggies', kcal: 200, p: 8, c: 20, tags: ['veg', 'vegan', 'gf', 'df', 'nf'] },
    { name: 'Cottage cheese & pineapple', kcal: 220, p: 24, c: 18, tags: ['veg', 'gf', 'nf'] },
    { name: 'Apple & peanut butter', kcal: 260, p: 8, c: 30, tags: ['veg', 'vegan', 'gf', 'df'] },
    { name: 'Mixed nuts', kcal: 280, p: 8, c: 12, tags: ['veg', 'vegan', 'gf', 'df'] },
  ],
};

function slotCategory(label) {
  const l = label.toLowerCase();
  if (l.indexOf('breakfast') >= 0) return 'breakfast';
  if (l.indexOf('lunch') >= 0) return 'lunch';
  if (l.indexOf('dinner') >= 0) return 'dinner';
  return 'snack';
}

function allowedByRestrictions(it, restrictions) {
  return restrictions.every((r) => it.tags.indexOf(r) >= 0);
}

function pickIdeas(label, kcalTarget, pTarget, profile, n = 3) {
  const diet = (profile && profile.diet) || 'balanced';
  const restrictions = (profile && profile.restrictions) || [];
  const all = MEAL_IDEAS[slotCategory(label)] || [];

  // hard filter on restrictions
  let list = all.filter((it) => allowedByRestrictions(it, restrictions));
  // keto wants very low carb; relax if it leaves too little
  if (diet === 'keto') {
    const keto = list.filter((it) => it.c <= 20);
    if (keto.length >= 2) list = keto;
  }
  if (!list.length) return [];

  const score = (it) => {
    let s = Math.abs(it.kcal - kcalTarget) / Math.max(kcalTarget, 1)
      + 0.5 * Math.abs(it.p - pTarget) / Math.max(pTarget, 1);
    if (diet === 'lowcarb' || diet === 'keto') s += it.c / 250;          // prefer lower carb
    if (diet === 'highprotein') s += Math.max(0, pTarget - it.p) / Math.max(pTarget, 1) * 0.6;
    return s;
  };
  return list.map((it) => ({ it, s: score(it) })).sort((a, b) => a.s - b.s).slice(0, n).map((x) => x.it);
}

/* ---------------- live recipes from recipeapi.io ----------------
   Called only when a user taps to expand a slot (human triggered), filtered
   by the slot's meal type, calorie target, diet and restrictions. Falls back
   to the offline library on any error or empty result. */
const RESTR_TO_API = { veg: 'vegetarian', vegan: 'vegan', gf: 'gluten_free', df: 'dairy_free', nf: 'nut_free' };

// search suggestions that fit the user's diet (so a vegan never sees "chicken")
export function searchExamples(profile) {
  const r = (profile && profile.restrictions) || [];
  const diet = (profile && profile.diet) || 'balanced';
  if (r.indexOf('vegan') >= 0) return ['Tofu', 'Chickpea', 'Lentil', 'Tempeh'];
  if (r.indexOf('veg') >= 0) return ['Paneer', 'Halloumi', 'Veggie pasta', 'Black bean'];
  if (diet === 'keto') return ['Steak', 'Salmon', 'Eggs', 'Avocado'];
  if (diet === 'lowcarb') return ['Chicken salad', 'Salmon', 'Omelette'];
  return ['Chicken', 'Salmon', 'Pasta', 'Stir fry'];
}

function recipeMealType(label) {
  const c = slotCategory(label);
  if (c === 'breakfast') return 'breakfast';
  if (c === 'snack') return 'snack';
  return 'main'; // lunch and dinner
}

async function recipeApiCall(opts) {
  const { label, kcal, p, diet, restrictions, page, search, difficulty, cookTimeMax, ingredients, perPage, limit } = opts;
  const rs = restrictions || [];
  const params = new URLSearchParams();
  params.set('per_page', String(perPage || 15));
  params.set('page', String(page || 1));
  if (search) {
    params.set('search', search);   // free text search by name, ignores meal type and calories
  } else {
    params.set('meal_type', recipeMealType(label));
    if (kcal) {
      params.set('calories_per_serving_min', String(Math.max(0, Math.round(kcal * 0.6))));
      params.set('calories_per_serving_max', String(Math.round(kcal * 1.4)));
    }
    if (diet === 'highprotein' && p) params.set('protein_min', String(Math.round(p * 0.7)));
  }
  // the API takes one dietary tag, so send the strongest and filter the rest below
  const primary = rs.indexOf('vegan') >= 0 ? 'vegan' : rs[0];
  if (primary && RESTR_TO_API[primary]) params.set('dietary_tags', RESTR_TO_API[primary]);
  if (difficulty) params.set('difficulty', difficulty);
  if (cookTimeMax) params.set('cook_time_max', String(cookTimeMax));
  if (ingredients) params.set('ingredients', Array.isArray(ingredients) ? ingredients.join(',') : ingredients);

  const r = await fetch('https://recipeapi.io/api/v1/recipes?' + params.toString(),
    { headers: { Authorization: 'Bearer ' + RECIPEAPI_KEY } });
  if (!r.ok) throw new Error('recipeapi ' + r.status);
  const j = await r.json();
  const list = j.data || j.recipes || j.results || (Array.isArray(j) ? j : []);
  const lastPage = (j.meta && j.meta.last_page) || 1;
  const total = (j.meta && j.meta.total) != null ? j.meta.total : list.length;

  const needed = rs.map((k) => RESTR_TO_API[k]).filter(Boolean);
  const recipes = list
    .filter((x) => needed.every((nTag) => (x.dietary_tags || []).indexOf(nTag) >= 0))
    .map((x) => ({
      id: x.id,
      name: x.name || x.title || 'Recipe',
      kcal: Math.round(x.calories_per_serving || x.calories || 0),
      p: Math.round(x.protein || 0),
      minutes: (x.prep_time || 0) + (x.cook_time || 0),
      difficulty: x.difficulty,
      servings: x.servings || 1,
      ingredients: (x.ingredients || []).map((ig) => ({
        name: ig.name, quantity: ig.quantity, unit: ig.unit, optional: !!ig.optional,
      })),
      instructions: x.instructions || [],
      recipe: true,
    }))
    .slice(0, limit || 5);
  return { recipes, rawCount: list.length, lastPage, total };
}

// full search used by the search modal (filters + pagination, returns more)
export async function recipeSearch(opts) {
  if (!RECIPEAPI_KEY) return { recipes: [], rawCount: 0, lastPage: 1, total: 0 };
  return recipeApiCall({ perPage: 20, limit: 20, ...opts });
}

export async function recipeApiSearch(opts) {
  if (!RECIPEAPI_KEY) return { recipes: [], rawCount: 0, lastPage: 1 };
  const page = opts.page || 1;
  const res = await recipeApiCall({ ...opts, page });
  // if the requested page overshot the result set, wrap around once
  if (res.rawCount === 0 && res.lastPage >= 1 && page > res.lastPage) {
    const wrapped = ((page - 1) % res.lastPage) + 1;
    if (wrapped !== page) return recipeApiCall({ ...opts, page: wrapped });
  }
  return res;
}

// free text recipe search by name, still respecting diet and restrictions
export async function recipeTextSearch(query, profile) {
  if (!RECIPEAPI_KEY || !query) return { recipes: [], rawCount: 0, lastPage: 1 };
  return recipeApiCall({
    search: query,
    diet: profile && profile.diet,
    restrictions: profile && profile.restrictions,
    page: 1,
  });
}

/* ---------------- a live day plan: adapts to time, intake and exercise ----------------
   Splits whatever calories you have LEFT across the meals still ahead by clock
   time, and if you are over, says how long to walk to get back. */
export function dayPlan(state) {
  const target = state.targets.kcal;
  const proteinTarget = state.targets.p;
  const goal = state.profile.goal;
  const kg = state.profile.weightKg;

  const eaten = dayTotals(state);
  const burned = dayBurned(state).total;
  const budget = target + burned;               // exercise earns calories back
  const remaining = budget - eaten.cal;
  const remProtein = Math.max(0, proteinTarget - eaten.p);

  // each slot has a rough end time and a share of the day's calories
  let slots;
  if (goal === 'gain') {
    slots = [
      { label: 'Breakfast', end: 10, w: 0.25 },
      { label: 'Lunch', end: 14.5, w: 0.27 },
      { label: 'Afternoon snack', end: 17, w: 0.10 },
      { label: 'Dinner', end: 21, w: 0.28 },
      { label: 'Evening snack', end: 22.5, w: 0.10 },
    ];
  } else if (goal === 'lose' && target < 1500) {
    slots = [
      { label: 'Breakfast', end: 10, w: 0.30 },
      { label: 'Lunch', end: 14.5, w: 0.35 },
      { label: 'Dinner', end: 21, w: 0.35 },
    ];
  } else {
    slots = [
      { label: 'Breakfast', end: 10, w: 0.25 },
      { label: 'Lunch', end: 14.5, w: 0.30 },
      { label: 'Afternoon snack', end: 17, w: 0.15 },
      { label: 'Dinner', end: 21, w: 0.30 },
    ];
  }

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const ahead = slots.filter((sl) => hour < sl.end);
  const aheadW = ahead.reduce((a, sl) => a + sl.w, 0);

  let suggestions = [];
  if (remaining > 0 && ahead.length && aheadW > 0) {
    suggestions = ahead.map((sl) => {
      const kcal = Math.max(0, Math.round((remaining * (sl.w / aheadW)) / 10) * 10);
      const p = Math.round(remProtein * (sl.w / aheadW));
      return { label: sl.label, kcal, p, ideas: pickIdeas(sl.label, kcal, p, state.profile) };
    });
  }

  const overBy = remaining < 0 ? -remaining : 0;
  // brisk walk is about MET 4.3: kcal = MET x 3.5 x kg / 200 per minute
  const perMin = (4.3 * 3.5 * kg) / 200;
  const walkMin = overBy ? Math.max(5, Math.round(overBy / perMin)) : 0;
  const walk30 = Math.round(perMin * 30);
  const showBurn = overBy > 0 && goal !== 'gain';

  let tone, headline, sub;
  if (overBy > 0) {
    tone = goal === 'gain' ? 'good' : 'off';
    headline = overBy.toLocaleString() + ' over budget';
    sub = goal === 'gain'
      ? 'That overage is fine for building.' + (burned ? ' Already counting the ' + burned.toLocaleString() + ' you burned.' : '')
      : 'Walk it off or keep tomorrow a little tighter.';
  } else if (remaining <= 50) {
    tone = 'good';
    headline = 'Right on budget';
    sub = 'You have used your ' + budget.toLocaleString() + ' for today' + (burned ? ', which includes the ' + burned.toLocaleString() + ' you burned.' : '.');
  } else if (!ahead.length) {
    tone = 'warn';
    headline = remaining.toLocaleString() + ' kcal left';
    sub = 'It is late to eat much more. A light snack is fine, or bank the deficit for faster progress.';
  } else {
    tone = 'good';
    headline = remaining.toLocaleString() + ' kcal left';
    sub = 'Here is how to spread it across what is still ahead' + (burned ? ', counting the ' + burned.toLocaleString() + ' you burned today.' : '.');
  }

  const tip = goal === 'lose'
    ? 'A 30 minute walk frees up about ' + walk30.toLocaleString() + ' kcal if you want more to eat or a quicker loss.'
    : goal === 'gain'
      ? 'Keep lifting so the extra food turns into muscle.'
      : 'A daily walk keeps the balance steady.';

  return { tone, headline, sub, suggestions, overBy, walkMin, showBurn, tip };
}

/* ---------------- store provider ---------------- */
const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const pushTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      let s = JSON.parse(JSON.stringify(DEFAULTS));
      if (raw) { try { s = Object.assign(s, JSON.parse(raw)); } catch (e) {} }
      if (!s.sync.code) s.sync.code = newSyncCode();
      setState(s);
    });
  }, []);

  const update = (fn) => {
    setState((prev) => {
      const next = fn(JSON.parse(JSON.stringify(prev)));
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      // push to the dashboard at most once every 8 seconds
      if (next.sync.enabled) {
        clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(() => { pushSync(next).catch(() => {}); }, 8000);
      }
      return next;
    });
  };

  const reset = async () => {
    await AsyncStorage.removeItem(KEY);
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    s.sync.code = newSyncCode();
    setState(s);
  };

  if (!state) return null;
  return <Ctx.Provider value={{ state, update, reset }}>{children}</Ctx.Provider>;
}
