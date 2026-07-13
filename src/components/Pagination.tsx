import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  /** Pagina corrente (1-based) */
  page: number;
  /** Numero totale di pagine */
  pageCount: number;
  onPageChange: (page: number) => void;
}

/**
 * Controllo di paginazione riutilizzabile (client-side).
 * Mostra Precedente / numeri di pagina con ellissi / Successivo.
 * Non renderizza nulla se c'è una sola pagina.
 */
export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  // Costruisce l'elenco di pagine da mostrare: prima, ultima, e una finestra
  // intorno alla corrente, con ellissi ('…') per i buchi.
  const pages: (number | '…')[] = [];
  const window = 1; // pagine mostrate a sinistra/destra della corrente
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - window && p <= page + window)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  const btnBase =
    'min-w-[2rem] h-8 px-2 flex items-center justify-center rounded-md text-sm font-medium transition-colors';

  return (
    <nav className="flex items-center justify-center gap-1 pt-4" aria-label="Paginazione">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent`}
        title="Pagina precedente"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-gray-400 select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btnBase} ${
              p === page
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        className={`${btnBase} text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent`}
        title="Pagina successiva"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
