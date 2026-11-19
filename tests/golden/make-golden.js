// Génère golden.json à partir du prototype d'origine, tel que committé avant le refactor.
// Usage : node tests/golden/make-golden.js [révision git, défaut f6479f6]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { snapshot } from './cases.js';

const ORIGINAL_REV = process.argv[2] || 'f6479f6';
const NAMES = ['LEVELS', 'genLevel', 'rng', 'dailyLevel', 'campRevenue', 'runAll', 'makeSim', 'stepSim', 'useCard', 'resultOf'];

function loadOriginalEngine(rev) {
  const html = execFileSync('git', ['show', `${rev}:index.html`], { encoding: 'utf8' });
  const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
  // Le moteur, les missions et la génération procédurale précèdent l'interface et ne touchent pas au DOM.
  const engine = script.slice(0, script.indexOf('// ============ Interface'));
  const revenue = script.match(/function campRevenue\([\s\S]*?\n}\n/)[0];
  return vm.runInNewContext(`${engine}\n${revenue}\n({ ${NAMES.join(', ')} })`, {});
}

const engine = loadOriginalEngine(ORIGINAL_REV);
const out = new URL('./golden.json', import.meta.url);
writeFileSync(out, JSON.stringify(snapshot(engine)));
console.log('golden.json écrit depuis', ORIGINAL_REV);
