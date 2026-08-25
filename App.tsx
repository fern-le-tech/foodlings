// Must be the first import in the entry file — react-native-gesture-handler
// installs its native event handling at module load time.
import "react-native-gesture-handler";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { RootNavigator } from "@/navigation/RootNavigator";
import AnimatedSplash from "@/components/AnimatedSplash";
import { prefetchCoreData } from "@/lib/prefetchCache";

SplashScreen.preventAutoHideAsync();

// Module scope, not inside the component — this should fire exactly once
// per app launch, not get re-triggered by a re-render.
const coreDataReady = prefetchCoreData();

export default function App() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  const onLayoutRootView = useCallback(async () => {
    // Native splash hides as soon as our custom splash is mounted on top,
    // so there's no gap/flash between the two.
    await SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <RootNavigator />
          {showCustomSplash && (
            <AnimatedSplash ready={coreDataReady} onFinish={() => setShowCustomSplash(false)} />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}