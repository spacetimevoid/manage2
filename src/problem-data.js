import { escapeHtml } from './library.js';
export const problemTitle = problem => problem.name.replace(/\.(pdf|png|jpe?g|webp|gif|avif|svg|bmp|ico|tiff?|heic|heif)$/i, '');

export function ensureProblemData(problem) {
  if (typeof problem.notes !== 'string') problem.notes = problem.statementNote || '';
  if (!Array.isArray(problem.statementImages)) problem.statementImages = [];
  problem.solution ??= {};
  const solution = problem.solution;
  solution.type ??= null;
  solution.markdown ??= '';
  solution.images ??= [];
  solution.pdfBlob ??= null;
  solution.pdfName ??= '';
  return problem;
}

export function renameProblem(problem, title, files) {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (/[\\/\x00-\x1f]/.test(trimmed)) throw new Error('File name cannot contain slashes or control characters.');
  const extension = /\.[a-z0-9]+$/i.exec(problem.name)?.[0] || '.pdf';
  const name = trimmed.toLowerCase().endsWith(extension.toLowerCase()) ? trimmed : `${trimmed}${extension}`;
  if (files.some(f => f.id !== problem.id && f.subject === problem.subject && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A problem with this name already exists in that subject.');
  }
  problem.name = name;
  return true;
}

// Render only the Markdown forms present in the supplied design; raw HTML stays text.
export function renderMarkdown(text) {
  if (!text?.trim()) return '<p style="color:#86868b;">No Markdown solution content yet.</p>';
  let code = false, html = '';
  const inline = line => line.replace(/`([^`]+)`|\*\*(.+?)\*\*|\*([^*]+)\*/g, (_match, literal, bold, italic) =>
    literal !== undefined ? `<code>${literal}</code>` : bold !== undefined ? `<strong>${bold}</strong>` : `<em>${italic}</em>`);
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) { html += code ? '</code></pre>' : '<pre><code>'; code = !code; continue; }
    const escaped = escapeHtml(line);
    if (code) { html += escaped + '\n'; continue; }
    const heading = /^(#{1,3})\s+(.*)/.exec(escaped);
    if (heading) html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if (/^&gt;\s+/.test(escaped)) html += `<blockquote>${inline(escaped.replace(/^&gt;\s+/, ''))}</blockquote>`;
    else if (/^[-*]\s+/.test(escaped)) html += `<p style="margin:4px 0 4px 14px;">• ${inline(escaped.slice(2))}</p>`;
    else if (!escaped.trim()) html += '<div style="height:8px;"></div>';
    else html += `<p style="margin:6px 0;">${inline(escaped)}</p>`;
  }
  return html + (code ? '</code></pre>' : '');
}
