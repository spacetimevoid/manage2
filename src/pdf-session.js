// Keep the worker and the last two parsed PDFs for this browser session only.
// Canvas bitmaps are still released by the viewer when it closes.
export function createPdfSession(pdfjs) {
  let worker;
  const tasks = new Map();
  function warm() {
    if (!worker || worker.destroyed) worker = new pdfjs.PDFWorker();
    return worker.promise;
  }
  function open(url) {
    if (tasks.has(url)) {
      const task = tasks.get(url); tasks.delete(url); tasks.set(url, task);
      return task;
    }
    warm().catch(() => {});
    const task = pdfjs.getDocument({ url, worker });
    tasks.set(url, task);
    task.promise.catch(() => {
      if (tasks.get(url) === task) tasks.delete(url);
      task.destroy().catch(() => {});
    });
    while (tasks.size > 2) {
      const [oldUrl, oldTask] = tasks.entries().next().value;
      tasks.delete(oldUrl); oldTask.destroy().catch(() => {});
    }
    return task;
  }
  async function clear() {
    const previous = [...tasks.values()]; tasks.clear();
    await Promise.allSettled(previous.map(task => task.destroy()));
    worker?.destroy(); worker = null;
  }
  return { warm, open, clear };
}
