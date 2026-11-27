export const noteTitle = value => value.trim().replace(/\.md$/i, '').trim();
export const validNoteId = value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export async function readNoteFile(file) {
  if (!/\.md$/i.test(file.name)) throw new Error('Choose a Markdown (.md) file.');
  try {
    const markdown = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (markdown.includes('\0')) throw new Error();
    return { title: noteTitle(file.name), markdown };
  } catch {
    throw new Error('Unable to read this file as UTF-8 Markdown.');
  }
}
