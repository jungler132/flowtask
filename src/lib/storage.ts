import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const K = { access: 'flowtask_access', refresh: 'flowtask_refresh' };

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') await AsyncStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(access: string, refresh?: string | null) {
  await setItem(K.access, access);
  if (refresh) await setItem(K.refresh, refresh);
  else await deleteItem(K.refresh);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(K.access);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(K.refresh);
}

export async function clearTokens() {
  await deleteItem(K.access);
  await deleteItem(K.refresh);
}
