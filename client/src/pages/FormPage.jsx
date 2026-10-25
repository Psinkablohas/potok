import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Field, PageLoader, Spinner } from '../components/ui.jsx';
import { Logo } from './AuthPage.jsx';
import { t } from '../i18n/index.js';

// Публичная форма заявки: работает без входа в аккаунт
export default function FormPage() {
  const { token } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['public-form', token], queryFn: () => api.get(`/forms/${token}`), retry: false });
  const [form, setForm] = useState({ title: '', description: '', name: '', email: '', fields: {} });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (isLoading) return <PageLoader />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post(`/forms/${token}`, form);
      setSent(true);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const setField = (id, v) => setForm({ ...form, fields: { ...form.fields, [id]: v } });

  return (
    <div className="min-h-full bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        {error ? (
          <div className="card p-8 text-center">
            <h1 className="text-lg font-semibold">{t("Форма недоступна")}</h1>
            <p className="mt-2 text-sm text-muted">{error.message}</p>
          </div>
        ) : sent ? (
          <div className="card p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 text-xl font-semibold">{t("Заявка отправлена")}</h1>
            <p className="mt-2 text-sm text-muted">{t("Спасибо! Команда проекта «{0}» уже видит её.", data.project_name)}</p>
            <button className="btn-secondary mt-6" onClick={() => { setForm({ title: '', description: '', name: form.name, email: form.email, fields: {} }); setSent(false); }}>{t("Отправить ещё одну")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="card overflow-hidden">
            <div className="h-2" style={{ background: data.project_color }} />
            <div className="p-6 sm:p-8 space-y-5">
              <div>
                <h1 className="text-2xl font-semibold">{data.title}</h1>
                {data.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.description}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Ваше имя")} htmlFor="ff-name"><input id="ff-name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label={t("Почта для ответа")} htmlFor="ff-email"><input id="ff-email" type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              </div>
              <Field label={t("Тема заявки *")} htmlFor="ff-title"><input id="ff-title" required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label={t("Подробности")} htmlFor="ff-desc"><textarea id="ff-desc" rows={5} className="input h-auto py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              {data.fields.map((f) => (
                <Field key={f.id} label={f.name} htmlFor={`ff-${f.id}`}>
                  {f.type === 'select' ? (
                    <select id={`ff-${f.id}`} className="input" value={form.fields[f.id] || ''} onChange={(e) => setField(f.id, e.target.value)}>
                      <option value="">{t("Не выбрано")}</option>
                      {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : (
                    <input id={`ff-${f.id}`} className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={form.fields[f.id] || ''} onChange={(e) => setField(f.id, e.target.value)} />
                  )}
                </Field>
              ))}
              {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
              <button className="btn-primary h-11 w-full" disabled={busy || !form.title.trim()}>{busy && <Spinner className="h-4 w-4 text-primary-ink" />}{t("Отправить заявку")}</button>
            </div>
          </form>
        )}
        <div className="mt-6 flex justify-center opacity-70"><Logo className="text-sm" /></div>
      </div>
    </div>
  );
}
