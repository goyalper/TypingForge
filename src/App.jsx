import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BarChart3, BookOpen, BookOpenCheck, Check,
  ChevronDown, CircleHelp, Clock3, Copy, Download, ExternalLink, Filter, Flame, Gamepad2,
  Globe2, Instagram, Keyboard, Languages, Linkedin, Menu, Moon, Pause, Play,
  RotateCcw, Search, Settings, Share2, Sparkles, Sun, Target, TrendingUp, Trophy, Volume2, VolumeX,
  X, Zap, MessageCircle, Medal,
} from 'lucide-react';
import { toKruti, toUnicode } from '@kovapdf/krutidev-unicode';
import asmrTypingAudioUrl from './assets/typing-asmr.mp3';
import { DIFFICULTY_LEVELS, countSavedParagraphs, getNextParagraph, resetParagraphLibrary } from './data/paragraphs.js';
import { exportAnalyticsCsv, exportResultsCsv, exportResultsJson } from './lib/exports.js';
import { createResultPoster, decodeShareToken, downloadPoster, makeShareUrl } from './lib/sharing.js';

const STORE_KEY = 'typingforge-v2';
const LANGUAGES = {
  en: { label: 'English', native: 'English', locale: 'en-US', sample: 'A clear mind finds its rhythm in the small things. Practice gives every careful keystroke a little more confidence, and steady effort turns a difficult task into a familiar habit.' },
  es: { label: 'Spanish', native: 'Español', locale: 'es-ES', sample: 'Cada día ofrece una oportunidad para aprender algo nuevo. La práctica constante convierte los pasos pequeños en avances seguros y abre espacio para nuevas ideas.' },
  fr: { label: 'French', native: 'Français', locale: 'fr-FR', sample: 'Chaque journée offre une occasion de découvrir quelque chose de nouveau. Une pratique régulière transforme les petits gestes en progrès solides et durables.' },
  de: { label: 'German', native: 'Deutsch', locale: 'de-DE', sample: 'Jeder Tag bietet eine Gelegenheit, etwas Neues zu lernen. Regelmäßige Übung macht aus kleinen Schritten einen sicheren Fortschritt und stärkt das Vertrauen.' },
  hi: { label: 'Hindi', native: 'हिन्दी', locale: 'hi-IN', sample: 'नियमित अभ्यास से आत्मविश्वास बढ़ता है। हर छोटा कदम नई सीख का रास्ता खोलता है और धैर्य के साथ कठिन काम भी आसान होने लगता है।' },
  ta: { label: 'Tamil', native: 'தமிழ்', locale: 'ta-IN', sample: 'தொடர்ந்து பயிற்சி செய்வது நம்பிக்கையை வளர்க்கிறது. ஒவ்வொரு சிறிய முயற்சியும் புதிய வாய்ப்புகளுக்கு வழி அமைத்து முன்னேற்றத்தை உருவாக்குகிறது.' },
  ja: { label: 'Japanese', native: '日本語', locale: 'ja-JP', sample: '毎日の練習を続けることで、自信が生まれます。小さな一歩を大切にすると、新しい発見と確かな進歩につながります。' },
};
const QUIZ = [
  ['How is typing speed commonly measured?', ['One word for every space', 'One word for every five characters', 'One word for every sentence', 'Only error-free words count'], 1, 'The common test convention counts five characters, including spaces, as one word.'],
  ['What helps build dependable speed?', ['Rushing on every test', 'Practising regularly with good accuracy', 'Looking only at the keyboard', 'Pressing keys harder'], 1, 'A relaxed, accurate rhythm is a stronger base for speed.'],
  ['What is Kruti Dev 010?', ['A Unicode Hindi keyboard', 'A legacy Hindi font encoding used with Remington input', 'A Hindi translation service', 'A browser extension'], 1, 'Kruti Dev 010 stores legacy character codes and is often used for Hindi typing exams.'],
  ['What should you do after a mistake?', ['Notice it and return to a steady pace', 'Stop the test immediately', 'Type faster to catch up', 'Ignore every error'], 0, 'Calmly noticing errors helps you improve accuracy without losing rhythm.'],
  ['Which habit helps during a longer exam?', ['Keep shoulders relaxed and take a breath', 'Lean close to the screen', 'Press every key firmly', 'Hold your hands still'], 0, 'A comfortable posture and a light touch help reduce fatigue.'],
];
const SOUND_OPTIONS = [
  ['asmr', 'ASMR soft taps'],
  ['mechanical', 'Mechanical keys'],
  ['soft', 'Soft tap'],
  ['typewriter', 'Typewriter'],
  ['pop', 'Bubble pop'],
  ['off', 'Sound off'],
];
const CHALLENGE_MESSAGES = [
  (name, run, link) => `${name} just hit ${run.wpm} WPM with ${run.accuracy}% accuracy. Think you can top that? Take the challenge: ${link}`,
  (name, run, link) => `${name} has set the pace at ${run.wpm} WPM. Your turn to beat it: ${link}`,
  (name, run, link) => `Typing duel: can you beat ${name}'s ${run.wpm} WPM and ${run.accuracy}% accuracy? Prove it here: ${link}`,
  (name, run, link) => `${name} posted a new typing benchmark: ${run.wpm} WPM. Got faster fingers? Challenge accepted: ${link}`,
  (name, run, link) => `${name} scored ${run.wpm} WPM on TypingForge. Think your score can beat theirs? Take your shot: ${link}`,
  (name, run, link) => `${run.wpm} WPM. ${run.accuracy}% accuracy. ${name} is waiting for a challenger: ${link}`,
];

