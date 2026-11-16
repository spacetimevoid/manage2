export function createContextMenu() {
  const menu = document.createElement('div');
  menu.className = 'library-context-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let origin;
  function close(restore = false) {
    menu.hidden = true;
    if (restore && origin?.isConnected) origin.focus();
  }
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('scroll', () => close(), true);
  window.addEventListener('resize', () => close());
  window.addEventListener('hashchange', () => close());
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') close(event.key === 'Escape');
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...menu.children], index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  return { open(event, actions) {
    origin = event.target.closest('[data-id], [data-subject]');
    menu.replaceChildren(...actions.map(action => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = action.label;
      button.setAttribute('role', 'menuitem');
      button.onclick = async () => {
        close(true);
        try { await action.run(); } catch (error) { window.alert(error.message || 'Unable to save changes.'); }
      };
      return button;
    }));
    menu.hidden = false;
    menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight))}px`;
    menu.firstElementChild?.focus();
  } };
}
