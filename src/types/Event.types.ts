export interface Event {
  id: string;
  name: string;
  venue: string;
  event_date: string;
  status: 'current' | 'past';
}

export interface EventInfo {
  name: string;
  venue: string;
  event_date: string;
}
