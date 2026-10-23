const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getBackendHealthStatuses,
  getIncidentsFreshness,
} = require('../../frontend/src/lib/healthStatus.js');

test('a successful health response reports a healthy backend and a connected database', () => {
  const result = getBackendHealthStatuses({
    health: {
      success: true,
      service: 'backend',
      status: 'healthy',
      database: 'connected',
      timestamp: '2026-10-22T06:00:00.000Z',
    },
    healthError: '',
  });

  assert.equal(result.backendStatus, 'Healthy');
  assert.equal(result.databaseStatus, 'Connected');
});

test('a degraded health response keeps the confirmed database disconnect', () => {
  const result = getBackendHealthStatuses({
    health: {
      success: false,
      service: 'backend',
      status: 'degraded',
      database: 'disconnected',
      timestamp: '2026-10-22T06:00:00.000Z',
    },
    healthError: 'Backend API is degraded: MongoDB is not connected.',
  });

  assert.equal(result.backendStatus, 'Degraded');
  assert.equal(result.databaseStatus, 'Disconnected');
});

test('an unreachable backend is unavailable and the database stays unknown', () => {
  const result = getBackendHealthStatuses({
    health: null,
    healthError: 'Backend API is unavailable.',
  });

  assert.equal(result.backendStatus, 'Unavailable');
  assert.equal(result.databaseStatus, 'Unknown');
});

test('before the first check both statuses are still checking', () => {
  const result = getBackendHealthStatuses({ health: null, healthError: '' });

  assert.equal(result.backendStatus, 'Checking');
  assert.equal(result.databaseStatus, 'Checking');
});

test('a response without a database field is reported as unknown, never connected', () => {
  const result = getBackendHealthStatuses({
    health: { success: true, status: 'healthy' },
    healthError: '',
  });

  assert.equal(result.backendStatus, 'Healthy');
  assert.equal(result.databaseStatus, 'Unknown');
});

test('incident figures are marked stale only while they are retained', () => {
  const stale = getIncidentsFreshness({
    incidents: [{ id: 1 }],
    incidentsError: 'Unable to load incidents from the backend.',
    updatedAt: '10:42:11',
  });

  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, '10:42:11');
  assert.equal(stale.hasFigures, true);

  const fresh = getIncidentsFreshness({
    incidents: [{ id: 1 }],
    incidentsError: '',
    updatedAt: '10:42:11',
  });

  assert.equal(fresh.stale, false);

  const failedWithoutData = getIncidentsFreshness({
    incidents: [],
    incidentsError: 'Unable to load incidents from the backend.',
    updatedAt: null,
  });

  assert.equal(failedWithoutData.stale, false);
  assert.equal(failedWithoutData.hasFigures, false);
});
