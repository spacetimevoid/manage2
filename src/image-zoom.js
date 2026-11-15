export function createImageZoom() {
  const $ = id => document.getElementById(id);
  const dialog = $('imageZoomDialog'), stage = $('imageZoomStage'), image = $('imageZoomImage');
  let scale = 1, x = 0, y = 0, returnFocus = null, moved = false, startedOnImage = false;
  const pointers = new Map();
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  function paint() {
    x = clamp(x, Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2));
    y = clamp(y, Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2));
    image.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
    image.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    $('imageZoomLabel').textContent = `${Math.round(scale * 100)}%`;
    $('imageZoomOutBtn').disabled = scale <= 0.25;
    $('imageZoomInBtn').disabled = scale >= 8;
  }
  function zoom(value, clientX, clientY) {
    const next = Math.max(0.25, Math.min(8, value));
    const rect = stage.getBoundingClientRect();
    const cx = clientX === undefined ? 0 : clientX - rect.left - rect.width / 2;
    const cy = clientY === undefined ? 0 : clientY - rect.top - rect.height / 2;
    x = cx - (cx - x) * next / scale;
    y = cy - (cy - y) * next / scale;
    scale = next; paint();
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.onclose = () => {
    if (dialog.open) return;
    pointers.clear(); image.removeAttribute('src'); scale = 1; x = y = 0;
    returnFocus?.focus(); returnFocus = null;
  };
  image.onload = paint;
  function open(source) {
    returnFocus = source;
    pointers.clear(); moved = false; startedOnImage = false; scale = 1; x = y = 0;
    image.alt = source.alt || 'Image preview'; image.src = source.currentSrc || source.src;
    dialog.showModal(); paint(); $('imageZoomCloseBtn').focus();
  }
  $('imageZoomCloseBtn').onclick = close;
  $('imageZoomInBtn').onclick = () => zoom(scale * 1.25);
  $('imageZoomOutBtn').onclick = () => zoom(scale / 1.25);
  dialog.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1);
    zoom(scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), e.clientX, e.clientY);
  }, { passive: false });
  dialog.addEventListener('keydown', e => {
    if (['+', '=', '-', '0'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === '0') { x = y = 0; zoom(1); }
      else zoom(e.key === '-' ? scale / 1.25 : scale * 1.25);
    }
  });
  dialog.onclick = e => {
    if (moved) { moved = false; return; }
    if (e.target === stage && startedOnImage) return;
    if (e.target === dialog || e.target === stage) close();
  };
  stage.ondblclick = e => {
    if (e.target !== image && !startedOnImage) return;
    e.preventDefault(); zoom(scale > 1 ? 1 : 2, e.clientX, e.clientY);
  };
  stage.onpointerdown = e => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    if (!pointers.size) { moved = false; startedOnImage = e.target === image; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove = e => {
    if (!pointers.has(e.pointerId)) return;
    const previous = pointers.get(e.pointerId), dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    const old = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const current = [...pointers.values()];
    if (old.length === 2) {
      const before = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y);
      const after = Math.hypot(current[0].x - current[1].x, current[0].y - current[1].y);
      if (before > 0) zoom(scale * after / before, (old[0].x + old[1].x) / 2, (old[0].y + old[1].y) / 2);
      x += dx / 2; y += dy / 2;
    } else { x += dx; y += dy; }
    paint();
  };
  stage.onpointerup = stage.onpointercancel = e => {
    pointers.delete(e.pointerId);
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  };
  window.addEventListener('resize', () => { if (dialog.open) paint(); });
  return { open, close };
}
