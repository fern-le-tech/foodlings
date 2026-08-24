import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { colors, spacing, TAB_BAR_HEIGHT } from "@/theme/colors";

import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { ChooseAvatarScreen } from "@/screens/ChooseAvatarScreen";
import { HowItWorksScreen } from "@/screens/HowItWorksScreen";
import { DailyDealsScreen } from "@/screens/DailyDealsScreen";
import { CollectionScreen } from "@/screens/CollectionScreen";
import { CharacterDetailScreen } from "@/screens/CharacterDetailScreen";
import { CheckInQRScreen } from "@/screens/CheckInQRScreen";
import { CheckInSuccessScreen } from "@/screens/CheckInSuccessScreen";
import { RedeemQRScreen } from "@/screens/RedeemQRScreen";
import { LeaderboardScreen } from "@/screens/LeaderboardScreen";
import { RestaurantDirectoryScreen } from "@/screens/RestaurantDirectoryScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { PublicProfileScreen } from "@/screens/PublicProfileScreen";
import { AcceptFriendRequestScreen } from "@/screens/AcceptFriendRequestScreen";
import { InviteFriendsModal } from "@/components/InviteFriendsModal";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// One icon per tab, picked to feel playful and food/collection themed
// rather than generic — MaterialCommunityIcons ships bundled with Expo
// so no extra install is needed.
const TAB_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Home: "fire",
  Collection: "cards",
  Directory: "map-marker-radius",
  "Scan to Earn": "qrcode-scan",
  Leaderboard: "trophy",
  Profile: "chef-hat",
};

const TAB_BAR_RED = "#D8342B";

