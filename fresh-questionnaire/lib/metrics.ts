/**
 * Surveillance-Free Metrics
 *
 * gupta-vidya compliance:
 * - Raw numeric counts only
 * - Time-bucketed aggregation (minute/hour)
 * - Non-linkable across time windows
 * - No IP, user agent, request IDs, or correlatable identifiers
 * - Safe to publish publicly
 *
 * Design: In-memory counters that reset each time bucket.
 * No persistence of individual events, only aggregated counts.
 */

interface MetricBucket {
  timestamp: number; // Bucket start time (truncated to minute/hour)
  counters: Map<string, number>;
}

// Time bucket duration in milliseconds
const BUCKET_DURATION_MS = 60 * 1000; // 1 minute buckets

// Current active bucket
let currentBucket: MetricBucket | null = null;

// Published aggregates (hour-level, for external consumption)
const hourlyAggregates: Map<number, Map<string, number>> = new Map();

/**
 * Get the bucket timestamp for a given time.
 * Truncates to the start of the current minute.
 */
function getBucketTimestamp(time: number = Date.now()): number {
  return Math.floor(time / BUCKET_DURATION_MS) * BUCKET_DURATION_MS;
}

/**
 * Get the hour timestamp for aggregation.
 */
function getHourTimestamp(time: number = Date.now()): number {
  const hourMs = 60 * 60 * 1000;
  return Math.floor(time / hourMs) * hourMs;
}

/**
 * Get or create the current bucket.
 * If bucket has expired, finalize it and create new one.
 */
function getCurrentBucket(): MetricBucket {
  const now = Date.now();
  const bucketTs = getBucketTimestamp(now);

  if (!currentBucket || currentBucket.timestamp !== bucketTs) {
    // Finalize previous bucket if exists
    if (currentBucket) {
      finalizeBucket(currentBucket);
    }

    currentBucket = {
      timestamp: bucketTs,
      counters: new Map(),
    };
  }

  return currentBucket;
}

/**
 * Finalize a bucket by aggregating into hourly totals.
 * Individual minute-level data is discarded.
 */
function finalizeBucket(bucket: MetricBucket): void {
  const hourTs = getHourTimestamp(bucket.timestamp);

  let hourData = hourlyAggregates.get(hourTs);
  if (!hourData) {
    hourData = new Map();
    hourlyAggregates.set(hourTs, hourData);
  }

  // Add bucket counters to hourly aggregate
  for (const [key, count] of bucket.counters) {
    hourData.set(key, (hourData.get(key) || 0) + count);
  }

  // Clean up old hourly data (keep last 24 hours)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const ts of hourlyAggregates.keys()) {
    if (ts < cutoff) {
      hourlyAggregates.delete(ts);
    }
  }
}

/**
 * Increment a counter.
 *
 * Valid metric names:
 * - requests.total
 * - requests.api
 * - auth.otp.sent
 * - auth.otp.verified
 * - auth.magiclink.sent
 * - auth.magiclink.verified
 * - questionnaire.started
 * - questionnaire.completed
 * - errors.4xx
 * - errors.5xx
 */
export function increment(metric: string, count = 1): void {
  const bucket = getCurrentBucket();
  bucket.counters.set(metric, (bucket.counters.get(metric) || 0) + count);
}

/**
 * Get current hour's aggregated metrics.
 * Safe to expose publicly.
 */
export function getCurrentHourMetrics(): Record<string, number> {
  // Ensure current bucket is included
  const bucket = getCurrentBucket();
  const hourTs = getHourTimestamp();

  const result: Record<string, number> = {};

  // Get hourly aggregate
  const hourData = hourlyAggregates.get(hourTs);
  if (hourData) {
    for (const [key, count] of hourData) {
      result[key] = count;
    }
  }

  // Add current bucket if in same hour
  if (getHourTimestamp(bucket.timestamp) === hourTs) {
    for (const [key, count] of bucket.counters) {
      result[key] = (result[key] || 0) + count;
    }
  }

  return result;
}

/**
 * Get all available hourly metrics.
 * Returns array of { hour: ISO string, metrics: Record }.
 */
export function getHistoricalMetrics(): Array<{
  hour: string;
  metrics: Record<string, number>;
}> {
  const result: Array<{ hour: string; metrics: Record<string, number> }> = [];

  // Sort by timestamp
  const sortedHours = [...hourlyAggregates.keys()].sort((a, b) => a - b);

  for (const hourTs of sortedHours) {
    const hourData = hourlyAggregates.get(hourTs);
    if (hourData) {
      const metrics: Record<string, number> = {};
      for (const [key, count] of hourData) {
        metrics[key] = count;
      }
      result.push({
        hour: new Date(hourTs).toISOString(),
        metrics,
      });
    }
  }

  return result;
}

/**
 * Format metrics for logging.
 * Example output: "2024-01-08T12:00:00Z requests.total=42 auth.otp.sent=3"
 */
export function formatMetricsLog(): string {
  const metrics = getCurrentHourMetrics();
  const hourTs = getHourTimestamp();
  const timestamp = new Date(hourTs).toISOString();

  const parts = Object.entries(metrics)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');

  return `${timestamp} ${parts}`;
}
