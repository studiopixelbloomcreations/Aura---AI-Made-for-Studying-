function parseJsonEnv(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function fromSingleFirebaseJsonEnv() {
  // Firebase docs pattern for web config injection.
  const fromFirebaseDocs = parseJsonEnv(process.env.FIREBASE_WEBAPP_CONFIG);
  if (fromFirebaseDocs) return fromFirebaseDocs;

  // Backward-compatible alias.
  const fromAlias = parseJsonEnv(process.env.FIREBASE_WEB_CONFIG);
  if (fromAlias) return fromAlias;
  return null;
}

function fromSplitEnv() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ""
  };
}

exports.handler = async function () {
  const config = Object.assign(
    {},
    fromSplitEnv(),
    fromSingleFirebaseJsonEnv() || {}
  );

  const missing = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId"
  ].filter((key) => !config[key]);

  if (missing.length) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        ok: false,
        error: "FIREBASE_CONFIG_MISSING",
        missing,
        hint: "Set FIREBASE_WEBAPP_CONFIG as a JSON string (recommended), or set split FIREBASE_* vars."
      })
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      ok: true,
      firebase: config
    })
  };
};
