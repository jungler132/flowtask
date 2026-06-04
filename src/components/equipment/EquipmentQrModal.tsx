import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EquipmentQrShareCard } from './EquipmentQrShareCard';
import { useTheme } from '../../context/ThemeContext';
import type { EquipmentQrCaption } from '../../lib/equipmentQr';
import { shareEquipmentQrImage } from '../../lib/equipmentQrShare';

type Props = {
  visible: boolean;
  caption: EquipmentQrCaption | null;
  onClose: () => void;
};

export default function EquipmentQrModal({ visible, caption, onClose }: Props) {
  const { colors, radii } = useTheme();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const fileName = useMemo(() => {
    if (!caption) return 'flowtask_qr.png';
    const base = caption.title.replace(/[^\w\u0400-\u04FF.-]+/g, '_').slice(0, 40);
    return `flowtask_qr_${base}_${caption.qrId.slice(0, 12)}.png`;
  }, [caption]);

  async function onShare() {
    if (!caption) return;
    setBusy(true);
    try {
      await shareEquipmentQrImage(cardRef, fileName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Ошибка', `Не удалось поделиться: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  if (!caption) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, borderRadius: radii.lg }]}>
            <Text style={[styles.title, { color: colors.text }]}>QR-код оборудования</Text>
            <Text style={[styles.hint, { color: colors.muted }]}>
              Наклейте или распечатайте код. При сканировании откроется карточка этой единицы.
            </Text>

            <EquipmentQrShareCard ref={cardRef} caption={caption} />

            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}
                onPress={() => void onShare()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.btnText, { color: colors.onPrimary }]}>Поделиться</Text>
                )}
              </Pressable>
              <Pressable style={styles.close} onPress={onClose} disabled={busy}>
                <Text style={{ color: colors.muted, fontSize: 16, fontWeight: '600' }}>Закрыть</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  sheet: {
    padding: 18,
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 16, textAlign: 'center' },
  actions: { width: '100%', marginTop: 18, gap: 10 },
  btn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  btnPrimary: {},
  btnText: { fontSize: 16, fontWeight: '700' },
  close: { alignItems: 'center', paddingVertical: 10 },
});
