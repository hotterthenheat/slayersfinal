import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/routes';
const ROUTES = [
  ['landing', '/'],
  ['compass', '/compass'],
  ['stocks', '/stocks'],
  ['news', '/news'],
  ['earnings', '/earnings'],
  ['proveit', '/prove-it'],
  ['tracker', '/tracker'],
  ['pin-gamma', '/pinpoint/gamma'],
  ['pin-levels', '/pinpoint/levels'],
  ['pin-greeks', '/pinpoint/greeks'],
  ['pin-vol', '/pinpoint/volatility'],
  ['pin-stress', '/pinpoint/stress'],
  ['pin-history', '/pinpoint/history'],
  ['trace-tape', '/trace/live-tape'],
  ['trace-dp', '/trace/dark-pool'],
  ['trace-scanner', '/trace/scanner'],
  ['trace-recon', '/trace/reconstruction'],
  ['guide-overview', '/guide/overview'],
  ['guide-desks', '/guide/desks'],
  ['guide-concepts', '/guide/concepts'],
  ['guide-faq', '/guide/faq'],
  ['community-ideas', '/community/ideas'],
  ['community-feedback', '/community/feedback'],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:4340/pulse');
await page.evaluate(() => localStorage.setItem('slayer_onboarded_v1', '1'));
for (const [name, path] of ROUTES) {
  try {
    await page.goto('http://localhost:4340' + path, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch {}
  await page.waitForTimeout(name === 'proveit' ? 6000 : 2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
console.log('ALLDONE');
