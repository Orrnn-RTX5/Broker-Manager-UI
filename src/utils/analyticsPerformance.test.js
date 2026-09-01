import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_VIEW_BY_PATH,
  buildAnalyticsDurations,
  completeAnalyticsTiming,
  markAnalyticsTiming,
  resetAnalyticsTimings,
  startAnalyticsTiming,
} from './analyticsPerformance.js';

test('maps only the three measured analytics destinations', () => {
  assert.equal(ANALYTICS_VIEW_BY_PATH['/analytics/online-users'], 'online-users');
  assert.equal(ANALYTICS_VIEW_BY_PATH['/analytics/open-positions'], 'open-positions');
  assert.equal(ANALYTICS_VIEW_BY_PATH['/analytics/open-orders'], 'open-orders');
  assert.equal(ANALYTICS_VIEW_BY_PATH['/clients/orders'], undefined);
});

test('calculates all request-to-render pipeline segments', () => {
  assert.deepEqual(buildAnalyticsDurations({
    interactionStarted: 10,
    requestStarted: 25,
    responseReceived: 425,
    dataProcessed: 440,
    routeVisible: 30,
    dataVisible: 460,
  }), {
    clickToRequest: 15,
    requestToResponse: 400,
    responseToProcessed: 15,
    processedToVisible: 20,
    clickToRouteVisible: 20,
    clickToDataVisible: 450,
  });
});

test('keeps unavailable pipeline segments explicit', () => {
  const durations = buildAnalyticsDurations({ interactionStarted: 10, routeVisible: 20 });
  assert.equal(durations.clickToRouteVisible, 10);
  assert.equal(durations.clickToRequest, null);
  assert.equal(durations.clickToDataVisible, null);
});

test('ignores late stages from an older interaction', () => {
  resetAnalyticsTimings();
  const older = startAnalyticsTiming('online-users');
  const current = startAnalyticsTiming('online-users');

  assert.equal(markAnalyticsTiming('online-users', 'responseReceived', {}, older), false);
  assert.equal(markAnalyticsTiming('online-users', 'responseReceived', {}, current), true);
  const report = completeAnalyticsTiming('online-users');

  assert.equal(report.id, current);
  assert.equal(report.marks.responseReceived > 0, true);
  resetAnalyticsTimings();
});
