import { TextLayer } from 'pdfjs-dist';
import './pdf-text.css';

export async function renderPdfText(page, viewport, sheet, canvas, tasks) {
  const container = document.createElement('div');
  container.className = 'pdf-text-layer';
  container.style.setProperty('--total-scale-factor', viewport.scale * viewport.userUnit);
  const layer = new TextLayer({ container, viewport, textContentSource: page.streamTextContent() });
  tasks.add(layer);
  try {
    await layer.render();
    if (canvas.parentNode === sheet) sheet.append(container);
  } finally {
    tasks.delete(layer);
  }
}
