import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { one, many, tx } from '../db.js';
import { h, fail, str, PROJECT_COLORS } from '../util.js';
import { requireAuth, setSessionCookie, clearSessionCookie, publicUser } from '../auth.js';
import { acceptInvite } from './workspaces.js';
import { st, normLocale } from '../i18n.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите 15 минут.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) fail(400, 'Пароль должен быть не короче 8 символов');
  if (password.length > 200) fail(400, 'Слишком длинный пароль');
}

export async function listWorkspaces(userId) {
  return many(
    `SELECT w.id, w.name, wm.role FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = $1 ORDER BY wm.joined_at`,
    [userId],
  );
}

router.post('/register', authLimiter, h(async (req, res) => {
  const name = str(req.body.name, { required: true, max: 80, field: 'Имя' });
  const email = str(req.body.email, { required: true, max: 200, field: 'Почта' }).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, 'Некорректный адрес почты');
  checkPassword(req.body.password);
  if (await one('SELECT 1 FROM users WHERE email=$1', [email])) fail(409, 'Пользователь с такой почтой уже есть. Войдите.');

  const hash = await bcrypt.hash(req.body.password, 10);
  const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
  const inviteToken = typeof req.body.invite === 'string' ? req.body.invite : null;
  const locale = normLocale(req.body.locale);

  const user = await tx(async (c) => {
    const { rows: [u] } = await c.query(
      'INSERT INTO users (email, name, password_hash, color, locale) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [email, name, hash, color, locale],
    );
    // Если человек пришёл по приглашению, отдельное пространство ему не создаём
    if (!inviteToken) {
      const { rows: [w] } = await c.query(
        'INSERT INTO workspaces (name, created_by) VALUES ($1,$2) RETURNING id',
        [st('workspace', locale, name), u.id],
      );
      await c.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')", [w.id, u.id]);
    }
    return u;
  });

  let joinedWorkspaceId = null;
  if (inviteToken) {
    try {
      joinedWorkspaceId = await acceptInvite(user.id, inviteToken);
    } catch (e) {
      // Приглашение устарело — создаём личное пространство, чтобы аккаунт не остался пустым
      const w = await one('INSERT INTO workspaces (name, created_by) VALUES ($1,$2) RETURNING id', [st('workspace', locale, name), user.id]);
      await one("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner') RETURNING 1", [w.id, user.id]);
    }
  }

  setSessionCookie(res, user.id);
  res.status(201).json({ user: publicUser(user), workspaces: await listWorkspaces(user.id), joinedWorkspaceId });
}));

router.post('/login', authLimiter, h(async (req, res) => {
  const email = str(req.body.email, { required: true, max: 200, field: 'Почта' }).toLowerCase();
  const user = await one('SELECT * FROM users WHERE email=$1', [email]);
  const ok = user && typeof req.body.password === 'string' && (await bcrypt.compare(req.body.password, user.password_hash));
  if (!ok) fail(401, 'Неверная почта или пароль');

  let joinedWorkspaceId = null;
  if (typeof req.body.invite === 'string') joinedWorkspaceId = await acceptInvite(user.id, req.body.invite);

  setSessionCookie(res, user.id);
  res.json({ user: publicUser(user), workspaces: await listWorkspaces(user.id), joinedWorkspaceId });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, h(async (req, res) => {
  res.json({ user: publicUser(req.user), workspaces: await listWorkspaces(req.user.id) });
}));

router.patch('/me', requireAuth, h(async (req, res) => {
  const name = str(req.body.name, { max: 80, field: 'Имя' });
  const color = req.body.color;
  if (color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(color)) fail(400, 'Некорректный цвет');

  if (req.body.newPassword !== undefined) {
    checkPassword(req.body.newPassword);
    const u = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await bcrypt.compare(String(req.body.currentPassword || ''), u.password_hash))) fail(400, 'Текущий пароль указан неверно');
    await one('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id', [await bcrypt.hash(req.body.newPassword, 10), req.user.id]);
  }

  const locale = req.body.locale !== undefined ? normLocale(req.body.locale) : null;
  const emailNotify = typeof req.body.email_notify === 'boolean' ? req.body.email_notify : null;
  const user = await one(
    `UPDATE users SET name = COALESCE($1, name), color = COALESCE($2, color), locale = COALESCE($3, locale),
            email_notify = COALESCE($4, email_notify) WHERE id=$5 RETURNING *`,
    [name || null, color || null, locale, emailNotify, req.user.id],
  );
  res.json({ user: publicUser(user) });
}));

export default router;
