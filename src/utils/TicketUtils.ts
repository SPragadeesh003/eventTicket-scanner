export function formatTicketType(t: string): string {
  if (t === 'regular') return 'General Admission';
  if (t === 'guest_list') return 'Guest List';
  if (t === 'external') return 'External';
  return t;
}
export function formatTicketDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');
}