function readSaved() {
  try {
    const current = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Object.keys(current).length) return current;
    return JSON.parse(localStorage.getItem('typingforge-v1') || '{}');
  } catch { return {}; }
}
function getGraphemes(value, locale = 'en') {
  if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(value)].map((part) => part.segment);
  return Array.from(value);
}
function inputUnits(value, isKruti, locale) {
  return isKruti ? Array.from(value) : getGraphemes(value, locale);
}
function expectedInput(value, isKruti) {
  if (!isKruti) return value;
  try { return toKruti(value); } catch { return value; }
}
function krutiPreview(value) {
  if (!value) return '';
  try { return toUnicode(value, { keepEnglish: false }); } catch { return value; }
}
function scoreText(typedValue, targetValue, seconds, isKruti, locale) {
  const typed = inputUnits(typedValue, isKruti, locale);
  const expected = inputUnits(expectedInput(targetValue, isKruti), isKruti, locale);
  let correct = 0;
  for (let index = 0; index < Math.min(typed.length, expected.length); index += 1) {
    if (typed[index] === expected[index]) correct += 1;
  }
  const elapsed = Math.max(seconds, typed.length ? 1 : 0);
  return {
    typed: typed.length,
    correct,
    errors: typed.length - correct,
    accuracy: typed.length ? Math.round(correct / typed.length * 100) : 100,
    wpm: elapsed ? Math.round(correct / 5 / (elapsed / 60)) : 0,
  };
}
function dayKey(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function streakFor(runs) {
  const days = new Set(runs.map((run) => run.day));
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
function timeLabel(value) {
  const seconds = Math.max(0, Math.ceil(value));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
function learnerInitials(name) {
  return String(name || '').trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toUpperCase() || 'TL';
}
function sharedResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('r');
  if (token) {
    const decoded = decodeShareToken(token);
    if (!decoded) return null;
    const minutes = Math.max(1, Math.min(5, Number(decoded.minutes) || 1));
    const language = String(decoded.language || 'en').slice(0, 32);
    return {
      name: String(decoded.name || 'Typing learner').slice(0, 48),
      wpm: Math.max(0, Math.min(999, Math.round(decoded.wpm))),
      accuracy: Math.max(0, Math.min(100, Math.round(decoded.accuracy))),
      date: String(decoded.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      language,
      languageName: LANGUAGES[language]?.label || language,
      difficulty: Math.max(1, Math.min(5, Number(decoded.difficulty) || 1)),
      label: minutes + '-minute typing test',
    };
  }
  if (params.get('share') !== '1') return null;
  const wpm = Number(params.get('wpm'));
  const accuracy = Number(params.get('accuracy'));
  if (!Number.isFinite(wpm) || !Number.isFinite(accuracy)) return null;
  return {
    name: (params.get('name') || 'Typing learner').slice(0, 48),
    wpm: Math.max(0, Math.min(999, Math.round(wpm))),
    accuracy: Math.max(0, Math.min(100, Math.round(accuracy))),
    date: (params.get('date') || new Date().toISOString().slice(0, 10)).slice(0, 10),
    languageName: (params.get('language') || 'Typing').slice(0, 32),
    difficulty: Math.max(1, Math.min(5, Number(params.get('difficulty')) || 1)),
    label: (params.get('test') || 'Typing test').slice(0, 44),
  };
}

function App() {
  const saved = useMemo(readSaved, []);
  const incomingShare = useMemo(sharedResultFromUrl, []);
  const [view, setView] = useState(incomingShare ? 'shared' : 'dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(saved.theme || 'light');
  const savedLearnerName = String(saved.learnerName || '').trim();
  const [learnerName, setLearnerName] = useState(savedLearnerName);
  const [nameDialogOpen, setNameDialogOpen] = useState(!savedLearnerName);
  const [nameDialogFirstRun, setNameDialogFirstRun] = useState(!savedLearnerName);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[saved.language] ? saved.language : 'en');
  const [inputLayout, setInputLayout] = useState(saved.inputLayout || (saved.language === 'hi' ? 'krutidev' : 'unicode'));
  const [difficulty, setDifficulty] = useState(Number(saved.difficulty) || 3);
  const [duration, setDuration] = useState([60, 180, 300].includes(Number(saved.duration)) ? Number(saved.duration) : 60);
  const [sound, setSound] = useState(saved.sound === 'mechanical' && !saved.soundDefaultUpdated ? 'asmr' : saved.sound || 'asmr');
  const [volume, setVolume] = useState(Number(saved.volume ?? 0.22));
  const [runs, setRuns] = useState(Array.isArray(saved.runs) ? saved.runs : []);
  const [quizBest, setQuizBest] = useState(Number(saved.quizBest) || 0);
  const [gameBests, setGameBests] = useState(saved.gameBests || {});
  const [paragraphs, setParagraphs] = useState([]);
  const [passageMessage, setPassageMessage] = useState('');
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedBase, setElapsedBase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [shareRun, setShareRun] = useState(null);
  const [shareName, setShareName] = useState('');
  const [poster, setPoster] = useState(null);
  const [shareMessage, setShareMessage] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [challengeCaption, setChallengeCaption] = useState('');
  const typedRef = useRef('');
  const targetRef = useRef('');
  const elapsedRef = useRef(0);
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const audioRef = useRef(null);
  const asmrBufferRef = useRef(null);
  const lastChallengeIndex = useRef(-1);
  const passageAbort = useRef(null);
  const passageRequest = useRef(0);
  const passageLoadingRef = useRef(false);
  const inputRef = useRef(null);
  const isKruti = language === 'hi' && inputLayout === 'krutidev';
  const lang = LANGUAGES[language];
  const target = useMemo(() => paragraphs.map((item) => item.text).filter(Boolean).join(' '), [paragraphs]);
  const expected = useMemo(() => inputUnits(expectedInput(target, isKruti), isKruti, lang.locale), [target, isKruti, lang.locale]);
  const typedUnits = useMemo(() => inputUnits(typed, isKruti, lang.locale), [typed, isKruti, lang.locale]);
  const live = useMemo(() => scoreText(typed, target, elapsed, isKruti, lang.locale), [typed, target, elapsed, isKruti, lang.locale]);
  typedRef.current = typed;
  targetRef.current = target;
  elapsedRef.current = elapsed;
  const expectedLength = expected.length;
  const savedPassageCount = countSavedParagraphs(language);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ theme, learnerName, language, inputLayout, difficulty, duration, sound, soundDefaultUpdated: true, volume, runs, quizBest, gameBests }));
  }, [theme, learnerName, language, inputLayout, difficulty, duration, sound, volume, runs, quizBest, gameBests]);
  useEffect(() => {
    return () => passageAbort.current?.abort();
  }, []);
  useEffect(() => {
    let active = true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    try { audioRef.current ||= new AudioContextClass(); } catch { return undefined; }
    fetch(asmrTypingAudioUrl)
      .then((response) => {
        if (!response.ok) throw new Error('Typing sound could not be loaded.');
        return response.arrayBuffer();
      })
      .then((audioData) => audioRef.current.decodeAudioData(audioData))
      .then((buffer) => { if (active) asmrBufferRef.current = buffer; })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const requestPassage = useCallback(async (append = false) => {
    if (append && passageLoadingRef.current) return;
    if (!append) {
      passageAbort.current?.abort();
      passageLoadingRef.current = false;
    }
    passageLoadingRef.current = true;
    setLoadingPassage(true);
    setPassageMessage('');
    const requestId = ++passageRequest.current;
    const controller = new AbortController();
    passageAbort.current = controller;
    try {
      const fresh = await getNextParagraph(language, difficulty, lang.sample, controller.signal);
      if (requestId !== passageRequest.current || controller.signal.aborted) return;
      setParagraphs((current) => append && current.length ? [...current, fresh] : [fresh]);
      if (fresh.fetchMessage) setPassageMessage(fresh.fetchMessage);
      else setPassageMessage('');
    } catch {
      if (requestId === passageRequest.current) setPassageMessage('A saved or starter passage is available while the passage library reconnects.');
    } finally {
      if (requestId === passageRequest.current) {
        passageLoadingRef.current = false;
        setLoadingPassage(false);
      }
    }
  }, [language, difficulty, lang.sample]);

  useEffect(() => {
    if (view === 'practice' && !paragraphs.length && !passageLoadingRef.current) requestPassage(false);
  }, [view, paragraphs.length, requestPassage]);

  useEffect(() => {
    if (view !== 'practice' || !startedRef.current || paused || result || !target || !expectedLength) return;
    const remaining = expectedLength - typedUnits.length;
    if (typedUnits.length >= Math.max(80, Math.floor(expectedLength * 0.58)) && remaining < 300 && !passageLoadingRef.current) {
      requestPassage(true);
    }
  }, [view, typedUnits.length, expectedLength, target, paused, result, requestPassage]);

  const resetSession = useCallback(() => {
    startedRef.current = false;
    completedRef.current = false;
    setTyped('');
    setStartedAt(0);
    setElapsedBase(0);
    setElapsed(0);
    setPaused(false);
    setResult(null);
  }, []);

  const saveLearnerName = (value) => {
    const cleanName = String(value || '').trim().replace(/\s+/gu, ' ').slice(0, 48);
    if (!cleanName) return false;
    setLearnerName(cleanName);
    setShareName(cleanName);
    setNameDialogOpen(false);
    return true;
  };
  const editLearnerName = () => {
    setNameDialogFirstRun(false);
    setNameDialogOpen(true);
  };
  const resetAllHistory = () => {
    passageRequest.current += 1;
    passageAbort.current?.abort();
    passageLoadingRef.current = false;
    setLoadingPassage(false);
    resetParagraphLibrary();
    try { localStorage.removeItem('typingforge-v1'); } catch { /* The visible history still resets if storage is unavailable. */ }
    resetSession();
    setRuns([]);
    setQuizBest(0);
    setGameBests({});
    setParagraphs([]);
    setPassageMessage('');
    setResetConfirmOpen(false);
    setResetNotice(true);
  };

  const playSound = useCallback((sample = false) => {
    if (sound === 'off' && !sample) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioRef.current ||= new AudioContextClass();
      const context = audioRef.current;
      if (context.state === 'suspended') context.resume();
      const kind = sound === 'off' ? 'mechanical' : sound;
      const now = context.currentTime;
      if (kind === 'asmr' && asmrBufferRef.current) {
        const sampleBuffer = asmrBufferRef.current;
        const clipLength = Math.min(0.12, sampleBuffer.duration);
        const clipFrames = Math.max(1, Math.floor(sampleBuffer.sampleRate * clipLength));
        const maxStart = Math.max(0, sampleBuffer.length - clipFrames);
        const stride = Math.max(1, Math.floor(sampleBuffer.sampleRate * 0.003));
        const channel = sampleBuffer.getChannelData(0);
        const candidates = [];
        for (let attempt = 0; attempt < 28; attempt += 1) {
          const start = Math.floor(Math.random() * (maxStart + 1));
          let energy = 0;
          let samples = 0;
          for (let frame = start; frame < start + clipFrames; frame += stride) {
            energy += channel[frame] * channel[frame];
            samples += 1;
          }
          candidates.push({ start, energy: energy / Math.max(1, samples) });
        }
        candidates.sort((first, second) => second.energy - first.energy);
        const strongest = candidates.slice(0, Math.min(8, candidates.length));
        const sampleStart = strongest[Math.floor(Math.random() * strongest.length)]?.start || 0;
        const source = context.createBufferSource();
        const tapGain = context.createGain();
        source.buffer = sampleBuffer;
        source.playbackRate.value = 0.94 + Math.random() * 0.12;
        tapGain.gain.setValueAtTime(0.001, now);
        tapGain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.65), now + 0.004);
        tapGain.gain.exponentialRampToValueAtTime(0.001, now + clipLength);
        source.connect(tapGain);
        tapGain.connect(context.destination);
        source.start(now, sampleStart / sampleBuffer.sampleRate, clipLength);
        return;
      }
      const asmr = kind === 'asmr';
      const soundLength = asmr ? 0.075 : kind === 'typewriter' ? 0.09 : 0.045;
      const gain = context.createGain();
      const master = Math.max(0.001, volume);
      const peak = master * (kind === 'mechanical' ? 0.4 : asmr ? 0.24 : 0.22);
      if (asmr) {
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
      } else gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + soundLength);
      gain.connect(context.destination);
      if (kind === 'soft' || kind === 'pop') {
        const oscillator = context.createOscillator();
        oscillator.type = kind === 'pop' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(kind === 'pop' ? 720 : 420, now);
        oscillator.frequency.exponentialRampToValueAtTime(kind === 'pop' ? 350 : 220, now + 0.04);
        oscillator.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
      } else {
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * soundLength), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) {
          const fade = 1 - index / samples.length;
          samples[index] = (Math.random() * 2 - 1) * (asmr ? fade * fade : fade);
        }
        const noise = context.createBufferSource();
        const filter = context.createBiquadFilter();
        filter.type = asmr ? 'bandpass' : 'highpass';
        filter.frequency.value = asmr ? 1350 + Math.random() * 450 : kind === 'mechanical' ? 2150 + Math.random() * 800 : 2700;
        if (asmr) filter.Q.value = 0.65;
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + soundLength);
        if (asmr) {
          const body = context.createOscillator();
          const bodyGain = context.createGain();
          body.type = 'sine';
          body.frequency.value = 145 + Math.random() * 25;
          bodyGain.gain.setValueAtTime(master * 0.035, now);
          bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
          body.connect(bodyGain);
          bodyGain.connect(context.destination);
          body.start(now);
          body.stop(now + 0.05);
        }
        if (kind === 'mechanical') {
          const body = context.createOscillator();
          const bodyGain = context.createGain();
          body.type = 'triangle';
          body.frequency.value = 125 + Math.random() * 30;
          bodyGain.gain.setValueAtTime(master * 0.09, now);
          bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
          body.connect(bodyGain);
          bodyGain.connect(context.destination);
          body.start(now);
          body.stop(now + 0.03);
        }
      }
    } catch { /* Sound is optional; typing remains available. */ }
  }, [sound, volume]);

  const finishSession = useCallback((typedValue = typedRef.current, seconds = elapsedRef.current) => {
    if (!startedRef.current || completedRef.current) return null;
    completedRef.current = true;
    const isLegacy = language === 'hi' && inputLayout === 'krutidev';
    const score = scoreText(typedValue, targetRef.current, seconds, isLegacy, LANGUAGES[language].locale);
    const sources = [...new Map(paragraphs.filter((item) => item.sourceUrl).map((item) => [item.sourceUrl, { title: item.title, url: item.sourceUrl, sourceName: item.sourceName, license: item.license }])).values()];
    const run = {
      id: Date.now(),
      date: new Date().toISOString(),
      day: dayKey(),
      wpm: score.wpm,
      accuracy: score.accuracy,
      correct: score.correct,
      errors: score.errors,
      typed: score.typed,
      elapsed: Math.round(seconds),
      language,
      languageName: LANGUAGES[language].label,
      inputLabel: isLegacy ? 'Kruti Dev 010 · Remington' : language === 'hi' ? 'Hindi Unicode · system input' : 'System keyboard',
      layout: inputLayout,
      difficulty,
      difficultyName: DIFFICULTY_LEVELS[difficulty - 1].name,
      label: Math.round(duration / 60) + '-minute typing test',
      sourceTitle: sources.map((item) => item.title).filter(Boolean).join(' · ') || 'TypingForge starter passage',
      sourceUrl: sources.find((item) => item.url)?.url || '',
      sources,
    };
    setRuns((current) => [run, ...current].slice(0, 300));
    setResult(run);
    setStartedAt(0);
    return run;
  }, [language, inputLayout, paragraphs, difficulty, duration]);

  useEffect(() => {
    if (!startedAt || paused || result) return undefined;
    const timer = window.setInterval(() => {
      const next = elapsedBase + (Date.now() - startedAt) / 1000;
      setElapsed(next);
      if (next >= duration) finishSession(typedRef.current, duration);
    }, 150);
    return () => window.clearInterval(timer);
  }, [startedAt, elapsedBase, paused, result, duration, finishSession]);

  const handleTyping = (event) => {
    if (paused || result) return;
    const isLegacy = language === 'hi' && inputLayout === 'krutidev';
    const before = typedRef.current;
    const limit = inputUnits(expectedInput(targetRef.current, isLegacy), isLegacy, lang.locale).length;
    let next = event.target.value;
    let nextUnits = inputUnits(next, isLegacy, lang.locale);
    if (nextUnits.length > limit) {
      next = nextUnits.slice(0, limit).join('');
      nextUnits = inputUnits(next, isLegacy, lang.locale);
    }
    const oldLength = inputUnits(before, isLegacy, lang.locale).length;
    if (nextUnits.length > oldLength) {
      if (!startedRef.current) {
        startedRef.current = true;
        setStartedAt(Date.now());
      }
      playSound();
    }
    setTyped(next);
  };

  const chooseLanguage = (value) => {
    setLanguage(value);
    setInputLayout(value === 'hi' ? 'krutidev' : 'unicode');
    setParagraphs([]);
    setPassageMessage('');
    resetSession();
  };
  const chooseDifficulty = (value) => {
    setDifficulty(value);
    setParagraphs([]);
    setPassageMessage('');
    resetSession();
  };
  const chooseLayout = (value) => {
    setInputLayout(value);
    resetSession();
  };
  const chooseDuration = (value) => {
    setDuration(value);
    resetSession();
  };
  const startTest = (seconds = duration, level = difficulty) => {
    if (level !== difficulty) chooseDifficulty(level);
    setDuration(seconds);
    resetSession();
    setView('practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const pauseSession = useCallback(() => {
    if (!startedAt) return;
    const current = elapsedBase + (Date.now() - startedAt) / 1000;
    setElapsed(current);
    setElapsedBase(current);
    setStartedAt(0);
    setPaused(true);
  }, [startedAt, elapsedBase]);
  const resumeSession = useCallback(() => {
    if (!paused) return;
    setPaused(false);
    setStartedAt(Date.now());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [paused]);
  useEffect(() => {
    if (view !== 'practice' && startedAt && !paused && !result) pauseSession();
  }, [view, startedAt, paused, result, pauseSession]);
  const nextChallengeCaption = (run, name, link) => {
    let index = Math.floor(Math.random() * CHALLENGE_MESSAGES.length);
    if (index === lastChallengeIndex.current) index = (index + 1 + Math.floor(Math.random() * (CHALLENGE_MESSAGES.length - 1))) % CHALLENGE_MESSAGES.length;
    lastChallengeIndex.current = index;
    const caption = CHALLENGE_MESSAGES[index](name, run, link);
    setChallengeCaption(caption);
    return caption;
  };
  const openShare = (run) => {
    const name = learnerName.trim() || 'Typing learner';
    const link = makeShareUrl(run, name);
    setShareRun(run);
    setShareName(name);
    setPoster(null);
    setShareMessage('Preparing your challenge poster…');
    setShareError('');
    setShareBusy(true);
    nextChallengeCaption(run, name, link);
    createResultPoster(run, name)
      .then((generated) => {
        setPoster(generated);
        setShareMessage('Poster ready. Choose a friend and challenge them to beat your score.');
      })
      .catch(() => setShareError('The poster could not be created. Try again in a moment.'))
      .finally(() => setShareBusy(false));
  };
  const createPoster = async () => {
    if (!shareRun || !shareName.trim()) {
      setShareError('Add a learner name in Settings before creating a result poster.');
      return;
    }
    setShareBusy(true);
    setShareError('');
    try {
      const generated = await createResultPoster(shareRun, shareName.trim().slice(0, 48));
      setPoster(generated);
      setShareMessage('Your challenge poster is ready.');
    } catch {
      setShareError('The poster could not be created. Try again in a moment.');
    } finally {
      setShareBusy(false);
    }
  };
  const copyShareLink = async () => {
    if (!shareRun || !shareName.trim()) {
      setShareError('Add a learner name in Settings before copying a result link.');
      return;
    }
    const link = poster?.shareUrl || makeShareUrl(shareRun, shareName.trim());
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage('Short result link copied.');
    } catch {
      window.prompt('Copy your result link:', link);
    }
  };
  const copyChallengeCaption = async () => {
    if (!shareRun) return;
    const link = poster?.shareUrl || makeShareUrl(shareRun, shareName.trim() || 'Typing learner');
    const caption = challengeCaption || nextChallengeCaption(shareRun, shareName.trim() || 'Typing learner', link);
    try {
      await navigator.clipboard.writeText(caption);
      setShareMessage('Challenge message copied with the short result link.');
    } catch {
      window.prompt('Copy this challenge message:', caption);
    }
  };
  const shareSocial = async (network) => {
    if (!shareRun || !poster) return;
    const name = shareName.trim() || 'Typing learner';
    const link = poster.shareUrl || makeShareUrl(shareRun, name);
    const text = nextChallengeCaption(shareRun, name, link);
    const file = typeof File === 'undefined' ? null : new File([poster.blob], 'typingforge-challenge.png', { type: 'image/png' });
    let supportsFileShare = false;
    try { supportsFileShare = Boolean(file && navigator.share && navigator.canShare?.({ files: [file] })); } catch { /* Use the download fallback when file sharing is unavailable. */ }
    try {
      if ((network === 'poster' || network === 'whatsapp' || network === 'linkedin' || network === 'instagram') && supportsFileShare) {
        await navigator.share({ files: [file], title: 'TypingForge challenge', text });
        setShareMessage(network === 'whatsapp' ? 'Choose WhatsApp and your friend. The poster and challenge are ready to send.' : network === 'linkedin' ? 'Choose LinkedIn in the share sheet to post your challenge.' : network === 'instagram' ? 'Choose Instagram in the share sheet to post your challenge poster.' : 'Choose a friend or app to share the poster and challenge.');
        return;
      }
      if (network === 'poster') {
        downloadPoster(poster.blob);
        try { await navigator.clipboard.writeText(text); } catch { /* The caption stays visible in the dialog. */ }
        setShareMessage('Poster downloaded and challenge message copied.');
      } else if (network === 'whatsapp') {
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        downloadPoster(poster.blob);
        setShareMessage('WhatsApp opened with your challenge. Attach the downloaded poster before sending.');
      } else if (network === 'linkedin') {
        window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link), '_blank', 'noopener,noreferrer');
        downloadPoster(poster.blob);
        try { await navigator.clipboard.writeText(text); } catch { /* The challenge remains visible in the dialog. */ }
        setShareMessage('LinkedIn opened with your short result link. The challenge was copied; add it and the downloaded poster to your post.');
      } else if (network === 'instagram') {
        downloadPoster(poster.blob);
        setShareMessage('Poster downloaded. Open Instagram and add it to your post or story.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setShareError('Sharing could not be opened. Download the poster and copy the challenge message instead.');
    }
  };
  const onGameBest = useCallback((game, score) => {
    setGameBests((current) => ({ ...current, [game]: Math.max(current[game] || 0, score) }));
  }, []);
  const toggleSound = () => setSound((current) => current === 'off' ? 'asmr' : 'off');
  const stats = useMemo(() => ({
    sessions: runs.length,
    best: runs.reduce((max, run) => Math.max(max, run.wpm || 0), 0),
    accuracy: runs.length ? Math.round(runs.reduce((sum, run) => sum + (run.accuracy || 0), 0) / runs.length) : 0,
    streak: streakFor(runs),
  }), [runs]);

  const nav = [
    ['dashboard', 'Overview', <BarChart3 size={18} />],
    ['practice', 'Typing test', <Keyboard size={18} />],
    ['tests', 'Tests & quizzes', <BookOpenCheck size={18} />],
    ['results', 'Results', <Medal size={18} />],
    ['games', 'Games', <Gamepad2 size={18} />],
    ['progress', 'Analytics', <Activity size={18} />],
  ];
  const pageNames = { dashboard: 'Overview', practice: 'Typing test', tests: 'Tests & quizzes', results: 'Results', games: 'Games', progress: 'Analytics', settings: 'Settings', shared: 'Shared result' };
  let page;
  if (view === 'dashboard') page = <Dashboard stats={stats} runs={runs} go={(next) => setView(next)} startTest={startTest} />;
  else if (view === 'practice') page = <PracticePage
    language={language} languages={LANGUAGES} layout={inputLayout} isKruti={isKruti} difficulty={difficulty}
    duration={duration} paragraphs={paragraphs} target={target} expected={expected} typed={typed}
    typedUnits={typedUnits} live={live} elapsed={elapsed} started={!!startedAt || elapsedBase > 0}
    paused={paused} result={result} loading={loadingPassage} message={passageMessage}
    savedPassages={savedPassageCount} inputRef={inputRef} onLanguage={chooseLanguage} onLayout={chooseLayout}
    onDifficulty={chooseDifficulty} onDuration={chooseDuration} onTyping={handleTyping}
    onRestart={resetSession} onPause={pauseSession} onResume={resumeSession}
    onFinish={() => finishSession()} onNewPassage={() => { resetSession(); requestPassage(false); }}
    sound={sound} onSound={() => playSound(true)} onToggleSound={toggleSound}
    onShare={openShare} onNavigate={(next) => setView(next)}
  />;
  else if (view === 'tests') page = <TestsPage best={quizBest} onBest={setQuizBest} onStart={startTest} difficulty={difficulty} />;
  else if (view === 'results') page = <ResultsPage runs={runs} onShare={openShare} onStart={() => startTest(60)} />;
  else if (view === 'games') page = <GamesPage bests={gameBests} onBest={onGameBest} onSound={() => playSound()} sound={sound} />;
  else if (view === 'progress') page = <AnalyticsPage stats={stats} runs={runs} />;
  else if (view === 'shared') page = <SharedResult run={incomingShare} onStart={() => startTest(60)} />;
  else page = <SettingsPage language={language} languages={LANGUAGES} sound={sound} volume={volume} savedCount={runs.length} learnerName={learnerName} initials={learnerInitials(learnerName)} resetNotice={resetNotice} onLanguage={chooseLanguage} onSound={setSound} onVolume={setVolume} onSample={() => playSound(true)} onEditName={editLearnerName} onResetHistory={() => { setResetNotice(false); setResetConfirmOpen(true); }} />;

  const navigateFooter = (next) => {
    if (next === 'practice' && result) resetSession();
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
        <div className="brand-row">
          <button className="brand" onClick={() => { setView('dashboard'); setMobileNav(false); }} aria-label="TypingForge home">
            <span className="brand-mark"><Keyboard size={19} /></span><span className="brand-name">Typing<span>Forge</span></span>
          </button>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {nav.map(([id, label, glyph]) => <button key={id} className={'nav-link ' + (view === id ? 'nav-active' : '')} onClick={() => { if (id === 'practice' && result) resetSession(); setView(id); setMobileNav(false); }} aria-current={view === id ? 'page' : undefined}>{glyph}<span>{label}</span>{view === id && <i />}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className={'nav-link ' + (view === 'settings' ? 'nav-active' : '')} onClick={() => { setView('settings'); setMobileNav(false); }}><Settings size={18} /><span>Settings</span>{view === 'settings' && <i />}</button>
          <div className="streak-card"><span className="streak-icon"><Flame size={17} /></span><div><b>{stats.streak} day{stats.streak === 1 ? '' : 's'}</b><small>practice streak</small></div><Sparkles size={15} className="streak-spark" /></div>
          <div className="privacy-note"><i /> Saved on this device</div>
        </div>
      </aside>
      <button className={'mobile-scrim ' + (mobileNav ? 'scrim-visible' : '')} onClick={() => setMobileNav(false)} aria-label="Close navigation" />
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div className="breadcrumbs"><span>TypingForge</span><b>/</b><strong>{pageNames[view]}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="local-badge"><i /> Browser saved</span>
            <button className="icon-button" aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="learner-chip" onClick={editLearnerName} aria-label={'Edit learner name: ' + learnerName} title="Edit learner name"><span>{learnerInitials(learnerName)}</span><b>{learnerName}</b></button>
          </div>
        </header>
        <div className="page-wrap">{page}</div>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <button className="footer-brand" type="button" onClick={() => navigateFooter('dashboard')} aria-label="TypingForge home">
              <span className="footer-brand-mark"><Keyboard size={18} /></span>
              <span className="brand-name">Typing<span>Forge</span></span>
            </button>
            <nav className="site-footer-links" aria-label="Footer navigation">
              <button type="button" onClick={() => navigateFooter('practice')}>Typing practice</button>
              <button type="button" onClick={() => navigateFooter('tests')}>Tests & quizzes</button>
              <button type="button" onClick={() => navigateFooter('results')}>Results</button>
              <button type="button" onClick={() => navigateFooter('progress')}>Analytics</button>
              <button type="button" onClick={() => navigateFooter('games')}>Games</button>
              <a href="https://www.linkedin.com/in/umesh-goyal-a1215123a/" target="_blank" rel="noreferrer">Developer LinkedIn ↗</a>
            </nav>
            <div className="footer-legal">
              <span>Made with <span className="footer-heart" aria-label="love">♥</span> in India</span>
              <span>© {new Date().getFullYear()} TypingForge · Saved on this device</span>
            </div>
          </div>
        </footer>
      </main>
      {shareRun && <ShareDialog
        run={shareRun} name={shareName} initials={learnerInitials(shareName)} poster={poster} message={shareMessage} error={shareError}
        challengeCaption={challengeCaption}
        busy={shareBusy} onCreate={createPoster} onClose={() => setShareRun(null)} onCopy={copyShareLink}
        onCopyChallenge={copyChallengeCaption} onNewChallenge={() => { if (shareRun) nextChallengeCaption(shareRun, shareName, poster?.shareUrl || makeShareUrl(shareRun, shareName)); }}
        onSocial={shareSocial} onDownload={() => poster && downloadPoster(poster.blob)}
      />}
      {nameDialogOpen && <LearnerNameDialog firstRun={nameDialogFirstRun} initialName={learnerName} onSave={saveLearnerName} onClose={() => { if (!nameDialogFirstRun) setNameDialogOpen(false); }} />}
      {resetConfirmOpen && <ResetHistoryDialog onCancel={() => setResetConfirmOpen(false)} onConfirm={resetAllHistory} />}
    </div>
  );
}

function PageIntro({ eyebrow, title, children, action }) {
  return <section className="page-intro"><div><div className="eyebrow"><i /> {eyebrow}</div><h1>{title}</h1>{children && <p>{children}</p>}</div>{action && <div className="page-intro-action">{action}</div>}</section>;
}

function Dashboard({ stats, runs, go, startTest }) {
  return <>
    <section className="dashboard-welcome">
      <div className="welcome-content"><span className="welcome-kicker"><i /> YOUR PRACTICE STUDIO</span><h1>Make every keystroke <em>count.</em></h1><p>Build the speed, accuracy, and confidence you need for your next typing test.</p><div className="welcome-actions"><button className="button-primary" onClick={() => go('practice')}><Keyboard size={17} /> Start typing <ArrowRight size={16} /></button><button className="button-quiet" onClick={() => go('games')}><Gamepad2 size={17} /> Take a game break</button></div><div className="privacy-inline"><i /> No account needed · your history stays in this browser</div></div>
      <div className="welcome-visual" aria-hidden="true"><div className="visual-orbit orbit-a" /><div className="visual-orbit orbit-b" /><div className="visual-glow" /><div className="visual-keyboard"><div>{['Q','W','E','R','T','Y','U','I'].map((key, i) => <span key={key} className={i === 4 ? 'key-pop' : ''}>{key}</span>)}</div><div>{['A','S','D','F','G','H','J'].map((key, i) => <span key={key} className={i === 2 ? 'key-mint' : ''}>{key}</span>)}</div><div><span>⇧</span><span>⌘</span><span className="space-key-visual" /><span>↵</span></div></div><i className="visual-star star-a">✦</i><i className="visual-star star-b">✳</i><span className="visual-chip chip-speed"><Zap size={13} /> {stats.best || '—'} WPM best</span><span className="visual-chip chip-accuracy"><Target size={13} /> {stats.accuracy || '—'}% accuracy</span></div>
    </section>
    <section className="metric-grid">
      <MetricCard label="Personal best" value={stats.best || '—'} unit="WPM" icon={<Zap size={17} />} tone="violet" detail="Your fastest test" />
      <MetricCard label="Average accuracy" value={stats.accuracy || '—'} unit={stats.sessions ? '%' : ''} icon={<Target size={17} />} tone="mint" detail="Across completed tests" />
      <MetricCard label="Tests completed" value={stats.sessions} unit="" icon={<BookOpenCheck size={17} />} tone="blue" detail="Saved on this device" />
      <MetricCard label="Practice streak" value={stats.streak} unit="days" icon={<Flame size={17} />} tone="peach" detail="A little practice adds up" />
    </section>
    <section className="dashboard-feature-grid">
      <article className="feature-card exam-feature">
        <div className="feature-copy"><span className="section-label">EXAM MODE</span><h2>Hindi typing, with <em>Kruti Dev 010.</em></h2><p>Practise with a Unicode Hindi passage, Remington style key input, and a clear view of your test score.</p><div className="feature-tags"><span><Languages size={14} /> Hindi + English</span><span><Clock3 size={14} /> 1, 3 or 5 min</span></div><button className="button-primary" onClick={() => { go('practice'); }}><Keyboard size={16} /> Open test workspace <ArrowRight size={15} /></button></div>
        <div className="exam-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-card"><span>हिन्दी टाइपिंग</span><b>010</b><small>REMINGTON INPUT</small></div><i className="art-spark">✦</i><i className="art-dot" /></div>
      </article>
      <article className="daily-card"><div className="section-heading"><div><span className="section-label">QUICK START</span><h2>Pick up the pace</h2></div><span className="heading-icon"><Clock3 size={17} /></span></div><p>Choose a focused session and get a fresh passage each time.</p><div className="quick-start-list"><button onClick={() => startTest(60)}><span className="quick-icon quick-violet"><Clock3 size={17} /></span><span><b>1-minute test</b><small>Find your baseline</small></span><ArrowRight size={15} /></button><button onClick={() => startTest(180)}><span className="quick-icon quick-mint"><Target size={17} /></span><span><b>3-minute test</b><small>Build your rhythm</small></span><ArrowRight size={15} /></button><button onClick={() => go('tests')}><span className="quick-icon quick-peach"><CircleHelp size={17} /></span><span><b>Typing quiz</b><small>Learn as you go</small></span><ArrowRight size={15} /></button></div></article>
    </section>
    <section className="dashboard-bottom-grid">
      <article className="content-card recent-preview"><div className="section-heading"><div><span className="section-label">LATEST RESULTS</span><h2>Your practice log</h2></div><button className="text-link" onClick={() => go('results')}>All results <ArrowRight size={14} /></button></div>
        {runs.length ? runs.slice(0, 4).map((run) => <div className="recent-result-row" key={run.id}><span className="result-medal"><Trophy size={15} /></span><div><b>{run.label}</b><small>{new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {run.languageName || LANGUAGES[run.language]?.label}</small></div><strong>{run.wpm}<small>WPM</small></strong><span className="recent-accuracy">{run.accuracy}%<small>accuracy</small></span></div>) : <div className="empty-state"><span className="empty-icon"><Keyboard size={20} /></span><b>Your first result is waiting.</b><p>Finish a short typing test and your speed and accuracy will appear here.</p><button className="text-link" onClick={() => go('practice')}>Start a test <ArrowRight size={14} /></button></div>}
      </article>
      <article className="content-card game-preview"><div className="game-preview-top"><span className="game-preview-icon"><Gamepad2 size={19} /></span><span className="section-label">BRAIN BREAK</span></div><h2>Take a playful <em>detour.</em></h2><p>Quick word and key games give your hands a change of pace.</p><div className="game-preview-visual" aria-hidden="true"><span>type</span><i>✦</i><b>tap</b><i>✳</i><span>play</span></div><button className="button-secondary" onClick={() => go('games')}>Explore typing games <ArrowRight size={15} /></button></article>
    </section>
  </>;
}

function MetricCard({ label, value, unit, icon, tone, detail }) {
  return <article className="metric-card"><div className="metric-card-top"><span>{label}</span><i className={'metric-icon ' + tone}>{icon}</i></div><strong>{value}<small>{unit}</small></strong><p>{detail}</p></article>;
}

function PracticePage({
  language, languages, layout, isKruti, difficulty, duration, paragraphs, target, expected,
  typed, typedUnits, live, elapsed, started, paused, result, loading, message, savedPassages, sound,
  inputRef, onLanguage, onLayout, onDifficulty, onDuration, onTyping, onRestart, onPause,
  onResume, onFinish, onNewPassage, onSound, onToggleSound, onShare, onNavigate,
}) {
  const lang = languages[language];
  const passageBoardRef = useRef(null);
  const [keyboardLocks, setKeyboardLocks] = useState({ caps: null, num: null, scroll: null });
  const [readAloud, setReadAloud] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (paused || result) {
      window.speechSynthesis?.cancel();
      setReadAloud(false);
    }
  }, [paused, result]);
  const toggleReadAloud = () => {
    if (!window.speechSynthesis) return;
    if (readAloud) {
      window.speechSynthesis.cancel();
      setReadAloud(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(target);
    utterance.lang = lang.locale;
    utterance.onend = () => setReadAloud(false);
    utterance.onerror = () => setReadAloud(false);
    window.speechSynthesis.speak(utterance);
    setReadAloud(true);
  };
  const updateKeyboardLocks = (event) => {
    if (typeof event.getModifierState !== 'function') return;
    const readState = (key) => {
      try { return event.getModifierState(key); } catch { return null; }
    };
    const next = { caps: readState('CapsLock'), num: readState('NumLock'), scroll: readState('ScrollLock') };
    setKeyboardLocks((current) => ({
      caps: next.caps ?? current.caps,
      num: next.num ?? current.num,
      scroll: next.scroll ?? current.scroll,
    }));
  };
  const timeLeft = Math.max(0, duration - elapsed);
  const displayChars = getGraphemes(target, lang.locale);
  const progress = expected.length ? Math.min(100, typedUnits.length / expected.length * 100) : 0;
  const displayProgress = isKruti && expected.length ? Math.floor(progress / 100 * displayChars.length) : typedUnits.length;
  useEffect(() => {
    const board = passageBoardRef.current;
    const cursor = board?.querySelector('.char-cursor');
    if (!board || !cursor) return;
    const boardBounds = board.getBoundingClientRect();
    const cursorBounds = cursor.getBoundingClientRect();
    if (cursorBounds.bottom > boardBounds.bottom - 36) board.scrollBy({ top: cursorBounds.bottom - boardBounds.bottom + 42, behavior: 'smooth' });
    else if (cursorBounds.top < boardBounds.top + 22) board.scrollBy({ top: cursorBounds.top - boardBounds.top - 24, behavior: 'smooth' });
  }, [displayProgress, target]);
  const paragraphSources = [...new Map(paragraphs.filter((item) => item.sourceUrl).map((item) => [item.sourceUrl, item])).values()];
  const highlighted = displayChars.map((char, index) => {
    const isPassed = index < displayProgress;
    const isWrong = !isKruti && isPassed && typedUnits[index] !== char;
    return <span key={index} className={isWrong ? 'char-error' : isPassed ? 'char-done' : index === displayProgress ? 'char-cursor' : ''}>{char === ' ' ? '\u00a0' : char}</span>;
  });
  const unicodePreview = isKruti ? krutiPreview(typed) : typed;
  const source = paragraphs[0];
  const sessionLocked = started || paused;
  return <>
    <PageIntro eyebrow="FOCUSED PRACTICE" title={<>Typing test <em>workspace.</em></>}>
      Set your exam language, input method, difficulty, and time. Your score is saved to this browser.
    </PageIntro>
    {result ? <section className="completed-panel">
      <div className="completed-art" aria-hidden="true"><div className="completed-orbit" /><span><Trophy size={31} /></span><i>✦</i><b>✳</b></div>
      <div className="completed-copy"><span className="section-label">TEST COMPLETE</span><h2>Nice work, {result.wpm} WPM.</h2><p>Your {result.languageName} result is saved. Keep it, share it, or head back for another passage.</p><div className="completed-metrics"><div><b>{result.wpm}</b><span>words per minute</span></div><div><b>{result.accuracy}%</b><span>accuracy</span></div><div><b>{result.errors}</b><span>errors</span></div><div><b>{timeLabel(result.elapsed)}</b><span>test time</span></div></div><div className="completed-actions"><button className="button-primary" onClick={() => onShare(result)}><Share2 size={16} /> Make a result poster</button><button className="button-secondary" onClick={() => onNavigate('results')}>View results <ArrowRight size={15} /></button><button className="button-quiet" onClick={onRestart}><RotateCcw size={15} /> Retake this passage</button></div></div>
    </section> : <>
      <section className="test-presets"><div><span className="section-label">TEST LENGTH</span><strong>{started ? 'Timed test in progress' : 'Choose a timed test'}</strong></div><div className="preset-buttons">{[60, 180, 300].map((seconds) => <button key={seconds} className={duration === seconds ? 'preset-active' : ''} onClick={() => onDuration(seconds)} disabled={sessionLocked}>{seconds / 60} min</button>)}</div><span className="preset-note"><Clock3 size={14} /> {started ? 'Session in progress' : 'Clock starts with your first key'}</span></section>
      <div className="practice-layout-new">
        <section className="workbench-card">
          <div className="workbench-heading"><div><span className="section-label">{started ? 'ACTIVE SESSION' : 'PASSAGE SETUP'}</span><h2>{started ? 'Your test is underway' : 'Prepare your test'}</h2></div><span className="fresh-badge"><i /> New passage library</span></div>
          <div className="setup-grid">
            <label className="form-control"><span><Globe2 size={15} /> Language</span><div className="form-select"><select value={language} onChange={(event) => onLanguage(event.target.value)} aria-label="Passage language" disabled={sessionLocked}>{Object.entries(languages).map(([key, item]) => <option key={key} value={key}>{item.native} · {item.label}</option>)}</select><ChevronDown size={15} /></div></label>
            <label className="form-control"><span><Keyboard size={15} /> Input method</span><div className="form-select"><select value={layout} onChange={(event) => onLayout(event.target.value)} aria-label="Keyboard input method" disabled={sessionLocked || language !== 'hi'}>{language === 'hi' ? <><option value="krutidev">Kruti Dev 010 · Remington</option><option value="unicode">Hindi Unicode · system input</option></> : <option value="unicode">System keyboard / IME</option>}</select><ChevronDown size={15} /></div></label>
          </div>
          {language === 'hi' && <div className="layout-note"><span className="layout-note-icon">हि</span><p>{isKruti ? <>Use your installed <b>Kruti Dev 010 Remington</b> input method. The passage stays in readable Unicode Hindi while your legacy key sequence is checked.</> : <>Use the Hindi Unicode input method enabled on your device, such as InScript. This mode checks the Unicode characters you enter.</>}</p></div>}
          <div className="difficulty-title"><div><span className="section-label">PASSAGE DIFFICULTY</span><strong>Choose your level</strong></div><span>Five levels</span></div>
           <div className="difficulty-grid">{DIFFICULTY_LEVELS.map((level) => <button key={level.id} className={'difficulty-card ' + (difficulty === level.id ? 'difficulty-active' : '')} onClick={() => onDifficulty(level.id)} disabled={sessionLocked} aria-pressed={difficulty === level.id}><span className="difficulty-number">0{level.id}</span><b>{level.name}</b><small>{level.detail}</small>{difficulty === level.id && <i><Check size={12} /></i>}</button>)}</div>
           <div className="passage-title-row"><div><span className="section-label">YOUR PASSAGE</span><h3>{loading && !target ? 'Finding a fresh passage…' : source?.title || 'Fresh typing passage'}</h3></div><button className="icon-label-button" onClick={onNewPassage} disabled={loading || sessionLocked}><RotateCcw size={14} /> New paragraph</button></div>
           <div ref={passageBoardRef} className={'passage-board ' + (paused ? 'passage-dimmed' : '')}>
            {loading && !target ? <div className="passage-loading"><span className="loading-pulse" /><b>Choosing a new passage</b><small>Saved passages are shuffled to keep practice fresh.</small></div> :
              <div className="passage-text" lang={lang.locale} aria-label="Passage to type">{highlighted}</div>}
            {paused && <div className="pause-overlay"><button className="button-primary" onClick={onResume}><Play size={15} /> Resume test</button></div>}
          </div>
          {isKruti && typed && <div className="unicode-preview"><span>LIVE UNICODE PREVIEW</span><p lang="hi">{unicodePreview || 'Keep typing to build your Hindi preview.'}</p></div>}
          <div className="typing-input-label"><label htmlFor="typing-answer"><span><Keyboard size={15} /> {isKruti ? 'Type your Kruti Dev 010 key sequence' : 'Type the passage here'}</span></label><span className="typed-key-count">{typedUnits.length} keys</span><div className="keyboard-locks" role="group" aria-label="Keyboard lock indicators">{[['CAPS', 'Caps Lock', keyboardLocks.caps], ['NUM', 'Num Lock', keyboardLocks.num], ['SCRL', 'Scroll Lock', keyboardLocks.scroll]].map(([short, label, isOn]) => <span key={short} className={'keyboard-lock ' + (isOn ? 'keyboard-lock-on' : '')} aria-label={label + ': ' + (isOn === null ? 'state unavailable' : isOn ? 'on' : 'off')} title={label + (isOn === null ? ' · waiting for keyboard input' : isOn ? ' · on' : ' · off')}><i />{short}<b>{isOn === null ? '—' : isOn ? 'ON' : 'OFF'}</b></span>)}</div></div>
          <textarea id="typing-answer" ref={inputRef} className="typing-input-area" value={typed} onChange={onTyping} onKeyDown={(event) => { updateKeyboardLocks(event); if (event.key === 'Escape') onRestart(); if (event.key === 'Enter' || event.key === 'Tab') event.preventDefault(); }} onKeyUp={updateKeyboardLocks} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck="false" lang={isKruti ? 'en' : lang.locale} disabled={paused || loading && !target} placeholder={isKruti ? 'Your Kruti Dev encoded keystrokes will appear here…' : 'Click here and start typing the passage above…'} aria-label={isKruti ? 'Kruti Dev 010 typing input' : lang.label + ' typing input'} />
          {message && <p className="passage-message"><Sparkles size={14} /> {message}</p>}
          <div className="source-credit">
            {paragraphSources.length ? <><span>Passage sources</span>{paragraphSources.map((item) => <a key={item.sourceUrl} href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title} <ExternalLink size={12} /></a>)}<small>Adapted from Wikipedia contributors</small><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></> : <><span>Passage source</span><b>TypingForge starter library</b><small>Web passages are added when a connection is available.</small></>}
          </div>
          <div className="test-progress-track"><i style={{ width: progress + '%' }} /></div>
          <div className="workbench-footer"><span><kbd>Esc</kbd> restart <i>·</i> type at a steady pace</span><span>{Math.round(progress)}% of this passage</span></div>
        </section>
        <aside className="test-aside-new">
          <article className="timer-card"><span className="section-label">TIME REMAINING</span><strong className={timeLeft <= 10 && started ? 'timer-urgent' : ''}>{timeLabel(started ? timeLeft : duration)}</strong><div className="timer-track"><i style={{ width: Math.max(0, timeLeft / duration * 100) + '%' }} /></div><div className="timer-actions">{started && !paused ? <button className="button-secondary" onClick={onPause}><Pause size={15} /> Pause</button> : paused ? <button className="button-primary" onClick={onResume}><Play size={15} /> Resume</button> : <span><Clock3 size={14} /> Ready when you are</span>}{started && <button className="button-secondary" onClick={onRestart}><RotateCcw size={14} /> Restart</button>}<button className="finish-button" onClick={onFinish} disabled={!started}>Finish test</button></div></article>
          <article className="live-card"><div className="section-heading"><div><span className="section-label">LIVE SCORE</span><h2>Your typing rhythm</h2><small className="active-sound-name">{sound === 'off' ? 'Typing sounds off' : (SOUND_OPTIONS.find(([id]) => id === sound)?.[1] || 'ASMR soft taps') + ' enabled'}</small></div><div className="sound-actions"><button className="sound-sample" onClick={onSound} aria-label="Preview selected keyboard sound" title="Preview keyboard sound"><Play size={14} /></button><button className="sound-sample" onClick={onToggleSound} aria-label={sound === 'off' ? 'Turn typing sounds on' : 'Turn typing sounds off'} title={sound === 'off' ? 'Turn sound on' : 'Turn sound off'}>{sound === 'off' ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><button className={'sound-sample ' + (readAloud ? 'read-aloud-active' : '')} onClick={toggleReadAloud} aria-label={readAloud ? 'Stop reading passage aloud' : 'Read passage aloud'} aria-pressed={readAloud} title={readAloud ? 'Stop reading aloud' : 'Read passage aloud'}><BookOpen size={14} /></button></div></div><div className="live-score-grid"><div><span>Speed</span><b>{live.wpm}<small> WPM</small></b></div><div><span>Accuracy</span><b>{live.accuracy}<small>%</small></b></div><div><span>Correct keys</span><b>{live.correct}</b></div><div><span>Errors</span><b>{live.errors}</b></div></div><div className="live-encouragement"><Sparkles size={15} /><span>{started ? live.accuracy >= 95 ? 'Excellent control. Keep your rhythm.' : 'Take a breath and focus on accuracy.' : 'Your score starts with the first key.'}</span></div></article>
          <article className="test-tip-card"><span className="tip-icon"><Target size={17} /></span><div><span className="section-label">EXAM TIP</span><h3>Accuracy comes first.</h3><p>Use the input method you know from your exam. A calm pace helps keep errors low.</p></div></article>
          <article className="saved-library-card"><div className="saved-library-icon"><BookOpen size={17} /></div><div><b>{savedPassages} saved passages</b><small>Fresh paragraphs are kept in this browser for later practice.</small></div></article>
        </aside>
      </div>
    </>}
  </>;
}

function TestsPage({ best, onBest, onStart, difficulty }) {
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const selectAnswer = (answer) => {
    if (choice !== null || done) return;
    setChoice(answer);
    if (answer === QUIZ[index][2]) setScore((current) => current + 1);
  };
  const nextQuestion = () => {
    if (index === QUIZ.length - 1) {
      setDone(true);
      onBest((current) => Math.max(current, score));
    } else {
      setIndex((current) => current + 1);
      setChoice(null);
    }
  };
  const restartQuiz = () => { setIndex(0); setChoice(null); setScore(0); setDone(false); };
  const current = QUIZ[index];
  return <>
    <PageIntro eyebrow="CHOOSE YOUR CHALLENGE" title={<>Tests & <em>quizzes.</em></>}>Set a test length or explore quick lessons about typing, exam input, and keyboard habits.</PageIntro>
    <section className="test-choice-grid">
      {[60, 180, 300].map((seconds, i) => <article className={'timed-choice timed-choice-' + i} key={seconds}><span className="choice-icon"><Clock3 size={19} /></span><span className="section-label">{i === 0 ? 'QUICK BASELINE' : i === 1 ? 'STEADY PRACTICE' : 'EXAM ENDURANCE'}</span><h2>{seconds / 60} minute{seconds > 60 ? 's' : ''}</h2><p>{i === 0 ? 'A short check of speed and accuracy.' : i === 1 ? 'Settle into a longer typing rhythm.' : 'Practise holding your focus over time.'}</p><div className="choice-meta"><span><Target size={14} /> Level {difficulty}</span><span><Globe2 size={14} /> Choose language in test</span></div><button className="button-primary" onClick={() => onStart(seconds)}>Start timed test <ArrowRight size={15} /></button></article>)}
    </section>
    <section className="quiz-section">
      <div className="quiz-intro"><div className="quiz-intro-art" aria-hidden="true"><div className="quiz-orbit" /><span><CircleHelp size={28} /></span><i>✦</i><b>✓</b></div><div><span className="section-label">5 QUESTIONS · NO TIMER</span><h2>Typing know-how</h2><p>Short explanations help you learn the details behind a more confident test.</p><div className="quiz-best"><Trophy size={15} /> Personal best <b>{best} / 5</b></div></div></div>
      {done ? <div className="quiz-card quiz-done"><span className="quiz-complete-icon"><Check size={22} /></span><span className="section-label">QUIZ COMPLETE</span><h3>{score >= 4 ? 'Nicely done.' : 'Good practice.'}</h3><p>You got <b>{score} out of 5</b> right. {score >= 4 ? 'You know your way around a typing test.' : 'You have a few new tips for your next practice.'}</p><button className="button-secondary" onClick={restartQuiz}>Try the quiz again <RotateCcw size={14} /></button></div> :
      <div className="quiz-card"><div className="quiz-card-top"><span>QUESTION <b>{String(index + 1).padStart(2, '0')}</b><small> OF 05</small></span><span>{score} <small>correct</small></span></div><div className="quiz-progress"><i style={{ width: (index / QUIZ.length * 100) + '%' }} /></div><h3>{current[0]}</h3><div className="quiz-answers">{current[1].map((answer, answerIndex) => <button key={answer} className={'quiz-answer ' + (choice === answerIndex ? answerIndex === current[2] ? 'answer-right' : 'answer-wrong' : '')} onClick={() => selectAnswer(answerIndex)} disabled={choice !== null}><i>{String.fromCharCode(65 + answerIndex)}</i><span>{answer}</span>{choice !== null && answerIndex === current[2] && <Check size={15} />}</button>)}</div>{choice !== null ? <div className="quiz-feedback"><b>{choice === current[2] ? 'That’s right.' : 'Here’s the key idea.'}</b><p>{current[3]}</p><button className="text-link" onClick={nextQuestion}>{index === QUIZ.length - 1 ? 'See your score' : 'Next question'} <ArrowRight size={14} /></button></div> : <div className="quiz-card-foot">Choose an answer to continue <Sparkles size={13} /></div>}</div>}
    </section>
  </>;
}

function ResultsPage({ runs, onShare, onStart }) {
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const languages = [...new Set(runs.map((run) => run.languageName || LANGUAGES[run.language]?.label || run.language).filter(Boolean))];
  const filteredRuns = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const days = Number(dateFilter);
    const earliest = days ? Date.now() - days * 86400000 : 0;
    return runs.filter((run) => {
      const language = run.languageName || LANGUAGES[run.language]?.label || run.language || '';
      const searchable = [run.label, language, run.inputLabel, run.difficultyName, run.sourceTitle].join(' ').toLocaleLowerCase();
      const date = new Date(run.date).getTime();
      return (!needle || searchable.includes(needle))
        && (languageFilter === 'all' || language === languageFilter)
        && (difficultyFilter === 'all' || Number(run.difficulty) === Number(difficultyFilter))
        && (!days || Number.isFinite(date) && date >= earliest);
    }).slice().sort((first, second) => {
      if (sortBy === 'oldest') return new Date(first.date) - new Date(second.date);
      if (sortBy === 'fastest') return (second.wpm || 0) - (first.wpm || 0);
      if (sortBy === 'accuracy') return (second.accuracy || 0) - (first.accuracy || 0);
      return new Date(second.date) - new Date(first.date);
    });
  }, [runs, search, languageFilter, difficultyFilter, dateFilter, sortBy]);
  const averageWpm = filteredRuns.length ? Math.round(filteredRuns.reduce((sum, run) => sum + (run.wpm || 0), 0) / filteredRuns.length) : 0;
  const averageAccuracy = filteredRuns.length ? Math.round(filteredRuns.reduce((sum, run) => sum + (run.accuracy || 0), 0) / filteredRuns.length) : 0;
  const averageErrors = filteredRuns.length ? (filteredRuns.reduce((sum, run) => sum + (run.errors || 0), 0) / filteredRuns.length).toFixed(1) : '—';
  const bestSpeed = filteredRuns.reduce((best, run) => Math.max(best, run.wpm || 0), 0);
  const totalTime = filteredRuns.reduce((sum, run) => sum + (run.elapsed || 0), 0);
  const trendRuns = filteredRuns.slice().sort((first, second) => new Date(first.date) - new Date(second.date)).slice(-8);
  const maxTrendSpeed = Math.max(1, ...trendRuns.map((run) => run.wpm || 0));
  const trendDelta = trendRuns.length > 1 ? (trendRuns[trendRuns.length - 1].wpm || 0) - (trendRuns[0].wpm || 0) : 0;
  const hasFilters = Boolean(search || languageFilter !== 'all' || difficultyFilter !== 'all' || dateFilter !== 'all');
  const clearFilters = () => { setSearch(''); setLanguageFilter('all'); setDifficultyFilter('all'); setDateFilter('all'); setSortBy('recent'); };
  return <>
    <PageIntro eyebrow="YOUR TEST HISTORY" title={<>Results that show <em>your progress.</em></>}>
      Filter attempts, compare your speed and accuracy, and export the exact results you want to keep.
    </PageIntro>
    <section className="results-summary">
      <div><span className="section-label">MATCHING TESTS</span><strong>{filteredRuns.length}<small> / {runs.length}</small></strong><small>in this view</small></div>
      <div><span className="section-label">BEST SPEED</span><strong>{filteredRuns.length ? bestSpeed : '—'}<small>{filteredRuns.length ? ' WPM' : ''}</small></strong><small>filtered personal best</small></div>
      <div><span className="section-label">AVG ACCURACY</span><strong>{filteredRuns.length ? averageAccuracy : '—'}<small>{filteredRuns.length ? '%' : ''}</small></strong><small>across this view</small></div>
      <div><span className="section-label">PRACTICE TIME</span><strong>{timeLabel(totalTime)}</strong><small>filtered session time</small></div>
    </section>
    <section className="result-analysis-card">
      <div className="results-card-heading"><div><span className="section-label">PERFORMANCE ANALYSIS</span><h2>Speed across sessions</h2></div><span className="analysis-tag"><Activity size={14} /> Last {trendRuns.length} shown</span></div>
      {trendRuns.length ? <>
        <div className="result-trend-chart" aria-label="Typing speed for the last eight matching tests">
          {trendRuns.map((run, index) => <div className="result-trend-column" key={run.id || index}><b>{run.wpm || 0}</b><i style={{ height: Math.max(run.wpm ? 10 : 4, (run.wpm || 0) / maxTrendSpeed * 100) + '%' }} /><small>{new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>)}
        </div>
        <div className="result-analysis-foot"><span className={trendDelta >= 0 ? 'trend-positive' : 'trend-negative'}><TrendingUp size={15} /> {trendRuns.length > 1 ? (trendDelta > 0 ? '+' : '') + trendDelta + ' WPM across these sessions' : 'Complete another test to reveal your trend'}</span><span>Average {averageWpm} WPM · {averageErrors} errors per test</span></div>
      </> : <div className="result-trend-empty">No matching tests yet. Clear filters or complete a timed test to see your trend.</div>}
    </section>
    <section className="results-card">
      <div className="results-card-heading"><div><span className="section-label">RESULTS LIBRARY</span><h2>Your completed tests</h2></div><div className="export-actions"><button className="button-secondary" onClick={() => exportResultsCsv(filteredRuns)} disabled={!filteredRuns.length}><Download size={15} /> Download CSV</button><button className="button-secondary" onClick={() => exportResultsJson(filteredRuns)} disabled={!filteredRuns.length}><Download size={15} /> Download JSON</button></div></div>
      {!!runs.length && <div className="results-filter-bar">
        <label className="results-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tests, input, or source" aria-label="Search results" /></label>
        <label className="results-filter-select"><Filter size={14} /><select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} aria-label="Filter by language"><option value="all">All languages</option>{languages.map((language) => <option value={language} key={language}>{language}</option>)}</select></label>
        <label className="results-filter-select"><select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} aria-label="Filter by difficulty"><option value="all">All levels</option>{DIFFICULTY_LEVELS.map((level) => <option value={level.id} key={level.id}>Level {level.id} · {level.name}</option>)}</select></label>
        <label className="results-filter-select"><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by date"><option value="all">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
        <label className="results-filter-select"><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort results"><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="fastest">Fastest first</option><option value="accuracy">Accuracy first</option></select></label>
        {hasFilters && <button className="text-link clear-result-filters" onClick={clearFilters}>Clear filters</button>}
      </div>}
      {runs.length ? filteredRuns.length ? <><p className="results-count">Showing {filteredRuns.length} of {runs.length} saved tests · exports include these filtered results.</p><div className="results-table-wrap"><table className="results-table"><thead><tr><th>TEST</th><th>LANGUAGE & INPUT</th><th>LEVEL</th><th>SPEED</th><th>ACCURACY</th><th>DATE</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredRuns.map((run) => <tr key={run.id}><td><b>{run.label}</b><small>{timeLabel(run.elapsed)} · {run.typed || run.correct} keys</small></td><td><b>{run.languageName || LANGUAGES[run.language]?.label}</b><small>{run.inputLabel || 'System keyboard'}</small></td><td><span className="level-tag">{run.difficulty || 1} · {run.difficultyName || 'Level'}</span></td><td><strong>{run.wpm}<small> WPM</small></strong></td><td><strong>{run.accuracy}%</strong><small>{run.errors || 0} errors</small></td><td>{new Date(run.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td><td><button className="row-share" onClick={() => onShare(run)} aria-label={'Share result from ' + new Date(run.date).toLocaleDateString()}><Share2 size={15} /><span>Challenge</span></button></td></tr>)}</tbody></table></div></> : <div className="empty-results"><span><Search size={22} /></span><h3>No tests match those filters.</h3><p>Try another language, level, or date range.</p><button className="button-secondary" onClick={clearFilters}>Clear filters</button></div> : <div className="empty-results"><span><Medal size={25} /></span><h3>Your first result is close.</h3><p>Complete a timed typing test to see your speed, accuracy, input method, and date here.</p><button className="button-primary" onClick={onStart}>Take a typing test <ArrowRight size={15} /></button></div>}
    </section>
    <p className="local-data-note"><span><Check size={15} /></span> Your test history stays in this browser. Download a copy any time to keep your records elsewhere.</p>
  </>;
}

