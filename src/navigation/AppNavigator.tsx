import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { fetchChats } from '../api/chatsApi';
import { fetchTasksPage } from '../api/tasksApi';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { applyLocalReadToChats, hydrateLocalReadChats } from '../lib/chatUnread';
import { colors } from '../theme';
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

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

const tabIconNames = {
  Chats: 'chatbubbles-outline',
  Tasks: 'checkbox-outline',
  News: 'newspaper-outline',
  Profile: 'person-circle-outline',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '600' as const, fontSize: 17 },
  cardStyle: { backgroundColor: colors.bg },
};

const RootStack = createStackNavigator();
const AuthStack = createStackNavigator<AuthStackParamList>();
const TasksStack = createStackNavigator<TasksStackParamList>();
const ChatsStack = createStackNavigator<ChatsStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TasksNavigator() {
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
  const [chatBadge, setChatBadge] = useState<number>(0);
  const [taskBadge, setTaskBadge] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function refreshBadges() {
      try {
        await hydrateLocalReadChats();
        const chatRes = await fetchChats({ page_size: 100 });
        const normalizedChats = applyLocalReadToChats(chatRes.results ?? []);
        const unreadChats = normalizedChats.reduce((sum, chat) => {
          const n = Number(chat.unread_count ?? 0);
          return Number.isFinite(n) ? sum + Math.max(0, n) : sum;
        }, 0);
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
    }, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
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
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        /**
         * Не задавать height/paddingBottom: они перебивают расчёт React Navigation
         * и нижний system inset (жестовая полоска / кнопки Android).
         */
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ color, size }) => {
          const name =
            tabIconNames[route.name as keyof typeof tabIconNames] ?? 'ellipse-outline';
          return <Ionicons name={name} size={size ?? 26} color={color} />;
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
  return (
    <AuthStack.Navigator detachInactiveScreens={false} screenOptions={stackScreenOptions}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="Verify" component={VerifyScreen} options={{ title: 'Код из письма' }} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading, ready } = useAuth();

  if (!ready || loading) {
    return (
      <View style={styles.splash}>
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

export default function AppNavigator() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" backgroundColor={colors.bg} />
          <NavigationContainer ref={rootNavigationRef} theme={navTheme}>
            <RootNavigator />
            <PushNotificationRoot />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
