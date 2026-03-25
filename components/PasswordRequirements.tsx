import { Check, X } from 'lucide-react';
import { PasswordCheck } from '@/lib/passwordValidation';

interface PasswordRequirementsProps {
  checks: PasswordCheck;
  show: boolean;
}

const rules: { key: keyof PasswordCheck; label: string }[] = [
  { key: 'minLength', label: 'Legalább 8 karakter' },
  { key: 'hasLower', label: 'Kisbetű (a-z)' },
  { key: 'hasUpper', label: 'Nagybetű (A-Z)' },
  { key: 'hasNumber', label: 'Szám (0-9)' },
  { key: 'hasSpecial', label: 'Speciális karakter (!@#$...)' },
];

export function PasswordRequirements({ checks, show }: PasswordRequirementsProps) {
  if (!show) return null;

  return (
    <ul className="space-y-1 text-xs mt-2">
      {rules.map(({ key, label }) => (
        <li key={key} className="flex items-center gap-1.5">
          {checks[key] ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <X className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={checks[key] ? 'text-muted-foreground' : 'text-destructive'}>
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
