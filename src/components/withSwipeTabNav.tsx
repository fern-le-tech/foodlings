import { ComponentType } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";

// Bottom tabs aren't swipeable by default (that's a top-tabs pattern) — this
// adds it via react-native-gesture-handler, which recognizes the gesture on
// the native UI thread instead of the JS thread (unlike the PanResponder
// version this replaced, which felt laggy competing with each screen's own
// FlatList/ScrollView for JS thread time). Home is deliberately left out of
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

    const goTo = (targetIndex: number) => {
      if (targetIndex >= 0 && targetIndex < TAB_ORDER.length) {
        navigation.navigate(TAB_ORDER[targetIndex]);
      }
    };

    const pan = Gesture.Pan()
      // Only steals the gesture once it's decisively horizontal — lets each
      // screen's own vertical scrolling pass through untouched for the far
      // more common up/down drag.
      .activeOffsetX([-20, 20])
      .failOffsetY([-15, 15])
      .onEnd((e) => {
        if (e.translationX < -50) goTo(index + 1);
        else if (e.translationX > 50) goTo(index - 1);
      });

    return (
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }}>
          <Component {...props} />
        </View>
      </GestureDetector>
    );
  };
}
