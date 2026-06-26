import { useEffect, useState, useCallback, ReactNode} from 'react';
import { Card } from './Card';
import { AlertTriangle, CheckCircle, ExternalLink} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppData } from './RT2AdeguataVerifica';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Spinner } from './cliente-wizard/modals/Spinner';
import { useStudio } from '../lib/StudioContext';
import { AlertCountsContext, useAlertCounts } from './alertCountsContext';
import type { AlertCountsType } from './alertCountsContext';
import { AlertContext, useSystemAlerts } from './alertContext';

// Ri-esportati per retrocompatibilità: context e hook vivono nei moduli foglia
// ./alertCountsContext e ./alertContext (stabili in HMR). Vedi quei file.
export { useAlertCounts, useSystemAlerts };

interface Alert {
  id: string;
  tipo_rt: string;
  alert_id: string;
  riferimento_id: string | null;
  messaggio: string;
  priorita: string;
  status: string;
  created_at: string;
}

// ============================================================================
// [DEPRECATED 2026-04-22] Logica di generazione alert migrata lato DB.
// Vedi supabase/migrations/20260422000000_alert_db_logic.sql
// - Trigger Postgres gestiscono creazione/cleanup automatico su INSERT/UPDATE
// - RPC check_alerts(studio_id) gestisce il sync completo (bottone "Controlla Alert")
// - RPC ensure_daily_alert_check(studio_id) invocata al mount (vedi Layout.tsx)
// Il codice sotto è lasciato per riferimento ma non viene più eseguito.
// ============================================================================
/*
// Errori attesi dopo un logout mentre i check alert sono ancora in corso:
// - 42501: RLS violation (auth.uid() = null invalida la policy)
// - 401/PGRST301: JWT invalido/scaduto
// In questi casi interrompiamo il loop senza rumore in console.
function isSessionEnded(error: any): boolean {
  if (!error) return false;
  return error.code === '42501' || error.code === 'PGRST301' || error.status === 401;
}


async function cleanupObsoleteAlerts(_idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;

  let alertQuery = supabase
    .from('alert')
    .select('id, tipo_rt, riferimento_id');
  if (studioId) alertQuery = alertQuery.eq('studio_id', studioId);
  const { data: allAlerts, error } = await alertQuery;

  if (error || !allAlerts) return 0;

  for (const alert of allAlerts) {
    let shouldDelete = false;

    // CASO A: Alert legati ai CLIENTII (RT4 = Senza Incarichi, RT2-DRAFT = In Bozza)
    if (alert.tipo_rt === 'RT4' || alert.tipo_rt === 'RT2-DRAFT') {
      const { data: cliente } = await supabase
        .from('clienti')
        .select('id, status, archiviato')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!cliente) {
        // 1. Il cliente è stato CANCELLATO
        shouldDelete = true;
      } else if (cliente.archiviato) {
        // Cliente archiviato: rimuovi alert
        shouldDelete = true;
      } else if (alert.tipo_rt === 'RT4') {
        // 2. Controllo se ora ha incarichi (RT4 non più necessario)
        const { data: incarichi } = await supabase
          .from('incarichi')
          .select('id')
          .eq('cliente_id', alert.riferimento_id)
          .limit(1);
        if (incarichi && incarichi.length > 0) shouldDelete = true;
      } else if (alert.tipo_rt === 'RT2-DRAFT' && cliente.status !== 'draft') {
        // 3. Il cliente non è più in BOZZA
        shouldDelete = true;
      }
    }

    // CASO B: Alert legati agli INCARICHI (RT2 = Senza Valutazione)
    if (alert.tipo_rt === 'RT2') {
      const { data: incarico } = await supabase
        .from('incarichi')
        .select('id, archiviato')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!incarico) {
        // 1. L'incarico è stato CANCELLATO (o il suo cliente è stato cancellato in cascade)
        shouldDelete = true;
      } else if (incarico.archiviato) {
        // Incarico archiviato: rimuovi alert
        shouldDelete = true;
      } else {
        // 2. Controllo se ora ha una valutazione del rischio
        const { data: valutazione } = await supabase
          .from('valutazioni_rischio')
          .select('id')
          .eq('incarico_id', alert.riferimento_id)
          .limit(1);
        if (valutazione && valutazione.length > 0) shouldDelete = true;
      }
    }

    // CASO C-bis: Alert scadenza autovalutazione (RT1-SCADENZA)
    if (alert.tipo_rt === 'RT1-SCADENZA') {
      const { data: auto } = await supabase
        .from('autovalutazioni')
        .select('id, valid_until, status')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!auto) {
        shouldDelete = true;
      } else if (auto.status !== 'current' && auto.status !== 'expired') {
        // Archiviata o eliminata — non serve più l'alert
        shouldDelete = true;
      } else if (auto.status === 'expired') {
        // Se esiste una current più recente, la expired è stata sostituita
        const { data: newer } = await supabase
          .from('autovalutazioni')
          .select('id')
          .eq('status', 'current')
          .limit(1);
        if (newer && newer.length > 0) shouldDelete = true;
      } else if (auto.valid_until) {
        const scadenzaDate = new Date(auto.valid_until);
        const today = new Date();
        const isScaduta = scadenzaDate < today;
        const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= 30 * 24 * 3600 * 1000;
        if (!isScaduta && !isVicina) shouldDelete = true;
      }
    }

    // CASO D: Alert scadenza documenti (DOC-SCADENZA)
    if (alert.tipo_rt === 'DOC-SCADENZA') {
      const { data: doc } = await supabase
        .from('documenti')
        .select('id, tipologia, incarico_id, data_scadenza, created_at')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!doc) {
        shouldDelete = true;
      } else if (doc.incarico_id) {
        // Controlla se l'incarico è archiviato
        const { data: incDoc } = await supabase.from('incarichi').select('archiviato').eq('id', doc.incarico_id).maybeSingle();
        if (incDoc?.archiviato) shouldDelete = true;
      }
      if (!shouldDelete && doc) {
        // Controlla se questo documento è stato rinnovato (esiste un doc con rinnovo_di = questo id)
        const { data: newerDoc } = await supabase
          .from('documenti')
          .select('id')
          .eq('rinnovo_di', doc.id)
          .limit(1);

        if (newerDoc && newerDoc.length > 0) {
          shouldDelete = true;
        } else if (doc.data_scadenza) {
          const scadenzaDate = new Date(doc.data_scadenza);
          const today = new Date();
          const isScaduta = scadenzaDate < today;
          const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= 30 * 24 * 3600 * 1000;
          if (!isScaduta && !isVicina) shouldDelete = true;
        } else {
          // data_scadenza rimossa dal documento
          shouldDelete = true;
        }
      }
    }

    // CASO C: Alert scadenza verifica (RT2-SCADENZA)
    if (alert.tipo_rt === 'RT2-SCADENZA') {
      const { data: incarico } = await supabase
        .from('incarichi')
        .select('id, data_inizio, data_fine, status, archiviato')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!incarico) {
        shouldDelete = true;
      } else if (incarico.archiviato) {
        shouldDelete = true;
      } else if (incarico.data_fine || incarico.status !== 'active') {
        // Incarico chiuso: alert non più necessario
        shouldDelete = true;
      } else {
        // Ricalcola scadenza: se ora è > 60 giorni, rimuovi
        const { data: ultVal } = await supabase
          .from('valutazioni_rischio')
          .select('data_valutazione, rischio_effettivo, prossimo_controllo')
          .eq('incarico_id', incarico.id)
          .order('data_valutazione', { ascending: false })
          .limit(1)
          .maybeSingle();

        let scadenzaDate: Date | null = null;
        if (ultVal) {
          scadenzaDate = ultVal.prossimo_controllo
            ? new Date(ultVal.prossimo_controllo)
            : (() => { const d = new Date(ultVal.data_valutazione); d.setMonth(d.getMonth() + classificaRischioEffettivo(ultVal.rischio_effettivo).periodicitaControlloMesi); return d; })();
        } else if (incarico.data_inizio) {
          scadenzaDate = new Date(incarico.data_inizio);
          scadenzaDate.setMonth(scadenzaDate.getMonth() + 36);
        }
        if (scadenzaDate) {
          const today = new Date();
          const isScaduta = scadenzaDate < today;
          const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= 30 * 24 * 3600 * 1000;
          if (!isScaduta && !isVicina) shouldDelete = true;
        }
      }
    }

    // CASO E: Alert scadenza controlli costanti (RT4-SCADENZA)
    if (alert.tipo_rt === 'RT4-SCADENZA') {
      const { data: incarico } = await supabase
        .from('incarichi')
        .select('id, data_fine, status, archiviato')
        .eq('id', alert.riferimento_id)
        .maybeSingle();

      if (!incarico) {
        shouldDelete = true;
      } else if (incarico.archiviato) {
        shouldDelete = true;
      } else if (incarico.data_fine || incarico.status !== 'active') {
        shouldDelete = true;
      } else {
        // Controlla se l'ultimo controllo ha ancora una scadenza imminente
        const { data: ctrl } = await supabase
          .from('controlli_costanti')
          .select('prossima_scadenza')
          .eq('incarico_id', incarico.id)
          .order('data_controllo', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ctrl || !ctrl.prossima_scadenza) {
          shouldDelete = true;
        } else {
          const scadenzaDate = new Date(ctrl.prossima_scadenza);
          const today = new Date();
          const isScaduta = scadenzaDate < today;
          const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= 30 * 24 * 3600 * 1000;
          if (!isScaduta && !isVicina) shouldDelete = true;
        }
      }
    }

    // ESECUZIONE ELIMINAZIONE
    if (shouldDelete) {
      const { error: delError } = await supabase
        .from('alert')
        .delete()
        .eq('id', alert.id);
      if (!delError) count++;
    }
  }

  return count;
}

async function checkClientiInBozza(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  let q = supabase
    .from('clienti')
    .select('id, codice_cliente, ragione_sociale')
    .eq('status', 'draft')
    .or('archiviato.eq.false,archiviato.is.null');
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: clienti } = await q;

  if (!clienti) return 0;

  for (const cliente of clienti) {
    const { error } = await supabase.from('alert').upsert({
      tipo_rt: 'RT2-DRAFT',
      riferimento_id: cliente.id,
      user_id: idAzienda,
      alert_id: `DRAFT_${cliente.codice_cliente || cliente.id}`,
      messaggio: `Cliente "${cliente.ragione_sociale || cliente.codice_cliente}" in stato BOZZA`,
      priorita: 'medium',
      status: 'open'
    }, { onConflict: 'alert_id', ignoreDuplicates: true });
    if (error) {
      if (isSessionEnded(error)) return count;
      console.error('[Alert] upsert DRAFT error:', JSON.stringify(error));
    } else count++;
  }
  return count;
}

  async function checkClientiSenzaIncarichi(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;

  let q = supabase
    .from('clienti')
    .select('id, codice_cliente, ragione_sociale, status')
    .or('archiviato.eq.false,archiviato.is.null');
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: clienti, error: clientiError } = await q;

  if (clientiError || !clienti || clienti.length === 0) return 0;

  for (const cliente of clienti) {
    // I clienti in bozza hanno già l'alert RT2-DRAFT dedicato, skip RT4
    if (cliente.status === 'draft') continue;

    const { data: incarichi } = await supabase
      .from('incarichi')
      .select('id')
      .eq('cliente_id', cliente.id)
      .limit(1);

    // Se non ha incarichi, gestiamo l'alert
    if (!incarichi || incarichi.length === 0) {
      const { error } = await supabase.from('alert').upsert({
        tipo_rt: 'RT4',
        riferimento_id: cliente.id,
        user_id: idAzienda,
        alert_id: `CLI_${cliente.codice_cliente || cliente.id}`,
        messaggio: `Cliente "${cliente.ragione_sociale}" senza incarichi associati`,
        priorita: 'medium',
        status: 'open'
      }, { onConflict: 'alert_id', ignoreDuplicates: true });
      if (error) {
        if (isSessionEnded(error)) return count;
        console.error('[Alert] upsert error:', JSON.stringify(error));
      } else count++;
    }
  }
  return count;
}

  async function checkIncarichiSenzaValutazione(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  let q = supabase
    .from('incarichi')
    .select('id, codice_incarico, cliente_id, clienti(ragione_sociale)')
    .or('archiviato.eq.false,archiviato.is.null');
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: incarichi } = await q;

  if (!incarichi) return 0;

  for (const incarico of incarichi) {
    const { data: valutazione } = await supabase
      .from('valutazioni_rischio')
      .select('id')
      .eq('incarico_id', incarico.id)
      .limit(1);

    if (!valutazione || valutazione.length === 0) {
      const { error } = await supabase.from('alert').upsert({
        tipo_rt: 'RT2',
        riferimento_id: incarico.id,
        user_id: idAzienda,
        alert_id: (incarico as any).codice_incarico || `INC_${incarico.id}`,
        messaggio: `Incarico cliente "${(incarico as any).clienti?.ragione_sociale}" senza valutazione`,
        priorita: 'high',
        status: 'open'
      }, { onConflict: 'alert_id', ignoreDuplicates: true });
      if (error) {
        if (isSessionEnded(error)) return count;
        console.error('[Alert] upsert RT2 error:', JSON.stringify(error));
      } else count++;
    }
  }
  return count;
}

async function checkIncarichiInScadenza(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  const ALERT_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 giorni
  const today = new Date();

  let q = supabase
    .from('incarichi')
    .select('id, codice_incarico, cliente_id, data_inizio, data_fine, status, clienti(ragione_sociale)')
    .eq('status', 'active')
    .or('archiviato.eq.false,archiviato.is.null')
    .is('data_fine', null);
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: incarichi } = await q;

  if (!incarichi) return 0;

  for (const inc of incarichi) {
    // Ultima valutazione rischio
    const { data: valutazioni } = await supabase
      .from('valutazioni_rischio')
      .select('data_valutazione, rischio_effettivo, prossimo_controllo')
      .eq('incarico_id', inc.id)
      .order('data_valutazione', { ascending: false })
      .limit(1);

    // Se non c'è nessuna valutazione, non genera alert di scadenza
    if (!valutazioni || valutazioni.length === 0) continue;

    const v = valutazioni[0];
    let scadenzaDate: Date | null = v.prossimo_controllo
      ? new Date(v.prossimo_controllo)
      : (() => { const d = new Date(v.data_valutazione); d.setMonth(d.getMonth() + classificaRischioEffettivo(v.rischio_effettivo).periodicitaControlloMesi); return d; })();

    if (!scadenzaDate) continue;

    const isScaduta = scadenzaDate < today;
    const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= ALERT_WINDOW_MS;
    if (!isScaduta && !isVicina) continue;

    const ragSoc = (inc as any).clienti?.ragione_sociale ?? inc.cliente_id;
    const dataStr = scadenzaDate.toLocaleDateString('it-IT');
    const messaggio = isScaduta
      ? `Verifica incarico ${(inc as any).codice_incarico} (${ragSoc}) SCADUTA il ${dataStr}`
      : `Verifica incarico ${(inc as any).codice_incarico} (${ragSoc}) in scadenza il ${dataStr}`;

    const { error } = await supabase.from('alert').upsert({
      tipo_rt: 'RT2-SCADENZA',
      riferimento_id: inc.id,
      user_id: idAzienda,
      alert_id: `INC_${(inc as any).codice_incarico || inc.id}_SCAD`,
      messaggio,
      priorita: isScaduta ? 'high' : 'medium',
      status: 'open',
    }, { onConflict: 'alert_id', ignoreDuplicates: true });
    if (error) {
      if (isSessionEnded(error)) return count;
      console.error('[Alert] upsert RT2-SCAD error:', JSON.stringify(error));
    } else count++;
  }
  return count;
}

async function checkAutovalutazioniInScadenza(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  const ALERT_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 giorni
  const today = new Date();

  let q = supabase
    .from('autovalutazioni')
    .select('id, version, valid_until, status')
    .in('status', ['current', 'expired']);
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: autovalutazioni } = await q;

  if (!autovalutazioni) return 0;

  // Se esiste una autovalutazione 'current' valida (non in scadenza), ignora le 'expired'
  const hasCurrent = autovalutazioni.some(a => {
    if (a.status !== 'current' || !a.valid_until) return false;
    const scad = new Date(a.valid_until);
    return scad >= today; // current e non ancora scaduta
  });

  for (const auto of autovalutazioni) {
    if (!auto.valid_until) continue;
    // Se c'è una current valida, skip le expired (sono state sostituite)
    if (hasCurrent && auto.status === 'expired') continue;

    const scadenzaDate = new Date(auto.valid_until);
    const isScaduta = scadenzaDate < today;
    const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= ALERT_WINDOW_MS;
    if (!isScaduta && !isVicina) continue;

    const dataStr = scadenzaDate.toLocaleDateString('it-IT');
    const messaggio = isScaduta
      ? `Autovalutazione RT1 v${auto.version} SCADUTA il ${dataStr}`
      : `Autovalutazione RT1 v${auto.version} in scadenza il ${dataStr}`;

    const { error } = await supabase.from('alert').upsert({
      tipo_rt: 'RT1-SCADENZA',
      riferimento_id: auto.id,
      user_id: idAzienda,
      alert_id: `RT1_${auto.version}_SCAD`,
      messaggio,
      priorita: isScaduta ? 'high' : 'medium',
      status: 'open',
    }, { onConflict: 'alert_id', ignoreDuplicates: true });
    if (error) {
      if (isSessionEnded(error)) return count;
      console.error('[Alert] upsert RT1-SCAD error:', JSON.stringify(error));
    } else count++;
  }
  return count;
}

async function checkDocumentiInScadenza(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  const ALERT_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 giorni
  const today = new Date();

  let q = supabase
    .from('documenti')
    .select('id, tipologia, nome_file, data_scadenza, cliente_id, persona_id, incarico_id, data_acquisizione, rinnovo_di, clienti(ragione_sociale), anagrafica_soggetti(nome_cognome)')
    .not('data_scadenza', 'is', null)
    .order('data_acquisizione', { ascending: false })
    .order('created_at', { ascending: false });
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: documenti } = await q;

  if (!documenti) return 0;

  // Considera solo i documenti che non sono stati rinnovati (nessun altro doc punta a loro via rinnovo_di)
  const renewedIds = new Set<string>();
  for (const doc of documenti) {
    if (doc.rinnovo_di) renewedIds.add(doc.rinnovo_di);
  }
  const latestDocs = documenti.filter(doc => !renewedIds.has(doc.id));

  // Pre-fetch incarichi archiviati per escluderli
  const incaricoIds = [...new Set(latestDocs.map(d => d.incarico_id).filter(Boolean))];
  const archivedIncaricoIds = new Set<string>();
  if (incaricoIds.length > 0) {
    const { data: archivedInc } = await supabase.from('incarichi').select('id').in('id', incaricoIds).eq('archiviato', true);
    if (archivedInc) archivedInc.forEach(i => archivedIncaricoIds.add(i.id));
  }

  for (const doc of latestDocs) {
    if (doc.incarico_id && archivedIncaricoIds.has(doc.incarico_id)) continue;
    const scadenzaDate = new Date(doc.data_scadenza);
    const isScaduta = scadenzaDate < today;
    const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= ALERT_WINDOW_MS;
    if (!isScaduta && !isVicina) continue;

    // Per documenti persona (es. carta d'identità), usa il nome della persona; altrimenti ragione sociale
    const ragSoc = (doc as any).clienti?.ragione_sociale
      || (doc as any).anagrafica_soggetti?.nome_cognome
      || '';
    const dataStr = scadenzaDate.toLocaleDateString('it-IT');
    const messaggio = isScaduta
      ? `Documento "${doc.nome_file}" (${ragSoc}) SCADUTO il ${dataStr}`
      : `Documento "${doc.nome_file}" (${ragSoc}) in scadenza il ${dataStr}`;

    const { error } = await supabase.from('alert').upsert({
      tipo_rt: 'DOC-SCADENZA',
      riferimento_id: doc.id,
      user_id: idAzienda,
      alert_id: `DOC_${doc.id}_SCAD`,
      messaggio,
      priorita: isScaduta ? 'high' : 'medium',
      status: 'open',
    }, { onConflict: 'alert_id', ignoreDuplicates: true });
    if (error) {
      if (isSessionEnded(error)) return count;
      console.error('[Alert] upsert DOC-SCAD error:', JSON.stringify(error));
    } else count++;
  }
  return count;
}

// ==================== CHECK 7: Controlli Costanti in Scadenza ====================
async function checkControlliInScadenza(idAzienda: string, studioId?: string | null): Promise<number> {
  let count = 0;
  const ALERT_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 giorni
  const today = new Date();

  let q = supabase
    .from('incarichi')
    .select('id, codice_incarico, cliente_id, clienti(ragione_sociale)')
    .eq('status', 'active')
    .or('archiviato.eq.false,archiviato.is.null')
    .is('data_fine', null);
  if (studioId) q = q.eq('studio_id', studioId);
  const { data: incarichi } = await q;

  if (!incarichi) return 0;

  for (const inc of incarichi) {
    // Ultimo controllo per questo incarico
    const { data: controlli } = await supabase
      .from('controlli_costanti')
      .select('id, prossima_scadenza')
      .eq('incarico_id', inc.id)
      .order('data_controllo', { ascending: false })
      .limit(1);

    if (!controlli || controlli.length === 0) continue;

    const ctrl = controlli[0];
    if (!ctrl.prossima_scadenza) continue;

    const scadenzaDate = new Date(ctrl.prossima_scadenza);
    const isScaduta = scadenzaDate < today;
    const isVicina = !isScaduta && (scadenzaDate.getTime() - today.getTime()) <= ALERT_WINDOW_MS;
    if (!isScaduta && !isVicina) continue;

    const ragSoc = (inc as any).clienti?.ragione_sociale ?? '';
    const dataStr = scadenzaDate.toLocaleDateString('it-IT');
    const messaggio = isScaduta
      ? `Controllo costante incarico ${(inc as any).codice_incarico} (${ragSoc}) SCADUTO il ${dataStr}`
      : `Controllo costante incarico ${(inc as any).codice_incarico} (${ragSoc}) in scadenza il ${dataStr}`;

    const { error } = await supabase.from('alert').upsert({
      tipo_rt: 'RT4-SCADENZA',
      riferimento_id: inc.id,
      user_id: idAzienda,
      alert_id: `CTRL_${(inc as any).codice_incarico || inc.id}_SCAD`,
      messaggio,
      priorita: isScaduta ? 'high' : 'medium',
      status: 'open',
    }, { onConflict: 'alert_id', ignoreDuplicates: true });
    if (error) {
      if (isSessionEnded(error)) return count;
      console.error('[Alert] upsert RT4-SCAD error:', JSON.stringify(error));
    } else count++;
  }
  return count;
}
*/
// ============================================================================
// Fine codice legacy commentato.
// ============================================================================

