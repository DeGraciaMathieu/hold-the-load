import { sources } from './state/context.js';
import { layout } from './render/geometry.js';
import { draw } from './render/board.js';
import { dismiss } from './render/dialogs.js';
import { refresh } from './render/panels.js';
import { bindInput } from './input/handlers.js';
import { clickBoard, switchMode, toggleRun, toggleSpeed, frame } from './loop/run.js';

// Seules sources d'aléa et d'horloge du jeu : la graine d'une partie Croissance et la date du défi.
const randomSeed = () => Math.floor(Math.random() * 1e9);
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
sources.randomSeed = randomSeed;
sources.today = todayStr;

bindInput({ board: clickBoard, tab: switchMode, run: toggleRun, speed: toggleSpeed, scrim: dismiss, escape: dismiss, resize: layout });
refresh();
document.fonts && document.fonts.ready.then(() => draw());
requestAnimationFrame(frame);
