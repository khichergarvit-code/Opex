import { describe, expect, it } from 'vitest';
import { computeAlerts } from './adminSystem.js';

describe('computeAlerts', () => {
  it('returns no alerts when everything is under threshold', () => {
    expect(computeAlerts({ pendingJobs: 5, diskUsedPct: 40 })).toEqual([]);
  });

  it('flags a high job queue depth', () => {
    const alerts = computeAlerts({ pendingJobs: 100, diskUsedPct: 10 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/queue depth/);
  });

  it('flags high disk usage', () => {
    const alerts = computeAlerts({ pendingJobs: 0, diskUsedPct: 95 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/disk usage/);
  });

  it('flags both at once', () => {
    expect(computeAlerts({ pendingJobs: 200, diskUsedPct: 99 })).toHaveLength(2);
  });
});
