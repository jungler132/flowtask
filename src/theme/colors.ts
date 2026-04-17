/** Полный набор цветов UI (светлая / тёмная тема). */
export type ThemeColors = {
  bg: string;
  bgMuted: string;
  card: string;
  text: string;
  muted: string;
  primary: string;
  primarySoft: string;
  border: string;
  danger: string;
  success: string;
  chip: string;
  chipActive: string;
  onPrimary: string;
  link: string;
  priorityLow: string;
  priorityMedium: string;
  priorityHigh: string;
  priorityUrgent: string;
  chatMine: string;
  chatMineBorder: string;
  chatOther: string;
  chatOtherBorder: string;
};

export const lightColors: ThemeColors = {
  bg: '#F0F6FB',
  bgMuted: '#E4EEF7',
  card: '#ffffff',
  text: '#1A2F45',
  muted: '#5A6D7E',
  primary: '#1565C0',
  primarySoft: '#E3F2FD',
  border: '#B9D0E5',
  danger: '#C62828',
  success: '#2E7D32',
  chip: '#E8F2FC',
  chipActive: '#D4E8FA',
  onPrimary: '#ffffff',
  link: '#0D47A1',
  priorityLow: '#2E7D32',
  priorityMedium: '#EF6C00',
  priorityHigh: '#E65100',
  priorityUrgent: '#B71C1C',
  chatMine: '#E3F2FD',
  chatMineBorder: '#90CAF9',
  chatOther: '#ffffff',
  chatOtherBorder: '#CFD8DC',
};

export const darkColors: ThemeColors = {
  bg: '#0f172a',
  bgMuted: '#1e293b',
  card: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  primary: '#60a5fa',
  primarySoft: 'rgba(59,130,246,0.22)',
  border: '#334155',
  danger: '#f87171',
  success: '#4ade80',
  chip: '#1e3a5f',
  chipActive: '#2563eb',
  onPrimary: '#0f172a',
  link: '#93c5fd',
  priorityLow: '#4ade80',
  priorityMedium: '#fbbf24',
  priorityHigh: '#fb923c',
  priorityUrgent: '#f87171',
  chatMine: '#1e3a8a',
  chatMineBorder: '#3b82f6',
  chatOther: '#1e293b',
  chatOtherBorder: '#475569',
};
