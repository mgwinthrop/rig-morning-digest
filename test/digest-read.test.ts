import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  if (!night) throw new Error('runs/2026-10-28.jsonl not found');
  const row = (job: string) => night.rows.find((r) => r.job === job);

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('fixtures/refresh: 3 retries, last status ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup: last status fail with its error', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', runs: 1 });
  });

  it('digest/render: null owner keeps its row', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, lastStatus: 'ok', runs: 1 });
  });

  it('lane/sync: counts every line, keeps the log offset', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('empty file: no rows, no bad lines', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ rows: [], badLines: 0 });
  });

  it('missing file: null', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('not a night name: null, never read', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('lines missing job/status/at or with an unknown status count as bad', () => {
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [
        '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
        '{"job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-03T01:00:00+02:00","status":"ok"}',
        '{"at":"2026-01-03T01:00:00+02:00","job":"a"}',
        '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"maybe"}',
        '[]',
        'null',
        'not json',
        '',
      ].join('\n'),
    );
    const n = readNight(dir, '2026-01-03');
    expect(n?.badLines).toBe(7);
    expect(n?.rows).toHaveLength(1);
    expect(n?.rows[0]?.firstAt).toBe('2026-01-03T01:00:00+02:00');
  });
});
