import { StackScreenProps } from '@react-navigation/stack';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Chat, searchChats } from '../../api/chatsApi';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { ChatsStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<ChatsStackParamList, 'ChatSearch'>;

function createChatSearchStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    bar: {
      flexDirection: 'row',
      padding: 12,
      borderBottomWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
      marginRight: 8,
    },
    go: {
      justifyContent: 'center',
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 10,
      minHeight: 44,
    },
    goTxt: { color: colors.onPrimary, fontWeight: '700' },
    row: { padding: 16, borderBottomWidth: 1, borderColor: colors.border },
    name: { color: colors.text, fontSize: 16, fontWeight: '600' },
    meta: { color: colors.muted, marginTop: 4 },
    empty: { textAlign: 'center', color: colors.muted, marginTop: 32 },
  });
}

export default function ChatSearchScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { colors } = useTheme();
  const styles = useMemo(() => createChatSearchStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setItems(await searchChats(q.trim()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Запрос q"
          placeholderTextColor={colors.muted}
          onSubmitEditing={run}
        />
        <Pressable style={styles.go} onPress={run} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.goTxt}>Найти</Text>
          )}
        </Pressable>
      </View>
      <FlatList
        data={items}
        contentContainerStyle={{ paddingBottom: tabScrollBottom }}
        keyExtractor={(c, i) => String(c._id ?? '').trim() || `chat-search-${i}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('ChatRoom', {
                chatId: String(item._id ?? ''),
                title: String(item.name ?? ''),
              })
            }
          >
            <Text style={styles.name}>{String(item.name ?? 'Чат')}</Text>
            <Text style={styles.meta}>{String(item.type ?? '')}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{busy ? '' : 'Введите запрос'}</Text>
        }
      />
    </View>
  );
}
