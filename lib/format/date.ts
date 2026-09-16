/**
 * Formatação de datas em pt-PT.
 *
 * O fuso é fixado explicitamente para que o servidor e o browser produzam
 * exatamente a mesma string — caso contrário a hidratação do React acusa
 * divergência quando o servidor corre em UTC.
 */
const TIME_ZONE = "Europe/Lisbon";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
