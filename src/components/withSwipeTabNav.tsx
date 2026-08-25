import { useMemo, ComponentType } from "react";
import { View, PanResponder } from "react-native";
import { useNavigation } from "@react-navigation/native";

// Bottom tabs aren't swipeable by default (that's a top-tabs pattern) — this
// adds it via PanResponder rather than pulling in react-native-gesture-handler
// (not an existing dependency, and would mean a bigger native-module change
// for what's otherwise a pure-JS gesture). Home is deliberately left out of
// TAB_ORDER — its own deal carousel already owns horizontal swipe, and
// layering a tab-switch gesture on top of that would fight it.
const TAB_ORDER = ["Collection", "Directory", "Scan to Earn", "Leaderboard", "Profile"];

// Linear, not cyclic — swiping past either end (e.g. right from Collection,
// which would land on the excluded Home) just does nothing rather than
// wrapping around, so Home stays reachable only by tapping its own tab.
export function withSwipeTabNav<P extends object>(Component: ComponentType<P>, tabName: string) {
  return function SwipeTabScreen(props: P) {
    const navigation = useNavigation<any>();
    const index = TAB_ORDER.indexOf(tabName);

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          // Capture only once the gesture is decisively horizontal — lets
          // each screen's own vertical scrolling (FlatList/ScrollView) pass
          // through untouched for the far more common up/down drag.
          onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
            Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
          onPanResponderRelease: (_evt, gesture) => {
            if (gesture.dx < -50 && index < TAB_ORDER.length - 1) {
              navigation.navigate(TAB_ORDER[index + 1]);
            } else if (gesture.dx > 50 && index > 0) {
              navigation.navigate(TAB_ORDER[index - 1]);
            }
          },
        }),
      [index, navigation]
    );

    return (
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <Component {...props} />
      </View>
    );
  };
}
