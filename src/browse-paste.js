import { isImageFile } from './uploads.js';

export function installBrowsePaste(element, { getView, enabled, onFile, onError }) {
  element.addEventListener('paste', event => {
    if (!enabled()) return;
    const files = [...(event.clipboardData?.files || [])];
    if (!files.length) return;
    event.preventDefault();
    const valid = files.find(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '') || (getView() === 'problems' && isImageFile(file)));
    if (valid) onFile(valid);
    else onError(getView() === 'problems' ? 'Please paste an image or PDF.' : 'Please paste a PDF.');
  });
}
