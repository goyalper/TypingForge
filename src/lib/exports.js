function csvCell(value) {
  const text = String(value ?? '');
  return '"' + text.replace(/"/gu, '""') + '"';
}

function downloadText(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportResultsCsv(runs) {
  const columns = ['Date', 'Test', 'Language', 'Input layout', 'Difficulty', 'Source', 'Duration seconds', 'WPM', 'Accuracy %', 'Correct keys', 'Errors'];
  const lines = [columns.map(csvCell).join(',')];
  runs.forEach((run) => lines.push([
    new Date(run.date).toISOString(),
    run.label,
    run.languageName || run.language,
    run.inputLabel || 'System keyboard',
    run.difficulty,
    run.sourceTitle || '',
    run.elapsed,
    run.wpm,
    run.accuracy,
    run.correct,
    run.errors,
  ].map(csvCell).join(',')));
  downloadText('typingforge-results.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export function exportResultsJson(runs) {
  downloadText('typingforge-results.json', JSON.stringify({ exportedAt: new Date().toISOString(), results: runs }, null, 2), 'application/json;charset=utf-8');
}

export function exportAnalyticsCsv(runs) {
  const total = runs.length;
  const avgSpeed = total ? Math.round(runs.reduce((sum, run) => sum + (run.wpm || 0), 0) / total) : 0;
  const avgAccuracy = total ? Math.round(runs.reduce((sum, run) => sum + (run.accuracy || 0), 0) / total) : 0;
  const totalTime = runs.reduce((sum, run) => sum + (run.elapsed || 0), 0);
  const best = runs.reduce((max, run) => Math.max(max, run.wpm || 0), 0);
  const lines = [
    ['Metric', 'Value'],
    ['Sessions', total],
    ['Best WPM', best],
    ['Average WPM', avgSpeed],
    ['Average accuracy %', avgAccuracy],
    ['Total practice seconds', totalTime],
    ['Current export date', new Date().toISOString()],
    [],
    ['Date', 'Test', 'Language', 'Input layout', 'Difficulty', 'WPM', 'Accuracy %', 'Errors'],
    ...runs.map((run) => [new Date(run.date).toISOString(), run.label, run.languageName || run.language, run.inputLabel || 'System keyboard', run.difficulty, run.wpm, run.accuracy, run.errors]),
  ];
  downloadText('typingforge-analytics.csv', '\uFEFF' + lines.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
