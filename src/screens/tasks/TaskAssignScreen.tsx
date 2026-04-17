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
import { addAssignees } from '../../api/tasksApi';
import { resolveAssigneeIdsForTasksApi } from '../../api/usersApi';
import UserInvitePickerModal, { type PickedUser } from '../chats/UserInvitePickerModal';
import { KeyboardAvoid } from '../../components/KeyboardAvoid';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { TasksStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<TasksStackParamList, 'TaskAssign'>;

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createTaskAssignStyles(colors: ThemeColors, radii: ThemeRadii, shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...shadowCard,
    },
    lead: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 },
    btnPick: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.chip,
      marginBottom: 14,
    },
    btnPickIcon: { marginRight: 8 },
    btnPickTxt: { color: colors.primary, fontWeight: '700', fontSize: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: '100%',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipTxt: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
    label: { color: colors.muted, fontSize: 13, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      padding: 14,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 16,
    },
    btn: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: radii.md,
      alignItems: 'center',
    },
    disabled: { opacity: 0.6 },
    btnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  });
}

export default function TaskAssignScreen({ route, navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(
    () => createTaskAssignStyles(colors, radii, shadowCard),
    [colors, radii, shadowCard],
  );
  const { taskId } = route.params;
  const [picked, setPicked] = useState<PickedUser[]>([]);
  const [manual, setManual] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const allIds = useMemo(() => {
    const fromPicked = picked.map((p) => p.id);
    const fromManual = manual
      .split(/[,\s\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const set = new Set<string>();
    fromPicked.forEach((id) => set.add(id));
    fromManual.forEach((id) => set.add(id));
    return Array.from(set);
  }, [picked, manual]);

  function removePicked(id: string) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }

  async function mergeFromPicker(selected: PickedUser[]) {
    setPicked((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      selected.forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values());
    });
    setPickerOpen(false);
  }

  async function submit() {
    if (!allIds.length) {
      Alert.alert('Исполнители', 'Выберите людей из списка или укажите их ID через запятую.');
      return;
    }
    setBusy(true);
    try {
      const resolved = await resolveAssigneeIdsForTasksApi(allIds);
      if (!resolved.length) {
        Alert.alert('Исполнители', 'Не удалось определить пользователей. Проверьте ID.');
        return;
      }
      await addAssignees(taskId, resolved);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Не удалось добавить', formatApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoid>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <UserInvitePickerModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          excludeIds={allIds}
          primaryLabel="Добавить исполнителей"
          onApply={mergeFromPicker}
          applyBusy={busy}
        />

        <View style={styles.card}>
          <Text style={styles.lead}>
            Новые исполнители добавятся к текущим. Можно выбрать из каталога сотрудников или дописать ID
            вручную.
          </Text>
          <Pressable
            style={[styles.btnPick, busy && styles.disabled]}
            onPress={() => setPickerOpen(true)}
            disabled={busy}
          >
            <Ionicons name="person-add-outline" size={22} color={colors.primary} style={styles.btnPickIcon} />
            <Text style={styles.btnPickTxt}>Выбрать из списка</Text>
          </Pressable>

          {picked.length > 0 ? (
            <View style={styles.chips}>
              {picked.map((p) => (
                <View key={p.id} style={styles.chip}>
                  <Text style={styles.chipTxt} numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  <Pressable onPress={() => removePicked(p.id)} hitSlop={8} disabled={busy}>
                    <Ionicons name="close-circle" size={22} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Дополнительно: ID через запятую</Text>
          <TextInput
            style={styles.input}
            value={manual}
            onChangeText={setManual}
            placeholder="Если кого-то нет в списке"
            placeholderTextColor={colors.muted}
            editable={!busy}
          />
        </View>

        <Pressable style={[styles.btn, busy && styles.disabled]} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>{busy ? '…' : 'Добавить'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoid>
  );
}
