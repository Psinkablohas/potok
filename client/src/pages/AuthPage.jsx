import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { Field, Spinner } from '../components/ui.jsx';
import { t, lang, LANGUAGES, setLanguage } from '../i18n/index.js';

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-lg ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#4F46E5" />
        <path d="M8 11h11M8 16h16M8 21h8" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {t("Поток")}
    </span>
  );
}

export default function AuthPage({ mode }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(mode === 'invite' ? 'register' : mode);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/invites/${token}`),
    enabled: !!token,
    retry: false,
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = current === 'register' ? { ...form, locale: lang } : { email: form.email, password: form.password };
      if (token) body.invite = token;
      const res = await api.post(`/auth/${current}`, body);
      qc.setQueryData(['me'], { user: res.user, workspaces: res.workspaces });
      const target = res.joinedWorkspaceId || res.workspaces[0]?.id;
      navigate(target ? `/w/${target}` : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-full flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[44%] flex-col justify-between bg-primary p-12 text-primary-ink">
        <Logo />
        <div>
          <h2 className="text-3xl font-bold leading-tight">{t("Все задачи команды — в одном потоке")}</h2>
          <p className="mt-4 text-lg opacity-90 max-w-md">{t("Проекты, доски, календарь и график работ. Совместная работа в реальном времени, полностью на русском и без платных ограничений.")}</p>
        </div>
        <p className="text-sm opacity-75">{t("Списки · Доски · Календарь · Диаграмма Ганта · Уведомления")}</p>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <select
          className="absolute right-4 top-4 h-9 rounded-full border border-line bg-surface px-3 text-sm"
          value={lang}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Language"
        >
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <div className="w-full max-w-sm">
          <Logo className="lg:hidden mb-8" />
          {token && (
            <div className="mb-6 flex gap-3 rounded-xl bg-primary-soft p-4 text-sm">
              <Users className="h-5 w-5 text-primary shrink-0" />
              {invite.isLoading ? <Spinner className="h-4 w-4" /> : invite.error ? (
                <span className="text-danger">{invite.error.message}</span>
              ) : (
                <span>{invite.data.inviter ? t("{0} приглашает вас в пространство «{1}»", invite.data.inviter, invite.data.workspace_name) : t("Вас приглашают в пространство «{0}»", invite.data.workspace_name)}</span>
              )}
            </div>
          )}

          <h1 className="text-2xl font-semibold">{current === 'register' ? t("Создать аккаунт") : t("Вход")}</h1>
          <p className="mt-1 text-sm text-muted">
            {current === 'register' ? t("Уже есть аккаунт? ") : t("Ещё нет аккаунта? ")}
            {token ? (
              <button className="text-primary font-medium hover:underline" onClick={() => setCurrent(current === 'register' ? 'login' : 'register')}>
                {current === 'register' ? t("Войти") : t("Зарегистрироваться")}
              </button>
            ) : (
              <Link className="text-primary font-medium hover:underline" to={current === 'register' ? '/login' : '/register'}>
                {current === 'register' ? t("Войти") : t("Зарегистрироваться")}
              </Link>
            )}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            {current === 'register' && (
              <Field label={t("Имя и фамилия")} htmlFor="name">
                <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} required />
              </Field>
            )}
            <Field label={t("Рабочая почта")} htmlFor="email">
              <input id="email" type="email" className="input" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} required />
            </Field>
            <Field label={t("Пароль")} htmlFor="password" hint={current === 'register' ? t("Не короче 8 символов") : null}>
              <div className="relative">
                <input id="password" type={show ? 'text' : 'password'} className="input pr-11" autoComplete={current === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-muted hover:text-ink" aria-label={show ? t("Скрыть пароль") : t("Показать пароль")}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <button className="btn-primary w-full h-11" disabled={busy}>
              {busy && <Spinner className="h-4 w-4 text-primary-ink" />}
              {current === 'register' ? (token ? t("Создать аккаунт и присоединиться") : t("Создать аккаунт")) : (token ? t("Войти и присоединиться") : t("Войти"))}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
