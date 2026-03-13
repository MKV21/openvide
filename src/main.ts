import { initApp } from './app/bootstrap';

const root = document.getElementById('app');
if (root) root.textContent = 'Open Vide — loading…';

initApp().catch((err) => {
  console.error('[OpenVide] Failed to initialize:', err);
  if (root) root.textContent = `Open Vide — error: ${err?.message ?? err}`;
});
