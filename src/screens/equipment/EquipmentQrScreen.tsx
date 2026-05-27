import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, formatApiErrorForUser } from '../../api/client';
import { equipmentId, fetchEquipmentByQr } from '../../api/equipmentApi';
import { useTheme } from '../../context/ThemeContext';
import { parseEquipmentQrPayload } from '../../lib/parseEquipmentQr';
import type { ProfileStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<ProfileStackParamList, 'EquipmentQr'>;

function createStyles(colors: ThemeColors, radii: (typeof import('../../theme'))['radii']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    cameraWrap: { flex: 1 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    frame: {
      width: 260,
      height: 260,
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.9)',
      borderRadius: radii.lg,
      backgroundColor: 'transparent',
    },
    hintTop: {
      position: 'absolute',
      top: 48,
      left: 20,
      right: 20,
      color: '#fff',
      fontSize: 16,
      textAlign: 'center',
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    bottomPanel: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: 16,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    manualLabel: { color: colors.muted, fontSize: 14, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.bg,
      marginBottom: 10,
    },
    btn: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: radii.md,
      alignItems: 'center',
    },
    btnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
    permBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.bg,
    },
    permText: { color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 16 },
    scanningBadge: {
      position: 'absolute',
      bottom: 24,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
    },
    scanningText: { color: '#fff', fontSize: 14 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 10 },
    modalBody: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 8 },
    modalQr: {
      color: colors.text,
      fontSize: 15,
      fontFamily: 'monospace',
      marginBottom: 20,
    },
    modalBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
    },
    modalBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  });
}

function isNotFoundError(e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status === 404) return true;
    const msg = e.message.toLowerCase();
    if (msg.includes('не найден') || msg.includes('not found')) return true;
  }
  return false;
}

export default function EquipmentQrScreen({ navigation }: Props) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii), [colors, radii]);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualQr, setManualQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanActive, setScanActive] = useState(true);
  const [notFound, setNotFound] = useState<{ visible: boolean; qr: string }>({
    visible: false,
    qr: '',
  });

  const lookupLock = useRef(false);
  const lastRawRef = useRef('');

  const openEquipment = useCallback(
    (raw: string) => {
      const qr = parseEquipmentQrPayload(raw);
      if (!qr || lookupLock.current) return;

      lookupLock.current = true;
      setScanActive(false);
      setBusy(true);
      lastRawRef.current = raw;

      fetchEquipmentByQr(qr)
        .then((eq) => {
          const id = equipmentId(eq);
          if (!id) {
            setNotFound({ visible: true, qr });
            return;
          }
          navigation.replace('EquipmentDetail', { equipmentId: id });
        })
        .catch((e) => {
          if (isNotFoundError(e)) {
            setNotFound({ visible: true, qr });
          } else {
            Alert.alert('Ошибка', formatApiErrorForUser(e));
            lastRawRef.current = '';
            setScanActive(true);
          }
        })
        .finally(() => {
          setBusy(false);
          lookupLock.current = false;
        });
    },
    [navigation],
  );

  const dismissNotFound = () => {
    setNotFound({ visible: false, qr: '' });
    lastRawRef.current = '';
    setScanActive(true);
  };

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (!scanActive || busy || notFound.visible) return;
      openEquipment(data);
    },
    [scanActive, busy, notFound.visible, openEquipment],
  );

  if (!permission) {
    return (
      <View style={styles.permBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permBox}>
        <Ionicons name="camera-outline" size={48} color={colors.muted} style={{ marginBottom: 12 }} />
        <Text style={styles.permText}>Для сканирования QR нужен доступ к камере.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnText}>Разрешить камеру</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={scanActive && !notFound.visible}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanActive && !busy && !notFound.visible ? onBarcodeScanned : undefined}
        />
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.hintTop}>Наведите камеру на QR-код оборудования</Text>
          <View style={styles.frame} />
        </View>
        {busy ? (
          <View style={styles.scanningBadge}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.scanningText}>Поиск…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.manualLabel}>Или введите QR ID вручную</Text>
        <TextInput
          style={styles.input}
          value={manualQr}
          onChangeText={setManualQr}
          placeholder="QR ID"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Pressable
          style={[styles.btn, busy && { opacity: 0.65 }]}
          disabled={busy}
          onPress={() => {
            const q = manualQr.trim();
            if (!q) return;
            openEquipment(q);
          }}
        >
          <Text style={styles.btnText}>Найти</Text>
        </Pressable>
      </View>

      <Modal
        visible={notFound.visible}
        transparent
        animationType="fade"
        onRequestClose={dismissNotFound}
      >
        <Pressable style={styles.modalBackdrop} onPress={dismissNotFound}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Не найдено</Text>
            <Text style={styles.modalBody}>
              Оборудование под таким QR не найдено.
            </Text>
            {notFound.qr ? (
              <Text style={styles.modalQr} selectable>
                {notFound.qr}
              </Text>
            ) : null}
            <Pressable style={styles.modalBtn} onPress={dismissNotFound}>
              <Text style={styles.modalBtnText}>Сканировать снова</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
