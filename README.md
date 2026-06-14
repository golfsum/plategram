# Plategram

Point your camera at your plate. The app works out the calories, protein, carbs and fat, and the photo you took becomes the meal's icon in your log. Walks, workouts and your daily steps count against the other side of the ledger, so you can see calories in and calories out on one screen.

## Run it on your iPhone

```
cd plategram
npx expo start
```

Scan the QR code with the Camera app and it opens in Expo Go. Everything works out of the box: onboarding, photo scans (demo results until you add a key), workout logging and step counting.

## Secrets live in .env, not in the app

There are no API key fields in the app anymore. All secrets are read from environment variables.

1. Copy `.env.example` to `.env`.
2. Fill in any of these you want:

```
EXPO_PUBLIC_GEMINI_API_KEY=        # real photo analysis (blank = demo mode)
EXPO_PUBLIC_FIREBASE_PROJECT_ID=   # backs the dashboard sync
EXPO_PUBLIC_FIREBASE_API_KEY=
```

3. Restart with `npx expo start -c`. Settings shows a green dot for each one that is set.

`npx expo start` loads `.env` automatically. On **expo.dev / EAS**, set the same variables in your project so builds pick them up:

```
eas env:create --name EXPO_PUBLIC_GEMINI_API_KEY --value "..." --environment production
```

One caveat: anything prefixed `EXPO_PUBLIC_` is bundled into the app and is not truly secret. For a real launch, move the Gemini call behind a Cloud Function and keep the key server side. The env setup is the right pattern for development and personal use.

## Turn on real photo analysis

Put a Gemini key (from Google AI Studio) in `EXPO_PUBLIC_GEMINI_API_KEY`. With no key, the app uses built-in sample results.

The scan is tuned for accuracy:
- It runs on `gemini-2.5-flash`, which reasons through portion size, hidden oils and cooking method before answering. For the most accurate (slower) results, change `GEMINI_MODEL` in `src/store.js` to `gemini-2.5-pro`.
- The prompt asks it to work like a dietitian: find every item including sauces and dressings, judge portions from scale cues in the photo, account for how food was cooked, and lean realistic rather than optimistic.
- Output is locked to a strict schema (per item grams, cooking method, calories and macros) so the model cannot drift, and temperature is 0 for steady answers.
- The photo is sent at 1024px so there is enough detail to read the plate.
- Each result shows a confidence score and a short note on any assumptions it made, and you can still adjust the portion before logging.

### USDA refinement
After the AI lists the ingredients and its gram estimate for each, every item is looked up in the USDA FoodData Central database and its calories and macros are recomputed from lab grade per-100g values scaled to those grams. The AI is good at naming the food and judging the portion, USDA is far more accurate per gram, so the two together beat either alone. If an item has no gram estimate, no clean match, or the database value looks wildly off (more than 3x different), the AI number is kept. Items that were matched show a small "matched to USDA nutrition data" line on the result. Set `EXPO_PUBLIC_FDC_API_KEY` for real use (it falls back to the shared DEMO_KEY, which is rate limited).

Costs are a small fraction of a cent per scan.

## Live recipe ideas (recipeapi.io)

"Plan your day" suggests meals per slot from a built-in offline library. If you set `EXPO_PUBLIC_RECIPEAPI_KEY` (an `sk_live_...` key from recipeapi.io), tapping a slot instead pulls live recipes that fit:

- It calls `GET https://recipeapi.io/api/v1/recipes` with the slot's `meal_type`, a `calories_per_serving_min/max` band around the slot target, your `dietary_tags`, and `protein_min` when your diet is high protein.
- recipeapi.io accepts a single dietary tag, so the strongest restriction is sent to the API and the rest are enforced client side against each recipe's returned `dietary_tags`.
- It only calls when you tap to expand a slot (never automatically), to respect rate limits, and falls back to the offline library on any error, empty result, or when no key is set.
- **Changes daily**: the starting page is seeded from the date, so the suggested recipes rotate each day. **Refresh for more** pulls the next page.
- **Tap the + on a recipe** to expand its ingredient breakdown and cooking steps (both come back in the same call, no extra request).
- **Save to favorites** with the heart; saved recipes (with their ingredients and steps) live in a "Saved recipes" section on Today, are editable in Settings, and persist on the device.
- **Search recipes** via a modal (the "Search recipes" button in Plan your day): free text plus filters for difficulty, cook time, and must-include ingredients. Your diet and restrictions are always applied, so a vegan never sees chicken, and the example suggestions are diet-aware (tofu/chickpea for vegan, steak/salmon for keto). Results paginate with "Load more".

