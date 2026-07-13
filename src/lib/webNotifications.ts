// Notifiche browser in-page per le azioni AI in attesa (notifica out-of-band).
// Funziona finché la tab della piattaforma è aperta (anche in background): la subscription
// Realtime che alimenta il badge "Azioni AI" fa da innesco (vedi Layout.tsx). Niente Service
// Worker / Web Push — quello servirebbe per la tab CHIUSA, fuori da questo step. Richiede HTTPS
// (ok su Vercel/localhost).

const PREF_KEY = 'mcp_web_notifications';

export function notificheSupportate(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permessoNotifiche(): NotificationPermission {
  return notificheSupportate() ? Notification.permission : 'denied';
}

/**
 * Preferenza utente (localStorage), DISTINTA dal permesso browser: l'utente può aver concesso il
 * permesso ma aver spento le notifiche dal toggle. Le notifiche partono solo se entrambe sono ok.
 */
export function notificheAbilitate(): boolean {
  return notificheSupportate() && localStorage.getItem(PREF_KEY) === '1' && Notification.permission === 'granted';
}

export function setNotifichePreferenza(on: boolean): void {
  if (on) localStorage.setItem(PREF_KEY, '1');
  else localStorage.removeItem(PREF_KEY);
}

/** Va chiamata da un gesto utente (click del toggle). Ritorna il permesso risultante. */
export async function richiediPermessoNotifiche(): Promise<NotificationPermission> {
  if (!notificheSupportate()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

interface NotificaOpts {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}

/**
 * Mostra una notifica SOLO se: supportata + preferenza attiva + permesso granted + la tab NON è in
 * primo piano (inutile notificare qualcosa che l'utente sta già guardando: quando è sulla
 * piattaforma compare già la modale). Il click porta la tab in primo piano ed esegue onClick
 * (es. vai alla schermata Azioni AI).
 */
export function mostraNotificaAI({ title, body, tag, onClick }: NotificaOpts): void {
  if (!notificheAbilitate()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      try { window.focus(); } catch { /* alcuni browser non permettono il focus programmatico */ }
      n.close();
      onClick?.();
    };
  } catch {
    // Alcuni browser lanciano se chiamato in un contesto non valido: ignora silenziosamente.
  }
}
