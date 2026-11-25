import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeShareToken, makeShareUrl } from './sharing.js';

function createShareUrl(run, name = 'Typing learner') {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { href: 'https://goyalper.github.io/TypingForge/' } };

  try {
    return new URL(makeShareUrl(run, name));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('share results round-trip their learner name and performance', () => {
  const url = createShareUrl({
    label: '1-minute typing test',
    wpm: 72,
    accuracy: 94,
    date: '2026-11-26',
    language: 'hi',
    difficulty: 4,
  }, 'Umesh Goyal');

  const result = decodeShareToken(url.searchParams.get('r'));

  assert.equal(url.origin + url.pathname, 'https://goyalper.github.io/TypingForge/');
  assert.deepEqual(result, {
    name: 'Umesh Goyal',
    wpm: 72,
    accuracy: 94,
    date: '2026-11-26',
    language: 'hi',
    difficulty: 4,
    minutes: 1,
  });
});

test('share result values are clamped to supported ranges', () => {
  const url = createShareUrl({
    label: '10-minute typing test',
    wpm: 1200,
    accuracy: 125,
    language: 'unsupported',
    difficulty: 9,
  });

  const result = decodeShareToken(url.searchParams.get('r'));

  assert.equal(result.wpm, 999);
  assert.equal(result.accuracy, 100);
  assert.equal(result.language, 'en');
  assert.equal(result.difficulty, 5);
  assert.equal(result.minutes, 5);
});

test('invalid share tokens return null', () => {
  assert.equal(decodeShareToken('AA'), null);
});
