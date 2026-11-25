const STORE_KEY = 'typingforge-paragraph-library-v1';
const MAX_PER_LANGUAGE = 240;

export const DIFFICULTY_LEVELS = [
  { id: 1, name: 'Starter', detail: 'Short words · gentle pace', min: 18, max: 34 },
  { id: 2, name: 'Easy', detail: 'Short passage · simple flow', min: 35, max: 55 },
  { id: 3, name: 'Steady', detail: 'A balanced reading rhythm', min: 56, max: 78 },
  { id: 4, name: 'Advanced', detail: 'Longer lines · more variety', min: 79, max: 105 },
  { id: 5, name: 'Expert', detail: 'Long-form · exam focus', min: 106, max: 150 },
];

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{"paragraphs":{},"used":{}}');
  } catch {
    return { paragraphs: {}, used: {} };
  }
}

function writeStore(value) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    // The current paragraph still works if browser storage is full or disabled.
  }
}

function wordCount(text, language) {
  if (language === 'ja') {
    if (Intl.Segmenter) {
      return [...new Intl.Segmenter('ja-JP', { granularity: 'word' }).segment(text)].filter((part) => part.isWordLike).length;
    }
    return Array.from(text).length;
  }
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function splitSentences(text) {
  return (text.match(/[^.!?।！？]+[.!?।！？]?/gu) || [])
    .map((sentence) => sentence.replace(/\[[0-9]+\]/gu, '').replace(/\s+/gu, ' ').trim())
    .filter((sentence) => sentence.length > 12);
}

function makeId(language, title, text) {
  let hash = 2166136261;
  const value = language + '|' + title + '|' + text;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return language + '-' + (hash >>> 0).toString(36);
}

function buildParagraphs(page, language) {
  const raw = String(page.extract || '')
    .replace(/\r/gu, '\n')
    .split(/\n+/u)
    .map((line) => line.replace(/^\s*={1,6}.*?={1,6}\s*$/gu, '').trim())
    .filter((line) => line.length > 25 && !/^(references|bibliography|external links|सन्दर्भ|बाहरी कड़ियाँ)\b/iu.test(line));
  const sentences = raw.flatMap(splitSentences);
  const generated = [];

  for (const level of DIFFICULTY_LEVELS) {
    for (let start = 0; start < sentences.length; start += 1) {
      let text = '';
      let units = 0;
      for (let end = start; end < sentences.length && end < start + 12; end += 1) {
        const candidate = text ? text + ' ' + sentences[end] : sentences[end];
        const nextUnits = wordCount(candidate, language);
        if (nextUnits > level.max && units >= level.min) break;
        if (nextUnits > level.max && units === 0) {
          const words = language === 'ja' ? Array.from(sentences[end]) : sentences[end].split(/\s+/u);
          const take = language === 'ja' ? words.slice(0, level.max).join('') : words.slice(0, level.max).join(' ');
          if (wordCount(take, language) >= level.min) {
            text = take;
            units = wordCount(take, language);
          }
          break;
        }
        text = candidate;
        units = nextUnits;
        if (units >= level.min) break;
      }
      if (units < level.min || units > level.max || text.length < 80) continue;
      const normalized = text.trim();
      generated.push({
        id: makeId(language, page.title, normalized),
        language,
        difficulty: level.id,
        title: page.title,
        text: normalized,
        sourceUrl: page.fullurl || ('https://' + language + '.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /gu, '_'))),
        sourceName: 'Wikipedia contributors',
        license: 'CC BY-SA',
        fetchedAt: new Date().toISOString(),
        unitCount: units,
      });
    }
  }
  return [...new Map(generated.map((item) => [item.id, item])).values()];
}

async function fetchWikipedia(language, signal) {
  const query = new URLSearchParams({
    action: 'query',
    generator: 'random',
    grnnamespace: '0',
    grnlimit: '16',
    prop: 'extracts',
    explaintext: '1',
    exchars: '6500',
    inprop: 'url',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const response = await fetch('https://' + language + '.wikipedia.org/w/api.php?' + query, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('The passage library is temporarily unavailable.');
  const payload = await response.json();
  const pages = payload?.query?.pages || [];
  return pages.flatMap((page) => buildParagraphs(page, language));
}

function shuffled(items) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function fallbackParagraph(language, difficulty, fallbackText) {
  const level = DIFFICULTY_LEVELS[difficulty - 1];
  let sentences = splitSentences(fallbackText || '');
  if (!sentences.length) sentences = [fallbackText || 'A new practice session is ready.'];
  let text = '';
  let units = 0;
  let cursor = 0;
  const offset = Math.floor(Math.random() * sentences.length);
  while (units < level.min && cursor < sentences.length * 4) {
    const sentence = sentences[(cursor + offset) % sentences.length];
    text += (text ? ' ' : '') + sentence;
    units = wordCount(text, language);
    cursor += 1;
  }
  return {
    id: 'starter-' + language + '-' + difficulty + '-' + makeId(language, '', text) + '-' + Math.random().toString(36).slice(2, 7),
    language,
    difficulty,
    title: 'TypingForge starter passage',
    text,
    sourceUrl: '',
    sourceName: 'TypingForge',
    license: '',
    fetchedAt: new Date().toISOString(),
    unitCount: units,
    offline: true,
  };
}

export async function getNextParagraph(language, difficulty, fallbackText, signal) {
  let store = readStore();
  store.paragraphs[language] ||= [];
  store.used ||= {};
  const usedKey = language + ':' + difficulty;
  store.used[usedKey] ||= [];

  let available = store.paragraphs[language].filter((item) => item.difficulty === difficulty && !store.used[usedKey].includes(item.id));
  let fetchError = '';
  if (available.length < 2) {
    try {
      const incoming = await fetchWikipedia(language, signal);
      store = readStore();
      const existing = store.paragraphs[language] || [];
      const merged = [...new Map([...existing, ...incoming].map((item) => [item.id, item])).values()];
      store.paragraphs[language] = merged.slice(-MAX_PER_LANGUAGE);
      store.used ||= {};
      store.used[usedKey] ||= [];
      available = store.paragraphs[language].filter((item) => item.difficulty === difficulty && !store.used[usedKey].includes(item.id));
      writeStore(store);
    } catch (error) {
      fetchError = error?.name === 'AbortError' ? 'Passage request cancelled.' : 'Using a saved passage while the web library reconnects.';
    }
  }

  let chosen;
  if (available.length) {
    chosen = shuffled(available)[0];
  }

  if (!chosen) {
    chosen = fallbackParagraph(language, difficulty, fallbackText);
    fetchError ||= 'A starter passage is ready while the passage library finds a match for this level.';
  }

  store.used[usedKey] = [...new Set([...(store.used[usedKey] || []), chosen.id])].slice(-500);
  writeStore(store);
  return { ...chosen, fetchMessage: fetchError, requestedDifficulty: difficulty };
}

export function countSavedParagraphs(language) {
  return (readStore().paragraphs?.[language] || []).length;
}

export function resetParagraphLibrary() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* Resetting local history is best-effort if storage is unavailable. */ }
}
