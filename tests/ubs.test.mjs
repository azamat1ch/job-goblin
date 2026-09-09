import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUbsBootstrap, parseUbsJobs } from '../src/connectors/ubs.mjs';

test('UBS bootstrap creates the public Hong Kong search request', () => {
  const initial = JSON.stringify({ KeywordCustomSolrFields: 'JobTitle,Department', LocationCustomSolrFields: 'Location,FORMTEXT23' });
  const preload = JSON.stringify({ SmartSearchJSONValue: initial }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<input id="preLoadJSON" type="hidden" value="${preload}">
    <input id="CookieValue" type="hidden" value="session-value">
    <input name="__RequestVerificationToken" type="hidden" value="request-token">`;
  const result = parseUbsBootstrap(html);
  assert.equal(result.token, 'request-token');
  assert.equal(result.request.Location, 'Hong Kong SAR');
  assert.equal(result.request.encryptedsessionvalue, 'session-value');
  assert.equal(result.request.LocationCustomSolrFields, 'Location,FORMTEXT23');
});

test('UBS records keep exact requisitions, updated dates, text, and application links', () => {
  const question = (QuestionName, Value) => ({ QuestionName, Value });
  const jobs = parseUbsJobs({ Jobs: { Job: [{ Questions: [
    question('reqid', '347630'), question('siteid', '5155'),
    question('jobtitle', 'Backend Engineer'), question('formtext23', 'Hong Kong SAR'),
    question('lastupdated', '01-Sep-2026'), question('jobdescription', 'Build<br>systems &amp; services.'),
  ] }, { Questions: [
    question('reqid', 'old'), question('jobtitle', 'Old Engineer'),
    question('formtext23', 'Hong Kong SAR'), question('lastupdated', '01-Aug-2026'),
  ] }] } }, { sinceDays: 21, now: new Date('2026-09-03T00:00:00Z').valueOf() });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source_key, '347630');
  assert.equal(jobs[0].posted_at, '2026-09-01T00:00:00.000Z');
  assert.equal(jobs[0].description, 'Build\nsystems & services.');
  assert.match(jobs[0].application_url, /jobid=347630/);
});
