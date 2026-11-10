import { displayName, initials, relativeTime, mergeMessages, lastMessageId, validateMessage, initiativeKey, indexSummaries, activityLine, othersOnline, MAX_MESSAGE } from './developmentCollaboration';

const NOW = Date.parse('2026-05-10T12:00:00Z');
const ago = seconds => new Date(NOW - seconds * 1000).toISOString();

test('names fall back from full name to username to a generic label', () => {
  expect(displayName({ fullName: 'Mario Rossi', username: 'mrossi' })).toBe('Mario Rossi');
  expect(displayName({ fullName: '  ', username: 'mrossi' })).toBe('mrossi');
  expect(displayName({})).toBe('Utente');
  expect(displayName(null)).toBe('Utente');
});

test('initials use first and last name, or the start of a single name', () => {
  expect(initials({ fullName: 'Mario Rossi' })).toBe('MR');
  expect(initials({ fullName: 'Anna Maria De Luca' })).toBe('AL');
  expect(initials({ username: 'anna' })).toBe('AN');
});

test('relative time is readable and never negative', () => {
  expect(relativeTime(ago(10), NOW)).toBe('adesso');
  expect(relativeTime(ago(5 * 60), NOW)).toBe('5 min fa');
  expect(relativeTime(ago(3 * 3600), NOW)).toBe('3 h fa');
  expect(relativeTime(ago(30 * 3600), NOW)).toBe('ieri');
  expect(relativeTime(ago(5 * 86400), NOW)).toBe('5 giorni fa');
  expect(relativeTime(new Date(NOW + 60000).toISOString(), NOW)).toBe('adesso');
  expect(relativeTime('non una data', NOW)).toBe('');
  expect(relativeTime(null, NOW)).toBe('');
});

test('merging keeps messages ordered by id and drops duplicates from racing poll and send', () => {
  const a = { id: 1, text: 'a' }, b = { id: 2, text: 'b' }, c = { id: 3, text: 'c' };
  expect(mergeMessages([a, c], [b, c]).map(m => m.id)).toEqual([1, 2, 3]);
  expect(mergeMessages([], [])).toEqual([]);
  expect(mergeMessages([a], [{ id: 1, text: 'a' }])).toHaveLength(1);
  expect(lastMessageId([a, b, c])).toBe(3);
  expect(lastMessageId([])).toBe(0);
});

test('messages are validated before they are sent', () => {
  expect(validateMessage('   ')).toMatchObject({ ok: false });
  expect(validateMessage(undefined)).toMatchObject({ ok: false });
  expect(validateMessage('  ciao  ')).toEqual({ ok: true, value: 'ciao' });
  expect(validateMessage('x'.repeat(MAX_MESSAGE + 1)).ok).toBe(false);
  expect(validateMessage('x'.repeat(MAX_MESSAGE)).ok).toBe(true);
});

test('list rows are matched to summaries regardless of GOTO letter case and spaces', () => {
  const index = indexSummaries([{ goto: 'goto-1', messageCount: 2 }]);
  expect(index[initiativeKey(' GOTO-1 ')].messageCount).toBe(2);
  expect(indexSummaries(null)).toEqual({});
});

test('the list line says who worked last and who is connected', () => {
  expect(activityLine(undefined).worked).toBe('Nessuna attività registrata');
  expect(activityLine({ online: [] }).worked).toBe('Nessuna attività registrata');
  const line = activityLine({ lastWorkedBy: 'mrossi', lastWorkedByFullName: 'Mario Rossi', lastWorkedAt: ago(7200), online: [{ username: 'a' }] });
  expect(line.worked).toMatch(/Mario Rossi/);
  expect(line.online).toHaveLength(1);
});

test('only other users count as colleagues to warn about', () => {
  expect(othersOnline([{ username: 'io', isMe: true }, { username: 'lei' }])).toEqual([{ username: 'lei' }]);
  expect(othersOnline(undefined)).toEqual([]);
});