export function AlertProvider({ children }: { children: ReactNode }) {
  const [isCheckingAlerts, setIsCheckingAlerts] = useState(false);
  const [lastCheckMessage, setLastCheckMessage] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const { activeStudioId } = useStudio();

  async function checkSystemAlerts() {
    if (isCheckingAlerts) return;
    if (!activeStudioId) return;
    setIsCheckingAlerts(true);
    setLastCheckMessage('Controllo in corso...');

    try {
      const { data, error } = await supabase.rpc('check_alerts', { p_studio_id: activeStudioId });
      if (error) throw error;

      const cleaned = (data as any)?.cleaned ?? 0;
      const generated = (data as any)?.generated ?? 0;
      setLastCheckMessage(`Completato: ${cleaned} rimossi, ${generated} generati`);
      setRefreshToken(v => v + 1);
    } catch (error: any) {
      setLastCheckMessage(`Errore: ${error.message}`);
    } finally {
      setTimeout(() => setIsCheckingAlerts(false), 800);
    }
  }

  const ensureDailyCheck = useCallback(async () => {
    if (!activeStudioId) return;
    try {
      const { data, error } = await supabase.rpc('ensure_daily_alert_check', { p_studio_id: activeStudioId });
      if (error) throw error;
      // Se la RPC ha effettivamente eseguito il check (non skipped), refresh dei conteggi
      if (data && !(data as any).skipped) {
        setRefreshToken(v => v + 1);
      }
    } catch (error: any) {
      console.error('[Alert] ensureDailyCheck error:', error.message);
    }
  }, [activeStudioId]);

  const runAlertCheckSilent = useCallback(async () => {
    if (!activeStudioId) return;
    try {
      const { error } = await supabase.rpc('check_alerts', { p_studio_id: activeStudioId });
      if (error) throw error;
      setRefreshToken(v => v + 1);
    } catch (error: any) {
      console.error('[Alert] runAlertCheckSilent error:', error.message);
    }
  }, [activeStudioId]);

  const bumpRefresh = useCallback(() => {
    setRefreshToken(v => v + 1);
  }, []);

  return (
    <AlertContext.Provider value={{ checkSystemAlerts, ensureDailyCheck, runAlertCheckSilent, bumpRefresh, isCheckingAlerts, lastCheckMessage, refreshToken }}>
      {children}
    </AlertContext.Provider>
  );
}

