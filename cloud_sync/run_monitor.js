const { readMonitorConfig } = require("./monitor_config");
const { RepoMonitor } = require("./repo_monitor");

async function main() {
  const cfg = readMonitorConfig();
  const monitor = new RepoMonitor(cfg);

  const shutdown = () => {
    monitor.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await monitor.start();
}

main().catch((e) => {
  console.error("[cloud-sync] fatal:", e && e.stack ? e.stack : String(e));
  process.exit(1);
});

