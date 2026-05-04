import { describe, it, expect } from "vitest";
import {
  calcSubOutMinutes,
  calcSubOutTotalMs,
  flushOnCourtPlayer,
  recalcOffCourtPlayer,
  canStageBenchPlayer,
} from "../match-minutes";

// ── calcSubOutMinutes ─────────────────────────────────────────────────────────

describe("calcSubOutMinutes", () => {
  it("first stint of exactly 10 minutes → 10", () => {
    const entered = 0;
    const now = 10 * 60_000;
    expect(calcSubOutMinutes(now, entered, 0)).toBe(10);
  });

  it("first stint of 10m 30s → 10 (floor, not round)", () => {
    const entered = 0;
    const now = 10 * 60_000 + 30_000;
    expect(calcSubOutMinutes(now, entered, 0)).toBe(10);
  });

  it("second stint adds on top of existing minutes", () => {
    // Player already has 8 min committed; plays another 3m → 11 total
    const entered = 20 * 60_000; // entered at 20:00
    const now = 23 * 60_000;     // exits at 23:00 → 3m stint
    expect(calcSubOutMinutes(now, entered, 8)).toBe(11);
  });

  it("backward time edit cannot produce negative total (clamped to 0)", () => {
    // Player entered at 5:00 but timer was moved back to 3:00
    const entered = 5 * 60_000;
    const now = 3 * 60_000;
    // raw stint = 3:00 - 5:00 = -2:00 → total = max(0, 0 + (-120s)) = 0 → 0 min
    expect(calcSubOutMinutes(now, entered, 0)).toBe(0);
  });

  it("sub-minute seconds carry over to totalMs but not to floor minutes", () => {
    // 7m 45s accumulated; exits after 45s more → 8m 30s total → 8 min
    const entered = 0;
    const existingMin = 7;
    // existing = 7*60000 = 420000; we want totalMs = 510000 (8m30s)
    // rawStint = 510000 - 420000 = 90000 (1m30s)
    const now = 90_000;
    expect(calcSubOutMinutes(now, entered, existingMin)).toBe(8);
  });
});

// ── calcSubOutTotalMs ─────────────────────────────────────────────────────────

describe("calcSubOutTotalMs", () => {
  it("returns exact ms including sub-minute seconds", () => {
    // entered at 0, exits at 10m30s → totalMs = 630 000
    expect(calcSubOutTotalMs(10 * 60_000 + 30_000, 0, 0)).toBe(630_000);
  });

  it("adds existing minutes correctly", () => {
    // 5 existing min + 2m stint = 7 min = 420 000 ms
    expect(calcSubOutTotalMs(2 * 60_000, 0, 5)).toBe(7 * 60_000);
  });

  it("clamps to 0 when backward edit produces negative total", () => {
    expect(calcSubOutTotalMs(0, 5 * 60_000, 0)).toBe(0);
  });
});

// ── flushOnCourtPlayer ────────────────────────────────────────────────────────

describe("flushOnCourtPlayer — quarter change (nextTimerOrigin = 0)", () => {
  it("exact 10-minute quarter — no remainder", () => {
    const result = flushOnCourtPlayer(10 * 60_000, 0, 0, 0);
    expect(result.newMin).toBe(10);
    expect(result.nextEnteredAtMs).toBe(0); // 0 - 0 remainder
  });

  it("carries sub-minute remainder into next quarter", () => {
    // Player played 10m 30s this quarter
    const result = flushOnCourtPlayer(10 * 60_000 + 30_000, 0, 0, 0);
    expect(result.newMin).toBe(10);
    // remainder = 30 000 ms → nextEnteredAtMs = 0 - 30 000 = -30 000
    // (negative means the player "entered" 30s before quarter start, so
    // those 30s count in the NEXT minute accumulation)
    expect(result.nextEnteredAtMs).toBe(-30_000);
  });

  it("accumulates on top of existing minutes", () => {
    // Player already has 12 min; plays a full 10-minute quarter
    const result = flushOnCourtPlayer(10 * 60_000, 0, 12, 0);
    expect(result.newMin).toBe(22);
    expect(result.nextEnteredAtMs).toBe(0);
  });

  it("backward time edit reduces minutes but not below 0", () => {
    // Timer moved backwards: enteredAt=5:00 but currentTimer=3:00
    const result = flushOnCourtPlayer(3 * 60_000, 5 * 60_000, 0, 0);
    expect(result.newMin).toBe(0);
    expect(result.nextEnteredAtMs).toBe(0); // totalMs clamped to 0
  });
});

