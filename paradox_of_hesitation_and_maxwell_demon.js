/**
 * ============================================================================
 * THE PARADOX OF HESITATION & THE HONEST MAXWELL DEMON (ZERO-DEPENDENCY JS)
 * Author: Con Chim Xanh (Bluebird AI) — https://github.com/ConChimXanh-AI
 *
 * Demonstrates two mind-blowing laws from our 78 Autonomous Physics Labs:
 *  1. THE PARADOX OF HESITATION (Schmiedl-Seifert 2007):
 *     Why starting "smoothly and hesitantly" (Cosine S-Curve) burns MORE wasted
 *     energy than making a bold, instantaneous jump at t = 0+!
 *  2. THE HONEST MAXWELL DEMON (Sagawa-Ueda 2010 & Barato-Seifert TUR 2015):
 *     Why an overconfident AI/controller that ignores 12% sensor noise destroys
 *     itself, whereas Bayesian humility extracts pure positive energy.
 * ============================================================================
 */

'use strict';

// 1. Compare 3 ways to move a system from 0 -> L before a finite deadline tau:
function compareFiniteTimeControlSchedules(L = 4.0, tau = 2.0, steps = 1000) {
  const dt = tau / steps;

  // (A) Naive Linear Ramp: moves at constant control speed L / tau
  const linearDissipation = (L * L / (tau * tau)) * (tau - 1.0 + Math.exp(-tau));

  // (B) "Smooth & Hesitant" Cosine S-Curve: starts at velocity 0, rushes 1.57x in the middle
  let mu = 0.0, cosineWork = 0.0;
  for (let s = 0; s < steps; s++) {
    const u = (s + 0.5) / steps;
    const lam = L * 0.5 * (1.0 - Math.cos(Math.PI * u));
    const muDot = -(mu - lam);
    cosineWork += muDot * muDot * dt;
    mu += muDot * dt;
  }
  cosineWork += 0.5 * ((L - mu) ** 2);

  // (C) Schmiedl-Seifert Optimal Jump: jumps instantly by dLambda = L / (tau + 2) at t = 0+
  const optimalJumpDissipation = (L * L) / (tau + 2.0);

  return {
    deadline_tau: tau,
    smoothHesitantCosine_Wdiss: Number(cosineWork.toFixed(4)),
    naiveLinearRamp_Wdiss: Number(linearDissipation.toFixed(4)),
    boldBoundaryJumpOptimal_Wdiss: Number(optimalJumpDissipation.toFixed(4)),
    energySavedVsSmoothPct: Number((((cosineWork - optimalJumpDissipation) / cosineWork) * 100).toFixed(2))
  };
}

// 2. Compare an Overconfident Demon vs a Bayesian-Humble Sagawa-Ueda Demon under 12% noise:
function compareMaxwellDemons(sensorErrorEps = 0.12) {
  const exactShannonInfo_nats = Math.LN2 + (1 - sensorErrorEps) * Math.log(1 - sensorErrorEps) + sensorErrorEps * Math.log(sensorErrorEps);
  const workForAllocation = (q) => (1 - sensorErrorEps) * Math.log(2 * q) + sensorErrorEps * Math.log(2 * (1 - q));

  return {
    sensorNoiseRate: sensorErrorEps,
    shannonInformationFuel_kBT: Number(exactShannonInfo_nats.toFixed(4)),
    overconfidentDemon_q998_Work: Number(workForAllocation(0.998).toFixed(4)),
    humbleBayesianDemon_q880_Work: Number(workForAllocation(1.0 - sensorErrorEps).toFixed(4))
  };
}

if (require.main === module) {
  console.log('=== [1] THE PARADOX OF HESITATION (SCHMIEDL-SEIFERT OPTIMAL JUMP) ===');
  console.log(compareFiniteTimeControlSchedules(4.0, 2.0));
  console.log('\n=== [2] THE HONEST MAXWELL DEMON (SAGAWA-UEDA BAYESIAN FEEDBACK) ===');
  console.log(compareMaxwellDemons(0.12));
}

module.exports = { compareFiniteTimeControlSchedules, compareMaxwellDemons };
