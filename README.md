# Foodlings — scaffold

Three pieces:

- **`/`** — the customer-facing Expo (React Native) app
- **`staff-portal/`** — the lightweight web app staff use to scan check-ins
- **`supabase/`** — the Postgres schema, RLS policies, and edge functions

This scaffold has no network access baked in — you'll need to run installs
yourself. Nothing here has been `npm install`ed or deployed yet; it's file
structure, schema, and working logic ready to run.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`, then optionally
   `supabase/seed.sql` for one example restaurant/character/rewards row.
3. Deploy the two edge functions (used for QR token signing):
   ```
   supabase functions deploy mint-checkin-token
   supabase functions deploy resolve-checkin-token
   supabase secrets set CHECKIN_TOKEN_SECRET=$(openssl rand -hex 32)
   ```
4. Grab your project URL and anon key from Project Settings > API.

## 2. Run the mobile app

```
cd foodiemon
npm install
```

Add your Supabase credentials to `app.json` under `expo.extra`
(`supabaseUrl`, `supabaseAnonKey`), or create a `.env` with:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Then:

```
npx expo start --android
```

(iOS via Expo Go works too for dev; native builds come later via EAS.)

## 3. Run the staff portal

```
cd staff-portal
npm install
```

Create `staff-portal/.env`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then:

```
npm run dev
```

Staff accounts don't self-signup — create rows in `auth.users` (Supabase
dashboard, or the admin dashboard once built) plus a matching row in
`public.staff` with the right `restaurant_id`.

## What's actually built vs. stubbed

**Fully wired (reads real data, calls real RPCs once Supabase is live):**
- Collection (Foodlingdex) grid, Character detail (About/Rewards tabs),
  Restaurant directory, Leaderboard, Onboarding sign-up/login
- Staff portal: login, QR scan, check-in confirm, calls `process_checkin()`
- `process_checkin()` — xp/points math, 4h rate limit, evolution detection,
  all server-side and RLS-safe

**Stubbed / needs finishing:**
- QR token minting/resolving edge functions are written but untested —
  deploy and confirm the HMAC round-trip before relying on them
- Friends flow (`friendships` table exists, no UI yet — leaderboard
  currently shows everyone, not just friends)
- Admin dashboard for adding restaurants/characters/rewards (not started —
  lowest risk to build directly per the brief, no design needed)
- Character art: `art_url_stage*` fields expect Supabase Storage URLs;
  nothing uploads them yet
- Push notifications for evolution moments (not in brief, worth considering
  later)

## Not covered here (brief's parallel track)

Partner agreements, privacy policy/ToS, Play Store developer account setup —
business/legal work, not code.
