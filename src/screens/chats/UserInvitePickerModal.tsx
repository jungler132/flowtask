import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  chatApiUserId,
  fetchAllUsersCached,
  userInviteId,
  userListDisplayName,
  type UserListItem,
} from '../../api/usersApi';
import { colors, radii } from '../../theme';
import { sameParticipantId } from './participantIdUtils';

/** Выбранные пользователи: для UI — имя, для API — id. */
export type PickedUser = { id: string; displayName: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Уже в чате или уже в поле участников — не показывать в списке */
  excludeIds: string[];
  primaryLabel: string;
  onApply: (selected: PickedUser[]) => void | Promise<void>;
  /** Блокировка кнопки (например, идёт запрос к API) */
  applyBusy?: boolean;
};

function userMatchesQuery(u: UserListItem, q: string): boolean {
  if (!q) return true;
  const id = userInviteId(u).toLowerCase();
  const name = userListDisplayName(u).toLowerCase();
  const email = String(u.email ?? '').toLowerCase();
  return name.includes(q) || email.includes(q) || id.includes(q);
}

export default function UserInvitePickerModal({
  visible,
  onClose,
  excludeIds,
  primaryLabel,
  onApply,
  applyBusy = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [inviteSearch, setInviteSearch] = useState('');
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setInviteSearch('');
    setSelectedInviteIds([]);
    setLoadError(false);
    setAllUsers([]);
    setInviteLoading(true);
    fetchAllUsersCached({ pageSize: 100 })
      .then((list) => {
        setAllUsers(list);
        setLoadError(false);
      })
      .catch(() => {
        setAllUsers([]);
        setLoadError(true);
      })
      .finally(() => setInviteLoading(false));
  }, [visible]);

  const inviteListFiltered = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    return allUsers.filter((u) => {
      const id = userInviteId(u);
      if (!id) return false;
      if (excludeIds.some((p) => sameParticipantId(p, id))) return false;
      return userMatchesQuery(u, q);
    });
  }, [allUsers, excludeIds, inviteSearch]);

  function toggleInviteSelect(id: string) {
    setSelectedInviteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleApply() {
    if (!selectedInviteIds.length || applyBusy) return;
    const byId = new Map<string, UserListItem>();
    for (const u of allUsers) {
      const id = chatApiUserId(u);
      if (id) byId.set(id, u);
    }
    const selected: PickedUser[] = selectedInviteIds.map((id) => {
      const u = byId.get(id);
      return {
        id,
        displayName: u ? userListDisplayName(u) : id,
      };
    });
    await onApply(selected);
  }

  const emptyHint = loadError
    ? 'Не удалось загрузить список. Проверьте сеть и попробуйте снова.'
    : inviteLoading
      ? ''
      : allUsers.length === 0
        ? 'Пользователей не найдено'
        : inviteListFiltered.length === 0
          ? inviteSearch.trim()
            ? 'Никого не нашли по запросу'
            : 'Все доступные пользователи уже добавлены'
          : '';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Выбор из списка</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.modalHint}>
          Загружаются все пользователи организации. Поле ниже сужает список по имени, email или ID.
        </Text>
        <TextInput
          style={styles.modalSearch}
          value={inviteSearch}
          onChangeText={setInviteSearch}
          placeholder="Поиск по списку…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        {inviteLoading ? (
          <View style={styles.modalLoader}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingHint}>Загружаем пользователей…</Text>
          </View>
        ) : (
          <FlatList
            data={inviteListFiltered}
            keyExtractor={(u, i) => userInviteId(u) || `u-${i}`}
            style={styles.modalList}
            contentContainerStyle={styles.modalListContent}
            ListEmptyComponent={
              emptyHint ? (
                <Text style={styles.muted}>{emptyHint}</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const id = userInviteId(item);
              const selected = id && selectedInviteIds.includes(id);
              return (
                <Pressable
                  style={[styles.inviteRow, selected && styles.inviteRowOn]}
                  onPress={() => id && toggleInviteSelect(id)}
                  disabled={!id}
                >
                  <View style={styles.inviteRowText}>
                    <Text style={styles.inviteName}>{userListDisplayName(item)}</Text>
                    {item.email ? (
                      <Text style={styles.inviteEmail} numberOfLines={1}>
                        {String(item.email)}
                      </Text>
                    ) : null}
                    {id ? (
                      <Text style={styles.inviteId} numberOfLines={1} selectable>
                        {id}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={selected ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            }}
          />
        )}
        <Pressable
          style={[
            styles.btnPrimary,
            (!selectedInviteIds.length || applyBusy) && styles.btnDisabled,
          ]}
          onPress={handleApply}
          disabled={!selectedInviteIds.length || applyBusy}
        >
          {applyBusy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnPrimaryTxt}>
              {primaryLabel} ({selectedInviteIds.length})
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
  modalHint: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },
  modalSearch: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  modalLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  loadingHint: { marginTop: 12, fontSize: 14, color: colors.muted },
  modalList: { flex: 1 },
  modalListContent: { paddingBottom: 16 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  inviteRowOn: { borderColor: colors.primary, backgroundColor: colors.chip },
  inviteRowText: { flex: 1, marginRight: 10 },
  inviteName: { fontSize: 16, fontWeight: '600', color: colors.text },
  inviteEmail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  inviteId: { fontSize: 11, fontFamily: 'monospace', color: colors.muted, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  btnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnPrimaryTxt: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
});
