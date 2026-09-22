#!/usr/bin/env node
// Sends 8 varied sample inputs to a locally running Worker (`wrangler dev`)
// and writes each result to quality-output/NN-topic.md for manual review
// against PHASE1_REVIEW.md.
//
// Usage:
//   1. In one terminal: wrangler dev
//   2. In another:      npm run quality-check
//      (or: node scripts/quality-check.mjs)

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:8787";
const OUTPUT_DIR = "quality-output";

// Cloudflare's published Turnstile dummy response token. It is only
// accepted by a matching dummy secret key (see .dev.vars.example), which is
// what `wrangler dev` should be configured with — never a production
// secret.
const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const GOALS = [
  "Understand it broadly",
  "Be able to discuss it confidently with others",
  "Spot opportunities and stay ahead",
  "Identify specific gaps or make a decision",
];

const MODELS = [
  "ChatGPT",
  "Claude (claude.ai)",
  "Microsoft Copilot",
  "Gemini",
  "Perplexity",
  "Other",
];

// 8 samples: every goal and every model appears at least once, and one
// sample has an empty context to exercise the "Not provided" fallback.
const samples = [
  {
    topic: "Quantum computing basics",
    context:
      "I'm a product manager with no physics background, trying to understand what my engineering team keeps talking about.",
    goal: GOALS[0],
    model: MODELS[0],
  },
  {
    topic: "Heat pumps for a small office",
    context: "I run a 12-person office in an old building and I'm deciding whether to switch from gas heating.",
    goal: GOALS[3],
    model: MODELS[1],
  },
  {
    topic: "The Swedish pension system",
    context: "",
    goal: GOALS[0],
    model: MODELS[2],
  },
  {
    topic: "mRNA vaccine technology",
    context: "I'm a science journalist writing a feature for a general audience.",
    goal: GOALS[1],
    model: MODELS[3],
  },
  {
    topic: "Stoic philosophy",
    context: "I'm going through a stressful career transition and want practical ideas, not just history.",
    goal: GOALS[3],
    model: MODELS[4],
  },
  {
    topic: "Cybersecurity for a small business",
    context: "I co-own a 6-person consultancy and we handle client financial data.",
    goal: GOALS[2],
    model: MODELS[5],
  },
  {
    topic: "AI in drug development",
    context: "I work in pharma quality assurance and want to stay ahead of how AI is changing the industry.",
    goal: GOALS[2],
    model: MODELS[1],
  },
  {
    topic: "Sourdough baking science",
    context: "Total beginner, just got a starter going and want to understand the 'why' behind the steps.",
    goal: GOALS[0],
    model: MODELS[0],
  },
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renderMarkdown(label, sample, outcome) {
  const lines = [];
  lines.push(`# ${label}`);
  lines.push("");
  lines.push("## Input");
  lines.push("");
  lines.push(`- Topic: ${sample.topic}`);
  lines.push(`- Context: ${sample.context ? sample.context : "(empty)"}`);
  lines.push(`- Goal: ${sample.goal}`);
  lines.push(`- Model: ${sample.model}`);
  lines.push("");
  lines.push(`## Result (HTTP ${outcome.status ?? "no response"})`);
  lines.push("");
  if (outcome.parsed && typeof outcome.parsed.prompt === "string") {
    lines.push(outcome.parsed.prompt);
  } else if (outcome.parsed && typeof outcome.parsed.error === "string") {
    lines.push(`Error: ${outcome.parsed.error}`);
  } else if (outcome.error) {
    lines.push(`Request failed: ${outcome.error}`);
  } else {
    lines.push("```");
    lines.push(outcome.raw ?? "(no body)");
    lines.push("```");
  }
  lines.push("");
  return lines.join("\n");
}

async function runSample(sample, index) {
  const label = `${String(index + 1).padStart(2, "0")}-${slugify(sample.topic)}`;
  const payload = { ...sample, turnstileToken: DUMMY_TURNSTILE_TOKEN };

  let outcome;
  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // leave parsed as null; raw is still written to the file
    }
    outcome = { status: res.status, parsed, raw };
  } catch (err) {
    outcome = { status: null, error: String(err) };
  }

  await writeFile(path.join(OUTPUT_DIR, `${label}.md`), renderMarkdown(label, sample, outcome), "utf8");

  const ok = outcome.status === 200 && outcome.parsed && typeof outcome.parsed.prompt === "string";
  console.log(`${ok ? "OK  " : "FAIL"} ${label} (status ${outcome.status ?? "n/a"})`);
  return ok;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Running ${samples.length} quality-check requests against ${WORKER_URL} ...`);

  let passed = 0;
  for (const [index, sample] of samples.entries()) {
    // Sequential on purpose: /generate is rate-limited to 2 req/60s per IP.
    // eslint-disable-next-line no-await-in-loop
    if (await runSample(sample, index)) passed++;
  }

  console.log(`\n${passed}/${samples.length} generated successfully. Output written to ${OUTPUT_DIR}/`);
  if (passed < samples.length) process.exitCode = 1;
}

main();
