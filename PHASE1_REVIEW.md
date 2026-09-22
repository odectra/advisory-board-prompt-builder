# Phase 1 review checklist

Use this to judge the outputs in `quality-output/` after running the quality
check (see README.md → "Running the quality check"). Read all 8 files before
deciding whether the prompt is ready to tune further.

For each sample, check:

- [ ] **Four distinct fictional personas** — four named experts, each with a
      distinct voice and a distinct (invented) area of expertise relevant to
      the topic. No two personas are interchangeable.
- [ ] **Panel behaviour** — the prompt instructs the target model to stay in
      character as all four experts for the whole conversation, not just the
      first reply.
- [ ] **Debate mechanic** — the prompt explicitly tells the experts to argue
      with each other by name when they disagree, rather than always
      agreeing.
- [ ] **Addressing convention** — the prompt distinguishes "ask the room"
      (all four reply) from "ask [name]" (that expert leads).
- [ ] **Source discipline** — the prompt tells experts to cite real,
      verifiable sources for factual claims and to flag opinion as opinion.
      No instruction anywhere encourages inventing citations.
- [ ] **Opening instruction** — the prompt has the target model introduce all
      four experts in character before waiting for the user's first
      question.
- [ ] **Format fits the target model** — XML-flavoured structure for Claude,
      markdown headings/bullets for ChatGPT, Copilot and Gemini, lighter
      structure for Perplexity, sensible markdown for "Other".
- [ ] **No real named people** — every persona is clearly fictional; no real
      person (living or dead) or real organisation is impersonated.
- [ ] **Context and goal are visibly reflected** — you can tell, without
      being told, which sample had which context and goal just by reading
      the generated prompt. The empty-context sample gets a sensible
      fallback (a clarifying-question instruction), not a generic prompt.
- [ ] **No preamble, no commentary, no code fence** — the response is only
      the prompt text itself, nothing wrapped around it.
- [ ] **Length** — roughly 500–900 words.

## Cross-sample checks

- [ ] All four goal strings appear at least once across the 8 samples.
- [ ] All six model strings appear at least once across the 8 samples.
- [ ] The prompt reads as genuinely different across samples — not the same
      template with the topic swapped in.

If several samples fail the same check, that's a signal to tune the system
prompt in `worker.js`, not to accept the output as-is.
