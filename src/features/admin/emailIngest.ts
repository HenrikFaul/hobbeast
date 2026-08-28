import { supabase } from '@/integrations/supabase/client';

/**
 * The operator's side of the newsletter ingestion channel.
 *
 * A technical inbox subscribes to event newsletters; a mail provider forwards
 * each arriving mail to the email-inbound webhook; the worker reads the events
 * out of the matched ones. This is the admin surface: the inbox address and
 * webhook secret, the sender→publisher mapping, and the log of what came in.
 */

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');

export interface EmailIngestConfig {
  inbox_address: string | null;
  webhook_secret: string;
  enabled: boolean;
}

export interface EmailSource {
  id: string;
  match_type: 'address' | 'domain';
  match_value: string;
  publisher_name: string;
  country_code: string | null;
  categories: string[];
  strategy: 'auto' | 'jsonld' | 'prose';
  enabled: boolean;
  notes: string | null;
  emails_total: number;
  events_total: number;
  last_email_at: string | null;
}

export interface InboundEmail {
  id: string;
  from_address: string | null;
  subject: string | null;
  status: string;
  events_found: number | null;
  publisher_name: string | null;
  received_at: string;
  error_text: string | null;
}

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** The full webhook URL a mail provider posts to, secret included. */
export function webhookUrl(secret: string): string {
  return `${SUPABASE_URL}/functions/v1/email-inbound?secret=${secret}`;
}

export async function getEmailConfig(): Promise<EmailIngestConfig | null> {
  const { data, error } = await rpc.rpc('admin_get_email_ingest_config');
  if (error || !data) return null;
  return (Array.isArray(data) ? data[0] : data) as EmailIngestConfig;
}

export async function updateEmailConfig(
  patch: { inbox?: string; enabled?: boolean; rotateSecret?: boolean },
): Promise<{ ok: true; config: EmailIngestConfig } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('admin_update_email_ingest_config', {
    p_inbox: patch.inbox ?? null,
    p_enabled: patch.enabled ?? null,
    p_rotate_secret: patch.rotateSecret ?? false,
  });
  if (error) {
    return { ok: false, message: error.message.includes('CAPABILITY_REQUIRED') ? 'Ehhez providers.manage jogosultság kell.' : 'A mentés nem sikerült.' };
  }
  return { ok: true, config: (Array.isArray(data) ? data[0] : data) as EmailIngestConfig };
}

export async function listEmailSources(): Promise<EmailSource[]> {
  const { data, error } = await rpc.rpc('admin_list_email_sources');
  return error || !Array.isArray(data) ? [] : (data as EmailSource[]);
}

export async function saveEmailSource(input: {
  id?: string;
  matchType: 'address' | 'domain';
  matchValue: string;
  publisherName: string;
  countryCode?: string;
  categories: string[];
  strategy: 'auto' | 'jsonld' | 'prose';
  enabled: boolean;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('admin_upsert_email_source', {
    p_id: input.id ?? null,
    p_match_type: input.matchType,
    p_match_value: input.matchValue.trim(),
    p_publisher_name: input.publisherName.trim(),
    p_country_code: input.countryCode?.trim() || null,
    p_categories: input.categories,
    p_strategy: input.strategy,
    p_enabled: input.enabled,
    p_notes: input.notes?.trim() || null,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes('CAPABILITY_REQUIRED') ? 'Ehhez providers.manage jogosultság kell.'
        : error.message.includes('email_ingest_sources_unique') ? 'Erre a feladóra már van forrás.'
          : error.message.includes('match_value') ? 'A feladó túl rövid.'
            : 'A mentés nem sikerült.',
    };
  }
  return { ok: true };
}

export async function deleteEmailSource(id: string): Promise<boolean> {
  const { error } = await rpc.rpc('admin_delete_email_source', { p_id: id });
  return !error;
}

export async function listInboundEmails(limit = 40): Promise<InboundEmail[]> {
  const { data, error } = await rpc.rpc('admin_list_inbound_emails', { p_limit: limit });
  return error || !Array.isArray(data) ? [] : (data as InboundEmail[]);
}
