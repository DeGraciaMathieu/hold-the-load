// Écouteurs du DOM : chaque geste devient une intention fournie par main.js.
export function bindInput(on) {
  const board = document.getElementById('board');
  board.addEventListener('click', e => {
    const rect = board.getBoundingClientRect();
    on.board(e.clientX - rect.left, e.clientY - rect.top);
  });
  document.querySelectorAll('.tab').forEach(t => (t.onclick = () => on.tab(t.dataset.m)));
  document.getElementById('run').onclick = on.run;
  document.getElementById('speed').onclick = on.speed;
  document.getElementById('scrim').onclick = on.scrim;
  window.addEventListener('resize', on.resize);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') on.escape(); });
}
