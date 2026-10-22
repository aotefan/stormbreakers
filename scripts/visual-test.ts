import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, devices, type Browser, type Page } from 'playwright';

const port = 8792;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = 'test-output';
let child: ChildProcess | undefined;
let browser: Browser | undefined;

async function main() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (data) => process.stdout.write(`[server] ${data}`));
  child.stderr?.on('data', (data) => process.stderr.write(`[server] ${data}`));
  await waitForHealth();

  browser = await chromium.launch();
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  const consoleErrors: string[] = [];
  desktop.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await desktop.goto(baseUrl);
  await desktop.getByTestId('practice').click();
  await desktop.waitForSelector('[data-testid="storm-scene"] canvas');
  await desktop.waitForSelector('[data-testid="scoreboard"]');
  await desktop.screenshot({ path: `${outDir}/desktop-practice.png`, fullPage: false });

  await desktop.getByTestId('pause').click();
  await desktop.waitForFunction(() => document.body.textContent?.includes('单机已冻结'));
  const beforePause = await desktop.locator('.top-center strong').textContent();
  await desktop.waitForTimeout(1100);
  const afterPause = await desktop.locator('.top-center strong').textContent();
  assert(beforePause === afterPause, 'solo pause freezes timer');
  await desktop.getByTestId('pause').click();
  await desktop.waitForTimeout(400);

  await dragOwnShip(desktop);
  await desktop.screenshot({ path: `${outDir}/desktop-after-drag.png`, fullPage: false });

  const phoneContext = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  await phone.goto(baseUrl);
  await phone.getByTestId('practice').click();
  await phone.waitForSelector('[data-testid="storm-scene"] canvas');
  await phone.screenshot({ path: `${outDir}/mobile-portrait.png`, fullPage: false });
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${outDir}/mobile-landscape.png`, fullPage: false });
  await dragOwnShip(phone);
  await desktopContext.close();
  await phoneContext.close();

  const ctxA = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const sentFrames: string[] = [];
  a.on('websocket', (socket) => {
    socket.on('framesent', (event) => sentFrames.push(String(event.payload)));
  });
  await a.goto(baseUrl);
  await a.getByTestId('nickname').fill('BrowserA');
  await a.getByTestId('create-room').click();
  await a.waitForSelector('[data-testid="storm-scene"] canvas');
  await a.locator('.top-left').waitFor({ state: 'visible', timeout: 10000 });
  const roomText = await a.locator('.top-left').textContent();
  const code = roomText?.match(/[A-Z2-9]{5}/)?.[0];
  assert(!!code, `room code visible in host HUD: ${roomText}`);
  await b.goto(baseUrl);
  await b.getByTestId('nickname').fill('BrowserB');
  await b.getByTestId('room-code').fill(code);
  await b.getByTestId('join-room').click();
  await b.waitForSelector('[data-testid="storm-scene"] canvas');
  await waitFor(async () => {
    const aText = await a.getByTestId('scoreboard').textContent();
    const bText = await b.getByTestId('scoreboard').textContent();
    return !!aText?.includes('BrowserB') && !!bText?.includes('BrowserA');
  }, 'two browser contexts show each other in the same room');
  await dragOwnShip(a);
  const inputFrames = sentFrames
    .map((payload) => {
      try {
        return JSON.parse(payload) as { type?: string; input?: { dragTarget?: unknown; throttle?: number; turn?: number } };
      } catch {
        return {};
      }
    })
    .filter((message) => message.type === 'input');
  assert(inputFrames.some((message) => !!message.input?.dragTarget), 'online drag sends predicted drag target');
  assert(
    inputFrames.slice(-12).some((message) => message.input?.dragTarget === null && message.input.throttle === 0 && message.input.turn === 0),
    'online drag release sends immediate stop input',
  );
  await a.screenshot({ path: `${outDir}/multiplayer-a.png`, fullPage: false });
  await b.screenshot({ path: `${outDir}/multiplayer-b.png`, fullPage: false });

  assert(consoleErrors.length === 0, `desktop console errors: ${consoleErrors.join('\n')}`);
  console.log('VISUAL_TEST_PASS', {
    screenshots: [
      `${outDir}/desktop-practice.png`,
      `${outDir}/desktop-after-drag.png`,
      `${outDir}/mobile-portrait.png`,
      `${outDir}/mobile-landscape.png`,
      `${outDir}/multiplayer-a.png`,
      `${outDir}/multiplayer-b.png`,
    ],
  });
}

async function dragOwnShip(page: Page) {
  await page.locator('[data-testid="storm-scene"] canvas').first().waitFor({ state: 'attached' });
  const boxes = await page.locator('[data-testid="storm-scene"] canvas').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  let box = boxes.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!box || box.width === 0 || box.height === 0) {
    const viewport = page.viewportSize();
    assert(!!viewport, `canvas exists for drag: ${JSON.stringify(boxes)}`);
    box = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  }
  const beforeRight = await page.getByTestId('right-cooldown').first().textContent({ timeout: 5000 });
  const beforeScroll = await page.evaluate('window.scrollY');
  const candidates = [
    [0.5, 0.5],
    [0.5, 0.62],
    [0.35, 0.68],
    [0.65, 0.58],
    [0.28, 0.46],
  ];
  let afterRight = beforeRight;
  for (const [xRatio, yRatio] of candidates) {
    const cx = box.x + box.width * xRatio;
    const cy = box.y + box.height * yRatio;
    await page.evaluate(`(() => {
      const cx = ${JSON.stringify(cx)};
      const cy = ${JSON.stringify(cy)};
      const canvas = document.querySelector('[data-testid="storm-scene"] canvas');
      if (!canvas) throw new Error('canvas missing');
      const fire = (type, x, y, pointerId) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 41
        }));
      };
      fire('pointerdown', cx, cy, 41);
      const fireX = Math.min(window.innerWidth - 20, cx + Math.max(120, window.innerWidth * 0.24));
      fire('pointermove', cx + 80, cy + 30, 41);
      fire('pointerdown', fireX, cy, 42);
      fire('pointerup', fireX, cy, 42);
      fire('pointerup', cx + 80, cy + 30, 41);
    })()`);
    await page.waitForTimeout(350);
    afterRight = await page.getByTestId('right-cooldown').first().textContent({ timeout: 5000 });
    if (beforeRight !== afterRight && !!afterRight?.match(/R\s+(?!OK)/)) break;
  }
  const timer = await page.locator('.top-center strong').textContent();
  assert(!!timer, 'timer remains visible after drag release');
  const afterScroll = await page.evaluate('window.scrollY');
  assert(beforeRight !== afterRight && !!afterRight?.match(/R\s+(?!OK)/), `second touch fires while dragging: ${beforeRight} -> ${afterRight}`);
  assert(beforeScroll === 0 && afterScroll === 0, 'touch drag does not scroll the page');
}

async function waitForHealth() {
  await waitFor(async () => {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }, 'server health check');
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    console.error('VISUAL_TEST_FAIL', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    child?.kill();
  });
