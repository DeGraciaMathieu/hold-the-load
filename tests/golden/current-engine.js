// Charge le moteur du code courant pour le comparer à l'instantané.
// Provisoire : tant que le moteur vit dans le script de la page, on en isole la partie
// qui précède l'interface et on l'importe comme un module.
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NAMES = ['LEVELS', 'genLevel', 'rng', 'dailyLevel', 'campRevenue', 'runAll', 'makeSim', 'stepSim', 'useCard', 'resultOf'];

function pageScript() {
  const main = join(ROOT, 'src/main.js');
  if (existsSync(main)) return readFileSync(main, 'utf8');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  return html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
}

export async function loadCurrentEngine() {
  const script = pageScript();
  const engine = script.slice(0, script.indexOf('// ============ Interface'));
  const revenue = (script.match(/function campRevenue\([\s\S]*?\n}\n/) || [''])[0];
  const srcUrl = pathToFileURL(join(ROOT, 'src/')).href;
  const source = `${engine}\n${revenue}\nexport { ${NAMES.join(', ')} };\n`
    .replace(/from '\.\/([^']+)'/g, (_, p) => `from '${srcUrl}${p}'`);
  const file = join(mkdtempSync(join(tmpdir(), 'golden-')), 'engine.mjs');
  writeFileSync(file, source);
  return import(pathToFileURL(file).href);
}
