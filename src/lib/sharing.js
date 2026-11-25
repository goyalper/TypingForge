import QRCode from 'qrcode';

const SHARE_LANGUAGES = ['en', 'es', 'fr', 'de', 'hi', 'ta', 'ja'];
const SHARE_EPOCH = Date.UTC(2020, 0, 1);

function toBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export function decodeShareToken(token) {
  try {
    const base64 = token.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - token.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length < 10 || bytes[0] !== 1 || bytes.length !== 10 + bytes[1]) return null;
    const nameLength = bytes[1];
    const name = new TextDecoder().decode(bytes.subarray(2, 2 + nameLength));
    const offset = 2 + nameLength;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const days = view.getUint16(offset + 3, false);
    const date = new Date(SHARE_EPOCH + days * 86400000).toISOString().slice(0, 10);
    return {
      name,
      wpm: view.getUint16(offset, false),
      accuracy: bytes[offset + 2],
      date,
      language: SHARE_LANGUAGES[bytes[offset + 5]] || 'en',
      difficulty: bytes[offset + 6],
      minutes: bytes[offset + 7],
    };
  } catch {
    return null;
  }
}

export function makeShareUrl(run, name) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  const minutes = Number(String(run.label || '').match(/\d+/u)?.[0]) || 1;
  const nameBytes = new TextEncoder().encode(String(name || 'Typing learner').slice(0, 48));
  const bytes = new Uint8Array(10 + nameBytes.length);
  bytes[0] = 1;
  bytes[1] = nameBytes.length;
  bytes.set(nameBytes, 2);
  const offset = 2 + nameBytes.length;
  const view = new DataView(bytes.buffer);
  view.setUint16(offset, Math.max(0, Math.min(999, Math.round(Number(run.wpm) || 0))), false);
  bytes[offset + 2] = Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0)));
  const dateValue = Date.parse(String(run.date || new Date().toISOString()).slice(0, 10) + 'T00:00:00Z');
  const days = Number.isFinite(dateValue) ? Math.max(0, Math.min(65535, Math.floor((dateValue - SHARE_EPOCH) / 86400000))) : 0;
  view.setUint16(offset + 3, days, false);
  bytes[offset + 5] = Math.max(0, SHARE_LANGUAGES.indexOf(run.language || 'en'));
  bytes[offset + 6] = Math.max(1, Math.min(5, Number(run.difficulty) || 1));
  bytes[offset + 7] = Math.max(1, Math.min(5, minutes));
  url.searchParams.set('r', toBase64Url(bytes));
  return url.toString();
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = text.split(/\s+/u);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = word;
      if (lines >= maxLines - 1) break;
    } else line = candidate;
  }
  if (line && lines < maxLines) context.fillText(line, x, y);
}

export async function createResultPoster(run, name) {
  const shareUrl = makeShareUrl(run, name);
  const qrData = await QRCode.toDataURL(shareUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 260,
    color: { dark: '#252640', light: '#ffffff' },
  });
  const qr = new Image();
  qr.src = qrData;
  await new Promise((resolve, reject) => { qr.onload = resolve; qr.onerror = reject; });

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, '#222345');
  background.addColorStop(.56, '#36337a');
  background.addColorStop(1, '#181a31');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = .13;
  context.strokeStyle = '#c7c2ff';
  context.lineWidth = 2;
  for (let ring = 0; ring < 5; ring += 1) {
    context.beginPath();
    context.ellipse(880, 130, 85 + ring * 35, 50 + ring * 25, -.45, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 1;
  context.fillStyle = '#d8f5c5';
  context.font = '700 25px Arial, sans-serif';
  context.fillText('TYPINGFORGE', 82, 95);
  context.fillStyle = '#aaa6ff';
  context.font = '700 14px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText('PERSONAL TYPING RESULT', 82, 175);
  context.letterSpacing = '0px';

  context.fillStyle = '#ffffff';
  context.font = '800 58px Arial, sans-serif';
  drawWrappedText(context, name, 82, 255, 780, 68, 2);
  context.fillStyle = '#c8c7df';
  context.font = '400 24px Arial, sans-serif';
  context.fillText(run.label || 'Typing test', 82, 325);

  roundedRect(context, 70, 390, 940, 422, 32);
  context.fillStyle = '#ffffff';
  context.fill();
  context.fillStyle = '#625fe0';
  context.font = '700 17px Arial, sans-serif';
  context.fillText('TYPING SPEED', 120, 460);
  context.fillStyle = '#252640';
  context.font = '800 185px Arial, sans-serif';
  context.fillText(String(run.wpm), 112, 650);
  context.fillStyle = '#77788d';
  context.font = '700 27px Arial, sans-serif';
  context.fillText('WORDS PER MINUTE', 126, 706);

  roundedRect(context, 680, 455, 275, 194, 24);
  context.fillStyle = '#f0efff';
  context.fill();
  context.fillStyle = '#625fe0';
  context.font = '800 76px Arial, sans-serif';
  context.fillText(String(run.accuracy) + '%', 715, 550);
  context.fillStyle = '#77788d';
  context.font = '700 18px Arial, sans-serif';
  context.fillText('ACCURACY', 719, 596);

  context.fillStyle = '#5d5c75';
  context.font = '600 19px Arial, sans-serif';
  context.fillText((run.languageName || run.language) + '  ·  Level ' + (run.difficulty || 1), 125, 766);
  context.fillText(new Date(run.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 125, 796);

  roundedRect(context, 70, 862, 940, 370, 32);
  context.fillStyle = '#ffffff';
  context.fill();
  roundedRect(context, 112, 900, 290, 290, 20);
  context.fillStyle = '#f4f4f9';
  context.fill();
  context.drawImage(qr, 127, 915, 260, 260);
  context.fillStyle = '#252640';
  context.font = '700 26px Arial, sans-serif';
  context.fillText('Scan to try a test', 455, 965);
  context.fillStyle = '#707286';
  context.font = '400 20px Arial, sans-serif';
  drawWrappedText(context, 'Practice typing, explore Hindi Kruti Dev input, and find your next personal best.', 455, 1010, 465, 32, 4);
  context.fillStyle = '#625fe0';
  context.font = '700 18px Arial, sans-serif';
  const shareHost = new URL(shareUrl);
  const displayHost = ['localhost', '127.0.0.1'].includes(shareHost.hostname) ? 'TypingForge practice' : shareHost.host.replace(/^www\./u, '');
  drawWrappedText(context, displayHost, 455, 1156, 465, 24, 1);
  context.fillStyle = '#a9aabd';
  context.font = '500 15px Arial, sans-serif';
  context.fillStyle = '#d8f5c5';
  context.font = '700 19px Arial, sans-serif';
  context.fillText('Think you can beat this score? Scan to take the challenge.', 82, 1293);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The result poster could not be created.');
  return { blob, shareUrl, dataUrl: canvas.toDataURL('image/png') };
}

export function downloadPoster(blob, name = 'typingforge-result.png') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
