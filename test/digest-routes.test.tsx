import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
const app = createApp(config);

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const at = '2026-10-28T02:00:00+01:00';

writeFileSync(
  join(dir, '2026-10-01.jsonl'),
  [
    line({ at, job: 'zeta', status: 'ok', owner: 'ann' }),
    line({ at, job: 'alpha', status: 'ok', owner: 'bob' }),
    line({ at, job: 'mid', status: 'ok', owner: 'cy' }),
  ].join('\n') + '\n',
);
writeFileSync(join(dir, '2026-10-02.jsonl'), '');
writeFileSync(
  join(dir, '2026-10-03.jsonl'),
  [line({ at, job: 'good', status: 'ok', owner: 'ann' }), 'not json at all'].join('\n') + '\n',
);
writeFileSync(
  join(dir, '2026-10-04.jsonl'),
  [
    line({ at, job: 'flaky', status: 'retry', owner: 'ann' }),
    line({ at, job: 'flaky', status: 'retry', owner: 'ann' }),
    line({ at, job: 'flaky', status: 'retry', owner: 'ann' }),
    line({ at, job: 'flaky', status: 'ok', owner: 'ann' }),
  ].join('\n') + '\n',
);
writeFileSync(join(dir, '2026-10-05.jsonl'), line({ at, job: 'broken', status: 'fail', owner: 'ann', error: 'boom' }) + '\n');
writeFileSync(join(dir, '2026-10-06.jsonl'), line({ at, job: 'orphan', status: 'ok' }) + '\n');

type Api = { night: string; rows: { job: string; owner: string | null }[]; badLines: number };
const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
};
const api = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as Api };
};

describe('digest page', () => {
  it('200 for a normal night', async () => {
    const r = await page('2026-10-01');
    expect(r.status).toBe(200);
    expect(r.html).toContain('digest 2026-10-01');
  });
  it('404 for a night with no file', async () => {
    expect((await page('2026-09-09')).status).toBe(404);
  });
  it('404 for a malformed night name', async () => {
    expect((await page('not-a-night')).status).toBe(404);
  });
  it('says nothing ran for an empty night', async () => {
    const r = await page('2026-10-02');
    expect(r.status).toBe(200);
    expect(r.html).toContain('nothing ran');
  });
  it('stays 200 and shows bad lines: 1', async () => {
    const r = await page('2026-10-03');
    expect(r.status).toBe(200);
    expect(r.html).toContain('bad lines: 1');
    expect(r.html).toContain('good');
  });
  it('marks retries >= 3', async () => {
    expect((await page('2026-10-04')).html).toContain('⚠');
  });
  it('marks fail rows', async () => {
    expect((await page('2026-10-05')).html).toContain('⚠ fail');
  });
  it('renders a null owner as a dash', async () => {
    expect((await page('2026-10-06')).html).toContain('<td>—</td>');
  });
});

describe('digest JSON', () => {
  it('200 for a normal night', async () => {
    const r = await api('2026-10-01');
    expect(r.status).toBe(200);
    expect(r.body.night).toBe('2026-10-01');
  });
  it('404 for a night with no file', async () => {
    expect((await api('2026-09-09')).status).toBe(404);
  });
  it('404 for a malformed night name', async () => {
    expect((await api('not-a-night')).status).toBe(404);
  });
  it('has empty rows for an empty night', async () => {
    const r = await api('2026-10-02');
    expect(r.status).toBe(200);
    expect(r.body.rows).toEqual([]);
  });
  it('reports badLines 1 and keeps rows', async () => {
    const r = await api('2026-10-03');
    expect(r.status).toBe(200);
    expect(r.body.badLines).toBe(1);
    expect(r.body.rows).toHaveLength(1);
  });
  it('has a null owner as null', async () => {
    expect((await api('2026-10-06')).body.rows[0]?.owner).toBeNull();
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const jobs = (await api('2026-10-01')).body.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha', 'mid', 'zeta']);
    const html = (await page('2026-10-01')).html;
    const found = [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(found).toEqual(jobs);
  });
});
