import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Verify: { email: string; hint?: string };
};

export type TasksStackParamList = {
  TasksHome: undefined;
  TaskDetail: { taskId: string; taskTitle?: string };
  TaskForm: { taskId?: string };
  TaskComments: { taskId: string };
  TaskSubtasks: { taskId: string };
  TaskActivity: { taskId: string };
  TaskAssign: { taskId: string };
  TaskTransfer: { taskId: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  TaskPasswordReset: undefined;
};

export type ChatsStackParamList = {
  ChatsHome: undefined;
  ChatRoom: { chatId: string; title?: string };
  ChatCreate: undefined;
  ChatFromTask: undefined;
  ChatSearch: undefined;
  ChatManage: { chatId: string; title?: string };
};

export type MainTabParamList = {
  Tasks: NavigatorScreenParams<TasksStackParamList> | undefined;
  Chats: NavigatorScreenParams<ChatsStackParamList> | undefined;
  News: undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

/** Корневой стек: табы или авторизация. */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};
