import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/* One wrapper so the whole app draws from a single icon set.
   MaterialCommunityIcons (Pictogrammers, Apache 2.0 / SIL OFL) ships inside
   @expo/vector-icons, so there is no extra dependency to resolve.
   Names below are semantic; each maps to one distinct glyph. */
const MAP = {
  // navigation and chrome
  home: 'home-variant',
  progress: 'chart-box',
  settings: 'cog',
  back: 'chevron-left',
  forward: 'chevron-right',
  close: 'close',
  add: 'plus',
  remove: 'minus',
  refresh: 'refresh',
  // food and tracking
  burn: 'fire',
  meal: 'silverware-fork-knife',
  water: 'cup-water',
  drink: 'bottle-soda',
  steps: 'shoe-print',
  scan: 'line-scan',
  library: 'image-multiple',
  camera: 'camera',
  workout: 'dumbbell',
  quickadd: 'lightning-bolt',
  // settings rows and paywall
  sparkles: 'creation',
  account: 'account-circle',
  camera2: 'camera',
  fav: 'heart',
  'fav-off': 'heart-outline',
  check: 'check-circle',
  download: 'download',
  trash: 'trash-can-outline',
  cloud: 'cloud-check',
  block: 'cancel',
  noads: 'cancel',
  fast: 'lightning-bolt',
  trending: 'chart-line',
  // goals
  'goal-lose': 'trending-down',
  'goal-maintain': 'trending-neutral',
  'goal-gain': 'trending-up',
  // activity levels
  'act-sitting': 'desk',
  'act-light': 'walk',
  'act-active': 'dumbbell',
  'act-very': 'run-fast',
  // exercise types
  walk: 'walk',
  jog: 'run',
  run: 'run-fast',
  cycle: 'bike',
  swim: 'swim',
  gym: 'dumbbell',
  hiit: 'timer',
  hike: 'hiking',
  yoga: 'yoga',
  dance: 'dance-ballroom',
  sport: 'basketball',
};

export default function Icon({ name, size = 22, color = '#fff' }) {
  return <MaterialCommunityIcons name={MAP[name] || 'fire'} size={size} color={color} />;
}