function AnalyticsPage({ stats, runs }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const records = runs.filter((run) => run.day === dayKey(date));
    return { label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2), amount: records.length, speed: records.length ? Math.round(records.reduce((sum, item) => sum + item.wpm, 0) / records.length) : 0 };
  });
  const maximum = Math.max(20, ...days.map((item) => item.speed));
  const averageSpeed = runs.length ? Math.round(runs.reduce((sum, item) => sum + item.wpm, 0) / runs.length) : 0;
  const totalPractice = runs.reduce((sum, item) => sum + (item.elapsed || 0), 0);
  const averageErrors = runs.length ? (runs.reduce((sum, item) => sum + (item.errors || 0), 0) / runs.length).toFixed(1) : '—';
  return <>
    <PageIntro eyebrow="YOUR PRACTICE DATA" title={<>See your <em>momentum.</em></>} action={<button className="button-secondary" onClick={() => exportAnalyticsCsv(runs)} disabled={!runs.length}><Download size={15} /> Download analytics</button>}>
      A clear view of your speed, accuracy, consistency, and practice time.
    </PageIntro>
    <section className="analytics-overview"><div className="analytics-highlight"><span className="section-label">PERSONAL BEST</span><strong>{stats.best || '—'}<small> WPM</small></strong><p>{runs.length ? 'Your fastest completed typing test.' : 'Your first test will set a baseline.'}</p><div className="highlight-wave" aria-hidden="true"><svg viewBox="0 0 400 90" preserveAspectRatio="none"><path d="M0 70 C35 65 45 31 82 48 S128 69 162 37 S209 48 243 25 S286 42 318 17 S365 28 400 6" /></svg></div></div><article className="analytics-stat"><span className="metric-icon mint"><Target size={17} /></span><small>Average speed</small><b>{averageSpeed || '—'}<i>{runs.length ? 'WPM' : ''}</i></b><p>Across {runs.length} saved test{runs.length === 1 ? '' : 's'}</p></article><article className="analytics-stat"><span className="metric-icon blue"><Clock3 size={17} /></span><small>Total practice</small><b>{timeLabel(totalPractice)}</b><p>Time spent at the keyboard</p></article><article className="analytics-stat"><span className="metric-icon peach"><Zap size={17} /></span><small>Average errors</small><b>{averageErrors}</b><p>Per completed test</p></article></section>
    <section className="analytics-grid-new"><article className="content-card weekly-chart"><div className="section-heading"><div><span className="section-label">LAST 7 DAYS</span><h2>Your typing rhythm</h2></div><span className="chart-legend"><i /> Average WPM</span></div><div className="chart-area"><div className="chart-guides"><i /><i /><i /><i /></div><div className="chart-columns">{days.map((day, index) => <div className="chart-column" key={index}><div className="chart-bar-wrap"><span>{day.amount ? day.speed + ' WPM' : ''}</span><i className={day.amount ? 'chart-bar-on' : ''} style={{ height: (day.speed ? Math.max(7, day.speed / maximum * 100) : 3) + '%' }} /></div><small>{day.label}</small></div>)}</div></div><p className="chart-caption">{runs.length ? 'Keep a steady rhythm. Your daily averages will grow with each test.' : 'Complete a typing test and your weekly progress will appear here.'}</p></article><article className="content-card analytics-breakdown"><div className="section-heading"><div><span className="section-label">PRACTICE SNAPSHOT</span><h2>At a glance</h2></div><Activity size={18} /></div><div className="snapshot-row"><span>Completed tests</span><b>{runs.length}</b></div><div className="snapshot-row"><span>Average accuracy</span><b>{stats.accuracy ? stats.accuracy + '%' : '—'}</b></div><div className="snapshot-row"><span>Practice streak</span><b>{stats.streak} days</b></div><div className="snapshot-row"><span>Most practised language</span><b>{runs.length ? mostUsedLanguage(runs) : '—'}</b></div><button className="button-secondary analytics-download" onClick={() => exportAnalyticsCsv(runs)} disabled={!runs.length}><Download size={15} /> Download full analytics</button></article></section>
  </>;
}

