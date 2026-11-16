export function normalizeSubject(value) {
  const subject = value.trim().toLocaleLowerCase().replace(/\s+/g, '-');
  if (!subject || subject === 'all' || /[\\/\x00-\x1f]/.test(subject)) throw new Error('Enter a subject without slashes. “all” is reserved.');
  return subject;
}

export function todayDate(now = new Date()) {
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function validateDocumentName(name, subject, files, id) {
  if (!name.trim()) throw new Error('Enter a file name.');
  if (/[\\/\x00-\x1f]/.test(name)) throw new Error('File name cannot contain slashes or control characters.');
  if (files.some(file => file.id !== id && !file.sample && file.subject === subject && file.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A file with this name already exists in that subject.');
  }
  return name;
}

export function renamedDocument(value, originalName) {
  const name = value.trim();
  if (!name) throw new Error('Enter a file name.');
  const extension = /\.[a-z0-9]+$/i.exec(originalName)?.[0] || '';
  return extension && !name.toLowerCase().endsWith(extension.toLowerCase()) ? `${name}${extension}` : name;
}

export const DIFFICULTIES = ['easy', 'med', 'hard'];
export const normalizedDifficulty = value => DIFFICULTIES.includes(value) ? value : 'easy';
export const difficultyLabel = value => ({ easy: 'Easy', med: 'Med', hard: 'Hard' })[normalizedDifficulty(value)];
