import { assert, assertEquals } from '$std/assert/mod.ts';
import {
  bridgeAuth,
  cleanShortName,
  cleanText,
  FIRST_INDEX,
  LAST_INDEX,
  nextIndex,
  questionText,
  validateAnswer,
  validateForget,
  validateSent,
} from './mesh.ts';

const GOOD = {
  question_index: 12,
  packet_id: 2020797967,
  from_id: '!62f61b44',
  short_name: 'AURA',
  text: 'Kindness, mostly.',
  via: 'reply',
  rx_time: 1790388510,
};

Deno.test('nextIndex starts at 2, steps by one, wraps 34 back to 2', () => {
  assertEquals(nextIndex(null), FIRST_INDEX);
  assertEquals(nextIndex(2), 3);
  assertEquals(nextIndex(33), 34);
  assertEquals(nextIndex(LAST_INDEX), FIRST_INDEX);
});

Deno.test('nextIndex never hands out a gate question', () => {
  assertEquals(nextIndex(0), FIRST_INDEX);
  assertEquals(nextIndex(1), FIRST_INDEX);
});

Deno.test('questionText reads the canonical list and refuses the gate questions', () => {
  assertEquals(questionText(2), 'What is the trait you most deplore in yourself?');
  assertEquals(questionText(34), 'What is your motto?');
  assertEquals(questionText(0), null);
  assertEquals(questionText(35), null);
  assertEquals(questionText(2.5), null);
});

Deno.test('every mesh question fits one Meshtastic text with tag and site name', () => {
  // P<n> <text> Reply to answer · aformulationoftruth.com/loramesh  -- the bridge's exact frame
  for (let i = FIRST_INDEX; i <= LAST_INDEX; i++) {
    const line = `P${i} ${questionText(i)} Reply to answer · aformulationoftruth.com/loramesh`;
    assert(new TextEncoder().encode(line).length <= 200, `Q${i} is ${line.length} chars`);
  }
});

Deno.test('cleanText turns controls into spaces and collapses runs', () => {
  assertEquals(cleanText('a\nb\t\tc\u0007d', 240), 'a b c d');
  assertEquals(cleanText('  padded  ', 240), 'padded');
});

Deno.test('cleanText strips bidi controls', () => {
  assertEquals(cleanText('abc\u202egfed\u202c', 240), 'abcgfed');
  assertEquals(cleanText('x\u2066y\u2069\u200fz', 240), 'xyz');
});

Deno.test('cleanText cuts on a character boundary, never inside one', () => {
  const s = 'a'.repeat(239) + 'é'; // é is 2 bytes: 241 total
  assertEquals(cleanText(s, 240), 'a'.repeat(239));
  assertEquals(cleanText('🌱🌱', 7), '🌱'); // 4 bytes each
});

Deno.test('cleanShortName keeps at most 8 characters', () => {
  assertEquals(cleanShortName('  A4T  '), 'A4T');
  assertEquals(cleanShortName('abcdefghijk'), 'abcdefgh');
});

Deno.test('validateAnswer accepts the bridge payload and converts rx_time', () => {
  const r = validateAnswer(GOOD);
  assert(r.ok);
  assertEquals(r.value.rx_at.getTime(), 1790388510 * 1000);
  assertEquals(r.value.via, 'reply');
});

Deno.test('validateAnswer refuses each malformed field', () => {
  const bad: Record<string, unknown>[] = [
    { ...GOOD, question_index: 1 },
    { ...GOOD, question_index: 35 },
    { ...GOOD, packet_id: 0 },
    { ...GOOD, packet_id: 2 ** 32 },
    { ...GOOD, from_id: '!62F61B44' },
    { ...GOOD, from_id: '62f61b44' },
    { ...GOOD, short_name: '   ' },
    { ...GOOD, text: '\n\t ' },
    { ...GOOD, via: 'channel' },
    { ...GOOD, rx_time: 'yesterday' },
    { ...GOOD, rx_time: -5 },
  ];
  for (const b of bad) assertEquals(validateAnswer(b).ok, false, JSON.stringify(b));
  assertEquals(validateAnswer(null).ok, false);
  assertEquals(validateAnswer('text').ok, false);
});

Deno.test('validateSent and validateForget', () => {
  assert(validateSent({ question_index: 2, packet_id: 7 }).ok);
  assertEquals(validateSent({ question_index: 1, packet_id: 7 }).ok, false);
  assert(validateForget({ from_id: '!04e1419c' }).ok);
  assertEquals(validateForget({ from_id: 'everyone' }).ok, false);
});

function req(auth?: string): Request {
  return new Request('http://localhost/api/mesh/question/next', {
    headers: auth ? { Authorization: auth } : {},
  });
}

Deno.test('bridgeAuth fails closed when no token is configured', () => {
  assertEquals(bridgeAuth(req('Bearer anything'), undefined)?.status, 503);
  assertEquals(bridgeAuth(req('Bearer anything'), '')?.status, 503);
});

Deno.test('bridgeAuth refuses missing, wrong and wrong-length tokens', () => {
  const t = 'correct-token-123';
  assertEquals(bridgeAuth(req(), t)?.status, 401);
  assertEquals(bridgeAuth(req('Bearer correct-token-124'), t)?.status, 401);
  assertEquals(bridgeAuth(req('Bearer short'), t)?.status, 401);
  assertEquals(bridgeAuth(req(`Basic ${t}`), t)?.status, 401);
  assertEquals(bridgeAuth(req(`Bearer ${t}`), t), null);
});

Deno.test('cleanText strips zero-width characters, so an invisible answer is empty', () => {
  assertEquals(cleanText('a\u200bb\u200c\u200dc\u2060\u061c\u00ad\ufeffd', 240), 'abcd');
  assertEquals(validateAnswer({ ...GOOD, text: '\u200b\u200b' }).ok, false);
  assertEquals(validateAnswer({ ...GOOD, short_name: '\u200b\u2060' }).ok, false);
});

Deno.test('validateSent carries the radio send time, bounded to the last 36 h', () => {
  const now = Math.floor(Date.now() / 1000);
  const r = validateSent({ question_index: 2, packet_id: 7, sent_time: now - 3600 });
  assert(r.ok);
  assertEquals(r.value.sent_at?.getTime(), (now - 3600) * 1000);
  assertEquals(validateSent({ question_index: 2, packet_id: 7, sent_time: now + 3600 }).ok, false);
  assertEquals(validateSent({ question_index: 2, packet_id: 7, sent_time: now - 48 * 3600 }).ok, false);
  assertEquals(validateSent({ question_index: 2, packet_id: 7, sent_time: 'x' }).ok, false);
  const legacy = validateSent({ question_index: 2, packet_id: 7 });
  assert(legacy.ok);
  assertEquals(legacy.value.sent_at, undefined);
});
