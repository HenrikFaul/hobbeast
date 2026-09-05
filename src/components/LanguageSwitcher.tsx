import { Globe } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { LOCALE_LABEL, SUPPORTED_LOCALES, type Locale } from '@/i18n/locales';

/**
 * The language control.
 *
 * A native <select> rather than a custom dropdown: it is keyboard- and
 * screen-reader-correct for free, it works on a phone with the OS picker, and a
 * language switcher is exactly the control someone reaches for when the rest of
 * the page is in a language they cannot read — it must not depend on them
 * understanding any of our copy.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t('language.choose')}</span>
      <Globe size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" aria-hidden="true" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t('language.choose')}
        data-testid="language-switcher"
        className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-card pl-8 pr-7 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORTED_LOCALES.map((code) => {
          const meta = LOCALE_LABEL[code];
          return (
            // The option shows the language in ITS OWN language. Someone looking
            // for Polish is looking for "Polski", not for "lengyel".
            <option key={code} value={code}>
              {meta?.flag} {meta?.native ?? code}
            </option>
          );
        })}
      </select>
    </label>
  );
}
