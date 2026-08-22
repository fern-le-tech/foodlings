# Foodlings

Three pieces:

- **`/`** — the customer-facing Expo (React Native) app
- **`staff-portal/`** — the web app staff/admins use to check people in, manage
  rewards/deals, tune evolution, and add restaurants
- **`supabase/`** — the Postgres schema, RLS policies, and edge functions

This is well past scaffold stage — see "What's actually built" below. Nothing
here has been `npm install`ed for you, and `supabase/schema.sql` +
`supabase/migrations/` don't fully reproduce the live project (see the
schema note in step 1) — but the app itself is real, working logic, not a
placeholder.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`, then every file in
   `supabase/migrations/` **in filename order** (or `supabase link` +
   `supabase db push` if you have the CLI). Optionally run
   `supabase/seed.sql` after for one example restaurant/character/rewards
   row.
3. **Known gap:** the migrations bring in the `daily_deals`, `saved_deals`,
   and `reviews` tables plus the `redemptions.status`/`fulfilled_at` columns,
   but three RPCs the app calls — `create_pending_redemption`,
   `fulfill_redemption`, `admin_list_staff_with_email` — and whatever
   trigger stamps `reviews.xp_awarded`/`points_awarded` only exist on the
   original live project. They were never captured into a migration (no
   Docker available when this was last reconciled, so `supabase db dump`
   couldn't run). Pull their definitions from that project's dashboard
   (Database → Functions) before a fresh project will support redemptions
   or reviews end-to-end.
4. Deploy the edge functions (used for QR check-in token signing):
   ```
   supabase functions deploy mint-checkin-token
   supabase functions deploy resolve-checkin-token
   supabase secrets set CHECKIN_TOKEN_SECRET=$(openssl rand -hex 32)
   ```
   (`migrate-character-art` and `rewrite-deal-ad` are optional utilities —
   see "Stubbed" below.)
5. Grab your project URL and anon key from Project Settings > API.

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
- Check-in QR display + success screen

**Staff portal — fully wired:**
- Login; check-in confirm calls `process_checkin()` (xp/points math, 4h rate
  limit, evolution detection — all server-side and RLS-safe)
- **Rewards manager** — CRUD a restaurant's rewards, plus scan a customer's
  redemption QR and confirm it (`fulfill_redemption`)
- **Daily Deals manager** — post/edit/expire deals with a photo upload
- **Evolution settings** — tune each restaurant's stage-2/stage-3 XP
  thresholds
- **Admin dashboard** (email-gated) — add a new restaurant + its Foodling
  character together, manage existing partners, manage staff

## Stubbed / needs finishing

- QR check-in token minting/resolving edge functions (`mint-checkin-token`,
  `resolve-checkin-token`) are written but the HMAC round-trip is still
  unverified — deploy and test before relying on them
- `rewrite-deal-ad` edge function is only the generated scaffold boilerplate
  (`"Hello from Functions!"`) — no real logic yet
- Character art is still a pasted-in URL on the admin "Add New Partner" form
  (no upload picker). `migrate-character-art` exists as a one-off tool to
  copy externally-hosted art into Supabase Storage, but nothing prompts
  staff to use it
- Push notifications for evolution moments — not started
- See the schema/migrations gap called out in step 1 above — redemptions
  and reviews won't fully work on a *fresh* Supabase project until those
  RPCs are captured

## Not covered here (brief's parallel track)

Partner agreements, privacy policy/ToS, Play Store developer account setup —
business/legal work, not code.
