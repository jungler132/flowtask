import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { fetchChats } from '../api/chatsApi';
import { fetchTasksPage } from '../api/tasksApi';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import {
  applyLocalReadToChats,
  hydrateLocalReadChats,
  unreadCountNumber,
} from '../lib/chatUnread';
import { TAB_BAR_FLOAT_BOTTOM_DP } from '../lib/screenInsets';
import {
  AuthStackParamList,
  ChatsStackParamList,
  MainTabParamList,
  ProfileStackParamList,
  TasksStackParamList,
} from './types';
import LoginScreen from '../screens/auth/LoginScreen';
import VerifyScreen from '../screens/auth/VerifyScreen';
import TasksHomeScreen from '../screens/tasks/TasksHomeScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import TaskCommentsScreen from '../screens/tasks/TaskCommentsScreen';
import TaskSubtasksScreen from '../screens/tasks/TaskSubtasksScreen';
import TaskActivityScreen from '../screens/tasks/TaskActivityScreen';
import TaskAssignScreen from '../screens/tasks/TaskAssignScreen';
import TaskTransferScreen from '../screens/tasks/TaskTransferScreen';
import TaskPasswordResetScreen from '../screens/tasks/TaskPasswordResetScreen';
import ChatsListScreen from '../screens/chats/ChatsListScreen';
import ChatRoomScreen from '../screens/chats/ChatRoomScreen';
import ChatCreateScreen from '../screens/chats/ChatCreateScreen';
import ChatFromTaskScreen from '../screens/chats/ChatFromTaskScreen';
import ChatSearchScreen from '../screens/chats/ChatSearchScreen';
import ChatManageScreen from '../screens/chats/ChatManageScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NewsScreen from '../screens/NewsScreen';
import { PushNotificationRoot } from '../components/PushNotificationRoot';
import { rootNavigationRef } from './rootNavigationRef';

const tabIconNames = {
  Chats: 'chatbubbles-outline',
  Tasks: 'checkbox-outline',
  News: 'newspaper-outline',
  Profile: 'person-circle-outline',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

/** Подпись вкладки: до 2 строк, поджим шрифта — чтобы на узких экранах не резало текст. */
function BottomTabBarLabel({
  color,
  text,
  maxWidth,
  fontSize,
}: {
  color: string;
  text: string;
  maxWidth: number;
  fontSize: number;
}) {
  return (
    <Text
      numberOfLines={2}
      ellipsizeMode="tail"
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      style={{
        color,
        fontSize,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: Math.round(fontSize * 1.2),
        maxWidth,
        alignSelf: 'center',
      }}
    >
      {text}
    </Text>
  );
}

const RootStack = createStackNavigator();
const AuthStack = createStackNavigator<AuthStackParamList>();
const TasksStack = createStackNavigator<TasksStackParamList>();
const ChatsStack = createStackNavigator<ChatsStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function useStackScreenOptions() {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerStyle: {
        backgroundColor: colors.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        elevation: 0,
        shadowOpacity: 0,
      },
      headerTintColor: colors.text,
      headerTitleStyle: {
        fontWeight: '700' as const,
        fontSize: 18,
        letterSpacing: 0,
        color: colors.text,
      },
      cardStyle: { backgroundColor: colors.bg },
    }),
    [colors],
  );
}

function TasksNavigator() {
  const stackScreenOptions = useStackScreenOptions();
  return (
    <TasksStack.Navigator
      detachInactiveScreens={false}
      screenOptions={stackScreenOptions}
    >
      <TasksStack.Screen name="TasksHome" component={TasksHomeScreen} options={{ title: 'Задачи' }} />
      <TasksStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Задача' }} />
      <TasksStack.Screen name="TaskForm" component={TaskFormScreen} />
      <TasksStack.Screen name="TaskComments" component={TaskCommentsScreen} options={{ title: 'Комментарии' }} />
      <TasksStack.Screen name="TaskSubtasks" component={TaskSubtasksScreen} options={{ title: 'Подзадачи' }} />
      <TasksStack.Screen name="TaskActivity" component={TaskActivityScreen} options={{ title: 'Активность' }} />
      <TasksStack.Screen name="TaskAssign" component={TaskAssignScreen} options={{ title: 'Исполнители' }} />
      <TasksStack.Screen name="TaskTransfer" component={TaskTransferScreen} options={{ title: 'Передать' }} />
    </TasksStack.Navigator>
  );
}

function ProfileNavigator() {
  const stackScreenOptions = useStackScreenOptions();
  return (
    <ProfileStack.Navigator detachInactiveScreens={false} screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Профиль' }} />
      <ProfileStack.Screen
        name="TaskPasswordReset"
        component={TaskPasswordResetScreen}
        options={{ title: 'Пароль от почты' }}
      />
    </ProfileStack.Navigator>
  );
}

