import { copyAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';

async function captureCard(ref: RefObject<View | null>): Promise<string> {
  if (!ref.current) throw new Error('Карточка QR не готова');
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
  return uri;
}

function safeFileName(title: string, qrId: string): string {
  const base = (title || 'oborudovanie')
    .replace(/[^\w\u0400-\u04FF.-]+/g, '_')
    .slice(0, 40);
  return `flowtask_qr_${base}_${qrId.slice(0, 12)}.png`;
}

export async function shareEquipmentQrImage(
  ref: RefObject<View | null>,
  fileName: string,
): Promise<void> {
  const uri = await captureCard(ref);
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert('Недоступно', 'На этом устройстве нельзя поделиться файлом.');
    return;
  }
  const dest = `${cacheDirectory ?? ''}${fileName}`;
  await copyAsync({ from: uri, to: dest });
  await Sharing.shareAsync(dest, {
    mimeType: 'image/png',
    dialogTitle: 'Поделиться QR-кодом',
  });
}

export async function saveEquipmentQrToGallery(
  ref: RefObject<View | null>,
  fileName: string,
): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    Alert.alert('Нет доступа', 'Разрешите сохранение фото в настройках устройства.');
    return;
  }
  const uri = await captureCard(ref);
  const asset = await MediaLibrary.createAssetAsync(uri);
  if (Platform.OS === 'android') {
    const album = await MediaLibrary.getAlbumAsync('Flowtask');
    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync('Flowtask', asset, false);
    }
  }
}
