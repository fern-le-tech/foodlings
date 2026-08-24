// The tab bar docks (reserves its own screen space) rather than floating
// over content — see RootNavigator's tabBarStyle — so React Navigation
// already keeps scrollable content from rendering behind it, even mid-
// scroll. This is just a little breathing room past the last item, not a
// tab-bar-avoidance calculation anymore.
export function useTabBarClearance(): number {
  return 32;
}
