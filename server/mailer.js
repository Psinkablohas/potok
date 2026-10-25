import nodemailer from 'nodemailer';
import { one } from './db.js';
import { st } from './i18n.js';

// Почта включается переменными окружения SMTP_*. Без них письма просто не отправляются.
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL, BREVO_API_KEY } = process.env;
// SMTP_HOST=log — письма не отправляются, а пишутся в журнал (для проверки)
const transport = SMTP_HOST === 'log'
  ? nodemailer.createTransport({ jsonTransport: true })
  : SMTP_HOST
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
  : null;

// Brevo отправляет через HTTPS — работает даже там, где почтовые порты SMTP закрыты
const brevo = BREVO_API_KEY
  ? {
    async sendMail({ from, to, subject, text, html }) {
      const m = String(from || '').match(/^(.*)<(.+)>$/);
      const sender = m ? { name: m[1].trim() || 'Potok', email: m[2].trim() } : { name: 'Potok', email: from };
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
      return {};
    },
  }
  : null;

const mailer = brevo || transport;
export const mailEnabled = () => !!mailer;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseUrl = () => (APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Письмо-уведомление. Отправка не блокирует запрос и не роняет его при ошибке почты.
 */
export function sendNotificationEmail({ userId, workspaceId, actorId, taskId, type, data = {} }) {
  if (!mailer) return;
  (async () => {
    const user = await one('SELECT email, name, locale, email_notify FROM users WHERE id=$1', [userId]);
    if (!user || !user.email_notify) return;
    const actor = actorId ? await one('SELECT name FROM users WHERE id=$1', [actorId]) : null;
    const who = actor?.name || st('mail.someone', user.locale);
    const subject = type === 'status'
      ? st('mail.status', user.locale, who, data.projectName || '')
      : `${st(`mail.${type}`, user.locale, who)}: ${data.title || ''}`;
    const link = taskId
      ? `${baseUrl()}/w/${workspaceId}?task=${taskId}`
      : data.projectId ? `${baseUrl()}/w/${workspaceId}/projects/${data.projectId}/overview` : `${baseUrl()}/w/${workspaceId}/inbox`;
    const excerpt = data.excerpt ? String(data.excerpt).replace(/@\[([^\]]+)\]\(\d+\)/g, '@$1') : '';

    const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:bold;font-size:16px;color:#4F46E5">${user.locale === 'uk' ? 'Потік' : user.locale === 'ru' ? 'Поток' : 'Potok'}</td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 8px;font-size:15px">${esc(subject)}</p>
        ${data.title && type !== 'status' ? `<p style="margin:0 0 12px;font-size:18px;font-weight:bold">${esc(data.title)}</p>` : ''}
        ${excerpt ? `<p style="margin:0 0 16px;padding:12px;background:#f8fafc;border-radius:8px;color:#334155;white-space:pre-wrap">${esc(excerpt)}</p>` : ''}
        <a href="${esc(link)}" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">${esc(st('mail.open', user.locale))}</a>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${esc(st('mail.footer', user.locale))}</td></tr>
    </table>
  </td></tr></table></body></html>`;

    const info = await mailer.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to: user.email,
      subject,
      text: `${subject}\n${data.title && type !== 'status' ? `${data.title}\n` : ''}${excerpt ? `\n${excerpt}\n` : ''}\n${link}\n\n${st('mail.footer', user.locale)}`,
      html,
    });
    if (SMTP_HOST === 'log') console.log('ПИСЬМО:', JSON.parse(info.message).subject, '→', user.email);
  })().catch((err) => console.error('Не удалось отправить письмо:', err.message));
}
