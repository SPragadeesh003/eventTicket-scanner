export const ROUTES = {
  LOGIN: 'routes/auth/login' as const,
  SET_PASSWORD: 'routes/auth/set-password' as const,
  HOME: 'routes/main/home' as const,
  EVENT_DETAIL: 'routes/main/event-detail/[eventId]' as const,
  SCANNER: 'routes/main/scanner/[eventId]' as const,
  TICKET_SEARCH: 'routes/main/ticket-search/[eventId]' as const,
  TICKET_DETAIL: 'routes/main/ticket-detail/[eventId]' as const,
  SYNC_STATUS: 'routes/main/sync-status/[eventId]' as const,
};