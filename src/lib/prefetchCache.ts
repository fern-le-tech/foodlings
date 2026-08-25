import { supabase } from "@/lib/supabase";
import type { Restaurant, FoodlingCharacter } from "@/types/database";

// Restaurants and their Foodling characters are the two datasets both
// Directory and Home's "Restaurants Near You" fetch independently on every
// mount/focus, and neither depends on the logged-in user — a warm module-
// level cache lets both screens paint with real data on first render instead
// of an empty list + spinner while the network round-trip happens. App.tsx
// kicks this off during the splash and waits on it before dismissing;
// screens that consume the cache still refetch afterward (via their
// existing useFocusEffect) so it's a fast first paint, not stale-forever data.
export let restaurantsCache: Restaurant[] | null = null;
export let charactersCache: FoodlingCharacter[] | null = null;

let inFlight: Promise<void> | null = null;

export function prefetchCoreData(): Promise<void> {
  if (restaurantsCache && charactersCache) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = Promise.all([
    supabase.from("restaurants").select("*").eq("partner_status", "active").order("name"),
    supabase.from("foodling_characters").select("*"),
  ])
    .then(([restaurantsResult, charactersResult]) => {
      restaurantsCache = restaurantsResult.data ?? [];
      charactersCache = charactersResult.data ?? [];
    })
    .catch(() => {
      // Leave the cache null on failure — consuming screens already have
      // their own fetch-and-spinner fallback, so a failed prefetch just
      // means no head start rather than a broken app.
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
