import { ru as ruDate, uk as ukDate, enUS, zhCN, de as deDate } from 'date-fns/locale';
import uk from './uk.js';
import en from './en.js';
import zh from './zh.js';
import de from './de.js';

// Ключ перевода — исходная русская фраза. Для русского языка словарь не нужен.
export const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'de', label: 'Deutsch' },
];

const DICTS = { ru: null, uk, en, zh, de };
const DATE_LOCALES = { ru: ruDate, uk: ukDate, en: enUS, zh: zhCN, de: deDate };
const KEY = 'potok-lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in DICTS) return saved;
  } catch { /* приватный режим */ }
  const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  return nav in DICTS ? nav : 'ru';
}

export const lang = detect();
document.documentElement.lang = lang;
const dict = DICTS[lang];

export const dateLocale = DATE_LOCALES[lang];

/** t('Удалить «{0}»?', name) — перевод с подстановкой значений по номерам */
export function t(key, ...args) {
  let s = (dict && dict[key]) || key;
  if (args.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
  return s;
}

// Модули читают язык при загрузке, поэтому после смены перезагружаем страницу
export function setLanguage(code) {
  if (!(code in DICTS) || code === lang) return;
  try { localStorage.setItem(KEY, code); } catch { /* приватный режим */ }
  window.location.reload();
}

const PLURALS = {
  // [one, few, many] для славянских, [one, other] для остальных
  ru: { задача: ['задача', 'задачи', 'задач'], участник: ['участник', 'участника', 'участников'] },
  uk: { задача: ['завдання', 'завдання', 'завдань'], участник: ['учасник', 'учасники', 'учасників'] },
  en: { задача: ['task', 'tasks'], участник: ['member', 'members'] },
  zh: { задача: ['个任务', '个任务'], участник: ['名成员', '名成员'] },
  de: { задача: ['Aufgabe', 'Aufgaben'], участник: ['Mitglied', 'Mitglieder'] },
};

/** tn(5, 'задача') → «5 задач» / «5 tasks» / «5 个任务» */
export function tn(n, word) {
  const forms = PLURALS[lang]?.[word] || PLURALS.ru[word] || [word, word, word];
  const sep = lang === 'zh' ? ' ' : ' ';
  if (lang === 'ru' || lang === 'uk') {
    const m10 = n % 10, m100 = n % 100;
    const f = m10 === 1 && m100 !== 11 ? forms[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1] : forms[2];
    return `${n}${sep}${f}`;
  }
  return `${n}${lang === 'zh' ? '' : sep}${n === 1 ? forms[0] : forms[1]}`;
}

// Ошибки приходят с сервера на русском — переводим, в том числе шаблонные
const ERROR_PATTERNS = [
  [/^(.+): обязательно$/, '{0}: обязательно'],
  [/^(.+): не может быть пустым$/, '{0}: не может быть пустым'],
  [/^(.+): не длиннее (\d+) символов$/, '{0}: не длиннее {1} символов'],
  [/^(.+): ожидается строка$/, '{0}: ожидается строка'],
  [/^(.+): недопустимое значение$/, '{0}: недопустимое значение'],
  [/^(.+): формат ГГГГ-ММ-ДД$/, '{0}: формат ГГГГ-ММ-ДД'],
  [/^(.+): некорректный идентификатор$/, '{0}: некорректный идентификатор'],
  [/^Задача ждёт завершения: (.+)$/, 'Задача ждёт завершения: {0}'],
];

export function tError(message) {
  if (!dict || !message) return message;
  if (dict[message]) return dict[message];
  for (const [re, key] of ERROR_PATTERNS) {
    const m = message.match(re);
    if (m) return t(key, ...m.slice(1).map((x) => dict[x] || x));
  }
  return message;
}
