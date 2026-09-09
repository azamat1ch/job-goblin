import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTencentResponse } from '../src/connectors/providers/tencent.mjs';

test('Tencent exposes China-Hong Kong API locations as Hong Kong', () => {
  const { jobs } = parseTencentResponse({ Data: { Count: 1, Posts: [{
    PostId: '123',
    PostURL: 'http://careers.tencent.com/jobdesc.html?postId=123',
    RecruitPostName: 'AI Engineer',
    CountryName: '中国',
    LocationName: '中国香港',
  }] } }, 'tencent');

  assert.equal(jobs[0].location, 'Hong Kong');
  assert.equal(jobs[0].url, 'https://careers.tencent.com/jobdesc.html?postId=123');
});
