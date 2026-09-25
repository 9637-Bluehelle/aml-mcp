import { supabase } from '../lib/supabase';

export type LogActionType = 'READ' | 'WRITE' | 'DELETE' | 'EXPORT';

export interface LogAccessParams {
  action: string;
  action_type?: LogActionType;
  target_table?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
}

// Scritture "libere": firma invariata per backward compat. Passa per la RPC
// cosi' l'IP viene catturato server-side (il client non lo controlla).
export async function addUserLog(action: string): Promise<void> {
  await callLogRpc({ action });
}

// Accessi a dati sensibili (apertura cliente, download, lettura segnalazione).
// Usa action_type + target_table + target_id per rendere i log filtrabili
// in fase di audit GDPR/AML.
export async function logAccess(params: LogAccessParams): Promise<void> {
  await callLogRpc(params);
}

async function callLogRpc(params: LogAccessParams): Promise<void> {
  const { error } = await supabase.rpc('log_user_action', {
    p_action: params.action,
    p_action_type: params.action_type ?? null,
    p_target_table: params.target_table ?? null,
    p_target_id: params.target_id ?? null,
    p_metadata: params.metadata ?? null,
  });
  if (error) {
    console.error('[userLogs] log fallito', error);
  }
}

export async function getUserLogs(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore caricando i log:', error);
    return [];
  }
}
