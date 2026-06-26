import emailjs from '@emailjs/browser';
import { supabase } from './supabase';

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const EMAILJS_TEMPLATE_ID_LOCKOUT = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_LOCKOUT as string | undefined;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? 'assistenza@adeguataverifica.pro';
const APP_NAME = 'AdeguataVerifica.Pro';

export interface LockoutStatus {
  locked: boolean;
  just_locked?: boolean;
  locked_at?: string;
  reason?: string;
  notification_sent?: boolean;
  attempts_remaining?: number;
  email?: string;
}

export async function checkAccountLockout(email: string): Promise<LockoutStatus> {
  const { data, error } = await supabase.rpc('check_account_lockout', {
    p_email: email,
  });

  if (error) {
    console.error('[loginSecurity] check_account_lockout failed', error);
    return { locked: false };
  }

  return (data ?? { locked: false }) as LockoutStatus;
}

export async function recordLoginAttempt(
  email: string,
  success: boolean
): Promise<LockoutStatus> {
  const { data, error } = await supabase.rpc('record_login_attempt', {
    p_email: email,
    p_success: success,
  });

  if (error) {
    console.error('[loginSecurity] record_login_attempt failed', error);
    return { locked: false };
  }

  return (data ?? { locked: false }) as LockoutStatus;
}

export async function sendLockoutEmail(email: string): Promise<boolean> {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID_LOCKOUT || !EMAILJS_PUBLIC_KEY) {
    console.warn('[loginSecurity] EmailJS non configurato: email non inviata');
    return false;
  }

  const templateParams = {
    to_email: email,
    support_email: SUPPORT_EMAIL,
    app_name: APP_NAME,
    lockout_time: new Date().toLocaleString('it-IT', {
      dateStyle: 'long',
      timeStyle: 'short',
    }),
  };

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID_LOCKOUT,
      templateParams,
      { publicKey: EMAILJS_PUBLIC_KEY }
    );

    await supabase.rpc('mark_lockout_notified', { p_email: email });
    return true;
  } catch (err) {
    console.error('[loginSecurity] invio email lockout fallito', err);
    return false;
  }
}

export async function adminUnlockAccount(email: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_unlock_account', { p_email: email });
  if (error) {
    console.error('[loginSecurity] admin_unlock_account failed', error);
    return false;
  }
  return true;
}

export async function selfUnlockAccount(): Promise<boolean> {
  const { error } = await supabase.rpc('self_unlock_account');
  if (error) {
    console.error('[loginSecurity] self_unlock_account failed', error);
    return false;
  }
  return true;
}
