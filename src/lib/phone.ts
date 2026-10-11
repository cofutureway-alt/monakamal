// Egyptian mobile phone normalization utilities.
// Canonical form: 20XXXXXXXXXX (12 digits, no plus)

export function normalizeEgPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return "2" + digits;
  if (/^1[0125]\d{8}$/.test(digits)) return "20" + digits;
  return digits;
}

export function isValidEgPhone(raw: string): boolean {
  const n = normalizeEgPhone(raw);
  return /^201[0125]\d{8}$/.test(n);
}

// ponytail: Supabase GoTrue rejects the reserved ".invalid" TLD on new projects
// (email_address_invalid). If this ever breaks again, self-host GoTrue or use
// an SMTP provider with phone-based accounts.
export function syntheticAuthEmail(phone: string): string {
  return `${normalizeEgPhone(phone)}@phone.fakarli.com`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@phone.fakarli.com");
}

// Returns true when the identifier looks like an Egyptian phone number
// (all digits after stripping formatting, and normalizes to a valid form).
export function looksLikePhone(id: string): boolean {
  const trimmed = (id || "").trim();
  if (!trimmed) return false;
  // Contains only digits, spaces, dashes, parentheses, or leading +
  if (!/^[+\d\s\-()]+$/.test(trimmed)) return false;
  return isValidEgPhone(trimmed);
}
