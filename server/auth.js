import jwt from 'jsonwebtoken';
import { one } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('ВНИМАНИЕ: JWT_SECRET не задан. Задайте его в настройках хостинга.');
}

export const COOKIE = 'potok_session';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function signSession(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: '30d' });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, SECRET).uid;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, userId) {
  res.cookie(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE);
}

export const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, color: u.color, locale: u.locale, email_notify: u.email_notify };

export async function requireAuth(req, res, next) {
  const uid = verifySession(req.cookies?.[COOKIE]);
  if (!uid) return res.status(401).json({ error: 'Требуется вход' });
  const user = await one('SELECT id, email, name, color, locale, email_notify FROM users WHERE id=$1', [uid]).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  req.user = user;
  next();
}
