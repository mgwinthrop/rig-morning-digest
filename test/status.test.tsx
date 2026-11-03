import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { countStatuses } from '../src/digest/read.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to a digest that renders, with counts', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    const hrefs = [...html.matchAll(/href="(\/digest\/[^"]+)"/g)].map((m) => m[1] ?? '');
    expect(hrefs).toEqual(['/digest/2026-10-28', '/digest/2026-10-27']);
    for (const href of hrefs) expect((await app.request(href)).status).toBe(200);
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });

  it('shows an empty-board note when runs is missing', async () => {
    const html = await (await createApp({ ...config, runsDir: 'nope' }).request('/')).text();
    expect(html).toContain('nothing in runs/');
  });

  it('countStatuses counts lines, not rows, and skips bad lines', () => {
    const l = (job: string, status: string) => JSON.stringify({ at: 'a', job, status });
    expect(countStatuses([l('j', 'retry'), l('j', 'ok'), 'junk', '', l('k', 'fail')].join('\n'))).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
