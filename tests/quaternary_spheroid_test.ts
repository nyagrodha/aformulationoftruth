/**
 * Unit Tests for the QuaternarySpheroid Island
 *
 * The island renders an animated canvas visualization driven by pure
 * geometry/animation helpers (`makeSphere`, `ease`, `between`, `flight`).
 * These helpers are exported from the module specifically so they can be
 * unit tested independently of the canvas/DOM-dependent `useEffect` logic,
 * which requires a full browser environment (ResizeObserver, PointerEvent,
 * CanvasRenderingContext2D, matchMedia, etc.) and is out of scope for a
 * unit test.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertNotEquals } from '$std/assert/mod.ts';
import {
  between,
  ease,
  flight,
  makeSphere,
  default as QuaternarySpheroid,
} from '../islands/QuaternarySpheroid.tsx';

// ============================================================================
// Test Suite: makeSphere
// ============================================================================

Deno.test({
  name: 'makeSphere - returns the requested number of points',
  fn() {
    assertEquals(makeSphere(0).length, 0);
    assertEquals(makeSphere(1).length, 1);
    assertEquals(makeSphere(128).length, 128);
  },
});

Deno.test({
  name: 'makeSphere - every point lies on the unit 3-sphere in 4D (sum of squares ~= 1)',
  fn() {
    const points = makeSphere(128);
    for (const [x, y, z, w] of points) {
      const magnitude = x * x + y * y + z * z + w * w;
      assert(
        Math.abs(magnitude - 1) < 1e-9,
        `expected magnitude ~1, got ${magnitude}`,
      );
    }
  },
});

Deno.test({
  name: 'makeSphere - each point has exactly 4 finite numeric coordinates',
  fn() {
    const points = makeSphere(16);
    for (const point of points) {
      assertEquals(point.length, 4);
      for (const coord of point) {
        assertEquals(typeof coord, 'number');
        assert(Number.isFinite(coord));
      }
    }
  },
});

Deno.test({
  name: 'makeSphere - first point matches the closed-form expected value',
  fn() {
    const count = 4;
    const [point] = makeSphere(count);
    const u = 0.5 / count; // (index + 0.5) / count for index 0
    const inner = Math.sqrt(u);
    const outer = Math.sqrt(1 - u);
    // a = TAU * ((0 * phi) % 1) = 0, b = TAU * ((0 * psi) % 1) = 0
    assert(Math.abs(point[0] - inner) < 1e-9);
    assert(Math.abs(point[1] - 0) < 1e-9);
    assert(Math.abs(point[2] - outer) < 1e-9);
    assert(Math.abs(point[3] - 0) < 1e-9);
  },
});

Deno.test({
  name: 'makeSphere - is deterministic for the same input',
  fn() {
    const a = makeSphere(32);
    const b = makeSphere(32);
    assertEquals(a, b);
  },
});

Deno.test({
  name: 'makeSphere - points are distributed (not all identical)',
  fn() {
    const points = makeSphere(8);
    const [first, second] = points;
    assertNotEquals(first, second);
  },
});

// ============================================================================
// Test Suite: ease
// ============================================================================

Deno.test({
  name: 'ease - clamps endpoints to exactly 0 and 1',
  fn() {
    assertEquals(ease(0), 0);
    assertEquals(ease(1), 1);
  },
});

Deno.test({
  name: 'ease - is symmetric around 0.5 (smoothstep property)',
  fn() {
    assertEquals(ease(0.5), 0.5);
    for (const value of [0.1, 0.25, 0.37, 0.42]) {
      assert(Math.abs((ease(value) + ease(1 - value)) - 1) < 1e-12);
    }
  },
});

Deno.test({
  name: 'ease - is monotonically increasing on [0, 1]',
  fn() {
    let previous = ease(0);
    for (let step = 1; step <= 10; step++) {
      const value = ease(step / 10);
      assert(value >= previous, `ease(${step / 10}) should be >= previous value`);
      previous = value;
    }
  },
});

Deno.test({
  name: 'ease - matches the smoothstep formula for an arbitrary value',
  fn() {
    // 0.25^2 * (3 - 0.5) = 0.0625 * 2.5 = 0.15625 (exact, dyadic fraction)
    assertEquals(ease(0.25), 0.15625);
  },
});

// ============================================================================
// Test Suite: between
// ============================================================================

Deno.test({
  name: 'between - returns "from" at the start of the range',
  fn() {
    assertEquals(between(0, 0, 1, 5, 15), 5);
  },
});

Deno.test({
  name: 'between - returns "to" at the end of the range',
  fn() {
    assertEquals(between(1, 0, 1, 5, 15), 15);
  },
});

Deno.test({
  name: 'between - eases through the midpoint',
  fn() {
    // ease(0.5) === 0.5, so result is the arithmetic midpoint
    assertEquals(between(0.5, 0, 1, 0, 10), 5);
  },
});

Deno.test({
  name: 'between - supports arbitrary (non 0-1) start/end ranges',
  fn() {
    assertEquals(between(0.28, 0, 0.28, 0, -120), -120);
    assertEquals(between(0.14, 0, 0.28, 0, -120), -60);
  },
});

// ============================================================================
// Test Suite: flight
// ============================================================================

Deno.test({
  name: 'flight - returns the initial keyframe at progress 0',
  fn() {
    const position = flight(0, false);
    assertEquals(position, { x: 0, y: 0, rotation: -8 });
  },
});

Deno.test({
  name: 'flight - loops back to the initial keyframe at progress 1',
  fn() {
    const position = flight(1, false);
    assertEquals(position, { x: 0, y: 0, rotation: -8 });
  },
});

Deno.test({
  name: 'flight - matches an exact keyframe stop at t=0.28',
  fn() {
    const position = flight(0.28, false);
    assertEquals(position, { x: -120, y: -100, rotation: -27 });
  },
});

Deno.test({
  name: 'flight - scales keyframe offsets down when compact is true',
  fn() {
    const expanded = flight(0.28, false);
    const compact = flight(0.28, true);
    assertEquals(compact.x, expanded.x * 0.58);
    assertEquals(compact.y, expanded.y * 0.58);
    // Rotation is not scaled by the compact flag.
    assertEquals(compact.rotation, expanded.rotation);
  },
});

Deno.test({
  name: 'flight - interpolates between keyframes rather than jumping',
  fn() {
    // Halfway between the t=0 stop (0,0,-8) and the t=0.28 stop (-120,-100,-27)
    const position = flight(0.14, false);
    assertEquals(position, { x: -60, y: -50, rotation: -17.5 });
  },
});

Deno.test({
  name: 'flight - produces finite numeric coordinates across the full progress range',
  fn() {
    for (let step = 0; step <= 20; step++) {
      const progress = step / 20;
      const position = flight(progress, step % 2 === 0);
      assert(Number.isFinite(position.x));
      assert(Number.isFinite(position.y));
      assert(Number.isFinite(position.rotation));
    }
  },
});

// ============================================================================
// Test Suite: default export shape
// ============================================================================

Deno.test({
  name: 'QuaternarySpheroid - default export is a named, zero-argument component function',
  fn() {
    assertEquals(typeof QuaternarySpheroid, 'function');
    assertEquals(QuaternarySpheroid.name, 'QuaternarySpheroid');
    assertEquals(QuaternarySpheroid.length, 0);
  },
});