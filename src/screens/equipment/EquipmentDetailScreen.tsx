import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { formatApiErrorForUser } from '../../api/client';
import {
  deleteEquipment,
  equipmentId,
  fetchEquipment,
  type Equipment,
} from '../../api/equipmentApi';
import { HeaderOutlineButton, HeaderRow } from '../../components/HeaderActions';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import type { ProfileStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';
import { equipmentStatusLabel, equipmentTypeLabel } from '../../utils/equipmentLabels';
import {
  formatDateTimeRu,
  formatPhoneRu,
  formatReadableLine,
  formatReadableMultiline,
} from '../../utils/formatDisplay';

type Props = StackScreenProps<ProfileStackParamList, 'EquipmentDetail'>;

type Field = { label: string; value: string; multiline?: boolean };

function line(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function fieldsFrom(eq: Equipment): Field[] {
  const ip =
    line(eq.ip_assignment_address) ||
    (eq.ip_assignment != null && eq.ip_assignment !== '' ? String(eq.ip_assignment) : '');

  const rows: Field[] = [
    {
      label: 'Тип',
      value: formatReadableLine(eq.equipment_type_display) || equipmentTypeLabel(line(eq.equipment_type)),
    },
    {
      label: 'Статус',
      value: formatReadableLine(eq.status_display) || equipmentStatusLabel(line(eq.status)),
    },
    { label: 'Модель', value: formatReadableLine(eq.model_name) },
    { label: 'Производитель', value: formatReadableLine(eq.manufacturer) },
    { label: 'Инвентарный №', value: formatReadableLine(eq.inventory_number) },
    { label: 'Серийный №', value: formatReadableLine(eq.serial_number) },
    { label: 'Кабинет', value: formatReadableLine(eq.room) },
    { label: 'Филиал', value: formatReadableLine(eq.branch_name) || formatReadableLine(eq.branch_value) },
    { label: 'MAC-адрес', value: formatReadableLine(eq.MAC_address) },
    { label: 'Порт', value: formatReadableLine(eq.port_number) },
    { label: 'Внутренний №', value: formatReadableLine(eq.internal_number) },
    { label: 'ТТ', value: formatReadableLine(eq.tt_number) },
    { label: 'Hostname', value: formatReadableLine(eq.hostname) },
    { label: 'IMEI', value: formatReadableLine(eq.imei) },
    { label: 'Телефон', value: formatPhoneRu(eq.phone_number) },
    { label: 'QR ID', value: formatReadableLine(eq.qr_id) },
    { label: 'IP', value: formatReadableLine(ip) },
    { label: 'Описание', value: formatReadableMultiline(eq.description), multiline: true },
    { label: 'Комментарий', value: formatReadableMultiline(eq.comment), multiline: true },
    { label: 'Создал', value: formatReadableLine(eq.created_by_name) },
    { label: 'Изменил', value: formatReadableLine(eq.updated_by_name) },
    { label: 'Создано', value: formatDateTimeRu(eq.created_at) },
    { label: 'Обновлено', value: formatDateTimeRu(eq.updated_at) },
  ];
  return rows.filter((r) => r.value);
}

function createStyles(colors: ThemeColors, radii: (typeof import('../../theme'))['radii'], shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
      marginBottom: 12,
    },
    title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
    sub: { color: colors.muted, fontSize: 15, marginBottom: 12 },
    row: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    label: { color: colors.muted, fontSize: 14, fontWeight: '600', marginBottom: 4 },
    value: { color: colors.text, fontSize: 16, lineHeight: 22 },
    valueMultiline: { color: colors.text, fontSize: 16, lineHeight: 24 },
    danger: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.danger,
      alignItems: 'center',
    },
    dangerText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

export default function EquipmentDetailScreen({ route, navigation }: Props) {
  const id = route.params.equipmentId;
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();
  const [eq, setEq] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEquipment(id);
      setEq(data);
      const title = line(data.model_name) || `Оборудование #${equipmentId(data) || id}`;
      navigation.setOptions({ title });
    } catch (e) {
      Alert.alert('Ошибка', formatApiErrorForUser(e), [
        { text: 'Назад', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [id, navigation]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderRow>
          <HeaderOutlineButton
            label="Изменить"
            onPress={() => navigation.navigate('EquipmentForm', { equipmentId: id })}
          />
        </HeaderRow>
      ),
    });
  }, [navigation, id]);

  function confirmDelete() {
    Alert.alert('Удалить оборудование?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => void doDelete(),
      },
    ]);
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteEquipment(id);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Ошибка', formatApiErrorForUser(e));
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !eq) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!eq) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Не найдено</Text>
      </View>
    );
  }

  const rows = fieldsFrom(eq);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}>
      <View style={styles.card}>
        <Text style={styles.title}>{line(eq.model_name) || `№ ${id}`}</Text>
        <Text style={styles.sub}>
          {equipmentTypeLabel(line(eq.equipment_type))} · {equipmentStatusLabel(line(eq.status))}
        </Text>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
            <Text style={styles.label}>{r.label}</Text>
            <Text
              style={r.multiline ? styles.valueMultiline : styles.value}
              selectable
            >
              {r.value}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.danger, deleting && { opacity: 0.6 }]}
        onPress={confirmDelete}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.dangerText}>Удалить</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
