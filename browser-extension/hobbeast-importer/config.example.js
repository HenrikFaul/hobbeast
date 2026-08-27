/**
 * Copy this file to `config.js` and fill in the two values from the Hobbeast
 * project. Both are the ones the public web app already ships, so they are not
 * secrets — but they are not committed here either, so the extension folder
 * stays valid for any environment.
 *
 * The publishable (anon) key alone grants nothing: every write goes through an
 * RPC that checks the signed-in operator's own capability.
 */
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR-PUBLISHABLE-ANON-KEY';
