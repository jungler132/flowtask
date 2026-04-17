import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { formatApiErrorForUser } from '../../api/client';
import {
  createTaskChat,
  extractChatIdFromCreateResponse,
  fetchChatByTask,
  normalizeTaskIdForChatApi,
} from '../../api/chatsApi';
import { KeyboardAvoid } from '../../components/KeyboardAvoid';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { ChatsStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';
import { taskStatusLabelRu } from '../../utils/taskLabels';
import TaskPickerModal, { type PickedTask } from './TaskPickerModal';

type Props = StackScreenProps<ChatsStackParamList, 'ChatFromTask'>;

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createChatFromTaskStyles(colors: ThemeColors, radii: ThemeRadii, shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16 },
    hero: {
      alignItems: 'center',
      marginBottom: 20,
      paddingVertical: 8,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    heroSub: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...shadowCard,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
    cardHint: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 16 },
    btnPick: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.chip,
      marginBottom: 16,
    },
    btnPickIcon: { marginRight: 8 },
    btnPickTxt: { color: colors.primary, fontWeight: '700', fontSize: 16 },
    selectedCard: {
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    selectedTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    selectedTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, lineHeight: 22 },
    clearBtn: { marginTop: -2 },
    statusPill: {
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.md,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusPillTxt: { fontSize: 13, fontWeight: '600', color: colors.primary },
    selectedMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      gap: 6,
    },
    selectedId: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', flex: 1 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    input: {
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      padding: 14,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 16,
    },
    overrideNote: { fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 18 },
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: radii.md,
      ...shadowCard,
    },
    btnPrimaryIcon: { marginRight: 10 },
    btnPrimaryTxt: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
    disabled: { opacity: 0.55 },
  });
}

export default function ChatFromTaskScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(
    () => createChatFromTaskStyles(colors, radii, shadowCard),
    [colors, radii, shadowCard],
  );
  const [picked, setPicked] = useState<PickedTask | null>(null);
  const [manualId, setManualId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveId = (picked?.id ?? manualId).trim();

  const manualOverridesPick = useMemo(() => {
    const m = manualId.trim();
    const p = picked?.id?.trim() ?? '';
    return m.length > 0 && m !== p;
  }, [manualId, picked]);

  async function openOrCreate() {
    if (!effectiveId) {
      Alert.alert('Нужна задача', 'Выберите задачу из списка или введите её идентификатор вручную.');
      return;
    }

    const { primary, fallback } = normalizeTaskIdForChatApi(effectiveId);
    const tryIds = [primary, fallback].filter(Boolean) as string[];

    setBusy(true);
    try {
      for (const tid of tryIds) {
        try {
          const chat = await fetchChatByTask(tid);
          const id = String(chat._id ?? '').trim();
          if (id) {
            const title =
              String(chat.name ?? '').trim() ||
              (picked?.title ? `Чат: ${picked.title}` : 'Чат по задаче');
            navigation.replace('ChatRoom', { chatId: id, title });
            return;
          }
        } catch {
          /* нет чата — создаём */
        }
      }

      let lastErr: unknown;
      for (const tid of tryIds) {
        try {
          const res = await createTaskChat(tid);
          const id = extractChatIdFromCreateResponse(res);
          if (id) {
            const title = picked?.title ? `Чат: ${picked.title}` : 'Чат по задаче';
            navigation.replace('ChatRoom', { chatId: id, title });
            return;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (lastErr) {
        Alert.alert('Не удалось открыть чат', formatApiErrorForUser(lastErr));
      } else {
        Alert.alert(
          'Ответ сервера',
          'Чат мог быть создан, но не удалось прочитать его идентификатор. Проверьте список чатов.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function clearPicked() {
    setPicked(null);
    setManualId('');
  }

  return (
    <KeyboardAvoid>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <TaskPickerModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          modalTitle="Задача для чата"
          confirmButtonLabel="Выбрать"
          onPick={(t) => {
            setPicked(t);
            setManualId(t.id);
            setPickerOpen(false);
          }}
        />

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="briefcase-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Чат по задаче</Text>
          <Text style={styles.heroSub}>
            Откроется существующий служебный чат или будет создан новый — участники смогут обсуждать
            задачу в переписке.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Выбор задачи</Text>
          <Text style={styles.cardHint}>
            Удобнее выбрать из ваших задач. Ручной ввод — если знаете точный ID (например task_12 или
            12).
          </Text>

          <Pressable
            style={[styles.btnPick, busy && styles.disabled]}
            onPress={() => setPickerOpen(true)}
            disabled={busy}
          >
            <Ionicons name="list-outline" size={22} color={colors.primary} style={styles.btnPickIcon} />
            <Text style={styles.btnPickTxt}>Выбрать из моих задач</Text>
          </Pressable>

          {picked && !manualOverridesPick ? (
            <View style={styles.selectedCard}>
              <View style={styles.selectedTop}>
                <Text style={styles.selectedTitle} numberOfLines={3}>
                  {picked.title}
                </Text>
                <Pressable onPress={clearPicked} hitSlop={10} style={styles.clearBtn} disabled={busy}>
                  <Ionicons name="close-circle" size={24} color={colors.muted} />
                </Pressable>
              </View>
              {picked.status ? (
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillTxt}>{taskStatusLabelRu(picked.status)}</Text>
                </View>
              ) : null}
              <View style={styles.selectedMeta}>
                <Ionicons name="finger-print-outline" size={14} color={colors.muted} />
                <Text style={styles.selectedId} selectable>
                  {picked.id}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Идентификатор задачи</Text>
          <TextInput
            style={styles.input}
            value={manualId}
            onChangeText={(t) => {
              setManualId(t);
              if (picked && t.trim() !== picked.id.trim()) {
                setPicked(null);
              }
            }}
            placeholder="task_12 или 12"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            editable={!busy}
          />
          {manualOverridesPick ? (
            <Text style={styles.overrideNote}>
              Используется введённый вручную ID (выбор из списка сброшен).
            </Text>
          ) : null}
        </View>

        <Pressable
          style={[styles.btnPrimary, busy && styles.disabled]}
          onPress={openOrCreate}
          disabled={busy}
        >
          <Ionicons name="chatbubbles-outline" size={22} color={colors.onPrimary} style={styles.btnPrimaryIcon} />
          <Text style={styles.btnPrimaryTxt}>{busy ? 'Подождите…' : 'Открыть или создать чат'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoid>
  );
}
