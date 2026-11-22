// Le moteur actuel (modules de src/), sous la même forme que celui extrait du prototype par make-golden.js.
import { LEVELS } from '../../src/content/levels.js';
import { rng, genLevel, dailyLevel } from '../../src/rules/procgen.js';
import { campRevenue } from '../../src/rules/campaign.js';
import { makeSim } from '../../src/rules/sim/make.js';
import { stepSim } from '../../src/rules/sim/step.js';
import { useCard } from '../../src/rules/sim/cards.js';
import { resultOf, runAll } from '../../src/rules/sim/result.js';

export const engine = { LEVELS, rng, genLevel, dailyLevel, campRevenue, makeSim, stepSim, useCard, resultOf, runAll };
