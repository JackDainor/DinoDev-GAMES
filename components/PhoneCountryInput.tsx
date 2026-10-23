'use client';

export type Country = { code: string; dial: string; flag: string; name: string };

export const COUNTRIES: Country[] = [
  { code: 'BO', dial: '591', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BR', dial: '55', flag: '🇧🇷', name: 'Brasil' },
  { code: 'PE', dial: '51', flag: '🇵🇪', name: 'Perú' },
  { code: 'AR', dial: '54', flag: '🇦🇷', name: 'Argentina' },
  { code: 'CL', dial: '56', flag: '🇨🇱', name: 'Chile' },
  { code: 'PY', dial: '595', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'UY', dial: '598', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'CO', dial: '57', flag: '🇨🇴', name: 'Colombia' },
  { code: 'EC', dial: '593', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'VE', dial: '58', flag: '🇻🇪', name: 'Venezuela' },
  { code: 'MX', dial: '52', flag: '🇲🇽', name: 'México' },
  { code: 'US', dial: '1', flag: '🇺🇸', name: 'EE.UU.' },
  { code: 'ES', dial: '34', flag: '🇪🇸', name: 'España' },
];

export function splitPhone(full: string): { dial: string; local: string } {
  const digits = String(full || '').replace(/\D/g, '');
  if (!digits) return { dial: '591', local: '' };
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial) && digits.length > c.dial.length) {
      return { dial: c.dial, local: digits.slice(c.dial.length) };
    }
  }
  // only dial code typed
  for (const c of sorted) {
    if (digits === c.dial) return { dial: c.dial, local: '' };
  }
  return { dial: '591', local: digits };
}

type Props = {
  value: string;
  onChange: (fullDigits: string) => void;
  defaultDial?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function PhoneCountryInput({
  value,
  onChange,
  defaultDial = '591',
  placeholder = '7xxxxxxx',
  required,
  disabled,
}: Props) {
  const digits = String(value || '').replace(/\D/g, '');
  let dial = defaultDial;
  let local = '';
  if (digits) {
    const s = splitPhone(digits);
    dial = s.dial;
    local = s.local;
  }

  return (
    <div className="phone-row">
      <select
        className="phone-dial"
        value={dial}
        disabled={disabled}
        onChange={(e) => {
          const newDial = e.target.value;
          const loc = splitPhone(value).local;
          onChange(newDial + loc);
        }}
        aria-label="Código de país"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.flag} +{c.dial} {c.name}
          </option>
        ))}
      </select>
      <input
        className="phone-local"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={local}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const only = e.target.value.replace(/\D/g, '');
          onChange(dial + only);
        }}
      />
    </div>
  );
}
