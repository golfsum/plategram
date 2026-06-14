import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, Modal } from 'react-native';
import Icon from '../icon';
import { Pedometer } from 'expo-sensors';
import { C, F } from '../theme';
import { Card, Ring, MacroBar, Input } from '../ui';
import {
  useStore, dayTotals, dayBurned, mealTotals, todayKey, stepsKcal, trackInsight, dayPlan,
  recipeApiEnabled, recipeApiSearch, recipeSearch, searchExamples,
  todayWater, waterGoalMl, GLASS_ML,
} from '../store';

const DIFF_OPTS = [{ v: '', l: 'Any' }, { v: 'easy', l: 'Easy' }, { v: 'medium', l: 'Medium' }, { v: 'hard', l: 'Hard' }];
const TIME_OPTS = [{ v: 0, l: 'Any time' }, { v: 15, l: '15 min' }, { v: 30, l: '30 min' }, { v: 45, l: '45 min' }];
import { MealEditModal } from './Modals';

// a recipe line that can expand to show ingredients and how to cook, with a save heart
function RecipeRow({ r, fav, onFav, open, onToggle }) {
  return (
    <View>
      <View style={s.recRow}>
        <Pressable style={{ flex: 1 }} onPress={onToggle}>
          <Text style={s.ideaName}>{r.name}</Text>
          <Text style={s.ideaMeta}>{r.kcal} kcal · {r.p}g P{r.minutes ? ' · ' + r.minutes + ' min' : ''}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={onFav} style={{ padding: 4 }}>
          <Icon name={fav ? 'fav' : 'fav-off'} size={18} color={fav ? C.fat : C.muted} />
        </Pressable>
        <Pressable hitSlop={8} onPress={onToggle} style={{ padding: 4 }}>
          <Icon name={open ? 'remove' : 'add'} size={16} color={C.muted} />
        </Pressable>
      </View>
      {open ? (
        <View style={s.recDetail}>
          <Text style={s.recHead}>Ingredients</Text>
          {(r.ingredients || []).map((ig, k) => (
            <Text key={k} style={s.recIng}>
              •  {ig.quantity ? ig.quantity + (ig.unit || '') + ' ' : ''}{ig.name}{ig.optional ? ' (optional)' : ''}
            </Text>
          ))}
          <Text style={[s.recHead, { marginTop: 10 }]}>How to cook</Text>
          {(r.instructions || []).map((step, k) => (
            <Text key={k} style={s.recStep}>{k + 1}.  {step}</Text>
          ))}
          {r.servings ? <Text style={s.recServ}>Makes {r.servings} serving{r.servings > 1 ? 's' : ''}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export default function Today() {
  const { state, update } = useStore();
  const [editMealId, setEditMealId] = useState(null);
  const [openSlot, setOpenSlot] = useState(null);
  const [slotData, setSlotData] = useState({}); // { [i]: { loading, recipes, refresh } } from recipeapi.io
  const [openRecipe, setOpenRecipe] = useState(null); // key of the recipe whose breakdown is open
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [sDiff, setSDiff] = useState('');
  const [sTime, setSTime] = useState(0);
  const [sIng, setSIng] = useState('');
  const [searchData, setSearchData] = useState(null); // { loading, recipes, total, page, lastPage }

  const runSearch = (query, page) => {
    setSearchData((prev) => (page > 1 && prev ? { ...prev, loadingMore: true } : { loading: true }));
    recipeSearch({
      search: query.trim() || undefined,
      difficulty: sDiff || undefined,
      cookTimeMax: sTime || undefined,
      ingredients: sIng.trim() || undefined,
      diet: state.profile.diet,
      restrictions: state.profile.restrictions,
      page,
    })
      .then((res) => setSearchData((prev) => ({
        loading: false, loadingMore: false,
        recipes: page > 1 && prev ? [...prev.recipes, ...res.recipes] : res.recipes,
        total: res.total, page, lastPage: res.lastPage,
      })))
      .catch(() => setSearchData((prev) => (page > 1 && prev ? { ...prev, loadingMore: false } : { loading: false, recipes: [] })));
  };
  const doSearch = () => runSearch(searchQ, 1);
  const loadMoreSearch = () => { if (searchData && searchData.page < searchData.lastPage) runSearch(searchQ, searchData.page + 1); };

  // day number, so the starting recipes change every day
  const daySeed = Math.floor(Date.now() / 86400000);

  const loadSlot = (i, m, refresh) => {
    const page = ((daySeed + i) % 12) + 1 + refresh; // shifts daily, and on each refresh
    setSlotData((d) => ({ ...d, [i]: { ...(d[i] || {}), loading: true, refresh } }));
    recipeApiSearch({ label: m.label, kcal: m.kcal, p: m.p, diet: state.profile.diet, restrictions: state.profile.restrictions, page })
      .then((res) => setSlotData((d) => ({ ...d, [i]: { loading: false, recipes: res.recipes, refresh } })))
      .catch(() => setSlotData((d) => ({ ...d, [i]: { loading: false, recipes: [], refresh } })));
  };
  const toggleSlot = (i, m) => {
    if (openSlot === i) { setOpenSlot(null); return; }
    setOpenSlot(i);
    if (recipeApiEnabled() && !slotData[i]) loadSlot(i, m, 0);
  };
  const refreshSlot = (i, m) => loadSlot(i, m, (slotData[i] && slotData[i].refresh ? slotData[i].refresh : 0) + 1);

  // favorites
  const favs = state.favorites || [];
  const isFav = (id) => favs.some((f) => f.id === id);
  const toggleFav = (r) => update((s) => {
    const arr = s.favorites || [];
    s.favorites = arr.some((f) => f.id === r.id) ? arr.filter((f) => f.id !== r.id) : [...arr, r];
    return s;
  });
  const t = dayTotals(state);
  const burned = dayBurned(state);
  const tg = state.targets;

  // budget = target + burned. Exercise earns calories back, like most trackers.
  const budget = tg.kcal + burned.total;
  const left = budget - t.cal;
  const over = left < 0;

  const water = todayWater(state);
  const waterGoal = waterGoalMl(state);
  const addWater = (ml) => update((s) => {
    const k = todayKey();
    s.water[k] = Math.max(0, (s.water[k] || 0) + ml);
    return s;
  });

  /* read today's steps from the phone, refresh every couple of minutes */
  useEffect(() => {
    let timer;
    const read = async () => {
      try {
        const ok = await Pedometer.isAvailableAsync();
        if (!ok) return;
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) return;
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const r = await Pedometer.getStepCountAsync(start, new Date());
        const count = r && r.steps ? r.steps : 0;
        update((s) => {
          s.steps[todayKey()] = { count, kcal: stepsKcal(count, s.profile.weightKg) };
          return s;
        });
      } catch (e) { /* pedometer not available on this device, fine */ }
    };
    read();
    timer = setInterval(read, 120000);
    return () => clearInterval(timer);
  }, []);

  const meals = (state.meals[todayKey()] || []).slice().reverse();
  const workouts = (state.exercises[todayKey()] || []).slice().reverse();
  const st_ = state.steps[todayKey()];

  const removeMeal = (id) => update((s) => {
    const k = todayKey();
    s.meals[k] = (s.meals[k] || []).filter((m) => m.id !== id);
    return s;
  });
  const removeWorkout = (id) => update((s) => {
    const k = todayKey();
    s.exercises[k] = (s.exercises[k] || []).filter((m) => m.id !== id);
    return s;
  });

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingBottom: 130 }}>
      {/* ring card */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 }}>
        <Ring pct={t.cal / Math.max(1, budget)}>
          <Text style={s.ringNum}>{Math.abs(left).toLocaleString()}</Text>
          <Text style={s.ringLbl}>{over ? 'OVER BUDGET' : 'LEFT TODAY'}</Text>
        </Ring>
        <View style={{ flex: 1 }}>
          <MacroBar name="Protein" value={t.p} max={tg.p} color={C.protein} />
          <MacroBar name="Carbs" value={t.c} max={tg.c} color={C.carbs} />
          <MacroBar name="Fat" value={t.f} max={tg.f} color={C.fat} />
        </View>
      </Card>

      {/* in / out chips */}
      <View style={{ flexDirection: 'row', gap: 11, marginTop: 12 }}>
        <View style={s.ioCell}>
          <Icon name="meal" size={15} color={C.orange} />
          <Text style={s.ioVal}>{t.cal.toLocaleString()}</Text>
          <Text style={s.ioLbl}>eaten</Text>
        </View>
        <View style={s.ioCell}>
          <Icon name="burn" size={15} color={C.green} fill={C.green} />
          <Text style={[s.ioVal, { color: C.green }]}>{burned.total.toLocaleString()}</Text>
          <Text style={s.ioLbl}>burned</Text>
        </View>
        <View style={s.ioCell}>
          <Icon name="steps" size={15} color={C.muted} />
          <Text style={s.ioVal}>{st_ ? st_.count.toLocaleString() : '0'}</Text>
          <Text style={s.ioLbl}>steps</Text>
        </View>
      </View>

      {/* water */}
      <View style={s.waterCard}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 }}>
            <Icon name="water" size={15} color={C.protein} />
            <Text style={s.waterVal}>{(water / 1000).toFixed(water % 1000 === 0 ? 0 : 1)}L</Text>
            <Text style={s.waterGoal}>of {(waterGoal / 1000).toFixed(1)}L</Text>
          </View>
          <View style={s.waterTrack}>
            <View style={[s.waterFill, { width: Math.min(100, (water / waterGoal) * 100) + '%' }]} />
          </View>
        </View>
        <Pressable style={s.waterBtn} onPress={() => addWater(GLASS_ML)}>
          <Icon name="add" size={16} color={C.protein} />
          <Text style={s.waterBtnTxt}>Glass</Text>
        </Pressable>
        <Pressable style={s.waterBtn} onPress={() => addWater(500)}>
          <Icon name="add" size={16} color={C.protein} />
          <Text style={s.waterBtnTxt}>500</Text>
        </Pressable>
        {water > 0 ? (
          <Pressable hitSlop={6} style={s.waterUndo} onPress={() => addWater(-GLASS_ML)}>
            <Icon name="remove" size={15} color={C.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* are you on track */}
      {(() => {
        const ins = trackInsight(state);
        const tone = ins.tone === 'good' ? C.green : ins.tone === 'off' ? C.fat : ins.tone === 'warn' ? C.carbs : C.muted;
        return (
          <View style={s.insight}>
            <View style={s.insHead}>
              <View style={[s.insDot, { backgroundColor: tone }]} />
              <Text style={s.insVerdict}>{ins.verdict}</Text>
            </View>
            <Text style={s.insDetail}>{ins.detail}</Text>
            <Text style={s.insToday}>{ins.today}</Text>
          </View>
        );
      })()}

      {/* plan your day, live */}
      {(() => {
        const plan = dayPlan(state);
        const tone = plan.tone === 'good' ? C.green : plan.tone === 'off' ? C.fat : C.carbs;
        return (
          <View style={s.plan}>
            <View style={s.insHead}>
              <Icon name="meal" size={15} color={C.orange} />
              <Text style={s.insVerdict}>Plan your day</Text>
            </View>
            <Text style={[s.planBig, { color: tone }]}>{plan.headline}</Text>
            <Text style={s.planIntro}>{plan.sub}</Text>
            {recipeApiEnabled() ? (
              <Pressable style={s.searchOpenBtn} onPress={() => setSearchOpen(true)}>
                <Icon name="scan" size={16} color={C.orange} />
                <Text style={s.searchOpenTxt}>Search recipes</Text>
              </Pressable>
            ) : null}

            {plan.suggestions.length > 0 && (
              <Text style={s.planHint}>Tap a meal for ideas that fit</Text>
            )}
            {plan.suggestions.map((m, i) => {
              const sd = slotData[i];
              // live recipes when they loaded, otherwise the offline ideas
              const live = sd && sd.recipes && sd.recipes.length ? sd.recipes : null;
              const ideas = live || m.ideas || [];
              return (
                <View key={i}>
                  <Pressable style={s.planRow} onPress={() => toggleSlot(i, m)}>
                    <Text style={s.planSlot}>{m.label}</Text>
                    <Text style={s.planKcal}>{m.kcal.toLocaleString()} kcal</Text>
                    <Text style={s.planP}>{m.p}g P</Text>
                    <Icon name={openSlot === i ? 'remove' : 'add'} size={14} color={C.muted} />
                  </Pressable>
                  {openSlot === i ? (
                    <View style={s.ideaBox}>
                      {sd && sd.loading ? (
                        <View style={s.ideaRow}>
                          <ActivityIndicator size="small" color={C.orange} />
                          <Text style={[s.ideaName, { marginLeft: 8 }]}>Finding recipes…</Text>
                        </View>
                      ) : ideas.length ? (
                        <>
                          {ideas.map((idea, j) => (
                            live ? (
                              <RecipeRow key={idea.id || j} r={idea} fav={isFav(idea.id)}
                                onFav={() => toggleFav(idea)}
                                open={openRecipe === 'slot' + i + '-' + idea.id}
                                onToggle={() => setOpenRecipe(openRecipe === 'slot' + i + '-' + idea.id ? null : 'slot' + i + '-' + idea.id)} />
                            ) : (
                              <View key={j} style={s.ideaRow}>
                                <Text style={s.ideaName}>{idea.name}</Text>
                                <Text style={s.ideaMeta}>{idea.kcal} kcal · {idea.p}g P</Text>
                              </View>
                            )
                          ))}
                          {live ? (
                            <Pressable style={s.refreshBtn} onPress={() => refreshSlot(i, m)}>
                              <Icon name="refresh" size={14} color={C.orange} />
                              <Text style={s.refreshTxt}>Refresh for more</Text>
                            </Pressable>
                          ) : null}
                          {live ? <Text style={s.ideaSrc}>recipes via recipeapi.io</Text> : null}
                        </>
                      ) : (
                        <Text style={s.ideaName}>No ideas match your diet here yet.</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {plan.showBurn ? (
              <View style={s.planAct}>
                <Icon name="walk" size={15} color={C.green} />
                <Text style={s.planActTxt}>
                  Walk about {plan.walkMin} minutes to burn {plan.overBy.toLocaleString()} kcal and get back to your budget.
                </Text>
              </View>
            ) : null}
            <Text style={s.planNote}>{plan.tip}</Text>
          </View>
        );
      })()}

      {/* saved recipes */}
      {favs.length > 0 ? (
        <View style={[s.plan, { marginTop: 12 }]}>
          <View style={s.insHead}>
            <Icon name="fav" size={15} color={C.fat} />
            <Text style={s.insVerdict}>Saved recipes</Text>
          </View>
          {favs.map((r) => (
            <RecipeRow key={r.id} r={r} fav onFav={() => toggleFav(r)}
              open={openRecipe === 'fav-' + r.id}
              onToggle={() => setOpenRecipe(openRecipe === 'fav-' + r.id ? null : 'fav-' + r.id)} />
          ))}
        </View>
      ) : null}

      {/* meals */}
      <View style={s.secRow}>
        <Text style={s.secTitle}>Meals</Text>
        {t.cal > 0 && <Text style={s.secSub}>{t.cal.toLocaleString()} kcal</Text>}
      </View>
      {meals.length === 0 ? (
        <View style={s.empty}>
          <Icon name="scan" size={30} color={C.muted} />
          <Text style={s.emptyTxt}>Nothing logged yet. Tap the plus button and snap your first meal.</Text>
        </View>
      ) : meals.map((m) => {
        const x = mealTotals(m);
        const time = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return (
          <Pressable key={m.id} style={s.row} onPress={() => setEditMealId(m.id)}>
            {m.img
              ? <Image source={{ uri: m.img }} style={s.thumb} />
              : <View style={[s.thumb, s.thumbPh]}><Icon name="meal" size={20} color={C.muted} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
              <Text style={s.rowSub}>
                {time} · P {x.p} · C {x.c} · F {x.f}{m.mult && m.mult !== 1 ? ' · ' + m.mult + 'x' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.rowKcal}>{x.cal}</Text>
              <Text style={s.rowKcalLbl}>kcal</Text>
            </View>
            <Pressable hitSlop={8} onPress={() => removeMeal(m.id)} style={{ padding: 4 }}>
              <Icon name="close" size={16} color={C.muted} />
            </Pressable>
          </Pressable>
        );
      })}

      {/* activity */}
      <View style={s.secRow}>
        <Text style={s.secTitle}>Activity</Text>
        {burned.total > 0 && <Text style={[s.secSub, { color: C.green }]}>{burned.total.toLocaleString()} kcal burned</Text>}
      </View>
      {workouts.length === 0 && !st_ ? (
        <View style={s.empty}>
          <Icon name="steps" size={30} color={C.muted} />
          <Text style={s.emptyTxt}>Walks and workouts show up here. Steps count automatically once you allow motion access.</Text>
        </View>
      ) : (
        <View>
          {workouts.map((w) => (
            <View key={w.id} style={s.row}>
              <View style={[s.thumb, s.thumbPh, { backgroundColor: C.greenSoft }]}>
                <Icon name="workout" size={19} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{w.label}</Text>
                <Text style={s.rowSub}>{w.minutes} min</Text>
              </View>
              <Text style={[s.rowKcal, { color: C.green }]}>-{w.kcal}</Text>
              <Pressable hitSlop={8} onPress={() => removeWorkout(w.id)} style={{ padding: 4 }}>
                <Icon name="close" size={16} color={C.muted} />
              </Pressable>
            </View>
          ))}
          {st_ && st_.count > 0 ? (
            <View style={s.row}>
              <View style={[s.thumb, s.thumbPh, { backgroundColor: C.greenSoft }]}>
                <Icon name="steps" size={19} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>Steps</Text>
                <Text style={s.rowSub}>{st_.count.toLocaleString()} so far today</Text>
              </View>
              <Text style={[s.rowKcal, { color: C.green }]}>-{st_.kcal}</Text>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
    <MealEditModal
      visible={editMealId != null}
      dayKey={todayKey()}
      mealId={editMealId}
      onClose={() => setEditMealId(null)}
    />

    <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
      <View style={s.searchPage}>
        <View style={s.searchHead}>
          <Text style={s.searchTitle}>Find a recipe</Text>
          <Pressable onPress={() => setSearchOpen(false)} style={s.xBtn}><Icon name="close" size={18} color={C.text} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18 }}>
          <Input value={searchQ} onChangeText={setSearchQ} onSubmitEditing={doSearch} returnKeyType="search"
            placeholder={'e.g. ' + searchExamples(state.profile)[0].toLowerCase()} style={{ flex: 1, paddingVertical: 11 }} />
          <Pressable style={s.searchBtn} onPress={doSearch}><Icon name="scan" size={17} color="#fff" /></Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
          {/* diet-aware quick suggestions */}
          {!searchData ? (
            <>
              <Text style={s.filtLabel}>Try</Text>
              <View style={s.chipRow}>
                {searchExamples(state.profile).map((ex) => (
                  <Pressable key={ex} style={s.exChip} onPress={() => { setSearchQ(ex); runSearch(ex, 1); }}>
                    <Text style={s.exChipTxt}>{ex}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {/* filters */}
          <Text style={s.filtLabel}>Difficulty</Text>
          <View style={s.chipRow}>
            {DIFF_OPTS.map((o) => (
              <Pressable key={o.l} style={[s.filtChip, sDiff === o.v && s.filtChipOn]} onPress={() => setSDiff(o.v)}>
                <Text style={[s.filtChipTxt, sDiff === o.v && { color: C.orange }]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.filtLabel}>Cook time</Text>
          <View style={s.chipRow}>
            {TIME_OPTS.map((o) => (
              <Pressable key={o.l} style={[s.filtChip, sTime === o.v && s.filtChipOn]} onPress={() => setSTime(o.v)}>
                <Text style={[s.filtChipTxt, sTime === o.v && { color: C.orange }]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.filtLabel}>Must include (comma separated)</Text>
          <Input value={sIng} onChangeText={setSIng} placeholder="e.g. tomato, basil" autoCapitalize="none" />
          <Pressable style={s.applyBtn} onPress={doSearch}>
            <Text style={s.applyTxt}>Apply filters</Text>
          </Pressable>
          {(state.profile.restrictions || []).length || (state.profile.diet && state.profile.diet !== 'balanced') ? (
            <Text style={s.dietNote}>
              Your {[state.profile.diet !== 'balanced' ? state.profile.diet : null, ...(state.profile.restrictions || [])].filter(Boolean).join(', ')} preferences are applied.
            </Text>
          ) : null}

          {/* results */}
          {searchData ? (
            <View style={{ marginTop: 16 }}>
              {searchData.loading ? (
                <View style={s.ideaRow}><ActivityIndicator size="small" color={C.orange} /><Text style={[s.ideaName, { marginLeft: 8 }]}>Searching…</Text></View>
              ) : searchData.recipes && searchData.recipes.length ? (
                <>
                  <Text style={s.filtLabel}>{searchData.total} results</Text>
                  {searchData.recipes.map((r) => (
                    <RecipeRow key={'srch-' + r.id} r={r} fav={isFav(r.id)} onFav={() => toggleFav(r)}
                      open={openRecipe === 'srch-' + r.id}
                      onToggle={() => setOpenRecipe(openRecipe === 'srch-' + r.id ? null : 'srch-' + r.id)} />
                  ))}
                  {searchData.page < searchData.lastPage ? (
                    <Pressable style={s.refreshBtn} onPress={loadMoreSearch}>
                      {searchData.loadingMore ? <ActivityIndicator size="small" color={C.orange} />
                        : <><Icon name="add" size={14} color={C.orange} /><Text style={s.refreshTxt}>Load more</Text></>}
                    </Pressable>
                  ) : null}
                  <Text style={s.ideaSrc}>recipes via recipeapi.io</Text>
                </>
              ) : (
                <Text style={s.ideaName}>No recipes match. Try fewer filters or a different word.</Text>
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  ringNum: { color: C.text, fontFamily: F.extra, fontSize: 31, letterSpacing: -1 },
  ringLbl: { color: C.muted, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.8 },
  ioCell: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 2,
  },
  ioVal: { color: C.text, fontFamily: F.extra, fontSize: 17 },
  ioLbl: { color: C.muted, fontFamily: F.bold, fontSize: 11 },
  waterCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14,
  },
  waterVal: { color: C.text, fontFamily: F.extra, fontSize: 16 },
  waterGoal: { color: C.muted, fontFamily: F.semi, fontSize: 12.5 },
  waterTrack: { height: 7, borderRadius: 99, backgroundColor: C.card2, overflow: 'hidden' },
  waterFill: { height: '100%', borderRadius: 99, backgroundColor: C.protein },
  waterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 11, backgroundColor: 'rgba(94,155,255,0.12)',
  },
  waterBtnTxt: { color: C.protein, fontFamily: F.bold, fontSize: 12.5 },
  waterUndo: { padding: 4 },
  insight: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, padding: 16, marginTop: 12,
  },
  insHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  insDot: { width: 9, height: 9, borderRadius: 99 },
  insVerdict: { flex: 1, color: C.text, fontFamily: F.extra, fontSize: 15.5 },
  insDetail: { color: C.muted, fontFamily: F.semi, fontSize: 13, lineHeight: 19 },
  insToday: {
    color: C.muted, fontFamily: F.semi, fontSize: 12, lineHeight: 17,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.line,
  },
  plan: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, padding: 16, marginTop: 12,
  },
  planBig: { fontFamily: F.extra, fontSize: 24, letterSpacing: -0.5, marginBottom: 4 },
  planIntro: { color: C.muted, fontFamily: F.semi, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  planHint: { color: C.muted, fontFamily: F.semi, fontSize: 11.5, marginBottom: 4 },
  searchOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 10, paddingVertical: 12, borderRadius: 13,
    backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: 'rgba(255,122,47,0.4)',
  },
  searchOpenTxt: { color: C.orange, fontFamily: F.bold, fontSize: 14 },
  searchPage: { flex: 1, backgroundColor: C.bg, paddingTop: 56 },
  searchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 14 },
  searchTitle: { color: C.text, fontFamily: F.extra, fontSize: 22 },
  xBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  searchBtn: {
    width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.gradB,
  },
  filtLabel: { color: C.muted, fontFamily: F.bold, fontSize: 12, marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  exChipTxt: { color: C.text, fontFamily: F.bold, fontSize: 13 },
  filtChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line },
  filtChipOn: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  filtChipTxt: { color: C.muted, fontFamily: F.bold, fontSize: 13 },
  applyBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 13, backgroundColor: C.gradB, alignItems: 'center' },
  applyTxt: { color: '#fff', fontFamily: F.bold, fontSize: 15 },
  dietNote: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 10 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderTopWidth: 1, borderColor: C.line,
  },
  planSlot: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 14 },
  planKcal: { color: C.text, fontFamily: F.bold, fontSize: 13.5, width: 78, textAlign: 'right' },
  planP: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, width: 52, textAlign: 'right' },
  ideaBox: { paddingLeft: 2, paddingBottom: 6 },
  ideaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  ideaName: { flex: 1, color: C.text, fontFamily: F.semi, fontSize: 13, paddingRight: 10 },
  ideaMeta: { color: C.muted, fontFamily: F.bold, fontSize: 11.5 },
  ideaSrc: { color: C.muted, fontFamily: F.semi, fontSize: 10.5, marginTop: 4 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: C.line },
  recDetail: { paddingVertical: 8, paddingLeft: 2 },
  recHead: { color: C.text, fontFamily: F.bold, fontSize: 12, marginBottom: 4 },
  recIng: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, lineHeight: 19 },
  recStep: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, lineHeight: 19, marginBottom: 3 },
  recServ: { color: C.muted, fontFamily: F.bold, fontSize: 11, marginTop: 8 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, marginTop: 4, borderRadius: 11, backgroundColor: C.orangeSoft },
  refreshTxt: { color: C.orange, fontFamily: F.bold, fontSize: 13 },
  planNote: { color: C.muted, fontFamily: F.semi, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  planAct: {
    flexDirection: 'row', gap: 9, marginTop: 12, padding: 12,
    backgroundColor: C.greenSoft, borderRadius: 13,
  },
  planActTxt: { flex: 1, color: C.text, fontFamily: F.semi, fontSize: 12.5, lineHeight: 18 },
  planLeft: {
    color: C.orange, fontFamily: F.bold, fontSize: 13, marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderColor: C.line,
  },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 11 },
  secTitle: { color: C.text, fontFamily: F.extra, fontSize: 17 },
  secSub: { color: C.muted, fontFamily: F.bold, fontSize: 12.5 },
  empty: {
    borderWidth: 1.5, borderColor: C.line, borderStyle: 'dashed', borderRadius: 20,
    padding: 26, alignItems: 'center', gap: 10,
  },
  emptyTxt: { color: C.muted, fontFamily: F.semi, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 18, padding: 12, marginBottom: 10,
  },
  thumb: { width: 52, height: 52, borderRadius: 14 },
  thumbPh: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: C.text, fontFamily: F.bold, fontSize: 14.5 },
  rowSub: { color: C.muted, fontFamily: F.semi, fontSize: 12, marginTop: 1 },
  rowKcal: { color: C.text, fontFamily: F.extra, fontSize: 15.5 },
  rowKcalLbl: { color: C.muted, fontFamily: F.semi, fontSize: 10.5 },
});
