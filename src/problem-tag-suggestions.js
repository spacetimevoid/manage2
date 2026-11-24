import { cloudClient } from './cloud.js';
import { isImageFile } from './uploads.js';

async function prepareAttachment(file) {
  if (!isImageFile(file)) throw new Error('Choose an image to suggest tags.');
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file;

  // Use the browser's decoder for image formats the upload form already accepts.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) return blob;
  } catch {
    // The user can replace the image or tag the problem manually.
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new Error('Unable to read this image for AI tagging.');
}

export async function suggestProblemTags(file, subjects, signal) {
  if (!cloudClient) throw new Error('Sign in to suggest tags.');
  const { data } = await cloudClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to suggest tags.');
  signal.throwIfAborted();

  const attachment = await prepareAttachment(file);
  const body = new FormData();
  body.append('file', attachment, 'problem');
  body.append('subjects', JSON.stringify(subjects));
  const response = await fetch('/api/problem-tags', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
    signal,
  });
  if (response.status === 413) throw new Error('This file is too large for AI tagging. You can still add tags manually.');
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.tags)) {
    throw new Error(result?.error || 'AI could not suggest tags. Try again or add tags manually.');
  }
  return result.tags;
}
