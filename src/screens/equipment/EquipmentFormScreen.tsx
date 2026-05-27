import { StackScreenProps } from '@react-navigation/stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  buildEquipmentPayload,
  createEquipment,
  equipmentToForm,
  fetchEquipment,
  patchEquipment,
} from '../../api/equipmentApi';
import { fetchBranches, type ReferenceItem } from '../../api/referencesApi';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import type { ProfileStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';
import { EQUIPMENT_STATUS_OPTIONS, EQUIPMENT_TYPE_OPTIONS } from '../../utils/equipmentLabels';

type Props = StackScreenProps<ProfileStackParamList, 'EquipmentForm'>;

function refBranchName(item: ReferenceItem): string {
  return String(item.name ?? item.title ?? item.value ?? item.branch_name ?? '').trim();
}

function createStyles(colors: ThemeColors, radii: (typeof import('../../theme'))['radii'], shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 16 },
    section: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
      marginBottom: 12,
    },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 },
    label: { color: colors.muted, fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.bg,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chip,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    save: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
      marginTop: 8,
    },
    saveText: { color: colors.onPrimary, fontWeight: '700', fontSize: 17 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

const EMPTY_FORM = equipmentToForm({});

export default function EquipmentFormScreen({ route, navigation }: Props) {
  const editId = route.params?.equipmentId;
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();

  const [loading, setLoading] = useState(!!editId);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [branches, setBranches] = useState<ReferenceItem[]>([]);

  useEffect(() => {
    fetchBranches({ page: 1 })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!editId) {
      navigation.setOptions({ title: 'Новое оборудование' });
      return;
    }
    (async () => {
      try {
        const eq = await fetchEquipment(editId);
        setForm(equipmentToForm(eq));
        navigation.setOptions({ title: 'Редактирование' });
      } catch (e) {
        Alert.alert('Ошибка', formatApiErrorForUser(e));
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, navigation]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!form.model_name.trim() && !form.inventory_number.trim() && !form.serial_number.trim()) {
      Alert.alert('Укажите модель, инвентарный или серийный номер');
      return;
    }
    setBusy(true);
    try {
      const body = buildEquipmentPayload(form);
      if (editId) {
        await patchEquipment(editId, body);
        navigation.replace('EquipmentDetail', { equipmentId: editId });
      } else {
        const created = await createEquipment(body);
        const id = String(created.id ?? created._id ?? '').trim();
        if (id) {
          navigation.replace('EquipmentDetail', { equipmentId: id });
        } else {
          navigation.goBack();
        }
      }
    } catch (e) {
      Alert.alert('Ошибка', formatApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabScrollBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Основное</Text>
          <Text style={styles.label}>Тип</Text>
          <View style={styles.chipRow}>
            {EQUIPMENT_TYPE_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                style={[styles.chip, form.equipment_type === o.value && styles.chipActive]}
                onPress={() => setField('equipment_type', o.value)}
              >
                <Text
                  style={[styles.chipText, form.equipment_type === o.value && styles.chipTextActive]}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Статус</Text>
          <View style={styles.chipRow}>
            {EQUIPMENT_STATUS_OPTIONS.map((o) => (
              <Pressable
                key={o.value || 'none'}
                style={[styles.chip, form.status === o.value && styles.chipActive]}
                onPress={() => setField('status', o.value)}
              >
                <Text style={[styles.chipText, form.status === o.value && styles.chipTextActive]}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Модель</Text>
          <TextInput
            style={styles.input}
            value={form.model_name}
            onChangeText={(v) => setField('model_name', v)}
            placeholder="Модель"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Производитель</Text>
          <TextInput
            style={styles.input}
            value={form.manufacturer}
            onChangeText={(v) => setField('manufacturer', v)}
            placeholder="Производитель"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Инвентарный №</Text>
          <TextInput
            style={styles.input}
            value={form.inventory_number}
            onChangeText={(v) => setField('inventory_number', v)}
            placeholder="Инвентарный номер"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Серийный №</Text>
          <TextInput
            style={styles.input}
            value={form.serial_number}
            onChangeText={(v) => setField('serial_number', v)}
            placeholder="Серийный номер"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Кабинет</Text>
          <TextInput
            style={styles.input}
            value={form.room}
            onChangeText={(v) => setField('room', v)}
            placeholder="Кабинет"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Филиал</Text>
          <View style={styles.chipRow}>
            {branches.slice(0, 24).map((b, i) => {
              const name = refBranchName(b);
              if (!name) return null;
              return (
                <Pressable
                  key={`${name}-${i}`}
                  style={[styles.chip, form.branch_value === name && styles.chipActive]}
                  onPress={() => setField('branch_value', form.branch_value === name ? '' : name)}
                >
                  <Text
                    style={[styles.chipText, form.branch_value === name && styles.chipTextActive]}
                  >
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={form.branch_value}
            onChangeText={(v) => setField('branch_value', v)}
            placeholder="Или введите название филиала"
            placeholderTextColor={colors.muted}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Сеть и идентификаторы</Text>
          {(
            [
              ['MAC_address', 'MAC-адрес'],
              ['port_number', 'Номер порта'],
              ['internal_number', 'Внутренний №'],
              ['hostname', 'Hostname'],
              ['tt_number', 'ТТ'],
              ['imei', 'IMEI'],
              ['phone_number', 'Телефон'],
              ['qr_id', 'QR ID'],
              ['ip_assignment', 'IP (число назначения)'],
            ] as const
          ).map(([key, label]) => (
            <View key={key}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key]}
                onChangeText={(v) => setField(key, v)}
                placeholder={label}
                placeholderTextColor={colors.muted}
                autoCapitalize={key === 'MAC_address' ? 'characters' : 'none'}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Примечания</Text>
          <Text style={styles.label}>Описание</Text>
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            value={form.description}
            onChangeText={(v) => setField('description', v)}
            multiline
            placeholder="Описание"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Комментарий</Text>
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            value={form.comment}
            onChangeText={(v) => setField('comment', v)}
            multiline
            placeholder="Комментарий"
            placeholderTextColor={colors.muted}
          />
        </View>

        <Pressable style={[styles.save, busy && { opacity: 0.65 }]} onPress={() => void save()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.saveText}>{editId ? 'Сохранить' : 'Создать'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
