import assert from 'node:assert/strict';
import test from 'node:test';
import { splitMaintenanceClients } from '../lumensia-auto-maintenance-run.mjs';

function fn(label) {
  const value = () => label;
  value.label = label;
  return value;
}

test('PAT owns PR data while ephemeral token owns hosted-check reads and merge', () => {
  const patApi = {
    createIssueComment: fn('pat-comment'),
    updatePull: fn('pat-update'),
    listIssueComments: fn('pat-issues'),
    listReviews: fn('pat-reviews'),
    listReviewComments: fn('pat-review-comments'),
    listPullFiles: fn('pat-files'),
    listCheckRuns: fn('pat-checks'),
    getCombinedStatus: fn('pat-status'),
  };
  const ephemeralApi = {
    listPullFiles: fn('ephemeral-files'),
    listCheckRuns: fn('ephemeral-checks'),
    getCombinedStatus: fn('ephemeral-status'),
    mergePull: fn('ephemeral-merge'),
  };

  const { api, mergeApi } = splitMaintenanceClients({ patApi, ephemeralApi });
  assert.equal(api.createIssueComment.label, 'pat-comment');
  assert.equal(api.updatePull.label, 'pat-update');
  assert.equal(api.listIssueComments.label, 'pat-issues');
  assert.equal(api.listReviews.label, 'pat-reviews');
  assert.equal(api.listReviewComments.label, 'pat-review-comments');
  assert.equal(api.listPullFiles.label, 'pat-files');
  assert.equal(api.listCheckRuns.label, 'ephemeral-checks');
  assert.equal(api.getCombinedStatus.label, 'ephemeral-status');
  assert.equal(mergeApi.mergePull.label, 'ephemeral-merge');
});

test('missing ephemeral token never invents merge capability', () => {
  const patApi = { createIssueComment: fn('pat-comment') };
  const { api, mergeApi } = splitMaintenanceClients({ patApi, ephemeralApi: null });
  assert.equal(api, patApi);
  assert.equal(mergeApi, null);
});
