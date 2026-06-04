import { StackScreenProps } from '@react-navigation/stack';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildEquipmentPayload,
  createEquipment,
  equipmentToForm,
  fetchEquipment,
  patchEquipment,
} from '../../api/equipmentApi';
import { fetchBranches, type ReferenceItem } from '../../api/referencesApi';
import { useTheme } from '../../context/ThemeContext';
import {
  EQUIPMENT_REQUIRED_HINT,
  errorsFromApiError,
  isEquipmentFieldRequired,
  mergeEquipmentErrors,
  validateEquipmentForm,
  type EquipmentFormField,
  type EquipmentFormState,
} from '../../lib/equipmentValidation';
import { generateEquipmentQrId } from '../../lib/equipmentQr';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import type { ProfileStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';
import { EQUIPMENT_STATUS_OPTIONS, EQUIPMENT_TYPE_OPTIONS } from '../../utils/equipmentLabels';

type Props = StackScreenProps<ProfileStackParamList, 'EquipmentForm'>;

function refBranchName(item: ReferenceItem): string {
  return String(item.name ?? item.title ?? item.value ?? item.branch_name ?? '').trim();
}

function createStyles(
  colors: ThemeColors,
  radii: (typeof import('../../theme'))['radii'],
  shadowCard: ViewStyle,
) {
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
    sectionError: { borderColor: colors.danger },
    screenTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 8,
    },
    requiredHint: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    formErrorBanner: {
      backgroundColor: `${colors.danger}18`,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radii.md,
      padding: 12,
      marginBottom: 12,
    },
    formErrorBannerText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 },
    label: { color: colors.muted, fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 8 },
    labelError: { color: colors.danger },
    requiredMark: { color: colors.danger },
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
    inputError: { borderColor: colors.danger, borderWidth: 2 },
    fieldError: { color: colors.danger, fontSize: 13, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chipRowError: {
      borderWidth: 2,
      borderColor: colors.danger,
      borderRadius: radii.md,
      padding: 6,
    },
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      marginBottom: 8,
      paddingVertical: 8,
    },
    toggleLabel: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, paddingRight: 12 },
    toggleHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 8 },
    toggleBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.chip,
      minWidth: 52,
      alignItems: 'center',
    },
    toggleBtnOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    toggleBtnText: { fontWeight: '700', fontSize: 14, color: colors.muted },
    toggleBtnTextOn: { color: colors.primary },
    qrRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qrInput: { flex: 1 },
    regenBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    regenBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
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

