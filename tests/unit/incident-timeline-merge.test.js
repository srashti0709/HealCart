const test = require('node:test');
const assert = require('node:assert/strict');

const {
  combineTimelineEvents,
  incidentToTimelineEvent,
} = require('../../frontend/src/lib/timelineMerge.js');

test('combineTimelineEvents orders recovery events newest first', () => {
  const events = [
    { type: 'crash', timestamp: '2026-10-22T10:00:00.000Z', message: 'down' },
    { type: 'recovered', timestamp: '2026-10-22T10:05:00.000Z', message: 'up' },
  ];

  const merged = combineTimelineEvents(events, []);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].type, 'recovered');
  assert.equal(merged[1].type, 'crash');
});

test('combineTimelineEvents converts backend incidents into timeline events', () => {
  const incidents = [
    {
      _id: 'inc-1',
      incidentType: 'payment_status_uncertain',
      service: 'backend',
      status: 'detected',
      message: 'Payment result uncertain for order 1.',
      detectedAt: '2026-10-22T09:00:00.000Z',
      severity: 'high',
      recoveryAction: 'Run reconciliation',
    },
  ];

  const merged = combineTimelineEvents([], incidents);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].type, 'payment_status_uncertain');
  assert.equal(merged[0].source, 'backend');
  assert.equal(merged[0].outcome, 'in_progress');
  assert.ok(/Recovery action: Run reconciliation/.test(merged[0].details));
});

test('combineTimelineEvents maps resolved incidents to success outcome', () => {
  const incidents = [
    {
      incidentType: 'payment_status_uncertain',
      service: 'backend',
      status: 'resolved',
      message: 'Reconciled.',
      detectedAt: '2026-10-22T09:00:00.000Z',
    },
  ];

  const merged = combineTimelineEvents([], incidents);

  assert.equal(merged[0].outcome, 'success');
});

test('combineTimelineEvents dedupes events shared by both sources', () => {
  const shared = {
    type: 'crash',
    timestamp: '2026-10-22T10:00:00.000Z',
    message: 'container stopped',
  };

  const incidents = [
    {
      incidentType: 'crash',
      service: 'backend',
      status: 'detected',
      message: 'container stopped',
      detectedAt: '2026-10-22T10:00:00.000Z',
    },
  ];

  const merged = combineTimelineEvents([shared], incidents);

  assert.equal(merged.length, 1);
});

test('combineTimelineEvents ignores non-object entries', () => {
  const merged = combineTimelineEvents([null, undefined, 'not-an-event'], []);

  assert.equal(merged.length, 0);
});

test('incidentToTimelineEvent returns null for invalid input', () => {
  assert.equal(incidentToTimelineEvent(null), null);
  assert.equal(incidentToTimelineEvent(undefined), null);
});
