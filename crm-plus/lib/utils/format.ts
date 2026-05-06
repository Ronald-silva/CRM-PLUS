export function formatCurrency(value: number, locale = "pt-BR", currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function formatDate(date: Date | string, locale = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
}

export function formatDateTime(date: Date | string, locale = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return phone;
}
