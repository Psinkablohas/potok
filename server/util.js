import { one } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => {
  throw new HttpError(status, message);
};

// Оборачивает async-обработчик, чтобы ошибки уходили в общий обработчик Express
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function str(value, { max = 500, required = false, field = 'Поле' } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(400, `${field}: обязательно`);
    return value;
  }
  if (typeof value !== 'string') fail(400, `${field}: ожидается строка`);
  const v = value.trim();
  if (required && !v) fail(400, `${field}: не может быть пустым`);
  if (v.length > max) fail(400, `${field}: не длиннее ${max} символов`);
  return v;
}

export function oneOf(value, allowed, field = 'Поле') {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) fail(400, `${field}: недопустимое значение`);
  return value;
}

export function dateOrNull(value, field = 'Дата') {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${field}: формат ГГГГ-ММ-ДД`);
  return value;
}

export function intOrNull(value, field = 'Поле') {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, `${field}: некорректный идентификатор`);
  return n;
}

export const PROJECT_COLORS = [
  '#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#EAB308',
  '#F97316', '#EF4444', '#EC4899', '#A855F7', '#64748B',
];

export async function isWorkspaceMember(userId, workspaceId) {
  return !!(await one('SELECT 1 FROM workspace_members WHERE user_id=$1 AND workspace_id=$2', [userId, workspaceId]));
}
