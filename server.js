// Serves the app and one API route: /api/parse turns a medicine sentence into structured JSON with Claude.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT ?? 3000);

// Minimal .env loader so a key can live in a local file that git ignores.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;

const Medicine = z.object({
  name: z.string().describe("Medicine name, capitalised, without the dose"),
  dose: z.string().describe("Amount per dose with unit, e.g. '500 mg', '2 tablets', '10 units'; empty if not given"),
  type: z
    .enum(["interval", "daily", "with_food"])
    .describe("interval: every N hours around the clock; daily: once a day; with_food: tied to meals"),
  times: z
    .array(z.string().describe("24-hour HH:MM"))
    .describe("Usual home clock times, one per dose per day. Infer sensible times if not stated."),
  flexHours: z.number().describe("How many hours a dose may move from its usual gap"),
  note: z.string().describe("Short note about anything ambiguous; empty if none"),
});
const Parsed = z.object({ medicines: z.array(Medicine) });

const SYSTEM = `You read medicine descriptions written by travellers and return them as structured data.
One sentence can describe one or more medicines. Never invent a dose that is not written.
Timing type rules: "every N hours" or a fixed number of evenly spaced daily doses for drugs that need steady levels → interval; one dose a day → daily; "with food", "with meals", "after breakfast/dinner" → with_food.
Default times when none are given: 1 dose → 08:00; 2 doses → 08:00 and 20:00; 3 doses → 08:00, 14:00, 20:00; with_food uses meal times 08:00, 13:00, 19:30.
Flexibility: interval 2 hours, but 1 hour for narrow-window drugs (e.g. tacrolimus, cyclosporine, levodopa, progestin-only pill); daily 3 hours; with_food 3 hours.`;

async function parseMedicine(text) {
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
    output_config: { effort: "low", format: zodOutputFormat(Parsed) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("No structured output");
  return response.parsed_output;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 10_000) throw new Error("Too large");
  }
  return JSON.parse(data || "{}");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/parse" && req.method === "POST") {
      if (!client) return send(res, 503, { error: "Smart reader not configured" });
      const { text } = await readBody(req);
      if (!text || typeof text !== "string") return send(res, 400, { error: "Missing text" });
      const parsed = await parseMedicine(text.slice(0, 500));
      return send(res, 200, { ...parsed, source: "llm" });
    }
    if (url.pathname === "/api/health") return send(res, 200, { smartReader: Boolean(client) });

    const file = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(root)) return send(res, 403, "Forbidden", "text/plain");
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return send(res, 404, "Not found", "text/plain");
    send(res, 200, await readFile(file), TYPES[path.extname(file)] ?? "application/octet-stream");
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "Could not read that medicine" });
  }
});

server.listen(PORT, () => {
  console.log(`JetDose running at http://localhost:${PORT}`);
  console.log(client ? "Smart reader: Claude" : "Smart reader off (no ANTHROPIC_API_KEY) — using built-in rules");
});
