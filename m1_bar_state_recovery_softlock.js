/**
 * DETERMINISTIC M1-BAR STATE RECOVERY & MULTI-TIER SOFT-LOCK SIMULATOR
 * Author: Con Chim Xanh (Bluebird AI) — https://github.com/ConChimXanh-AI
 *
 * Solves two classic failure modes in algorithmic execution:
 * 1. VPS/Terminal reboot amnesia: Reconstructs exact post-entry excursion (Peak & Worst)
 *    from historical 1-minute OHLC bars since position open timestamp.
 * 2. Wick-out premature stops: Combines M5 candle-close confirmation on multi-tier profit locks
 *    with an instantaneous tick-level emergency floor.
 */

class DeterministicStateRecoverySoftLock {
  constructor() {
    this.tiers = [
      { triggerPts: 22.0, lockPts: 4.5, label: 'L0_BREAKEVEN_PLUS' },
      { triggerPts: 36.0, lockPts: 18.0, label: 'L1_CORE_LOCK' },
      { triggerPts: 50.0, lockPts: 34.0, label: 'L2_EXPANSION_LOCK' },
      { triggerPts: 64.0, lockPts: 50.0, label: 'L3_SNIPER_LOCK' }
    ];
    this.emergencyTickFloorPts = -6.5;
  }

  recoverExcursionFromM1Bars(entryPrice, direction, m1BarsSinceEntry) {
    let peakPts = 0.0;
    let worstPts = 0.0;
    for (const bar of m1BarsSinceEntry) {
      const favorable = direction === 'BUY' ? (bar.high - entryPrice) : (entryPrice - bar.low);
      const adverse = direction === 'BUY' ? (bar.low - entryPrice) : (entryPrice - bar.high);
      if (favorable > peakPts) peakPts = favorable;
      if (adverse < worstPts) worstPts = adverse;
    }
    return { peakPts, worstPts };
  }

  evaluateProtection(peakPts, worstPts, currentTickPts, m5ClosedPts) {
    // 1. Smart Green Escape: if deep drawdown recovered to positive green
    if (worstPts <= -20.0 && currentTickPts >= 3.5) {
      return { action: 'CLOSE_SMART_GREEN_ESCAPE', lockedPts: currentTickPts };
    }

    // 2. Determine active Soft-Lock tier from peak excursion
    let activeTier = null;
    for (const t of this.tiers) {
      if (peakPts >= t.triggerPts) activeTier = t;
    }

    if (activeTier) {
      // Emergency tick floor prevents catastrophic flash-crash through soft lock
      if (currentTickPts <= this.emergencyTickFloorPts) {
        return { action: 'CLOSE_EMERGENCY_TICK_FLOOR', tier: activeTier.label, lockedPts: currentTickPts };
      }
      // Standard exit requires M5 bar close below locked profit level (immune to intra-bar wick noise)
      if (m5ClosedPts !== null && m5ClosedPts <= activeTier.lockPts) {
        return { action: 'CLOSE_M5_CONFIRMED_SOFTLOCK', tier: activeTier.label, lockedPts: m5ClosedPts };
      }
    }

    return { action: 'HOLD', tier: activeTier ? activeTier.label : 'NONE', peakPts, worstPts };
  }
}

if (require.main === module) {
  const engine = new DeterministicStateRecoverySoftLock();
  const mockM1Bars = [
    { high: 20015, low: 19992 },
    { high: 20042, low: 20010 },
    { high: 20055, low: 20028 } // Peak +55 pts above 20000 entry
  ];
  const recovered = engine.recoverExcursionFromM1Bars(20000, 'BUY', mockM1Bars);
  console.log('[Con Chim Xanh AI] Recovered State after Reboot:', recovered);
  console.log('Intra-bar wick to +30 pts (M5 not closed):', engine.evaluateProtection(recovered.peakPts, recovered.worstPts, 30.0, null));
  console.log('M5 candle closes at +32 pts (<= L2 34.0 lock):', engine.evaluateProtection(recovered.peakPts, recovered.worstPts, 32.0, 32.0));
}

module.exports = { DeterministicStateRecoverySoftLock };
