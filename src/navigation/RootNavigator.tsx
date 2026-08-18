import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

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
  "Check In": "qrcode-scan",
  Leaderboard: "trophy",
  Profile: "chef-hat",
};

const TAB_BAR_RED = "#D8342B";

function MainTabs() {
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
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          height: 68,
          borderRadius: 28,
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          paddingTop: 8,
          paddingBottom: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 10,
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
      <Tab.Screen name="Check In" component={CheckInQRScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Deep link routing: exp://.../--/invite/<id> in Expo Go during dev,
// foodiemon://invite/<id> in a standalone/dev-client build. Either form
// maps to the same "AcceptFriendRequest" screen with inviterId as a param.
const linking = {
  prefixes: [Linking.createURL("/"), "foodiemon://"],
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
              options={{
                headerShown: true,
                title: "FoodieMon",
                headerRight: () => <InviteHeaderButton userId={session.user.id} />,
              }}
            >
              {() => <MainTabsHeaderHost userId={session.user.id} />}
            </Stack.Screen>
            <Stack.Screen
              name="CharacterDetail"
              component={CharacterDetailScreen}
              options={{ headerShown: true, title: "" }}
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
