PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_key TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  company_key TEXT NOT NULL,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  seniority TEXT NOT NULL DEFAULT 'unknown',
  location TEXT,
  market TEXT NOT NULL DEFAULT 'unknown',
  remote_scope TEXT,
  salary_text TEXT,
  source TEXT NOT NULL,
  source_key TEXT,
  source_url TEXT NOT NULL,
  application_url TEXT,
  description TEXT,
  description_hash TEXT,
  posted_at TEXT,
  reposted_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  eligibility TEXT NOT NULL DEFAULT 'uncertain',
  eligibility_reason TEXT,
  priority TEXT NOT NULL DEFAULT 'possible',
  fit_verdict TEXT,
  fit_reason TEXT,
  fit_gap TEXT,
  fit_eligibility_note TEXT,
  fit_reviewed_at TEXT,
  fit_description_hash TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  failure_reason TEXT,
  cv_path TEXT,
  cv_version TEXT,
  answers_path TEXT,
  application_channel TEXT,
  applied_at TEXT,
  confirmation_id TEXT,
  raw_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_stage_idx ON jobs(stage);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs(company_key);
CREATE INDEX IF NOT EXISTS jobs_seen_idx ON jobs(last_seen_at);
CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs(source);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  run_id TEXT,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS events_job_idx ON events(job_id, created_at);
CREATE INDEX IF NOT EXISTS events_kind_idx ON events(kind, created_at);

CREATE TABLE IF NOT EXISTS outreach (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_role TEXT,
  contact_url TEXT,
  address TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'linkedin')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'replied', 'closed')),
  message_path TEXT,
  drafted_at TEXT NOT NULL,
  sent_at TEXT,
  replied_at TEXT,
  follow_up_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS outreach_job_idx ON outreach(job_id, updated_at);
CREATE INDEX IF NOT EXISTS outreach_follow_up_idx ON outreach(status, follow_up_at);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hypothesis TEXT NOT NULL,
  change_text TEXT NOT NULL,
  cohort TEXT NOT NULL,
  metric TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  result TEXT,
  decision TEXT
);