// Center title shown in the shared top header, keyed by tab route name —
// keeps every screen's own page-title text out of the body since it's now
// rendered once here instead of duplicated per-screen.
const TAB_TITLES: Record<string, string> = {
  Home: "HOME",
  Collection: "COLLECTION",
  Directory: "DIRECTORY",
  "Scan to Earn": "SCAN TO EARN",
  Leaderboard: "LEADERBOARD",
  Profile: "PROFILE",
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: TAB_BAR_RED,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
        // Deliberately NOT position:"absolute" — that floats the bar over
        // scrollable content, so list items visibly slide past/behind it
        // mid-scroll. Docking it (normal flow) makes React Navigation
        // reserve its full footprint as real screen space instead, so
        // nothing ever renders behind it, not even while actively
        // scrolling. Full-width now instead of an inset rounded pill —
        // the pill made sense when the bar hovered over content; docked,
        // it just left a bare strip of background showing around it.
        tabBarStyle: {
          // Height covers all the way down into the safe-area inset
          // (gesture bar / 3-button nav) so the background has no gap
          // below it; paddingBottom pushes the icons up above that inset
          // instead of shrinking the bar to stop short of it.
          height: TAB_BAR_HEIGHT + insets.bottom,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: focused ? TAB_BAR_RED : "transparent",
            }}
          >
            <MaterialCommunityIcons
              name={TAB_ICONS[route.name]}
              size={focused ? size + 2 : size}
              color={focused ? "#FFFFFF" : color}
            />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={DailyDealsScreen} />
      <Tab.Screen name="Collection" component={CollectionScreen} />
      <Tab.Screen name="Directory" component={RestaurantDirectoryScreen} />
      <Tab.Screen name="Scan to Earn" component={CheckInQRScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Deep link routing: exp://.../--/invite/<id> in Expo Go during dev,
// foodlings://invite/<id> in a standalone/dev-client build. Either form
// maps to the same "AcceptFriendRequest" screen with inviterId as a param.
const linking = {
  prefixes: [Linking.createURL("/"), "foodlings://"],
  config: {
    screens: {
      AcceptFriendRequest: "invite/:inviterId",
      Main: "",
    },
  },
};

export function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Set true only by a fresh sign-up (see OnboardingScreen's onSignUpSuccess),
  // never by a plain sign-in — so returning users skip straight to the app.
  const [awaitingAvatarChoice, setAwaitingAvatarChoice] = useState(false);
  // Shown once, right after avatar choice, only for brand-new sign-ups —
  // same reasoning as awaitingAvatarChoice above.
  const [awaitingWalkthrough, setAwaitingWalkthrough] = useState(false);

  // MaterialCommunityIcons needs its font file explicitly loaded before it
  // will render glyphs — without this, tab icons silently render as blank
  // space (no error, no fallback box) rather than the icon.
  const [iconFontLoaded] = useFonts({
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready || !iconFontLoaded) return null; // could swap in a splash/loading component

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session && awaitingAvatarChoice ? (
          <Stack.Screen name="ChooseAvatar" options={{ gestureEnabled: false }}>
            {() => (
              <ChooseAvatarScreen
                onDone={() => {
                  setAwaitingAvatarChoice(false);
                  setAwaitingWalkthrough(true);
                }}
              />
            )}
          </Stack.Screen>
        ) : session && awaitingWalkthrough ? (
          <Stack.Screen name="HowItWorks" options={{ gestureEnabled: false }}>
            {() => <HowItWorksScreen onDone={() => setAwaitingWalkthrough(false)} />}
          </Stack.Screen>
        ) : session ? (
          <>
            <Stack.Screen
              name="Main"
              options={({ route }) => {
                const focusedTab = getFocusedRouteNameFromRoute(route) ?? "Home";
                return {
                  headerShown: true,
                  headerTitleAlign: "center",
                  headerStyle: { backgroundColor: colors.surface },
                  headerShadowVisible: false,
                  headerLeft: () => <Text style={headerStyles.brand}>Foodlings</Text>,
                  headerLeftContainerStyle: { paddingLeft: spacing.md },
                  headerTitle: () => (
                    <Text style={headerStyles.pageTitle}>{TAB_TITLES[focusedTab] ?? ""}</Text>
                  ),
                  // Invite is a growth/social action — only Home needs it in the
                  // header; every other tab would just be repeating chrome.
                  headerRight: () =>
                    focusedTab === "Home" ? <InviteHeaderButton userId={session.user.id} /> : null,
                  headerRightContainerStyle: { paddingRight: spacing.md },
                };
              }}
            >
              {() => <MainTabsHeaderHost userId={session.user.id} />}
            </Stack.Screen>
            <Stack.Screen
              name="CharacterDetail"
              component={CharacterDetailScreen}
              options={{
                headerShown: true,
                title: "",
                headerTitleAlign: "center",
                headerTitleStyle: { fontWeight: "800", color: "#000000" },
                headerStyle: { backgroundColor: colors.surface },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="PublicProfile"
              component={PublicProfileScreen}
              options={{ headerShown: true, title: "" }}
            />
            <Stack.Screen
              name="CheckInSuccess"
              component={CheckInSuccessScreen}
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="RedeemQR"
              component={RedeemQRScreen}
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="AcceptFriendRequest"
              component={AcceptFriendRequestScreen}
              options={{ headerShown: true, title: "Friend Request", presentation: "modal" }}
            />
          </>
        ) : (
          <Stack.Screen name="Onboarding" options={{}}>
            {() => <OnboardingScreen onSignUpSuccess={() => setAwaitingAvatarChoice(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// A tiny global registry lets the stack-level headerRight button (which has
// no direct access to MainTabsHeaderHost's local state) trigger the
// modal that actually lives inside MainTabsHeaderHost. This avoids lifting
// modal state all the way up to RootNavigator just for one button.
let openInviteModalRef: (() => void) | null = null;

const headerStyles = StyleSheet.create({
  brand: {
    fontSize: 22,
    fontWeight: "900",
    color: TAB_BAR_RED,
    letterSpacing: 0.2,
  },
  pageTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#000000",
  },
});

function InviteHeaderButton({ userId }: { userId: string }) {
  return (
    <Pressable
      onPress={() => openInviteModalRef?.()}
      hitSlop={12}
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="account-plus" size={24} color={colors.tabActive} />
    </Pressable>
  );
}

function MainTabsHeaderHost({ userId }: { userId: string }) {
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  useEffect(() => {
    openInviteModalRef = () => setInviteModalVisible(true);
    return () => {
      openInviteModalRef = null;
    };
  }, []);

  return (
    <>
      <MainTabs />
      <InviteFriendsModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        userId={userId}
        displayName={null}
      />
    </>
  );
}
