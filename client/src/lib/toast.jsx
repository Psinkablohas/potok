import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { t } from '../i18n/index.js';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, { type = 'success', action, duration = 4000 } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list.slice(-3), { id, message, type, action }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), duration);
  }, []);

  const close = (id) => setItems((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-toast flex flex-col gap-2 w-[min(420px,calc(100vw-32px))]" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} role="status" className="animate-pop-in flex items-center gap-3 rounded-xl bg-ink text-bg px-4 py-3 shadow-pop">
            {item.type === 'error' ? <AlertCircle className="h-5 w-5 text-red-400 shrink-0" /> : <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />}
            <span className="text-sm flex-1">{item.message}</span>
            {item.action && (
              <button className="text-sm font-semibold underline underline-offset-2" onClick={() => { item.action.onClick(); close(item.id); }}>
                {item.action.label}
              </button>
            )}
            <button onClick={() => close(item.id)} aria-label={t("Закрыть")} className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
