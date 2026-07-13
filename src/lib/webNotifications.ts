// Notifiche browser in-page per le azioni AI in attesa (notifica out-of-band).
// Funziona finché la tab della piattaforma è aperta (anche in background): la subscription
// Realtime che alimenta il badge "Azioni AI" fa da innesco (vedi Layout.tsx). Niente Service
// Worker / Web Push — quello servirebbe per la tab CHIUSA, fuori da questo step. Richiede HTTPS
// (ok su Vercel/localhost).

import { supabase } from './supabase';

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

/**
 * Salva la preferenza anche sul profilo (DB), così l'intento on/off sopravvive al cambio
 * dispositivo / pulizia dati del sito. Il PERMESSO del browser resta per-dispositivo. Best-effort:
 * se fallisce, la preferenza locale (localStorage) resta comunque valida per questo browser.
 */
export async function salvaPreferenzaNotificheDB(on: boolean): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_profiles').update({ mcp_notifiche_web: on }).eq('user_id', user.id);
  } catch {
    // Best-effort: la preferenza locale è già stata scritta, non blocchiamo l'utente.
  }
}

/**
 * All'avvio: allinea la preferenza locale (localStorage) a quella salvata sul profilo (DB), così
 * l'intento segue l'utente tra dispositivi/sessioni.
 *  - DB = true/false → è la fonte di verità: rispecchialo in locale.
 *  - DB = NULL (mai impostata) → se in locale era attiva (utente pre-esistente), MIGRA quella
 *    preferenza sul DB invece di spegnerla; altrimenti lascia lo stato locale invariato.
 * Il permesso del browser non viene toccato (è per-dispositivo).
 */
export async function sincronizzaPreferenzaNotificheDaDB(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('mcp_notifiche_web')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) return;
    const dbPref = data.mcp_notifiche_web as boolean | null;
    if (dbPref === null) {
      if (localStorage.getItem(PREF_KEY) === '1') await salvaPreferenzaNotificheDB(true);
      return;
    }
    setNotifichePreferenza(dbPref);
  } catch {
    // Best-effort.
  }
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
