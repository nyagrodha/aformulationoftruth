/**
 * Funnel metric mapping.
 *
 * trackFunnelQuestion is 0-based in, 1-based in the metric name, and the
 * gate's two questions are named differently from the rest. An off-by-one
 * here is a silent hole in the conversion funnel: Q35 never increments, or
 * Q0 is recorded as questionnaire.q1.
 *
 *   deno test lib/metrics_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { getCurrentHourMetrics, trackFunnelQuestion, trackLatency } from './metrics.ts';

function count(name: string): number {
  return getCurrentHourMetrics()[name] ?? 0;
}

Deno.test('trackFunnelQuestion maps gate indices onto the gate metrics', () => {
  const q1 = count('funnel.gate.q1_answered');
  const q2 = count('funnel.gate.q2_answered');
  trackFunnelQuestion(0);
  trackFunnelQuestion(1);
  assertEquals(count('funnel.gate.q1_answered'), q1 + 1);
  assertEquals(count('funnel.gate.q2_answered'), q2 + 1);
});

Deno.test('trackFunnelQuestion maps questionnaire indices onto 1-based names', () => {
  const q3 = count('funnel.questionnaire.q3');
  const q35 = count('funnel.questionnaire.q35');
  trackFunnelQuestion(2);
  trackFunnelQuestion(34);
  assertEquals(count('funnel.questionnaire.q3'), q3 + 1);
  assertEquals(count('funnel.questionnaire.q35'), q35 + 1);
});

Deno.test('trackFunnelQuestion ignores an index that is not a question', () => {
  const q1 = count('funnel.gate.q1_answered');
  const q3 = count('funnel.questionnaire.q3');
  trackFunnelQuestion(-1);
  trackFunnelQuestion(35);
  assertEquals(count('funnel.gate.q1_answered'), q1);
  assertEquals(count('funnel.questionnaire.q3'), q3);
});

Deno.test('trackLatency buckets without storing the duration', () => {
  const fast = count('latency.fast');
  const extended = count('latency.extended');
  trackLatency(Date.now() - 1_000); // ~1s → fast
  trackLatency(Date.now() - 400_000); // ~6.5min → extended
  assertEquals(count('latency.fast'), fast + 1);
  assertEquals(count('latency.extended'), extended + 1);
  assertEquals('latency.1000' in getCurrentHourMetrics(), false);
});
