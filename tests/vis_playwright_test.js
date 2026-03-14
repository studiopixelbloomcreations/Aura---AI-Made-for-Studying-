const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const http = require('http');

const BASE_URL = process.env.VIS_BASE_URL || 'http://127.0.0.1:8080/app.html?visMock=1';
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');

function ensureDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMetrics(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const metrics = await page.evaluate(() => window.__VIS_METRICS || null);
    if (metrics && metrics.timings && metrics.timings.total_verification_time_ms) return metrics;
    await sleep(500);
  }
  return null;
}

function startStaticServer(rootDir, port) {
  const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
  };
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(rootDir, urlPath.replace(/^\/+/, ''));
      if (urlPath === '/') filePath = path.join(rootDir, 'index.html');
      if (urlPath === '/public-config') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: true, firebase: { apiKey: "test", authDomain: "test", projectId: "test" } }));
      }
      if (urlPath.startsWith('/gamification/')) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ points: 0, badges: [] }));
      }
      if (urlPath === '/vis_identity_profiles/index.json') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify([]));
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  ensureDir();
  const consoleLogs = [];
  const pageErrors = [];
  const requestFailures = [];
  const responses404 = [];
  let launchError = null;

  let server = null;
  if (process.env.VIS_START_SERVER !== '0') {
    server = await startStaticServer(path.resolve(__dirname, '..'), 8080);
  }

  const launchArgs = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
  ];

  const chromePath = process.env.CHROME_PATH || 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : undefined;

  let browser = null;
  let browserName = 'chromium';
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: launchArgs,
    });
  } catch (err) {
    try {
      browserName = 'firefox';
      browser = await firefox.launch({ headless: true, args: launchArgs });
    } catch (err2) {
      try {
        browserName = 'webkit';
        browser = await webkit.launch({ headless: true, args: launchArgs });
      } catch (err3) {
        launchError = err3 || err2 || err;
      }
    }
  }

  if (!browser) {
    const output = {
      url: BASE_URL,
      browser: browserName,
      metrics: null,
      consoleLogs,
      pageErrors,
      requestFailures,
      responses404,
      error: launchError ? String(launchError && launchError.message ? launchError.message : launchError) : 'Unknown launch error',
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'vis_report.json'), JSON.stringify(output, null, 2));
    if (server) server.close();
    process.exit(1);
  }
  const context = await browser.newContext({
    permissions: ['camera'],
  });
  await context.addInitScript(() => {
    window.__VIS_TEST_MODE = true;
    window.__VIS_TEST_USE_MOCK = true;
    window.Human = { Human: class { async load(){} async warmup(){} } };
    const mockVec = new Array(128);
    for (let i = 0; i < 128; i += 1) mockVec[i] = ((i % 13) + 1) / 13;
    localStorage.setItem('vis_profiles_local', JSON.stringify([{
      user_identity: { username: "test_user" },
      facial_signature: { feature_vector: mockVec }
    }]));
  });
  await context.route('**/*puter.com*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/*firestore.googleapis.com*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/gamification/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"points":0,"badges":[]}' }));
  await context.route('**/public-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"firebase":{}}' }));

  const page = await context.newPage();
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const errorText = failure ? failure.errorText : 'unknown';
    if (errorText === 'net::ERR_ABORTED') return;
    requestFailures.push({ url: req.url(), error: errorText });
  });
  page.on('response', (res) => {
    if (res.status() === 404) responses404.push(res.url());
  });

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });

  await page.evaluate(async () => {
    if (!window.__VIS_METRICS) {
      try {
        const mod = await import('/vis/vis_controller.js');
        if (mod && mod.startVIS) {
          console.log('[TEST] Forcing startVIS manually');
          mod.startVIS();
        }
      } catch (err) {
        console.error('[TEST] Failed to manually load module:', err);
      }
    }
  });

  const metrics = await waitForMetrics(page, 30000);

  if (!metrics) {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vis_timeout.png'), fullPage: true });
  }

  const output = {
    url: BASE_URL,
    browser: browserName,
    metrics: metrics || null,
    consoleLogs,
    pageErrors,
    requestFailures,
    responses404,
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'vis_report.json'), JSON.stringify(output, null, 2));

  let exitCode = 0;
  if (!metrics) exitCode = 1;
  if (pageErrors.length || requestFailures.length || responses404.length) exitCode = 1;
  if (metrics && metrics.timings && metrics.timings.total_verification_time_ms > 15000) exitCode = 1;

  if (exitCode !== 0) {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vis_failure.png'), fullPage: true });
  }

  await browser.close();
  if (server) server.close();
  process.exit(exitCode);
}

run().catch((err) => {
  ensureDir();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'vis_runner_error.log'), String(err && err.stack ? err.stack : err));
  process.exit(1);
});
