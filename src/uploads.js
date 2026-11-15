import { validatePdf } from './library.js';

async function decodeImage(blob) {
  const image = new Image(), url = URL.createObjectURL(blob);
  try { image.src = url; await image.decode(); }
  finally { image.removeAttribute('src'); URL.revokeObjectURL(url); }
}
export async function validateUpload(file, view, imageDecoder = decodeImage) {
  if (view === 'problems' && file?.type.startsWith('image/')) {
    try { await imageDecoder(file); }
    catch { throw new Error('Unable to read this image. Please select a valid image or PDF.'); }
    return 'image';
  }
  if (view === 'problems' && !file) throw new Error('Please select an image or PDF.');
  await validatePdf(file);
  return 'pdf';
}
export function uploadName(value, file, type) {
  let name = value.trim() || file.name;
  if (type === 'pdf') return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
  const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0] || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/svg+xml': '.svg' })[file.type] || '';
  name = name.replace(/\.pdf$/i, '');
  return extension && !name.toLowerCase().endsWith(extension.toLowerCase()) ? name + extension : name;
}