The free tier is 500 requests/month; Essential is $29.99/month for 50,000. For production, proxy the call through a Cloud Function so the key is off-device and responses can be cached.

## Accounts (Firebase auth) and building

Sign-in lives in Settings > Account: email/password, Google, and Apple. It's optional, the app works fully without it.

**Email/password** works in Expo Go once you set the Firebase keys. **Google and Apple need a real build** (Expo Go cannot do native Google/Apple sign-in).

### 1. Firebase console
- In your `plategram` project, enable **Authentication > Sign-in method**: Email/Password, Google, and Apple.
- Add an **iOS app** with bundle id `com.nd82soft.plategram`, download `GoogleService-Info.plist`.
- Copy the web app config values into `.env`:
  - `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_FIREBASE_MSG_SENDER_ID`
  - For Google: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (the iOS client id) and `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (its reversed form, `com.googleusercontent.apps.xxxx`).
- Apple sign-in also needs the Apple **Services ID / Sign in with Apple** capability set up in your Apple Developer account, and the Apple provider configured in Firebase.

### 2. Build with EAS (gets you off the Expo Go SDK ceiling too)
```
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```
Install the resulting build on your phone, then `npx expo start --dev-client` and open it there. `eas.json` already has `development`, `preview`, and `production` profiles. Set the same `EXPO_PUBLIC_*` vars as EAS environment variables for cloud builds (`eas env:create ...`).

Auth uses the Firebase JS SDK (`signInWithCredential` for Google/Apple tokens), so there's no `@react-native-firebase` native dependency to manage.

## How the burn numbers work

- Workouts use MET values from the Compendium of Physical Activities: kcal = MET x 3.5 x weight in kg / 200, per minute. A 30 minute brisk walk at 75 kg comes out around 170 kcal, which matches what most trackers report.
- Steps are read from the phone's pedometer (Core Motion on iOS) and converted at roughly 0.0005 kcal per step per kg of body weight, so 10,000 steps at 75 kg is about 375 kcal.
- Eating targets come from the Mifflin-St Jeor equation with an activity multiplier, minus 500 kcal for weight loss or plus 300 for muscle gain.
- Burned calories get added back to the daily budget, the same way MyFitnessPal handles it.

These are honest estimates, not medical measurements, and the app says so.

## Money

The paywall (3 day trial, $39.99 a year or $9.99 a month) is fully built. The purchase button currently flips a local flag. To take real money, install `react-native-purchases`, create the products in App Store Connect and RevenueCat, and replace the `buy` function in `src/screens/Modals.js`. Free users get 3 photo scans a day; the fourth one opens the paywall.

## App icon and brand mark

The home screen icon, splash, Android adaptive layers and the in-app brand mark are all generated from the Plategram logo at `assets/logo-source.png` by `scripts/make-icons.js`. The icon uses just the plate emblem (the wordmark is unreadable at icon size); the splash uses the full lockup. The source art is 201px, so the upscaled icon is slightly soft. Drop in a higher resolution `logo-source.png` and rerun `node scripts/make-icons.js` for a crisper result.

## Free assets used

- Manrope typeface, via @expo-google-fonts (SIL Open Font License)
- Material Community Icons (Pictogrammers, Apache 2.0 / SIL OFL), shipped inside @expo/vector-icons so there is no extra dependency. Every icon is mapped in `src/icon.js`, one distinct glyph per function (home, progress, steps, scan, photo library, workout, quick add, calorie burn, and each exercise type)
- Food photography from Unsplash (free under the Unsplash license)
- Chart.js on the dashboard (MIT)
