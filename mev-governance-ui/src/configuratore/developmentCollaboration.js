export const HEARTBEAT_MS = 15000;
export const MAX_MESSAGE = 2000;

export const displayName = user => String(user?.fullName ?? '').trim() || String(user?.username ?? '').trim() || 'Utente';

// "Mario Rossi" -> "MR"; falls back to the username.
export const initials = user => {
  const words = displayName(user).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
};

export function relativeTime(iso, now = Date.now()) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return 'adesso';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ieri' : `${days} giorni fa`;
}

// Merges new messages into the list by id: order is by id, duplicates (a poll and a send racing) are dropped.
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
export const lastMessageId = messages => messages.length ? messages[messages.length - 1].id : 0;

export function validateMessage(text) {
  const value = String(text ?? '').trim();
  if (!value) return { ok: false, reason: 'Scrivi un messaggio.' };
  if (value.length > MAX_MESSAGE) return { ok: false, reason: `Il messaggio supera ${MAX_MESSAGE} caratteri (${value.length}).` };
  return { ok: true, value };
}

// The server stores initiative codes case-insensitively; list rows must be matched the same way.
export const initiativeKey = code => String(code || '').trim().toLowerCase();
export const indexSummaries = list => Object.fromEntries((Array.isArray(list) ? list : []).map(entry => [initiativeKey(entry.goto), entry]));

// Text for the initiative list: who worked last and who is connected now (never including the viewer twice).
export function activityLine(summary) {
  if (!summary) return { worked: 'Nessuna attività registrata', online: [] };
  const worked = summary.lastWorkedBy
    ? `Ultimo lavoro: ${displayName({ fullName: summary.lastWorkedByFullName, username: summary.lastWorkedBy })} · ${relativeTime(summary.lastWorkedAt)}`
    : 'Nessuna attività registrata';
  return { worked, online: summary.online || [] };
}

export function othersOnline(users) { return (users || []).filter(user => !user.isMe); }
