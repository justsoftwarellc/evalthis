// The final grader does not look at the model's output. It only reads the scores
// the quality and cost graders produced and turns them into one verdict.
// That is the place where the trade-off between quality and cost is decided,
// so it is the place to change when your priorities change.
//
// Default policy:
//   1. quality = weighted mean of the quality grades; cost = same for cost.
//   2. Quality is a gate: below `minQuality` the case fails, however cheap.
//   3. Otherwise score = qualityWeight * quality + costWeight * cost,
//      and the case passes when score >= minScore.
//
// Tune the numbers in eval.config.js (`finalOptions`), or rewrite this file.

const DEFAULTS = { qualityWeight: 0.7, costWeight: 0.3, minQuality: 0.6, minScore: 0.7 };

const weightedMean = (entries) => {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  return total === 0 ? 0 : entries.reduce((sum, e) => sum + e.score * e.weight, 0) / total;
};

/** @type {import("../contracts.js").FinalGrader} */
export const grader = {
  id: 'final',

  grade({ quality, cost, options }) {
    const { qualityWeight, costWeight, minQuality, minScore } = { ...DEFAULTS, ...options };

    if (quality.length === 0) {
      return { score: 0, pass: false, reason: 'no quality graders configured; refusing to pass on cost alone' };
    }
    const q = weightedMean(quality);
    const c = cost.length ? weightedMean(cost) : 1; // no cost graders = cost is ignored
    const score = (qualityWeight * q + costWeight * c) / (qualityWeight + costWeight);
    const summary = `quality ${q.toFixed(2)}, cost ${c.toFixed(2)}, score ${score.toFixed(2)}`;

    if (quality.some((e) => e.error) || cost.some((e) => e.error)) {
      return { score, pass: false, reason: `a grader threw; ${summary}` };
    }
    if (q < minQuality) {
      return { score, pass: false, reason: `quality below floor ${minQuality}; ${summary}` };
    }
    return {
      score,
      pass: score >= minScore,
      reason: score >= minScore ? summary : `score below ${minScore}; ${summary}`,
    };
  },
};
