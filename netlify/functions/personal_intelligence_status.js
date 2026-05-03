function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const email = (event.queryStringParameters && event.queryStringParameters.email) || "guest@student.com";
  return json(200, {
    email: String(email).toLowerCase(),
    assistant_name: "Aevra",
    section_name: "Personal Intelligence",
    integration_state: {
      spotify_connected: false,
      google_maps_connected: true,
      home_address: "",
    },
    known_facts: {},
  });
};
