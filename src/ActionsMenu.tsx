import { useState, useRef, useEffect } from 'react';
import { MoreVertical, type LucideIcon } from 'lucide-react';

export interface ActionItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger';
  hidden?: boolean;
  disabled?: boolean;
}

/**
 * Menu azioni a tendina (⋮). Raccoglie le azioni di un'entità
 * (es. Storico, Modifica, Sposta nel cestino) in un unico pulsante.
 */
export function ActionsMenu({
  items,
  align = 'right',
  buttonClassName = '',
  title = 'Azioni',
}: {
  items: ActionItem[];
  align?: 'left' | 'right';
  buttonClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const visible = items.filter(i => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors ${buttonClassName}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50`}
          role="menu"
        >
          {visible.map((item, idx) => {
            const Icon = item.icon;
            const danger = item.variant === 'danger';
            return (
              <button
                key={idx}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onClick(); }}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
