import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
  exiting?: boolean;
}

interface ConfirmOptions {
  message: ReactNode;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLE_MAP = {
  success: 'bg-green-50 border-green-400 text-green-800',
  error: 'bg-red-50 border-red-400 text-red-800',
  warning: 'bg-amber-50 border-amber-400 text-amber-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800',
};

const ICON_STYLE_MAP = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const CLOSE_BTN_MAP = {
  success: 'text-green-400 hover:text-green-600',
  error: 'text-red-400 hover:text-red-600',
  warning: 'text-amber-400 hover:text-amber-600',
  info: 'text-blue-400 hover:text-blue-600',
};

const DURATION = 4000;

function ToastItem({ toast: t, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const Icon = ICON_MAP[t.type];

  // Ogni toast ha il PROPRIO timer di auto-dismiss (indipendente dagli altri): così N toast
  // ravvicinati scompaiono ciascuno dopo la sua durata, non in coda uno alla volta. Quando il
  // toast viene marcato `exiting` (es. sostituito da uno nuovo dello stesso tipo) il timer si
  // azzera per non richiamare onClose due volte.
  useEffect(() => {
    if (t.exiting) return;
    const timer = setTimeout(() => onClose(t.id), t.duration ?? DURATION);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, t.exiting, onClose]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-md w-full transition-all duration-300 toast-enter ${STYLE_MAP[t.type]} ${t.exiting ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${ICON_STYLE_MAP[t.type]}`} />
      <p className="text-sm flex-1 whitespace-pre-line">{t.message}</p>
      <button onClick={() => onClose(t.id)} className={`flex-shrink-0 ${CLOSE_BTN_MAP[t.type]}`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

const CONFIRM_VARIANT_STYLES = {
  danger: {
    icon: XCircle,
    iconClass: 'text-red-500',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    headerBg: 'bg-red-50',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    headerBg: 'bg-amber-50',
  },
  info: {
    icon: Info,
    iconClass: 'text-blue-500',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    headerBg: 'bg-blue-50',
  },
};

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { message, title, confirmText = 'Conferma', cancelText = 'Annulla', variant = 'warning' } = options;
  const style = CONFIRM_VARIANT_STYLES[variant];
  const Icon = style.icon;
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in">
        <div className={`flex items-center gap-3 px-5 py-4 ${style.headerBg}`}>
          <Icon className={`w-6 h-6 ${style.iconClass}`} />
          <h3 className="font-semibold text-gray-900">{title || 'Conferma'}</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600 whitespace-pre-line">{message}</p>
        </div>
        <div className="flex justify-end gap-3 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${style.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  // Specchio dei toast correnti: serve ad addToast per chiudere quelli dello stesso tipo senza
  // doverli mettere tra le sue dipendenze (così la reference di `toast` resta stabile, vedi sotto).
  const toastsRef = useRef<Toast[]>([]);
  toastsRef.current = toasts;

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration?: number) => {
    // Regola "uno per tipo": un nuovo toast chiude quello dello stesso tipo già a schermo (resta
    // solo il più recente). Tipi diversi (success/error/warning/info) restano e coesistono.
    toastsRef.current.forEach(t => {
      if (t.type === type && !t.exiting) removeToast(t.id);
    });
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, [removeToast]);

  // Memoizzato su `addToast` (stabile): senza memo, `toast` sarebbe una nuova
  // reference a ogni render del provider. Dato che tutto l'albero ri-renderizza
  // su eventi auth (es. TOKEN_REFRESHED al ritorno sull'app), una reference
  // instabile fa ripartire i fetch dei consumer che hanno `toast` tra le
  // dipendenze (es. lo spinner del Cestino).
  const toast = useMemo(() => ({
    success: (message: string, duration?: number) => addToast(message, 'success', duration),
    error: (message: string, duration?: number) => addToast(message, 'error', duration),
    warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
    info: (message: string, duration?: number) => addToast(message, 'info', duration),
  }), [addToast]);

  const confirmFn = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      setConfirmState({ options: opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirmState?.resolve(true);
    setConfirmState(null);
  }, [confirmState]);

  const handleCancel = useCallback(() => {
    confirmState?.resolve(false);
    setConfirmState(null);
  }, [confirmState]);

  // Anche il value del context è memoizzato: così un re-render del provider
  // (es. comparsa/sparizione di un toast) non propaga un nuovo oggetto a tutti
  // i consumer, evitando re-render/fetch a catena.
  const contextValue = useMemo(() => ({ toast, confirm: confirmFn }), [toast, confirmFn]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast container */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onClose={removeToast} />
          </div>
        ))}
      </div>
      {/* Confirm dialog */}
      {confirmState && (
        <ConfirmDialog
          options={confirmState.options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useConfirm must be used within ToastProvider');
  return ctx.confirm;
}
