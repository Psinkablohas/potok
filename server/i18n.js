// Серверные тексты, которые видит пользователь вне интерфейса: письма и названия по умолчанию
export const LOCALES = ['ru', 'uk', 'en', 'zh', 'de'];
export const normLocale = (l) => (LOCALES.includes(l) ? l : 'ru');

const T = {
  workspace: { ru: 'Пространство {0}', uk: 'Простір {0}', en: "{0}'s workspace", zh: '{0} 的工作区', de: 'Arbeitsbereich von {0}' },
  formTitle: { ru: 'Заявка в проект «{0}»', uk: 'Заявка до проєкту «{0}»', en: 'Request for “{0}”', zh: '“{0}”项目请求', de: 'Anfrage für „{0}“' },
  copy: { ru: '{0} (копия)', uk: '{0} (копія)', en: '{0} (copy)', zh: '{0}（副本）', de: '{0} (Kopie)' },

  'mail.assigned': { ru: '{0} назначил(а) вам задачу', uk: '{0} призначив(ла) вам завдання', en: '{0} assigned you a task', zh: '{0} 给您分配了任务', de: '{0} hat Ihnen eine Aufgabe zugewiesen' },
  'mail.mentioned': { ru: '{0} упомянул(а) вас', uk: '{0} згадав(ла) вас', en: '{0} mentioned you', zh: '{0} 提及了您', de: '{0} hat Sie erwähnt' },
  'mail.commented': { ru: '{0} оставил(а) комментарий', uk: '{0} залишив(ла) коментар', en: '{0} left a comment', zh: '{0} 发表了评论', de: '{0} hat kommentiert' },
  'mail.completed': { ru: '{0} завершил(а) задачу', uk: '{0} завершив(ла) завдання', en: '{0} completed a task', zh: '{0} 完成了任务', de: '{0} hat eine Aufgabe erledigt' },
  'mail.liked': { ru: '{0} отметил(а) задачу', uk: '{0} вподобав(ла) завдання', en: '{0} liked a task', zh: '{0} 赞了任务', de: '{0} gefällt eine Aufgabe' },
  'mail.status': { ru: '{0} опубликовал(а) статус проекта «{1}»', uk: '{0} опублікував(ла) статус проєкту «{1}»', en: '{0} posted a status update for “{1}”', zh: '{0} 发布了“{1}”项目状态', de: '{0} hat ein Status-Update für „{1}“ veröffentlicht' },
  'mail.open': { ru: 'Открыть', uk: 'Відкрити', en: 'Open', zh: '打开', de: 'Öffnen' },
  'mail.footer': {
    ru: 'Вы получили это письмо, потому что подписаны на уведомления. Отключить письма можно в настройках профиля.',
    uk: 'Ви отримали цей лист, бо підписані на сповіщення. Вимкнути листи можна в налаштуваннях профілю.',
    en: "You're receiving this because email notifications are on. You can turn them off in your profile settings.",
    zh: '您收到此邮件是因为开启了邮件通知。可在个人资料设置中关闭。',
    de: 'Sie erhalten diese E-Mail, weil E-Mail-Benachrichtigungen aktiv sind. Sie können sie in den Profileinstellungen deaktivieren.',
  },
  'mail.someone': { ru: 'Кто-то', uk: 'Хтось', en: 'Someone', zh: '某人', de: 'Jemand' },
};

export const SECTION_TEMPLATES = {
  empty: { ru: ['Без раздела'], uk: ['Без розділу'], en: ['Untitled section'], zh: ['未命名分区'], de: ['Ohne Abschnitt'] },
  kanban: {
    ru: ['К выполнению', 'В работе', 'На проверке', 'Готово'],
    uk: ['До виконання', 'В роботі', 'На перевірці', 'Готово'],
    en: ['To do', 'In progress', 'In review', 'Done'],
    zh: ['待办', '进行中', '审核中', '已完成'],
    de: ['Zu erledigen', 'In Arbeit', 'In Prüfung', 'Erledigt'],
  },
  sprint: {
    ru: ['Бэклог', 'Спринт', 'В работе', 'Тестирование', 'Готово'],
    uk: ['Беклог', 'Спринт', 'В роботі', 'Тестування', 'Готово'],
    en: ['Backlog', 'Sprint', 'In progress', 'Testing', 'Done'],
    zh: ['待办池', '冲刺', '进行中', '测试', '已完成'],
    de: ['Backlog', 'Sprint', 'In Arbeit', 'Test', 'Erledigt'],
  },
  marketing: {
    ru: ['Идеи', 'Подготовка', 'Публикация', 'Аналитика'],
    uk: ['Ідеї', 'Підготовка', 'Публікація', 'Аналітика'],
    en: ['Ideas', 'Preparation', 'Publishing', 'Analytics'],
    zh: ['想法', '准备', '发布', '分析'],
    de: ['Ideen', 'Vorbereitung', 'Veröffentlichung', 'Analyse'],
  },
};

export function st(key, locale, ...args) {
  const row = T[key];
  const s = (row && (row[normLocale(locale)] || row.ru)) || key;
  return s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
}
