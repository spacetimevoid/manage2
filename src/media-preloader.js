// Background work never gates a click. A click joins the same in-flight request,
// or starts immediately instead of waiting behind unrelated downloads.
export function createMediaPreloader(prepare, { concurrency = 2, delay = 80 } = {}) {
  const pending = new WeakMap(), warmed = new WeakSet();
  let queue = [], running = 0, timer;
  function load(file) {
    if (pending.has(file)) return pending.get(file);
    queue = queue.filter(item => item !== file);
    const task = Promise.resolve().then(() => prepare(file)).then(() => {
      warmed.add(file); return file;
    }).finally(() => pending.delete(file));
    pending.set(file, task);
    return task;
  }
  function drain() {
    while (running < concurrency && queue.length) {
      const file = queue.shift();
      if (warmed.has(file) || pending.has(file)) continue;
      running++;
      load(file).catch(() => {}).finally(() => { running--; drain(); });
    }
  }
  function warm(files) {
    clearTimeout(timer);
    queue = [...new Set(files)].filter(file => !warmed.has(file) && !pending.has(file));
    if (queue.length) timer = setTimeout(drain, delay);
  }
  return { load, warm };
}