describe("flushOnCourtPlayer — time edit (nextTimerOrigin = newTimerMs)", () => {
  it("forward edit: enteredAtMs is reset to new origin minus remainder", () => {
    // Timer edited from 8:00 to 10:00 (forward 2 min); player entered at 0
    // stint = 8:00; flush gives 8 min; then origin resets to 10:00
    const result = flushOnCourtPlayer(8 * 60_000, 0, 0, 10 * 60_000);
    expect(result.newMin).toBe(8);
    expect(result.nextEnteredAtMs).toBe(10 * 60_000); // no remainder
  });

  it("remainder is carried even with non-zero origin", () => {
    // Played 5m 45s; origin resets to 15m
    const result = flushOnCourtPlayer(5 * 60_000 + 45_000, 0, 0, 15 * 60_000);
    expect(result.newMin).toBe(5);
    // remainder = 45 000 → nextEnteredAtMs = 15*60000 - 45000
    expect(result.nextEnteredAtMs).toBe(15 * 60_000 - 45_000);
  });
});

// ── recalcOffCourtPlayer ──────────────────────────────────────────────────────

describe("recalcOffCourtPlayer", () => {
  it("forward time edit beyond exit point has no effect (capped at exit)", () => {
    // Player exited at 10:00 with 10 min total.
    // Timer now at 15:00 (forward) → min(0, 15:00 - 10:00) = +5:00 → ignored
    // targetMs = max(0, 600 000 + min(0, 300 000)) = 600 000 → 10 min
    const minutes = recalcOffCourtPlayer(15 * 60_000, 10 * 60_000, 10 * 60_000, 10);
    expect(minutes).toBe(10);
  });

  it("backward time edit before exit reduces minutes", () => {
    // Exited at 10:00 with 10 min. Timer moved to 8:00.
    // delta = 8:00 - 10:00 = -2:00 → targetMs = 600 000 - 120 000 = 480 000 → 8 min
    const minutes = recalcOffCourtPlayer(8 * 60_000, 10 * 60_000, 10 * 60_000, 10);
    expect(minutes).toBe(8);
  });

  it("backward edit cannot go below 0 minutes", () => {
    // Exited at 2:00 with 2 min. Timer moved to 0:00.
    const minutes = recalcOffCourtPlayer(0, 2 * 60_000, 2 * 60_000, 2);
    expect(minutes).toBe(0);
  });

  it("timer exactly at exit time → minutes unchanged", () => {
    const minutes = recalcOffCourtPlayer(10 * 60_000, 10 * 60_000, 10 * 60_000, 10);
    expect(minutes).toBe(10);
  });

  it("sub-minute totalAtExit preserved across recalc", () => {
    // Exited at 5:00 with 4m 45s total (285 000 ms). Timer stays at 5:00.
    const minutes = recalcOffCourtPlayer(5 * 60_000, 5 * 60_000, 285_000, 4);
    expect(minutes).toBe(4); // floor(285 000 / 60 000) = 4
  });
});

// ── canStageBenchPlayer ───────────────────────────────────────────────────────

describe("canStageBenchPlayer", () => {
  it("5 on court, 0 staged out, 0 staged in → cannot add more", () => {
    // effectiveSize = 5 - 0 + 0 = 5 → NOT < 5
    expect(canStageBenchPlayer(5, 0, 0)).toBe(false);
  });

  it("5 on court, 1 staged out, 0 staged in → can add 1", () => {
    // effectiveSize = 5 - 1 + 0 = 4 → 4 < 5 ✓
    expect(canStageBenchPlayer(5, 1, 0)).toBe(true);
  });

  it("5 on court, 1 staged out, 1 already staged in → cannot add another", () => {
    // effectiveSize = 5 - 1 + 1 = 5 → NOT < 5
    expect(canStageBenchPlayer(5, 1, 1)).toBe(false);
  });

  it("5 on court, 2 staged out, 1 staged in → can add 1 more", () => {
    // effectiveSize = 5 - 2 + 1 = 4 → 4 < 5 ✓
    expect(canStageBenchPlayer(5, 2, 1)).toBe(true);
  });

  it("4 on court (foul-out scenario), 0 staged out, 0 staged in → can add", () => {
    // effectiveSize = 4 - 0 + 0 = 4 → 4 < 5 ✓
    expect(canStageBenchPlayer(4, 0, 0)).toBe(true);
  });

  it("0 on court — edge case — can always stage in", () => {
    expect(canStageBenchPlayer(0, 0, 0)).toBe(true);
  });
});