function ChatsNavigator() {
  const stackScreenOptions = useStackScreenOptions();
  return (
    <ChatsStack.Navigator
      detachInactiveScreens={false}
      screenOptions={stackScreenOptions}
    >
      <ChatsStack.Screen name="ChatsHome" component={ChatsListScreen} options={{ title: 'Чаты' }} />
      <ChatsStack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ title: 'Чат' }} />
      <ChatsStack.Screen name="ChatCreate" component={ChatCreateScreen} options={{ title: 'Новый чат' }} />
      <ChatsStack.Screen name="ChatFromTask" component={ChatFromTaskScreen} options={{ title: 'Чат по задаче' }} />
      <ChatsStack.Screen name="ChatSearch" component={ChatSearchScreen} options={{ title: 'Поиск чатов' }} />
      <ChatsStack.Screen name="ChatManage" component={ChatManageScreen} options={{ title: 'Настройки чата' }} />
    </ChatsStack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const tabBarMetrics = useMemo(() => {
    const tabCount = 4;
    const slot = windowWidth / tabCount;
    const labelMaxWidth = Math.max(48, Math.floor(slot) - 10);
    const fontSize =
      slot < 72 ? 9 : slot < 80 ? 10 : slot < 92 ? 11 : slot < 108 ? 12 : 13;
    const iconSize =
      slot < 72 ? 20 : slot < 80 ? 22 : slot < 92 ? 24 : slot < 108 ? 26 : 28;
    const tabBarMinHeight = slot < 88 ? 56 : 52;
    return { labelMaxWidth, fontSize, iconSize, tabBarMinHeight };
  }, [windowWidth]);

  const [chatBadge, setChatBadge] = useState<number>(0);
  const [taskBadge, setTaskBadge] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function refreshBadges() {
      try {
        await hydrateLocalReadChats();
        const chatRes = await fetchChats({ page_size: 100 });
        const normalizedChats = applyLocalReadToChats(chatRes.results ?? []);
        const unreadChats = normalizedChats.reduce(
          (sum, chat) => sum + unreadCountNumber(chat.unread_count),
          0
        );
        if (mounted) setChatBadge(unreadChats);
      } catch {
        if (mounted) setChatBadge(0);
      }

      try {
        const taskRes = await fetchTasksPage({ page: 1, page_size: 1, status: 'new' });
        const count = Number(taskRes.count ?? 0);
        if (mounted) setTaskBadge(Number.isFinite(count) ? Math.max(0, count) : 0);
      } catch {
        if (mounted) setTaskBadge(0);
      }
    }

    refreshBadges().catch(() => {});
    const timer = setInterval(() => {
      refreshBadges().catch(() => {});
    }, 8000);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBadges().catch(() => {});
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      appSub.remove();
    };
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="Chats"
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: true,
        tabBarItemStyle: {
          flex: 1,
          minWidth: 0,
          paddingHorizontal: 2,
        },
        tabBarLabel: ({ color, children }) => (
          <BottomTabBarLabel
            color={color}
            text={typeof children === 'string' ? children : String(children ?? '')}
            maxWidth={tabBarMetrics.labelMaxWidth}
            fontSize={tabBarMetrics.fontSize}
          />
        ),
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          minHeight: tabBarMetrics.tabBarMinHeight,
          marginBottom: TAB_BAR_FLOAT_BOTTOM_DP,
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarIcon: ({ color }) => {
          const name =
            tabIconNames[route.name as keyof typeof tabIconNames] ?? 'ellipse-outline';
          return <Ionicons name={name} size={tabBarMetrics.iconSize} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsNavigator}
        options={{
          title: 'Чаты',
          tabBarBadge: chatBadge > 0 ? (chatBadge > 99 ? '99+' : chatBadge) : undefined,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Chats', { screen: 'ChatsHome' });
          },
        })}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksNavigator}
        options={{
          title: 'Задачи',
          tabBarBadge: taskBadge > 0 ? (taskBadge > 99 ? '99+' : taskBadge) : undefined,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Tasks', { screen: 'TasksHome' });
          },
        })}
      />
      <Tab.Screen name="News" component={NewsScreen} options={{ title: 'Новости' }} />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ title: 'Профиль' }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Profile', { screen: 'ProfileMain' });
          },
        })}
      />
    </Tab.Navigator>
  );
}

function AuthNavigator() {
  const stackScreenOptions = useStackScreenOptions();
  return (
    <AuthStack.Navigator detachInactiveScreens={false} screenOptions={stackScreenOptions}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="Verify" component={VerifyScreen} options={{ title: 'Код из письма' }} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { colors } = useTheme();
  const { user, loading, ready } = useAuth();

  if (!ready || loading) {
    return (
      <View style={[splashStyles.splash, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <RootStack.Navigator detachInactiveScreens={false} screenOptions={{ headerShown: false }}>
      {user ? (
        <RootStack.Screen name="Main" component={MainTabs} />
      ) : (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}

const splashStyles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function AppNavigation() {
  const { colors, isDark } = useTheme();
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [colors, isDark]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer ref={rootNavigationRef} theme={navTheme}>
        <RootNavigator />
        <PushNotificationRoot />
      </NavigationContainer>
    </>
  );
}

export default function AppNavigator() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppNavigation />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
