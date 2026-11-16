export function enableSubjectDrag(list, reorder, getView) {
  let source = null, view = null, saving = false;
  const row = event => event.target.closest('[data-subject]');
  list.addEventListener('dragstart', event => {
    const target = row(event);
    if (saving || !target || target.dataset.subject === 'all') { event.preventDefault(); return; }
    source = target.dataset.subject; view = getView();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', source);
  });
  list.addEventListener('dragover', event => {
    const target = row(event);
    if (!source || saving || getView() !== view || !target || target.dataset.subject === 'all') return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
  });
  list.addEventListener('drop', async event => {
    const target = row(event), from = source, collection = view;
    source = null;
    if (!from || saving || getView() !== collection || !target || target.dataset.subject === 'all') return;
    event.preventDefault();
    const bounds = target.getBoundingClientRect();
    saving = true;
    try { await reorder(collection, from, target.dataset.subject, event.clientY > bounds.top + bounds.height / 2); }
    catch (error) { window.alert(error.message || 'Unable to save subject order.'); }
    finally { saving = false; }
  });
  list.addEventListener('dragend', () => { source = null; });
}