function mostUsedLanguage(runs) {
  const counts = runs.reduce((result, run) => { const key = run.languageName || LANGUAGES[run.language]?.label || run.language; result[key] = (result[key] || 0) + 1; return result; }, {});
  return Object.entries(counts).sort((first, second) => second[1] - first[1])[0]?.[0] || '—';
}

function GamesPage({ bests, onBest, onSound, sound }) {
  const [game, setGame] = useState('word');
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(45);
  const [score, setScore] = useState(0);
  const [wordInput, setWordInput] = useState('');
  const [target, setTarget] = useState('rhythm');
  const [gameMessage, setGameMessage] = useState('');
  const inputRef = useRef(null);
  const words = ['steady', 'focus', 'bright', 'signal', 'rhythm', 'keyboard', 'forest', 'motion', 'curious', 'confident', 'journey', 'practice', 'planet', 'puzzle', 'momentum', 'gentle', 'spark', 'window'];
  const patterns = ['ASDF', 'JKL;', 'FJDK', 'SLAK', 'QWER', 'UIOP', 'ZXCV', 'NM,./', 'HOME', 'TYPE'];
  const currentBest = bests[game] || 0;

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (running && seconds === 0) {
      setRunning(false);
      onBest(game, score);
      setGameMessage('Time is up. Your best for this game is ' + Math.max(currentBest, score) + ' points.');
    }
  }, [running, seconds, game, score, currentBest, onBest]);

  const startGame = (next = game) => {
    setGame(next);
    setRunning(true);
    setSeconds(45);
    setScore(0);
    setWordInput('');
    setGameMessage('Go for it. Keep a light touch and enjoy the run.');
    setTarget(next === 'word' ? words[Math.floor(Math.random() * words.length)] : patterns[Math.floor(Math.random() * patterns.length)]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const chooseGame = (next) => {
    setGame(next);
    setRunning(false);
    setSeconds(45);
    setScore(0);
    setWordInput('');
    setGameMessage('');
    setTarget(next === 'word' ? words[Math.floor(Math.random() * words.length)] : patterns[Math.floor(Math.random() * patterns.length)]);
  };
  const updateInput = (event) => {
    const value = event.target.value;
    setWordInput(value);
    if (!running) return;
    const targetValue = game === 'word' ? target.toLowerCase() : target;
    const typedValue = game === 'word' ? value.trim().toLowerCase() : value.toUpperCase();
    if (typedValue === targetValue) {
      setScore((current) => current + 1);
      setWordInput('');
      setTarget(game === 'word' ? words[Math.floor(Math.random() * words.length)] : patterns[Math.floor(Math.random() * patterns.length)]);
      setGameMessage('Nice one. Next target.');
      onSound();
    } else if (!targetValue.startsWith(typedValue)) {
      setGameMessage('Not quite. Clear the entry and try the target again.');
    }
  };
  return <>
    <PageIntro eyebrow="PLAYFUL PRACTICE" title={<>A little game <em>break.</em></>}>Give your hands a different rhythm. These quick games save your personal best on this device.</PageIntro>
    <section className="games-hero"><div className="games-hero-copy"><span className="section-label">TYPING ARCADE</span><h2>Play a round.<br /><em>Come back refreshed.</em></h2><p>Short challenges make a playful break between focused typing tests.</p><div className="games-hero-badges"><span><Clock3 size={14} /> 45-second rounds</span><span><Trophy size={14} /> Personal bests saved</span></div></div><div className="arcade-art" aria-hidden="true"><div className="arcade-orbit arcade-orbit-one" /><div className="arcade-orbit arcade-orbit-two" /><div className="arcade-screen"><span>READY?</span><b>TYPE<br />PLAY</b><i>✦</i></div><div className="arcade-keys"><span>A</span><span>S</span><span>D</span><span>F</span></div><i className="arcade-star">✳</i></div></section>
    <section className="game-selector" aria-label="Choose a typing game"><button className={'game-select-card ' + (game === 'word' ? 'game-select-active' : '')} onClick={() => chooseGame('word')}><span className="game-select-icon word-icon">Aa</span><span><b>Word Sprint</b><small>Type each word before the timer runs out.</small></span><strong>BEST {bests.word || 0}</strong></button><button className={'game-select-card ' + (game === 'meteor' ? 'game-select-active' : '')} onClick={() => chooseGame('meteor')}><span className="game-select-icon meteor-icon">⌁</span><span><b>Key Meteor</b><small>Clear each sequence with a clean key run.</small></span><strong>BEST {bests.meteor || 0}</strong></button></section>
    <section className="game-console">
      <div className="game-console-top"><div><span className="section-label">{game === 'word' ? 'WORD SPRINT' : 'KEY METEOR'}</span><h2>{game === 'word' ? 'Ready, set, type.' : 'Catch the sequence.'}</h2></div><div className={'game-timer ' + (seconds <= 8 && running ? 'game-timer-low' : '')}><Clock3 size={16} /><b>{timeLabel(seconds)}</b></div></div>
      <div className={'game-stage ' + (game === 'meteor' ? 'meteor-stage' : '')}>
        <div className="game-stars" aria-hidden="true"><i>✦</i><i>·</i><i>✳</i><i>✧</i></div>
        <span className="game-stage-label">{game === 'word' ? 'TYPE THIS WORD' : 'TYPE THIS KEY SEQUENCE'}</span>
        <strong className="game-target">{target}</strong>
        <div className="game-score-pill"><Zap size={15} /> {score} {score === 1 ? 'point' : 'points'}</div>
        <label className="game-input-shell"><span className="sr-only">Game typing input</span><input ref={inputRef} value={wordInput} onChange={updateInput} disabled={!running} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" placeholder={running ? 'Type the target…' : 'Press start to play'} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /><Keyboard size={17} /></label>
        <p className="game-feedback" aria-live="polite">{gameMessage || (running ? 'You are doing great. Keep going.' : 'A quick round is ready when you are.')}</p>
        {!running ? <button className="button-primary game-start-button" onClick={() => startGame(game)}><Play size={16} /> Start 45-second round <ArrowRight size={15} /></button> : <button className="button-quiet game-stop-button" onClick={() => { setRunning(false); onBest(game, score); setGameMessage('Round paused. Your score is ' + score + '.'); }}><Pause size={15} /> Pause round</button>}
      </div>
      <div className="game-console-foot"><span><Trophy size={14} /> Your best: <b>{currentBest}</b></span><span>Sound: {sound === 'off' ? 'off' : SOUND_OPTIONS.find(([id]) => id === sound)?.[1] || 'ASMR soft taps'} {sound === 'off' ? <VolumeX size={14} /> : <Volume2 size={14} />}</span><span>Local score · no account needed</span></div>
    </section>
    <section className="game-play-tip"><Sparkles size={17} /><div><b>Keep it light.</b><span>Games are for a change of pace. Your formal typing test results stay in the Results tab.</span></div></section>
  </>;
}

function SettingsPage({ language, languages, sound, volume, savedCount, learnerName, initials, resetNotice, onLanguage, onSound, onVolume, onSample, onEditName, onResetHistory }) {
  return <>
    <PageIntro eyebrow="MAKE IT YOURS" title={<>Your <em>settings.</em></>}>Choose the sounds and language setup that make practice feel comfortable.</PageIntro>
    <section className="settings-layout-new">
      <article className="settings-card-new learner-profile-card"><span className="learner-profile-avatar">{initials}</span><div className="settings-content-new"><span className="section-label">LEARNER PROFILE</span><h2>{learnerName}</h2><p>This saved name appears in your header and on result posters you share.</p></div><button className="button-secondary profile-edit-button" onClick={onEditName}>Edit name</button></article>
      <article className="settings-card-new"><div className="settings-card-icon violet-icon"><Volume2 size={20} /></div><div className="settings-content-new"><span className="section-label">KEYBOARD SOUNDS</span><h2>Choose your key sound</h2><p>Your soft ASMR typing track is on by default. Pick another sound or silence the keyboard whenever you like.</p><div className="sound-settings-row"><label htmlFor="sound-kind">Sound option</label><div className="form-select"><select id="sound-kind" value={sound} onChange={(event) => onSound(event.target.value)}>{SOUND_OPTIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><ChevronDown size={15} /></div><button className="button-secondary" onClick={onSample}><Play size={14} /> Preview</button></div><div className="volume-settings-row"><label htmlFor="sound-volume">Volume</label><input id="sound-volume" type="range" min="0" max="0.4" step="0.01" value={volume} onChange={(event) => onVolume(Number(event.target.value))} /><span>{Math.round(volume * 250)}%</span></div></div><div className="sound-graphic-new" aria-hidden="true"><i /><i /><i /><i /><i /></div></article>
      <article className="settings-card-new language-settings-new"><div className="settings-card-icon coral-icon"><Languages size={19} /></div><div className="settings-content-new"><span className="section-label">PASSAGE LANGUAGES</span><h2>Choose a practice language</h2><p>Hindi tests include Kruti Dev 010 Remington input and a separate Hindi Unicode system input option.</p><div className="language-options-new">{Object.entries(languages).map(([key, item]) => <button key={key} className={language === key ? 'language-chip language-chip-active' : 'language-chip'} onClick={() => onLanguage(key)}><span>{item.native.slice(0, 1)}</span><b>{item.native}</b><small>{item.label}</small>{language === key && <i><Check size={12} /></i>}</button>)}</div></div></article>
      <article className="settings-card-new privacy-settings-new"><div className="settings-card-icon mint-icon"><Settings size={19} /></div><div className="settings-content-new"><span className="section-label">YOUR DEVICE</span><h2>Private by design</h2><p>Tests, preferences, game scores, and saved passages stay in this browser on this device. Web paragraphs are fetched only when you ask for a fresh passage.</p><div className="privacy-status"><i /> Browser storage is active <span>·</span> {savedCount} saved test{savedCount === 1 ? '' : 's'}</div></div><div className="privacy-lock"><div>✓</div><i /></div></article>
      <article className="settings-card-new history-reset-card"><div className="settings-card-icon reset-icon"><RotateCcw size={19} /></div><div className="settings-content-new"><span className="section-label">START FRESH</span><h2>Reset practice history</h2><p>Clear saved test results, quiz and game bests, and downloaded passages from this browser. Your learner name and preferences stay saved.</p>{resetNotice && <div className="reset-success"><Check size={14} /> Your practice history has been cleared.</div>}</div><button className="button-destructive" onClick={onResetHistory}>Reset history</button></article>
    </section>
  </>;
}

function ShareDialog({ run, name, initials, poster, message, error, busy, challengeCaption, onCreate, onClose, onCopy, onCopyChallenge, onNewChallenge, onSocial, onDownload }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="dialog-heading"><div><span className="section-label">CHALLENGE YOUR FRIENDS</span><h2 id="share-title">Share your typing poster</h2></div><button className="icon-button" onClick={onClose} aria-label="Close sharing dialog"><X size={18} /></button></div>
      <p className="dialog-intro">Your poster is prepared automatically with your saved learner name, score, challenge line, and a QR code.</p>
      <div className="share-profile-strip"><span>{initials}</span><div><b>{name}</b><small>Saved learner name · used on this result</small></div><button className="button-secondary" onClick={onCreate} disabled={busy}>{busy ? 'Preparing…' : poster ? 'Refresh poster' : 'Create poster'} <Sparkles size={15} /></button></div>
      {error && <p className="share-error" role="alert">{error}</p>}
      {message && <p className="share-success" role="status"><Check size={14} /> {message}</p>}
      <div className="share-score-summary"><span className="share-score-glyph"><Trophy size={19} /></span><div><b>{run.wpm} WPM <i>·</i> {run.accuracy}% accuracy</b><small>{run.languageName || run.language} · Level {run.difficulty || 1} · {run.label}</small></div></div>
      {poster && <div className="poster-preview"><img src={poster.dataUrl} alt="Preview of your TypingForge result poster with a QR code and challenge prompt" /><div><b>Your poster is ready</b><small>Its QR code opens this result.</small><button className="button-secondary" onClick={onDownload}><Download size={14} /> Download PNG</button></div></div>}
      <div className="challenge-caption-card"><div><span className="section-label">CHALLENGE MESSAGE</span><button className="text-link" onClick={onNewChallenge}><RotateCcw size={13} /> Shuffle</button></div><p>{challengeCaption}</p></div>
      <div className="social-share-grid"><button onClick={() => onSocial('poster')} disabled={busy || !poster}><Share2 size={16} /><span>Share poster</span></button><button onClick={() => onSocial('whatsapp')} disabled={busy || !poster}><MessageCircle size={16} /><span>WhatsApp</span></button><button onClick={() => onSocial('linkedin')} disabled={busy || !poster}><Linkedin size={16} /><span>LinkedIn</span></button><button onClick={() => onSocial('instagram')} disabled={busy || !poster}><Instagram size={16} /><span>Instagram</span></button><button onClick={onCopyChallenge} disabled={busy || !poster}><Copy size={16} /><span>Copy challenge</span></button><button onClick={onCopy}><Copy size={16} /><span>Copy short link</span></button></div>
      <p className="qr-note">The short link and QR use this site’s address. Localhost links only work on this computer; publish the site for friends to open them.</p>
    </section>
  </div>;
}

function LearnerNameDialog({ firstRun, initialName, onSave, onClose }) {
  const [name, setName] = useState(initialName || '');
  const [error, setError] = useState('');
  useEffect(() => {
    const closeOnEscape = (event) => { if (!firstRun && event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [firstRun, onClose]);
  const submit = (event) => {
    event.preventDefault();
    const cleanName = name.trim().replace(/\s+/gu, ' ');
    if (!cleanName) {
      setError('Enter a name to continue.');
      return;
    }
    if (onSave(cleanName)) setError('');
  };
  return <div className="dialog-backdrop name-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!firstRun && event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog learner-name-dialog" role="dialog" aria-modal="true" aria-labelledby="learner-name-title">
      {!firstRun && <button className="icon-button name-dialog-close" onClick={onClose} aria-label="Close name editor"><X size={18} /></button>}
      <span className="name-dialog-mark"><Keyboard size={23} /></span>
      <span className="section-label">{firstRun ? 'YOUR TYPINGFORGE PROFILE' : 'LEARNER PROFILE'}</span>
      <h2 id="learner-name-title">{firstRun ? 'What should we call you?' : 'Edit your learner name'}</h2>
      <p>{firstRun ? 'Your name appears in your workspace and on result posters you share. You can change it later in Settings.' : 'This saved name is shown in the workspace and used automatically on result posters.'}</p>
      <form onSubmit={submit} className="learner-name-form"><label htmlFor="learner-name">Learner name</label><input id="learner-name" value={name} onChange={(event) => { setName(event.target.value.slice(0, 48)); setError(''); }} maxLength={48} placeholder="Enter your name" autoComplete="name" autoFocus /><small>{name.length}/48</small><button className="button-primary" type="submit">{firstRun ? 'Continue to TypingForge' : 'Save learner name'} <ArrowRight size={15} /></button>{error && <span className="share-error" role="alert">{error}</span>}</form>
    </section>
  </div>;
}

function ResetHistoryDialog({ onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-history-title">
      <span className="reset-dialog-icon"><RotateCcw size={21} /></span><span className="section-label">START FRESH</span><h2 id="reset-history-title">Clear your practice history?</h2><p>This clears saved typing results, quiz and game bests, and fetched passages from this browser. Your learner name and settings stay saved.</p><div><button className="button-secondary" onClick={onCancel}>Keep my history</button><button className="button-destructive" onClick={onConfirm}>Clear history</button></div>
    </section>
  </div>;
}

function SharedResult({ run, onStart }) {
  if (!run) return <section className="shared-result-card"><span className="share-trophy"><Trophy size={26} /></span><span className="section-label">SHARED TYPING RESULT</span><h1>This result link is incomplete.</h1><p>Ask the sender for a fresh TypingForge result link, or take a test and share your own score.</p><button className="button-primary" onClick={onStart}>Take a typing test <ArrowRight size={15} /></button></section>;
  return <section className="shared-result-card"><span className="share-trophy"><Trophy size={26} /></span><span className="section-label">SHARED TYPING RESULT</span><h1>{run.name} typed <em>{run.wpm} WPM.</em></h1><p>{run.accuracy}% accuracy in a {run.label.toLowerCase()}, using {run.languageName}. Level {run.difficulty} passage.</p><div className="shared-result-stats"><div><b>{run.wpm}</b><small>WORDS PER MINUTE</small></div><div><b>{run.accuracy}%</b><small>ACCURACY</small></div><div><b>{run.difficulty}</b><small>DIFFICULTY LEVEL</small></div></div><small className="shared-date">Shared result · {new Date(run.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</small><button className="button-primary" onClick={onStart}><Keyboard size={16} /> Try a test yourself <ArrowRight size={15} /></button></section>;
}

export default App;
