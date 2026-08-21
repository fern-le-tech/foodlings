// Hand-written types matching supabase/schema.sql.
// Once the project is linked, replace this with generated types via:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type PartnerStatus = "active" | "paused" | "onboarding" | "churned";
export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
  home_city: string | null;
  instagram_handle: string | null;
  created_at: string;
}

export interface Restaurant {
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
}

export interface FoodlingCharacter {
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
}

export interface UserRestaurantProgress {
  id: string;
  user_id: string;
  restaurant_id: string;
  cumulative_spend: number;
  current_xp: number;
  current_stage: 1 | 2 | 3;
  visit_count: number;
  unlocked_at: string;
}

export interface Checkin {
  id: string;
  user_id: string;
  restaurant_id: string;
  staff_id: string;
  amount: number;
  xp_awarded: number;
  points_awarded: number;
  rate_limited: boolean;
  created_at: string;
}

export interface RedeemableReward {
  id: string;
  restaurant_id: string;
  title: string;
  points_cost: number;
  active: boolean;
  created_at: string;
}

export interface Redemption {
  id: string;
  user_id: string;
  reward_id: string;
  redeemed_at: string;
}

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface ProcessCheckinResult {
  checkin_id: string;
  xp_awarded: number;
  points_awarded: number;
  rate_limited: boolean;
  new_stage: 1 | 2 | 3;
  evolved: boolean;
  new_cumulative_xp: number;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  collection_size: number;
  total_xp: number;
}

// Minimal Database generic shape so `createClient<Database>` type-checks.
// Expand table-by-table as you wire up real queries, or swap in generated types.
export interface Database {
  public: {
    Tables: {
      users: { Row: User; Insert: Partial<User>; Update: Partial<User> };
      restaurants: { Row: Restaurant; Insert: Partial<Restaurant>; Update: Partial<Restaurant> };
      foodling_characters: {
        Row: FoodlingCharacter;
        Insert: Partial<FoodlingCharacter>;
        Update: Partial<FoodlingCharacter>;
      };
      user_restaurant_progress: {
        Row: UserRestaurantProgress;
        Insert: Partial<UserRestaurantProgress>;
        Update: Partial<UserRestaurantProgress>;
      };
      checkins: { Row: Checkin; Insert: Partial<Checkin>; Update: Partial<Checkin> };
      redeemable_rewards: {
        Row: RedeemableReward;
        Insert: Partial<RedeemableReward>;
        Update: Partial<RedeemableReward>;
      };
      redemptions: { Row: Redemption; Insert: Partial<Redemption>; Update: Partial<Redemption> };
      friendships: { Row: Friendship; Insert: Partial<Friendship>; Update: Partial<Friendship> };
    };
    Views: {
      leaderboard: { Row: LeaderboardRow };
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
    };
  };
}
