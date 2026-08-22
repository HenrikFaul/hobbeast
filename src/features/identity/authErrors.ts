export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_unconfirmed'
  | 'already_registered'
  | 'rate_limited'
  | 'weak_password'
  | 'expired_token'
  | 'network'
  | 'unknown';

export interface SafeAuthError {
  code: AuthErrorCode;
  message: string;
}

export function mapAuthError(error: unknown): SafeAuthError {
  const raw = error instanceof Error ? error.message : String(error || '');
  const message = raw.toLowerCase();
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return { code: 'invalid_credentials', message: 'Hibás e-mail cím vagy jelszó.' };
  }
  if (message.includes('email not confirmed')) {
    return { code: 'email_unconfirmed', message: 'Az e-mail címed még nincs megerősítve.' };
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return { code: 'already_registered', message: 'Ehhez az e-mail címhez már tartozik fiók.' };
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return { code: 'rate_limited', message: 'Túl sok próbálkozás történt. Kérjük, várj néhány percet.' };
  }
  if (message.includes('password') && (message.includes('weak') || message.includes('characters'))) {
    return { code: 'weak_password', message: 'A jelszó nem felel meg a biztonsági követelményeknek.' };
  }
  if (message.includes('expired') || message.includes('invalid token')) {
    return { code: 'expired_token', message: 'A megerősítő kód lejárt vagy érvénytelen.' };
  }
  if (message.includes('fetch') || message.includes('network')) {
    return { code: 'network', message: 'Kapcsolati hiba történt. Ellenőrizd az internetkapcsolatot.' };
  }
  return { code: 'unknown', message: 'A művelet nem sikerült. Kérjük, próbáld újra.' };
}
