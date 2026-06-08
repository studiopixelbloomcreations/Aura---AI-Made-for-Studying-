const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium, firefox, webkit } = require("playwright");

const BASE_URL = process.env.VIS_BASE_URL || "http://127.0.0.1:8080/app.html?visMock=1";
const ARTIFACT_DIR = path.join(__dirname, "artifacts");

function ensureDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function startStaticServer(rootDir, port) {
  const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(rootDir, urlPath.replace(/^\/+/, ""));
      if (urlPath === "/") filePath = path.join(rootDir, "index.html");
      if (urlPath === "/public-config") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: true, firebase: { apiKey: "test", authDomain: "test", projectId: "test" } }));
      }
      if (urlPath.startsWith("/gamification/")) {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ points: 0, badges: [] }));
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          return res.end("Not found");
        }
        res.setHeader("Content-Type", mime[path.extname(filePath).toLowerCase()] || "application/octet-stream");
        res.end(data);
      });
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function run() {
  ensureDir();
  const consoleLogs = [];
  const pageErrors = [];
  const requestFailures = [];
  const forbiddenRequests = [];

  const server = await startStaticServer(path.resolve(__dirname, ".."), 8080);

  let browser = null;
  let browserName = "chromium";
  const chromePath = process.env.CHROME_PATH || "";
  const executablePath = fs.existsSync(chromePath) ? chromePath : undefined;
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
  } catch (err) {
    try {
      browserName = "firefox";
      browser = await firefox.launch({ headless: true });
    } catch (err2) {
      try {
        browserName = "webkit";
        browser = await webkit.launch({ headless: true });
      } catch (err3) {
        ensureDir();
        fs.writeFileSync(path.join(ARTIFACT_DIR, "vis_runner_error.log"), String((err3 && err3.stack) || (err2 && err2.stack) || (err && err.stack) || err3 || err2 || err));
        server.close();
        process.exit(1);
      }
    }
  }

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__TEST_MEDIA_CALLS__ = [];
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async function (constraints) {
        window.__TEST_MEDIA_CALLS__.push({ kind: "getUserMedia", constraints: constraints || null });
        throw new Error("getUserMedia should not be called in no-camera PI flow");
      };
    }
    window.puter = undefined; // Puter removed — Gemini TTS used instead
    window.Auth = {
      getUser: function () {
        return {
          uid: "user_123",
          email: "student@example.com",
          name: "Student One",
          photoURL: "",
        };
      },
    };
  });

  await context.route("**/personal-intelligence/config?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          user_id: "user_123",
          personalization_data: {
            interests: ["robotics"],
            goals: ["improve coding"],
            communication_style: "direct",
            tone: "calm",
          },
          ai_config: {
            tone: "calm",
            personalization_prompt: "Personalize for Student One. Tone: calm. Interests: robotics. Goals: improve coding.",
          },
          unique_id: "abc123",
        },
      }),
    });
  });
  await context.route("**/personal-intelligence/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          user_id: "user_123",
          personalization_data: {},
          ai_config: { personalization_prompt: "Personalize for Student One." },
          unique_id: "abc123",
        },
      }),
    });
  });
  await context.route("**/personal-intelligence/ask", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "Personalized mock answer.",
        observatory: {
          queries: [{ id: "q_1", text: "Help me with algebra", type: "tutorial", complexity: "medium", requires_multi_models: false }],
          type: "tutorial",
          complexity: "medium",
          requires_multi_models: false,
        },
        agent_harmony: {
          model_used: "mistral",
          fallback_used: false,
        },
      }),
    });
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (/\/vis\/|detect-face|process-face|recognize-user|register-user|analyze-emotion/i.test(url)) {
      forbiddenRequests.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
  page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), error: req.failure() && req.failure().errorText || "unknown" }));

  await page.goto(BASE_URL, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => {
    const panel = document.querySelector(".pi-panel");
    if (panel) panel.classList.remove("show");
  });
  await page.locator("#piBrainToggle").evaluate((node) => node.click());
  await page.fill("#inputBox", "Help me with algebra");
  await page.click("#sendBtn");
  await page.waitForFunction(() => {
    const messages = document.querySelectorAll(".message.ai, .bubble.ai, .msg.ai");
    return Array.from(messages).some((node) => /Personalized mock answer\./.test(node.textContent || ""));
  }, { timeout: 15000 }).catch(() => {});

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("pi:harmony-debug", {
      detail: {
        status: "Complete",
        observatory: { type: "tutorial", complexity: "medium", queries: [{ text: "Help me with algebra" }] },
        harmony: { model_used: "mistral", fallback_used: false },
      },
    }));
  });
  await page.click(".pi-harmony-toggle");
  const panelText = await page.textContent(".pi-harmony-panel");
  const mediaCalls = await page.evaluate(() => window.__TEST_MEDIA_CALLS__ || []);

  const output = {
    url: BASE_URL,
    browser: browserName,
    panelText,
    mediaCalls,
    forbiddenRequests,
    consoleLogs,
    pageErrors,
    requestFailures,
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "vis_report.json"), JSON.stringify(output, null, 2));

  let exitCode = 0;
  if (!/mistral/i.test(panelText || "")) exitCode = 1;
  if (forbiddenRequests.length) exitCode = 1;
  if (mediaCalls.length) exitCode = 1;
  if (pageErrors.length) exitCode = 1;

  await browser.close();
  server.close();
  process.exit(exitCode);
}

run().catch((err) => {
  ensureDir();
  fs.writeFileSync(path.join(ARTIFACT_DIR, "vis_runner_error.log"), String(err && err.stack ? err.stack : err));
  process.exit(1);
});