function FieldLabel({
  label,
  required,
  error,
  styles,
}: {
  label: string;
  required?: boolean;
  error?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Text style={[styles.label, error && styles.labelError]}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

export default function EquipmentFormScreen({ route, navigation }: Props) {
  const editId = route.params?.equipmentId;
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(!!editId);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EquipmentFormState>(EMPTY_FORM);
  const [branches, setBranches] = useState<ReferenceItem[]>([]);
  const [errors, setErrors] = useState<Partial<Record<EquipmentFormField, string>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [autoGenerateQr, setAutoGenerateQr] = useState(false);

  useEffect(() => {
    fetchBranches({ page: 1 })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const eq = await fetchEquipment(editId);
        setForm(equipmentToForm(eq));
      } catch (e) {
        const { message } = errorsFromApiError(e);
        Alert.alert('Ошибка', message ?? 'Не удалось загрузить оборудование');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, navigation]);

  function clearFieldError(key: EquipmentFormField) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      if (key === 'model_name' || key === 'inventory_number' || key === 'serial_number') {
        delete next.model_name;
        delete next.inventory_number;
        delete next.serial_number;
      }
      return next;
    });
    setFormMessage(null);
  }

  function setField<K extends EquipmentFormField>(key: K, value: EquipmentFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  }

  function onAutoGenerateQrToggle() {
    const next = !autoGenerateQr;
    setAutoGenerateQr(next);
    if (next && !form.qr_id.trim()) {
      setField('qr_id', generateEquipmentQrId());
    }
  }

  function regenerateQrId() {
    setField('qr_id', generateEquipmentQrId());
  }

  function fieldError(key: EquipmentFormField): string | undefined {
    return submitAttempted ? errors[key] : undefined;
  }

  async function save() {
    setSubmitAttempted(true);
    setFormMessage(null);

    let payloadForm = form;
    if (autoGenerateQr && !form.qr_id.trim()) {
      payloadForm = { ...form, qr_id: generateEquipmentQrId() };
      setForm(payloadForm);
    }

    const localErrors = validateEquipmentForm(payloadForm);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setBusy(true);
    try {
      const body = buildEquipmentPayload(payloadForm);
      if (editId) {
        await patchEquipment(editId, body);
        navigation.replace('EquipmentDetail', { equipmentId: editId });
      } else {
        const created = await createEquipment(body);
        const newId = String(created.id ?? created._id ?? '').trim();
        const showQr = autoGenerateQr && !!String(payloadForm.qr_id).trim();
        if (newId) {
          navigation.replace('EquipmentDetail', { equipmentId: newId, showQrModal: showQr });
        } else {
          navigation.navigate('EquipmentList');
        }
      }
    } catch (e) {
      const { fieldErrors, message } = errorsFromApiError(e);
      const merged = mergeEquipmentErrors(validateEquipmentForm(payloadForm), fieldErrors);
      setErrors(merged);
      setFormMessage(message);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
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

  const typeErr = fieldError('equipment_type');
  const statusErr = fieldError('status');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabScrollBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>{editId ? 'Редактирование' : 'Новое оборудование'}</Text>
        {!editId ? <Text style={styles.requiredHint}>{EQUIPMENT_REQUIRED_HINT}</Text> : null}

        {formMessage ? (
          <View style={styles.formErrorBanner}>
            <Text style={styles.formErrorBannerText}>{formMessage}</Text>
          </View>
        ) : null}

        {submitAttempted && Object.keys(errors).length > 0 && !formMessage ? (
          <View style={styles.formErrorBanner}>
            <Text style={styles.formErrorBannerText}>
              Проверьте поля, отмеченные красным.
            </Text>
          </View>
        ) : null}

        <View style={[styles.section, (typeErr || statusErr) && styles.sectionError]}>
          <Text style={styles.sectionTitle}>Основное</Text>

          <FieldLabel label="Тип" required styles={styles} error={typeErr} />
          <View style={[styles.chipRow, typeErr && styles.chipRowError]}>
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
          {typeErr ? <Text style={styles.fieldError}>{typeErr}</Text> : null}

          <FieldLabel label="Статус" styles={styles} error={statusErr} />
          <View style={[styles.chipRow, statusErr && styles.chipRowError]}>
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
          {statusErr ? <Text style={styles.fieldError}>{statusErr}</Text> : null}

          {(
            [
              ['model_name', 'Модель'],
              ['manufacturer', 'Производитель'],
              ['inventory_number', 'Инвентарный №'],
              ['serial_number', 'Серийный №'],
              ['room', 'Кабинет'],
            ] as const
          ).map(([key, label]) => {
            const err = fieldError(key);
            return (
              <View key={key}>
                <FieldLabel
                  label={label}
                  required={isEquipmentFieldRequired(key)}
                  styles={styles}
                  error={err}
                />
                <TextInput
                  style={[styles.input, err && styles.inputError]}
                  value={form[key]}
                  onChangeText={(v) => setField(key, v)}
                  placeholder={label}
                  placeholderTextColor={colors.muted}
                />
                {err ? <Text style={styles.fieldError}>{err}</Text> : null}
              </View>
            );
          })}

          <FieldLabel label="Филиал" styles={styles} />
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

          {!editId ? (
            <>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Сгенерировать QR-код</Text>
                <Pressable
                  style={[styles.toggleBtn, autoGenerateQr && styles.toggleBtnOn]}
                  onPress={onAutoGenerateQrToggle}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: autoGenerateQr }}
                >
                  <Text style={[styles.toggleBtnText, autoGenerateQr && styles.toggleBtnTextOn]}>
                    {autoGenerateQr ? 'Да' : 'Нет'}
                  </Text>
                </Pressable>
              </View>
              {autoGenerateQr ? (
                <Text style={styles.toggleHint}>
                  Будет создан уникальный QR ID. После сохранения можно поделиться или сохранить
                  наклейку в галерею.
                </Text>
              ) : null}
            </>
          ) : null}

          <FieldLabel label="QR ID" styles={styles} error={fieldError('qr_id')} />
          <View style={styles.qrRow}>
            <TextInput
              style={[
                styles.input,
                styles.qrInput,
                fieldError('qr_id') && styles.inputError,
              ]}
              value={form.qr_id}
              onChangeText={(v) => {
                setAutoGenerateQr(false);
                setField('qr_id', v);
              }}
              placeholder="Идентификатор для QR-наклейки"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              editable={!autoGenerateQr || !!editId}
            />
            {autoGenerateQr && !editId ? (
              <Pressable style={styles.regenBtn} onPress={regenerateQrId}>
                <Text style={styles.regenBtnText}>Новый</Text>
              </Pressable>
            ) : null}
          </View>
          {fieldError('qr_id') ? <Text style={styles.fieldError}>{fieldError('qr_id')}</Text> : null}

          {(
            [
              ['MAC_address', 'MAC-адрес'],
              ['port_number', 'Номер порта'],
              ['internal_number', 'Внутренний №'],
              ['hostname', 'Hostname'],
              ['tt_number', 'ТТ'],
              ['imei', 'IMEI'],
              ['phone_number', 'Телефон'],
              ['ip_assignment', 'IP (число назначения)'],
            ] as const
          ).map(([key, label]) => {
            const err = fieldError(key);
            return (
              <View key={key}>
                <FieldLabel label={label} styles={styles} error={err} />
                <TextInput
                  style={[styles.input, err && styles.inputError]}
                  value={form[key]}
                  onChangeText={(v) => setField(key, v)}
                  placeholder={label}
                  placeholderTextColor={colors.muted}
                  autoCapitalize={key === 'MAC_address' ? 'characters' : 'none'}
                  keyboardType={key === 'ip_assignment' ? 'number-pad' : 'default'}
                />
                {err ? <Text style={styles.fieldError}>{err}</Text> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Примечания</Text>
          {(
            [
              ['description', 'Описание'],
              ['comment', 'Комментарий'],
            ] as const
          ).map(([key, label]) => {
            const err = fieldError(key);
            return (
              <View key={key}>
                <FieldLabel label={label} styles={styles} error={err} />
                <TextInput
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }, err && styles.inputError]}
                  value={form[key]}
                  onChangeText={(v) => setField(key, v)}
                  multiline
                  placeholder={label}
                  placeholderTextColor={colors.muted}
                />
                {err ? <Text style={styles.fieldError}>{err}</Text> : null}
              </View>
            );
          })}
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
