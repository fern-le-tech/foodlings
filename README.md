# Foodlings

Three pieces:

- **`/`** — the customer-facing Expo (React Native) app
- **`staff-portal/`** — the web app staff/admins use to check people in, manage
  rewards/deals, tune evolution, and add restaurants
- **`supabase/`** — the Postgres schema, RLS policies, and edge functions

This is well past scaffold stage — see "What's actually built" below. Nothing
here has been `npm install`ed for you, but `supabase/schema.sql` +
`supabase/migrations/` now fully reproduce the live project (verified
2026-08-21 by querying the live schema directly — table DDL, RLS policies,
triggers, and RPC bodies, not reconstructed from client code). That pass
also caught `apply_review_bonus()` still referencing the pre-rebrand
`foodiemon_characters` table name (silently breaking every review insert
live) — fixed both in the migration and on the live project.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`, then every file in
   `supabase/migrations/` **in filename order** (or `supabase link` +
   `supabase db push` if you have the CLI). Optionally run
   `supabase/seed.sql` after for one example restaurant/character/rewards
   row.
3. Deploy the edge functions (used for QR check-in token signing):
   ```
   supabase functions deploy mint-checkin-token
   supabase functions deploy resolve-checkin-token
   supabase secrets set CHECKIN_TOKEN_SECRET=$(openssl rand -hex 32)
   ```
   (`migrate-character-art` and `rewrite-deal-ad` are optional utilities —
   see "Stubbed" below.)
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

Type-check with `npm run typecheck` — should be clean.

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
dashboard) plus a matching row in `public.staff` with the right
`restaurant_id`. Admin access (the "Add New Partner"/"Manage
Existing"/"Staff" tabs) is gated by email address — add the account's email
to `ADMIN_EMAILS` in `staff-portal/src/App.jsx`.

## What's actually built

**Mobile app — fully wired:**
- Onboarding sign-up/login, avatar picker, first-run "how it works" walkthrough
- **Home** — Daily Deals: browse and save restaurants' time-limited deals
- **Collection** — the Foodlingdex grid
- **Character Detail** — About (address/signature dish/today's deal), Rewards
  (redeem points for a reward, get a QR code, see it confirmed live the
  instant staff scans it), Reviews (rate + review with an optional photo,
  earns XP/points)
- **Directory** — restaurant list with unlock progress
- **Leaderboard** — scoped to accepted friends only, via `friends_leaderboard`;
  invites work as deep links (`foodlings://invite/:inviterId`) handled by
  `AcceptFriendRequestScreen`
- **Profile** / **Public Profile** — lifetime stats, favorite Foodling,
  optional Instagram link
- Check-in QR display + success celebration, backed by the
  `mint-checkin-token` / `resolve-checkin-token` edge functions — confirmed
  2026-08-22 with a real signed token through both deployed functions
  end-to-end (they're already deployed on the live project with
  `CHECKIN_TOKEN_SECRET` set; the "unverified" note that used to be here was
  stale). `CheckInQRScreen` listens for its own new `checkins` row
  (realtime, same pattern as `RedeemQRScreen`) and navigates to
  `CheckInSuccessScreen` the instant staff confirm — `checkins` needed
  adding to the `supabase_realtime` publication first, done in
  `20260822000000_enable_checkins_realtime.sql`.

**Staff portal — fully wired:**
- Login; check-in confirm scans the QR, resolves it via
  `resolve-checkin-token`, then calls `process_checkin()` (xp/points math,
  4h rate limit, evolution detection — all server-side and RLS-safe)
- **Rewards manager** — CRUD a restaurant's rewards, plus scan a customer's
  redemption QR and confirm it (`fulfill_redemption`)
- **Daily Deals manager** — post/edit/expire deals with a photo upload
- **Evolution settings** — tune each restaurant's stage-2/stage-3 XP
  thresholds
- **Admin dashboard** (email-gated) — add a new restaurant + its Foodling
  character together, manage existing partners, manage staff

## Stubbed / needs finishing

- `rewrite-deal-ad` edge function is only the generated scaffold boilerplate
  (`"Hello from Functions!"`) — no real logic yet
- Character art is still a pasted-in URL on the admin "Add New Partner" form
  (no upload picker). `migrate-character-art` exists as a one-off tool to
  copy externally-hosted art into Supabase Storage, but nothing prompts
  staff to use it
- Push notifications for evolution moments — not started

## Not covered here (brief's parallel track)

Partner agreements, Play Store developer account setup, Google Play's
closed-testing requirement (12 testers opted in for 14+ days before
production access) — business/legal work, not code.

A **draft** privacy policy exists at `legal/PRIVACY_POLICY.md` — written
from what the app's schema actually collects, but it has placeholder
business details and needs real review (ideally legal) before submission,
especially once payment/revenue-share features go live. `eas.json` is set
up for EAS Build; running an actual build still needs `eas login` +
`eas init` with your own Expo account.
