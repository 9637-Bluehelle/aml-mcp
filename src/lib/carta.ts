// Estremi della carta in uso e calcoli sulla scadenza.
//
// Stanno qui e non in un componente perché li usano sia il riquadro in Piano &
// Fatturazione sia l'avviso di carta in scadenza, e la soglia dell'avviso deve
// essere una sola: due definizioni divergenti darebbero due messaggi diversi
// nella stessa pagina.

export interface Carta {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

/**
 * Uno dei metodi di pagamento registrati sul customer Stripe.
 *
 * NON solo carte: dal portale Stripe si registrano anche Satispay, Amazon Pay,
 * PayPal e altri. `carta` è valorizzata soltanto per le carte — è l'unica
 * famiglia che scade, e su cui hanno senso i calcoli qui sotto.
 *
 * `id` è il PaymentMethod: è ciò che serve per eleggerne un altro a predefinito.
 */
export interface MetodoPagamento {
  id: string;
  /** Tipo Stripe: 'card', 'paypal', 'satispay', 'amazon_pay', 'sepa_debit', … */
  tipo: string | null;
  carta: Carta | null;
  /** Riga di dettaglio, se c'è: '•••• 4242', l'account PayPal, … */
  dettaglio: string | null;
  predefinito: boolean;
}

/** Da quanti giorni prima segnalare la scadenza. */
export const SOGLIA_AVVISO_GIORNI = 30;

/**
 * La carta in uso viene tenuta in cache per la sessione: è una chiamata a
 * Stripe e l'avviso di scadenza la rileggerebbe a ogni cambio di schermata.
 *
 * La chiave sta qui perché chi *cambia* la carta non è chi la mostra: senza
 * invalidare, dopo una sostituzione l'avviso continuerebbe a segnalare la
 * scadenza della carta vecchia per tutto il resto della sessione.
 */
export const CHIAVE_CACHE_CARTA = 'carta_in_uso';

/** Da chiamare ogni volta che la carta in uso cambia. */
export function invalidaCacheCarta(): void {
  try { sessionStorage.removeItem(CHIAVE_CACHE_CARTA); } catch { /* storage non disponibile */ }
}

// Stripe restituisce il brand in minuscolo ('visa', 'amex', ...): qui le forme
// che gli utenti riconoscono. Per i brand non elencati usiamo il valore grezzo
// con l'iniziale maiuscola, così un metodo nuovo resta comunque leggibile.
const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

function nomeBrand(brand: string | null): string {
  if (!brand) return 'Carta';
  return BRAND_LABEL[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

// Nomi dei metodi che non sono carte. Stripe li identifica con il tipo in
// minuscolo e con gli underscore ('amazon_pay'), che non è da mostrare così.
const TIPO_LABEL: Record<string, string> = {
  paypal: 'PayPal',
  satispay: 'Satispay',
  amazon_pay: 'Amazon Pay',
  revolut_pay: 'Revolut Pay',
  cashapp: 'Cash App Pay',
  klarna: 'Klarna',
  link: 'Link',
  alipay: 'Alipay',
  wechat_pay: 'WeChat Pay',
  sepa_debit: 'Addebito SEPA',
  bacs_debit: 'Addebito Bacs',
  au_becs_debit: 'Addebito BECS',
  us_bank_account: 'Conto bancario',
};

/**
 * Nome leggibile del metodo: la marca per le carte, il nome del servizio per
 * tutto il resto.
 *
 * I tipi che Stripe aggiungerà in futuro non sono in elenco: per quelli
 * ripieghiamo sul tipo grezzo reso presentabile, così un metodo nuovo resta
 * riconoscibile senza aspettare un rilascio della piattaforma.
 */
export function nomeMetodo(m: Pick<MetodoPagamento, 'tipo' | 'carta'>): string {
  if (m.carta) return nomeBrand(m.carta.brand);
  if (!m.tipo) return 'Metodo di pagamento';
  return TIPO_LABEL[m.tipo]
    || m.tipo.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** "09/27", oppure null se la scadenza non è nota. */
export function scadenza(c: Carta): string | null {
  if (!c.expMonth || !c.expYear) return null;
  return `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`;
}

/**
 * Giorni che mancano alla scadenza; negativo se è già scaduta, null se la data
 * non è nota. La carta è valida per TUTTO il mese indicato, quindi il confronto
 * è sull'ultimo giorno di quel mese.
 */
export function giorniAllaScadenza(c: Carta): number | null {
  if (!c.expMonth || !c.expYear) return null;
  const ultimoGiorno = new Date(c.expYear, c.expMonth, 0, 23, 59, 59, 999);
  const oggi = new Date();
  return Math.floor((ultimoGiorno.getTime() - oggi.getTime()) / 86_400_000);
}

/** true se la carta è già scaduta. */
export function scaduta(c: Carta): boolean {
  const g = giorniAllaScadenza(c);
  return g !== null && g < 0;
}
