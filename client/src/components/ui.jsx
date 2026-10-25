import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Loader2 } from 'lucide-react';

export function Avatar({ user, size = 24, className = '' }) {
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      title={user.name}
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none ${className}`}
      style={{ width: size, height: size, background: user.color, fontSize: Math.max(10, size * 0.4) }}
    >
      {initials}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-muted ${className}`} aria-label="Загрузка" />;
}

export function PageLoader() {
  return <div className="flex h-full items-center justify-center p-10"><Spinner className="h-6 w-6" /></div>;
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      {Icon && <div className="mb-4 rounded-2xl bg-primary-soft p-4"><Icon className="h-7 w-7 text-primary" /></div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Круглая галочка завершения задачи
export function CompleteToggle({ done, onToggle, size = 'md', disabled }) {
  const s = size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`group relative inline-flex ${s} shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150
        before:absolute before:-inset-3 before:content-['']
        ${done ? 'border-success bg-success text-white' : 'border-muted/60 text-transparent hover:border-success hover:text-success'}`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

/**
 * Всплывающее окно, привязанное к элементу. Рендерится в портал,
 * чтобы не обрезалось прокручиваемыми контейнерами.
 */
export function Popover({ anchor, open, onClose, children, width = 260, align = 'start' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight || 300;
      const w = Math.min(width, window.innerWidth - 16);
      let left = align === 'end' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
      setPos({ top: Math.max(8, top), left, width: w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed z-pop card shadow-pop p-1.5 animate-pop-in max-h-[min(420px,70vh)] overflow-y-auto scrollbar-thin"
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

// Кнопка + всплывающее меню
export function Dropdown({ trigger, children, width, align }) {
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger({ ref: setAnchor, open, toggle: () => setOpen((o) => !o) })}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={width} align={align}>
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </Popover>
    </>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative card shadow-pop w-full animate-pop-in rounded-b-none sm:rounded-xl max-h-[92vh] flex flex-col"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ColorDot({ color, className = 'h-2.5 w-2.5' }) {
  return <span className={`inline-block rounded-[4px] shrink-0 ${className}`} style={{ background: color }} />;
}

export function Field({ label, children, hint, htmlFor }) {
  return (
    <div>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex rounded-lg bg-subtle p-0.5 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium transition-colors duration-150
            ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.icon && <o.icon className="h-4 w-4" />}
          <span className={o.icon ? 'hidden sm:inline' : ''}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
