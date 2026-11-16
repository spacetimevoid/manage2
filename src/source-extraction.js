export function selectedRegion(bounds, start, end) {
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  const x1 = clamp(start.x, bounds.width), y1 = clamp(start.y, bounds.height);
  const x2 = clamp(end.x, bounds.width), y2 = clamp(end.y, bounds.height);
  if (x1 === x2 || y1 === y2) return null;
  return { x: Math.min(x1, x2) / bounds.width, y: Math.min(y1, y2) / bounds.height,
    width: Math.abs(x2 - x1) / bounds.width, height: Math.abs(y2 - y1) / bounds.height };
}

export async function cropPage(pdf, pageNumber, rect, makeCanvas = () => document.createElement('canvas')) {
  const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: 2 });
  const canvas = makeCanvas();
  canvas.width = Math.max(1, Math.ceil(viewport.width * rect.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height * rect.height));
  try {
    await page.render({ canvasContext: canvas.getContext('2d'), viewport,
      transform: [1, 0, 0, 1, -viewport.width * rect.x, -viewport.height * rect.y] }).promise;
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to crop this page.')), 'image/png'));
    return new File([blob], `page-${pageNumber}.png`, { type: 'image/png' });
  } finally { canvas.width = canvas.height = 0; }
}

export function sourceEntries(files, sourceId) {
  return files.filter(file => file.kind === 'problem' && file.sourceLocation?.sourceId === sourceId)
    .sort((a, b) => a.sourceLocation.page - b.sourceLocation.page || a.sourceLocation.rect.y - b.sourceLocation.rect.y || a.sourceLocation.rect.x - b.sourceLocation.rect.x);
}
