import { format, isToday, isTomorrow, isYesterday, differenceInCalendarDays, parseISO, isThisYear, formatDistanceToNowStrict } from 'date-fns';
import { dateLocale as ru } from '../i18n/index.js';
import { t } from '../i18n/index.js';

export const toISODate = (d) => format(d, 'yyyy-MM-dd');
export const todayISO = () => toISODate(new Date());
export const parseDate = (s) => (s ? parseISO(s) : null);

export function dueLabel(dateStr) {
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  if (isToday(d)) return t("Сегодня");
  if (isTomorrow(d)) return t("Завтра");
  if (isYesterday(d)) return t("Вчера");
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 1 && diff < 7) return format(d, 'EEEE', { locale: ru }).replace(/^./, (c) => c.toUpperCase());
  return format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy', { locale: ru });
}

// overdue | today | soon | later | none
export function dueState(dateStr, completed) {
  if (!dateStr || completed) return 'none';
  const diff = differenceInCalendarDays(parseISO(dateStr), new Date());
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 2) return 'soon';
  return 'later';
}

export const dueClass = {
  overdue: 'text-danger',
  today: 'text-success',
  soon: 'text-warn',
  later: 'text-muted',
  none: 'text-muted',
};

export const fmtDate = (s, pattern = 'd MMMM yyyy') => (s ? format(parseISO(s), pattern, { locale: ru }) : '');

export const timeAgo = (iso) => (Date.now() - new Date(iso) < 60_000 ? t("только что") : formatDistanceToNowStrict(new Date(iso), { locale: ru, addSuffix: true }));

export const fmtDateTime = (iso) => format(new Date(iso), 'd MMM, HH:mm', { locale: ru });

export const PRIORITY = {
  none: { label: t("Без приоритета"), short: '', cls: '' },
  low: { label: t("Низкий"), short: t("Низкий"), cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
  medium: { label: t("Средний"), short: t("Средний"), cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  high: { label: t("Высокий"), short: t("Высокий"), cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
};

export const RECURRENCE = {
  '': t("Не повторять"),
  daily: t("Каждый день"),
  weekdays: t("По будням"),
  weekly: t("Каждую неделю"),
  biweekly: t("Раз в две недели"),
  monthly: t("Каждый месяц"),
  yearly: t("Каждый год"),
};

export const PROJECT_COLORS = ['#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#EAB308', '#F97316', '#EF4444', '#EC4899', '#A855F7', '#64748B'];

export const ROLE_LABEL = { owner: t("Владелец"), admin: t("Администратор"), member: t("Участник"), editor: t("Редактор"), viewer: t("Наблюдатель") };

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const fileSize = (b) => (b < 1024 ? t("{0} Б", b) : b < 1048576 ? t("{0} КБ", (b / 1024).toFixed(0)) : t("{0} МБ", (b / 1048576).toFixed(1)));

// Позиция между соседями для перестановки без пересчёта всего списка
export function between(prev, next) {
  if (prev == null && next == null) return 1;
  if (prev == null) return next - 1;
  if (next == null) return prev + 1;
  return (prev + next) / 2;
}

export const PROJECT_STATUS = {
  on_track: { label: t("По плану"), cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300', dot: '#16A34A' },
  at_risk: { label: t("Есть риски"), cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: '#D97706' },
  off_track: { label: t("Отстаём"), cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300', dot: '#DC2626' },
  on_hold: { label: t("На паузе"), cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', dot: '#0284C7' },
  complete: { label: t("Завершён"), cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300', dot: '#4F46E5' },
};

export const TASK_TYPE = {
  task: t("Задача"),
  milestone: t("Веха"),
  approval: t("Согласование"),
};

export const APPROVAL = {
  pending: { label: t("Ждёт решения"), cls: 'bg-subtle text-muted' },
  approved: { label: t("Одобрено"), cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  changes: { label: t("Нужны правки"), cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  rejected: { label: t("Отклонено"), cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
};

export const FIELD_TYPES = {
  text: t("Текст"),
  number: t("Число"),
  select: t("Выбор из списка"),
  date: t("Дата"),
  person: t("Человек"),
};