export function AlertCountsProvider({ children }: { children: ReactNode }) {
  const [alertCounts, setAlertCounts] = useState<AlertCountsType>({
    no_incarichi: 0,
    no_valutazioni: 0,
    draft: 0,
    scadenza: 0,
    rt1_scadenza: 0,
    doc_scadenza: 0,
    controlli_scadenza: 0,
  });

  const { refreshToken, ensureDailyCheck, bumpRefresh } = useSystemAlerts();
  const { loading } = useAppData();
  const { activeStudioId } = useStudio();

  const loadAlertCounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let q = supabase
      .from('alert')
      .select('tipo_rt');
    if (activeStudioId) q = q.eq('studio_id', activeStudioId);
    const { data } = await q;

    if (data) {
      setAlertCounts({
        no_incarichi: data.filter(a => a.tipo_rt === 'RT4').length,
        no_valutazioni: data.filter(a => a.tipo_rt === 'RT2').length,
        draft: data.filter(a => a.tipo_rt === 'RT2-DRAFT').length,
        scadenza: data.filter(a => a.tipo_rt === 'RT2-SCADENZA').length,
        rt1_scadenza: data.filter(a => a.tipo_rt === 'RT1-SCADENZA').length,
        doc_scadenza: data.filter(a => a.tipo_rt === 'DOC-SCADENZA').length,
        controlli_scadenza: data.filter(a => a.tipo_rt === 'RT4-SCADENZA').length,
      });
    }
  };

  useEffect(() => {
    // Se l'app sta ancora caricando i dati base, aspettiamo
    if (loading) return;

    loadAlertCounts();

    // Refresh deterministico dopo operazioni sul cestino (sposta/ripristina/
    // svuota), che possono eliminare o rigenerare alert.
    const onCestinoChanged = () => loadAlertCounts();
    window.addEventListener('cestino-changed', onCestinoChanged);

    let channel: RealtimeChannel;

    const initSupabase = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Sottoscrizione Realtime filtrata per studio: senza filtro ogni
      // cambio in qualunque studio raggiungeva tutti i client connessi.
      if (!activeStudioId) return;
      channel = supabase
        .channel(`alerts-${activeStudioId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'alert',
            filter: `studio_id=eq.${activeStudioId}`,
          },
          () => {
            loadAlertCounts();
            bumpRefresh();
          }
        )
        // Cestinamento/ripristino/svuotamento elimina o rigenera alert (via
        // trigger archiviato + check_alerts) nella STESSA transazione che scrive
        // su `cestino`. Il realtime sui DELETE filtrati di `alert` è inaffidabile,
        // mentre gli eventi su `cestino` (INSERT/UPDATE) sono consegnati: li usiamo
        // per ricaricare i contatori in modo deterministico.
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cestino',
            filter: `studio_id=eq.${activeStudioId}`,
          },
          () => {
            loadAlertCounts();
            bumpRefresh();
          }
        )
        .subscribe();
    };

    initSupabase();

    // Polling leggero per le scadenze basate sul tempo (RT2/RT4/DOC/RT1
    // -SCADENZA): ensure_daily_alert_check è server-side e ritorna
    // {skipped: true} immediatamente se il check di oggi è già stato fatto,
    // quindi è praticamente gratis. Quando si attraversa la mezzanotte la
    // chiamata successiva esegue check_alerts e gli eventi Realtime sopra
    // aggiornano i contatori senza intervento del client.
    const intervalId = window.setInterval(() => {
      ensureDailyCheck();
    }, 30 * 60 * 1000);

    return () => {
      window.removeEventListener('cestino-changed', onCestinoChanged);
      if (channel) {
        supabase.removeChannel(channel);
      }
      window.clearInterval(intervalId);
    };
  }, [loading, refreshToken, activeStudioId, ensureDailyCheck, bumpRefresh]);

  return (
    <AlertCountsContext.Provider value={{ alertCounts, setAlertCounts }}>
      {children}
    </AlertCountsContext.Provider>
  );
}

export function AlertPanel({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'no_incarichi' | 'no_valutazioni' | 'draft' | 'scadenza' | 'rt1_scadenza' | 'doc_scadenza' | 'controlli_scadenza'>('all');
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const { alertCounts } = useAlertCounts();
  const { checkSystemAlerts,  isCheckingAlerts, lastCheckMessage, refreshToken } = useSystemAlerts();
  const { clienti, incarichi, loading } = useAppData();
  const { activeStudioId } = useStudio();


  async function loadAlerts() {
    if (loading) return;
    setLoadingAlerts(true);

    let query = supabase
      .from('alert')
      .select('*')
      .order('created_at', { ascending: false });
    if (activeStudioId) query = query.eq('studio_id', activeStudioId);

    if (filter === 'no_incarichi') query = query.eq('tipo_rt', 'RT4');
    else if (filter === 'no_valutazioni') query = query.eq('tipo_rt', 'RT2');
    else if (filter === 'draft') query = query.eq('tipo_rt', 'RT2-DRAFT');
    else if (filter === 'scadenza') query = query.eq('tipo_rt', 'RT2-SCADENZA');
    else if (filter === 'rt1_scadenza') query = query.eq('tipo_rt', 'RT1-SCADENZA');
    else if (filter === 'doc_scadenza') query = query.eq('tipo_rt', 'DOC-SCADENZA');
    else if (filter === 'controlli_scadenza') query = query.eq('tipo_rt', 'RT4-SCADENZA');

    const { data } = await query;
    if (data) setAlerts(data);
    setLoadingAlerts(false);
  }

  useEffect(() => {
    if (!loading) {
      loadAlerts();
      /*loadAlertCounts();*/
    }
  }, [filter, refreshToken, loading, clienti, incarichi]);


  async function handleAlertClick(alert: Alert) {
    if (!onNavigate) return;

    const tipo = alert.tipo_rt;

    if (!alert.riferimento_id) return;

    // RT1-SCADENZA → navigate to RT1 tab
    if (tipo === 'RT1-SCADENZA') {
      onNavigate('rt1');
      return;
    }

    // Client-level alerts: riferimento_id = cliente_id
    if (tipo === 'RT2-DRAFT' || tipo === 'RT4') {
      const tab = tipo === 'RT2-DRAFT' ? 'anagrafica' : 'incarichi';
      sessionStorage.setItem('alert_navigate_fascicolo', JSON.stringify({
        clienteId: alert.riferimento_id,
        tab,
      }));
      onNavigate('fascicolo');
      return;
    }

    // Incarico-level alerts: riferimento_id = incarico_id
    if (tipo === 'RT2' || tipo === 'RT2-SCADENZA') {
      const inc = incarichi.find(i => i.id === alert.riferimento_id);
      const clienteId = inc?.cliente_id;
      if (!clienteId) return;
      sessionStorage.setItem('alert_navigate_fascicolo', JSON.stringify({
        clienteId,
        tab: 'incarichi',
        incaricoId: alert.riferimento_id,
      }));
      onNavigate('fascicolo');
      return;
    }

    // RT4-SCADENZA (controlli costanti): porta alla tab RT3 con incarico pre-selezionato
    if (tipo === 'RT4-SCADENZA') {
      sessionStorage.setItem('alert_navigate_rt3', alert.riferimento_id);
      onNavigate('rt3');
      return;
    }

    // DOC-SCADENZA: riferimento_id = document_id → look up cliente_id
    if (tipo === 'DOC-SCADENZA') {
      const { data: doc } = await supabase
        .from('documenti')
        .select('cliente_id, persona_id, incarico_id')
        .eq('id', alert.riferimento_id)
        .single();
      if (!doc) return;

      let clienteId = doc.cliente_id;

      // Se il documento è associato a una persona (es. carta d'identità), risali al cliente
      if (!clienteId && doc.persona_id) {
        const { data: cliente } = await supabase
          .from('clienti')
          .select('id')
          .eq('persona_id', doc.persona_id)
          .maybeSingle();
        if (cliente) clienteId = cliente.id;

        // Fallback: cerca tra i titolari effettivi
        if (!clienteId) {
          const { data: titolare } = await supabase
            .from('titolari_effettivi')
            .select('cliente_id')
            .eq('persona_id', doc.persona_id)
            .limit(1)
            .maybeSingle();
          if (titolare) clienteId = titolare.cliente_id;
        }
      }

      // Fallback: risali tramite incarico
      if (!clienteId && doc.incarico_id) {
        const { data: inc } = await supabase
          .from('incarichi')
          .select('cliente_id')
          .eq('id', doc.incarico_id)
          .maybeSingle();
        if (inc) clienteId = inc.cliente_id;
      }

      if (!clienteId) return;
      sessionStorage.setItem('alert_navigate_fascicolo', JSON.stringify({
        clienteId,
        tab: 'documenti',
      }));
      onNavigate('fascicolo');
      return;
    }
  }

  function getPriorityColor(priorita: string) {
    switch (priorita) {
      case 'high': return 'text-red-700 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'low': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alert e Notifiche</h1>
          <p className="text-gray-600 mt-1">Gestione alert di conformità AML</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="px-4 py-2 border border-gray-300 bg-white rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-0"
        >
          <option value="all">Tutti gli alert ({alertCounts.no_incarichi + alertCounts.no_valutazioni + alertCounts.draft + alertCounts.scadenza + alertCounts.rt1_scadenza + alertCounts.doc_scadenza + alertCounts.controlli_scadenza})</option>
          <option value="no_incarichi">Clienti senza Incarichi ({alertCounts.no_incarichi})</option>
          <option value="no_valutazioni">Incarichi senza Valutazioni ({alertCounts.no_valutazioni})</option>
          <option value="draft">Clienti in Bozza ({alertCounts.draft})</option>
          <option value="scadenza">Valutazioni in Scadenza ({alertCounts.scadenza})</option>
          <option value="controlli_scadenza">Controlli in Scadenza ({alertCounts.controlli_scadenza})</option>
          <option value="rt1_scadenza">RT1 in Scadenza ({alertCounts.rt1_scadenza})</option>
          <option value="doc_scadenza">Documenti in Scadenza ({alertCounts.doc_scadenza})</option>
        </select>
        </div>

        <div className="flex items-center gap-3">
          {lastCheckMessage && (
            <span className="text-sm text-gray-500">{lastCheckMessage}</span>
          )}
          <button
            onClick={checkSystemAlerts}
            disabled={isCheckingAlerts}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            <AlertTriangle className="w-4 h-4" />
            {isCheckingAlerts ? 'Controllo...' : 'Controlla Alert'}
          </button>
        </div>
      </div>
      {(loading || loadingAlerts) ? (
        <Spinner />
      ) : alerts.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4 opacity-50" />
            <p className="text-gray-600">Nessun alert presente</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const isClickable = !!onNavigate && !!alert.riferimento_id;
            return (
            <Card key={alert.id}>
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && handleAlertClick(alert)}
                className={`w-full text-left flex items-start gap-4 ${isClickable ? 'cursor-pointer hover:bg-gray-50 transition-colors rounded-lg -m-2 p-2' : ''}`}
              >
                <div className={`p-2 rounded-lg ${getPriorityColor(alert.priorita)}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase">
                          {alert.tipo_rt} - {alert.alert_id}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(alert.priorita)}`}>
                          {alert.priorita === 'high' ? 'Alta' : alert.priorita === 'medium' ? 'Media' : 'Bassa'}
                        </span>
                      </div>
                      <p className="text-gray-900 font-medium">{alert.messaggio}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleDateString('it-IT')}
                      </span>
                      {isClickable && (
                        <ExternalLink className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}