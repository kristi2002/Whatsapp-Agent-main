#!/usr/bin/env node
/**
 * Simulate an inbound WhatsApp message locally — POSTs a Meta-shaped webhook
 * payload to your running dev server, exactly as Meta would. Lets you exercise
 * the full agent (store -> AI -> booking -> reply) WITHOUT a public URL.
 *
 * The server responds 200 immediately and processes in the background, so watch
 * the `npm run dev` terminal for the AI/booking logs. If `from` is a number
 * registered on your Meta test number, the reply is delivered to that phone for
 * real; the exchange also appears in the dashboard.
 *
 * Usage:
 *   node scripts/simulate-message.mjs "Ciao, vorrei un taglio donna domani" 39XXXXXXXXXX
 *   npm run simulate -- "Che servizi avete?" 39XXXXXXXXXX
 *
 * Env:
 *   BASE_URL   default http://localhost:3000
 *   FROM       default 393330000000 (override, or pass as 2nd arg)
 *
 * Keep WHATSAPP_APP_SECRET empty in .env.local for this to work (otherwise the
 * server requires a valid X-Hub-Signature-256).
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const text = process.argv[2] || "Ciao, vorrei prenotare un taglio donna";
const from = process.argv[3] || process.env.FROM || "393330000000";
const name = process.env.NAME || "Cliente Test";

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1041062138271233",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15556523157",
              phone_number_id: "1142465592289974",
            },
            contacts: [{ profile: { name }, wa_id: from }],
            messages: [
              {
                from,
                // Unique id each run so it isn't treated as a duplicate delivery.
                id: "wamid.SIM_" + process.hrtime.bigint().toString(),
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

console.log(`→ POST ${BASE_URL}/api/webhook`);
console.log(`  from: ${from}`);
console.log(`  text: ${text}`);

try {
  const res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`← ${res.status} ${body}`);
  if (res.ok) {
    console.log(
      "\nAccepted. The reply is generated asynchronously — watch the dev-server\n" +
        "logs, the dashboard, or your phone (if `from` is a registered recipient)."
    );
  } else {
    console.log("\nServer rejected the request. If 401, WHATSAPP_APP_SECRET is set — clear it for local sim.");
  }
} catch (err) {
  console.error(`\nRequest failed: ${err.message}`);
  console.error("Is the dev server running? Start it with `npm run dev`.");
  process.exit(1);
}
