const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.CAPITAL_URL || 'https://ui-silk.vercel.app/capital';
const output = path.resolve(process.env.DEMO_OUTPUT || 'demo/mezo-working-capital-demo.webm');

(async () => {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    deviceScaleFactor: 1,
    recordVideo: {dir: path.dirname(output), size: {width: 1440, height: 900}},
  });
  const page = await context.newPage();
  const video = page.video();

  await page.goto(url, {waitUntil: 'networkidle'});
  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    caption.textContent = 'LIVE PROTOTYPE · MEZO TESTNET';
    Object.assign(caption.style, {
      position: 'fixed', left: '24px', bottom: '24px', zIndex: '9999',
      padding: '12px 16px', border: '1px solid #ff4949', background: '#09090bee',
      color: '#ff9292', font: '600 13px ui-monospace, monospace', letterSpacing: '1.5px',
    });
    document.body.appendChild(caption);
  });
  await page.waitForTimeout(1800);

  await page.getByRole('button', {name: 'Load vault'}).click();
  await page.getByText(/Vault read at testnet block/i).waitFor({timeout: 15000});
  await page.evaluate(() => { document.querySelector('#demo-caption').textContent = 'LIVE VAULT DATA · VERIFIED ON TESTNET'; });
  await page.waitForTimeout(1800);

  const sections = [
    ['Reserve policy', 'OWNER-DEFINED RESERVE · CAPS · BUDGET · COOLDOWN'],
    ['Manage funds', 'FUND · ALLOCATE · WITHDRAW · HARVEST'],
    ['Experimental testnet savings.', 'SECURITY GATES · TEST ASSETS ONLY'],
  ];
  for (const [text, caption] of sections) {
    const target = page.getByText(text, {exact: true}).first();
    await target.scrollIntoViewIfNeeded();
    await page.evaluate(value => { document.querySelector('#demo-caption').textContent = value; }, caption);
    await page.waitForTimeout(2200);
  }

  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'smooth'}));
  await page.evaluate(() => { document.querySelector('#demo-caption').textContent = 'MUSD WORKING CAPITAL · BUILT FOR MEZO'; });
  await page.waitForTimeout(2200);

  await context.close();
  if (!video) throw new Error('Video recording was not initialized.');
  await video.saveAs(output);
  await browser.close();
  process.stdout.write(`${output}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
