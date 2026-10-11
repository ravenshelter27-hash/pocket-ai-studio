import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "8mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

// Optional single-user password gate. Set APP_PASSWORD in .env for private deployments.
// This is intentionally simple; use proper authentication for multi-user/public services.
app.use((req, res, next) => {
  const password = process.env.APP_PASSWORD;
  if (!password || req.path === "/api/health" || req.path === "/manifest.json" || req.path === "/sw.js" || req.path.startsWith("/icons/")) return next();
  if (req.path.startsWith("/api/")) {
    const supplied = req.get("x-app-password") || "";
    if (supplied !== password) return res.status(401).json({ error: "Enter the app password in Settings." });
  }
  next();
});

async function readStore() {
  try { return JSON.parse(await fs.readFile(STORE_FILE, "utf8")); }
  catch { return { conversations: [], characters: [] }; }
}
async function writeStore(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}
function safeText(value, max = 12000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function configStatus() {
  return {
    chatConfigured: Boolean(process.env.AI_API_KEY),
    chatModel: process.env.AI_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    imageConfigured: Boolean(process.env.HF_API_KEY),
    imageProvider: process.env.IMAGE_PROVIDER || "huggingface",
    passwordRequired: Boolean(process.env.APP_PASSWORD)
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Pocket AI Studio", ...configStatus() }));

app.get("/api/data", async (_req, res) => {
  const data = await readStore();
  res.json({ ...data, status: configStatus() });
});

app.put("/api/data", async (req, res) => {
  const input = req.body || {};
  const conversations = Array.isArray(input.conversations) ? input.conversations.slice(0, 200) : [];
  const characters = Array.isArray(input.characters) ? input.characters.slice(0, 100) : [];
  await writeStore({ conversations, characters });
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Chat model is not configured yet. Add AI_API_KEY and AI_MODEL to your server's .env file." });
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-30) : [];
  if (!messages.length) return res.status(400).json({ error: "Add a message first." });
  const character = req.body?.character || null;
  const system = [
    "You are the assistant inside Pocket AI Studio. Be helpful, clear, and honest.",
    "Respect the configured provider's usage rules and applicable law. Do not claim to have generated an image unless an image provider actually returns one.",
    character ? `Active fictional character profile (use for creative continuity): ${safeText(character.name, 100)}. Notes: ${safeText(character.description, 3000)}. Keep this character consistent when relevant.` : ""
  ].filter(Boolean).join("\n\n");
  const upstreamMessages = [{ role: "system", content: system }, ...messages.map(m => ({
    role: ["user", "assistant", "system"].includes(m.role) && m.role !== "system" ? m.role : "user",
    content: safeText(m.content, 12000)
  }))];
  const base = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.AI_SITE_URL ? { "HTTP-Referer": process.env.AI_SITE_URL } : {}),
        ...(process.env.AI_SITE_NAME ? { "X-Title": process.env.AI_SITE_NAME } : {})
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        messages: upstreamMessages,
        temperature: 0.8,
        stream: false
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: body?.error?.message || body?.message || `AI provider returned HTTP ${response.status}.` });
    const answer = body?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: "The AI provider returned an empty response." });
    res.json({ answer, model: body.model || process.env.AI_MODEL });
  } catch (err) {
    res.status(502).json({ error: `Could not reach the AI provider: ${err.message}` });
  }
});

app.post("/api/image", async (req, res) => {
  const prompt = safeText(req.body?.prompt, 1800).trim();
  if (!prompt) return res.status(400).json({ error: "Write an image prompt first." });
  const provider = (process.env.IMAGE_PROVIDER || "huggingface").toLowerCase();

  // Hugging Face Inference API: requires a token and model availability varies.
  if (provider === "huggingface") {
    if (!process.env.HF_API_KEY) return res.status(503).json({ error: "Image generation is not configured. Add HF_API_KEY to .env and choose a model available to your account." });
    const model = process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
    try {
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.HF_API_KEY}`, "Content-Type": "application/json", "Accept": "image/*" },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } })
      });
      if (!response.ok) {
        const msg = await response.text();
        return res.status(response.status).json({ error: `Image provider error (${response.status}): ${msg.slice(0, 500)}` });
      }
      const type = response.headers.get("content-type") || "image/png";
      if (!type.startsWith("image/")) return res.status(502).json({ error: "Image provider did not return an image. Check model availability." });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 12 * 1024 * 1024) return res.status(413).json({ error: "Image response was too large." });
      return res.json({ image: `data:${type};base64,${buffer.toString("base64")}`, provider: "Hugging Face" });
    } catch (err) {
      return res.status(502).json({ error: `Could not reach image provider: ${err.message}` });
    }
  }

  return res.status(400).json({ error: "Unsupported IMAGE_PROVIDER. Set IMAGE_PROVIDER=huggingface." });
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Pocket AI Studio running on http://localhost:${PORT}`));
