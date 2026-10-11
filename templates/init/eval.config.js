// The whole evaluation, in one place. The runner imports this file and does
// exactly what it says: every model x every task case, run as a session by the
// orchestrator, then graded by every grader.
// Nothing is auto-discovered; if it is not imported here, it does not run.
//
// Each import is a module that declares named exports:
//   models/*.js         model + harness
//   tasks/*.js          task
//   orchestrators/*.js  model + harness (+ optional instructions)
//   graders/**/*.js     grader

import * as stub from './models/stub.js';
import * as scripted from './orchestrators/scripted.js';
import * as uppercase from './tasks/uppercase.js';
import * as exactMatch from './graders/quality/exact-match.js';
import * as tokenCost from './graders/cost/token-cost.js';
import * as final from './graders/final.js';

export default {
  // WHO is being evaluated. `evalthis add model <name>`
  models: [stub],

  // WHAT they are asked to do. `evalthis add task <name>`
  tasks: [uppercase],

  // WHO runs each session: an LLM (or script) that prompts the model under test,
  // follows up, and summarises. `evalthis add orchestrator <name>`
  orchestrator: scripted,

  // HOW each answer is judged. Two independent lists, so quality can never be
  // bought with cost, or the reverse, without the final grader saying so.
  graders: {
    quality: [exactMatch], // `evalthis add grader quality <name>`
    cost: [tokenCost], //     `evalthis add grader cost <name>`
  },

  // The only grader allowed to produce a pass/fail. It sees the grades above.
  final,
  finalOptions: {
    qualityWeight: 0.7, // how much of the final score comes from quality
    costWeight: 0.3, //    ...and from cost
    minQuality: 0.6, //    a hard floor: below this the case fails whatever the cost
    minScore: 0.7, //      overall score needed to pass
  },

  // Safety rails for runaway sessions.
  limits: {
    maxOrchestratorTurns: 8, // orchestrator calls per session
    maxModelSteps: 8, //        tool-call rounds the model under test may take per prompt
  },

  // Run each case this many times (useful for non-deterministic models).
  repeats: 1,

  // Exit non-zero when the overall pass rate drops below this (0 to 1). CI hook.
  minPassRate: 0,
};
