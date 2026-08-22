// Hand-written types matching the LIVE Supabase schema (confirmed via
// `npx supabase gen types typescript --linked` on 2026-08-21 — supabase/schema.sql
// lags behind, see its header comment). Once the project is linked and you want
// full fidelity (RLS-aware helper types, exact literal unions, etc.), replace this
// file with the generated output directly:
//   npx supabase gen types typescript --linked > src/types/database.ts
// and re-add the named aliases below on top of it, since screens import them.
//
// NOTE: every Row/Args type below is declared with `type`, not `interface`.
// TypeScript's structural `extends` check against an index-signature type
// (Record<string, unknown>, which supabase-js's GenericTable/GenericFunction
// require) does not match `interface` declarations, even when the shape is
// identical — supabase-js's Database generic then silently falls back to an
// unconstrained schema and every query resolves to `never`. Keep these as
// `type` aliases.

export type PartnerStatus = "active" | "paused" | "onboarding" | "churned";
export type FriendshipStatus = "pending" | "accepted" | "blocked";

export type User = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  home_city: string | null;
  instagram_handle: string | null;
  created_at: string;
};

export type Restaurant = {
  id: string;
  name: string;
  neighborhood: string | null;
  city: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine_type: string | null;
  signature_dish: string | null;
  partner_status: PartnerStatus;
  created_at: string;
};

export type FoodlingCharacter = {
  id: string;
  restaurant_id: string;
  name_stage1: string;
  name_stage2: string;
  name_stage3: string;
  art_url_stage1: string | null;
  art_url_stage2: string | null;
  art_url_stage3: string | null;
  xp_threshold_stage2: number;
  xp_threshold_stage3: number;
  created_at: string;
};

export type UserRestaurantProgress = {
  id: string;
  user_id: string;
  restaurant_id: string;
  cumulative_spend: number;
  current_xp: number;
  current_stage: 1 | 2 | 3;
  visit_count: number;
  unlocked_at: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  restaurant_id: string;
  staff_id: string;
  amount: number;
  xp_awarded: number;
  points_awarded: number;
  rate_limited: boolean;
  created_at: string;
};

export type RedeemableReward = {
  id: string;
  restaurant_id: string;
  title: string;
  points_cost: number;
  active: boolean;
  created_at: string;
};

// `status`/`fulfilled_at`/`fulfilled_by` back the create_pending_redemption /
// fulfill_redemption RPC flow (points reserved on redeem, spent on staff scan
// confirmation) — live on the DB but not yet captured in supabase/schema.sql.
// `status` is left as `string` rather than a guessed union since only
// "fulfilled" is confirmed by client code (RedeemQRScreen); the live column
// itself is untyped text, not a Postgres enum.
export type Redemption = {
  id: string;
  user_id: string;
  reward_id: string;
  status: string;
  redeemed_at: string;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
};

export type Friendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  created_at: string;
};

export type DailyDeal = {
  id: string;
  restaurant_id: string;
  photo_url: string;
  description: string;
  expires_at: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
};

export type SavedDeal = {
  id: string;
  user_id: string;
  deal_id: string;
  created_at: string;
};

export type Review = {
  id: string;
  user_id: string;
  restaurant_id: string;
  body: string;
  rating: number | null;
  photo_url: string | null;
  xp_awarded: number;
  points_awarded: number;
  created_at: string;
  updated_at: string;
};

export type ProcessCheckinResult = {
  checkin_id: string;
  xp_awarded: number;
  points_awarded: number;
  rate_limited: boolean;
  new_stage: 1 | 2 | 3;
  evolved: boolean;
  new_cumulative_xp: number;
};

export type CreatePendingRedemptionResult = {
  success: boolean;
  message: string;
  redemption_id: string;
  expires_at: string;
};

export type FulfillRedemptionResult = {
  success: boolean;
  message: string;
  reward_title: string;
  points_spent: number;
};

export type AdminStaffWithEmail = {
  id: string;
  display_name: string;
  email: string;
  restaurant_id: string;
  active: boolean;
};

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  collection_size: number;
  total_xp: number;
};

export type RestaurantRatings = {
  restaurant_id: string;
  average_rating: number | null;
  rating_count: number | null;
};

// Minimal Database generic shape so `createClient<Database>` type-checks.
// Expand table-by-table as you wire up real queries, or swap in generated types.
// Supabase's client generics require every Tables/Views entry to satisfy
// GenericTable/GenericView, which include a `Relationships` field — these
// helpers add it so `createClient<Database>` actually applies our row types
// instead of silently falling back to an unconstrained schema.
type TableDef<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type ViewDef<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      users: TableDef<User>;
      restaurants: TableDef<Restaurant>;
      foodling_characters: TableDef<FoodlingCharacter>;
      user_restaurant_progress: TableDef<UserRestaurantProgress>;
      checkins: TableDef<Checkin>;
      redeemable_rewards: TableDef<RedeemableReward>;
      redemptions: TableDef<Redemption>;
      friendships: TableDef<Friendship>;
      daily_deals: TableDef<DailyDeal>;
      saved_deals: TableDef<SavedDeal>;
      reviews: TableDef<Review>;
    };
    Views: {
      leaderboard: ViewDef<LeaderboardRow>;
      restaurant_ratings: ViewDef<RestaurantRatings>;
      user_restaurant_points: ViewDef<{ user_id: string; restaurant_id: string; points_balance: number | null }>;
    };
    Functions: {
      process_checkin: {
        Args: {
          p_user_id: string;
          p_restaurant_id: string;
          p_staff_id: string;
          p_amount: number;
        };
        Returns: ProcessCheckinResult[];
      };
      accept_friend_invite: {
        Args: { p_inviter_id: string };
        Returns: void;
      };
      friends_leaderboard: {
        Args: Record<PropertyKey, never>;
        Returns: LeaderboardRow[];
      };
      create_pending_redemption: {
        Args: { p_reward_id: string };
        Returns: CreatePendingRedemptionResult[];
      };
      fulfill_redemption: {
        Args: { p_redemption_id: string; p_restaurant_id: string; p_staff_id: string };
        Returns: FulfillRedemptionResult[];
      };
      admin_list_staff_with_email: {
        Args: Record<PropertyKey, never>;
        Returns: AdminStaffWithEmail[];
      };
    };
  };
};
