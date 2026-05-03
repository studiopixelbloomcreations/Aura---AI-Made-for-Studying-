"use strict";

function entry(level, type, payload) {
  return Object.assign({
    at: new Date().toISOString(),
    level,
    type,
  }, payload && typeof payload === "object" ? payload : { message: String(payload || "") });
}

function write(level, type, payload) {
  const row = entry(level, type, payload);
  if (typeof window !== "undefined") {
    const key = "aevra_logs";
    try {
      const rows = JSON.parse(sessionStorage.getItem(key) || "[]").slice(-100);
      rows.push(row);
      sessionStorage.setItem(key, JSON.stringify(rows));
    } catch (error) {}
    if (level === "error") console.error("[Aevra]", row);
    return row;
  }
  const line = JSON.stringify(row);
  if (level === "error") console.error(line);
  else console.log(line);
  return row;
}

const logger = {
  info: (type, payload) => write("info", type, payload),
  warn: (type, payload) => write("warn", type, payload),
  error: (type, payload) => write("error", type, payload),
  request: (payload) => write("info", "request", payload),
  model: (payload) => write("info", "model_usage", payload),
  voice: (payload) => write("info", "voice_recognition", payload),
};

if (typeof module !== "undefined") module.exports = logger;
if (typeof window !== "undefined") window.AevraLogger = logger;
