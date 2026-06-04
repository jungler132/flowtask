import { forwardRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../context/ThemeContext';
import { buildEquipmentQrValue, type EquipmentQrCaption } from '../../lib/equipmentQr';

type Props = {
  caption: EquipmentQrCaption;
  size?: number;
};

export const EquipmentQrShareCard = forwardRef<View, Props>(function EquipmentQrShareCard(
  { caption, size = 200 },
  ref,
) {
  const { colors, radii } = useTheme();
  const qrValue = buildEquipmentQrValue(caption.qrId);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.card,
        {
          backgroundColor: '#ffffff',
          borderRadius: radii.lg,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={styles.brand}>Flowtask · Оборудование</Text>
      <Text style={styles.title} numberOfLines={2}>
        {caption.title}
      </Text>
      {caption.lines.map((line) => (
        <Text key={line} style={styles.line} numberOfLines={2}>
          {line}
        </Text>
      ))}
      <View style={styles.qrWrap}>
        <QRCode value={qrValue} size={size} backgroundColor="#ffffff" color="#1A2F45" />
      </View>
      <Text style={styles.qrId} selectable>
        QR: {caption.qrId}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    minWidth: 280,
  },
  brand: {
    color: '#5A6D7E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    color: '#1A2F45',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  line: {
    color: '#5A6D7E',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 2,
  },
  qrWrap: {
    marginTop: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  qrId: {
    color: '#5A6D7E',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
});
