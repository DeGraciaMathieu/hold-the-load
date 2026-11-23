// Écouteurs du DOM : chaque geste devient une intention fournie par main.js.
export function bindInput(on) {
  const board = document.getElementById('board');
  board.addEventListener('click', e => {
    const rect = board.getBoundingClientRect();
    on.board(e.clientX - rect.left, e.clientY - rect.top);
  });
  board.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const rect = board.getBoundingClientRect();
    on.hover(e.clientX - rect.left, e.clientY - rect.top);
  });
  board.addEventListener('pointerleave', () => on.hover(null));
  document.querySelectorAll('#tabs .tab').forEach(t => (t.onclick = () => on.tab(t.dataset.m)));
  document.querySelectorAll('#langs .tab').forEach(t => (t.onclick = () => on.lang(t.dataset.l)));
  document.getElementById('run').onclick = on.run;
  document.getElementById('speed').onclick = on.speed;
  document.getElementById('scrim').onclick = on.scrim;
  window.addEventListener('resize', on.resize);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { on.escape(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
    on.keys[e.key.toLowerCase()]?.();
  });
}
