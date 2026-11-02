// Contract for the morning digest (plan.md § 1). Other parts of the plan build against this file.

export type JobStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null; views show it as "—"
  runs: number; // lines for this job
  retries: number; // lines for this job with status "retry"
  lastStatus: JobStatus; // from the job's last line, in file order
  lastError: string | null; // from the job's last line; null when that line has no error
  firstAt: string; // `at` of the job's first line, exactly as logged (offset kept, never UTC)
  lastAt: string; // `at` of the job's last line, exactly as logged
};

export type Night = {
  rows: DigestRow[]; // sorted by job
  badLines: number; // non-empty lines that don't parse or lack job/status/at
};

// Reads `<runsDir>/<night>.jsonl` synchronously. Never writes.
// Returns null when there is no file for that night (or `night` isn't YYYY-MM-DD);
// an empty file returns { rows: [], badLines: 0 }. Bad lines are counted, never thrown.
export type ReadNight = (runsDir: string, night: string) => Night | null;
