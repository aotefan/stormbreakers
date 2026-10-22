import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { SITE_URL, REPOSITORY_URL, siteText } from '../src/site';

const port = 8798;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore',
});
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const lang of ['zh', 'en'] as const) {
    const path = lang === 'zh' ? '/' : '/en/';
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/html; charset=utf-8/);
    const html = await response.text();
    assert(html.includes(`<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">`));
    assert(html.includes(`<link rel="canonical" href="${SITE_URL}${path}"`));
    for (const [question, answer] of siteText[lang].faq) assert(html.includes(question) && html.includes(answer), 'visible facts must be in raw HTML');
    assert(html.includes(REPOSITORY_URL));
    assert(html.includes('hreflang="zh-CN"') && html.includes('hreflang="en"'));
    assert(html.includes('name="description"') && html.includes('property="og:image"'));
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const graph = JSON.parse(json)['@graph'];
    assert.equal(graph.find((item: any) => item['@type'] === 'VideoGame').numberOfPlayers.maxValue, 6);
    assert.equal(graph.find((item: any) => item['@type'] === 'SoftwareSourceCode').codeRepository, REPOSITORY_URL);
    for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
      const resource = await fetch(`${base}${asset[1]}`);
      assert(resource.ok); assert(resource.headers.get('cache-control')?.includes('immutable'));
    }
  }
  const robots = await fetch(`${base}/robots.txt`);
  assert.match(robots.headers.get('content-type')!, /text\/plain/);
  assert((await robots.text()).includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.match(sitemap.headers.get('content-type')!, /application\/xml/);
  const xml = await sitemap.text();
  assert.equal([...xml.matchAll(/<loc>/g)].length, 2);
  for (const match of xml.matchAll(/<loc>(.*?)<\/loc>/g)) assert((await fetch(match[1].replace(SITE_URL, base))).ok);
  assert((await (await fetch(`${base}/llms.txt`)).text()).includes(REPOSITORY_URL));
  const image = await fetch(`${base}/social-preview.png`);
  assert(image.ok); assert.equal(image.headers.get('content-type'), 'image/png');
  const png = await readFile('public/social-preview.png');
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  assert.equal((await fetch(`${base}/en`, { redirect: 'manual' })).headers.get('location'), '/en/');
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  console.log('SEO_TEST_PASS: raw bilingual HTML, visible facts, canonical/hreflang, JSON-LD, sitemap, robots, image, caching and real 404s');
} finally { child.kill(); }
