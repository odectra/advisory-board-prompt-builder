'use strict';

// Fill these in after deploying the Worker and creating the Turnstile
// widget — see README.md steps 5 and 2/6. Both are placeholders.
const CONFIG = {
  WORKER_URL: 'https://REPLACE_WITH_WORKER_URL.workers.dev',
  TURNSTILE_SITE_KEY: 'REPLACE_WITH_TURNSTILE_SITE_KEY',
};

const GOALS = [
  'Understand it broadly',
  'Be able to discuss it confidently with others',
  'Spot opportunities and stay ahead',
  'Identify specific gaps or make a decision',
];

const MODELS = [
  'ChatGPT',
  'Claude (claude.ai)',
  'Microsoft Copilot',
  'Gemini',
  'Perplexity',
  'Other',
];

const TOTAL_STEPS = 5;

const state = {
  step: 1,
  topic: '',
  context: '',
  goal: null,
  model: null,
  turnstileToken: null,
};

let turnstileApiReady = false;
let turnstileWidgetId = null;
let generating = false;

// ---------- Small DOM helpers ----------

function $(id) {
  return document.getElementById(id);
}

function setText(el, text) {
  el.textContent = text;
}

// ---------- Step navigation ----------

function showStep(step) {
  state.step = step;
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    $(`step-${i}`).hidden = i !== step;
  }
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  $('progress-fill').style.width = `${pct}%`;
  $('progress').setAttribute('aria-valuenow', String(step));
  $('progress').setAttribute('aria-label', `Step ${step} of ${TOTAL_STEPS}`);
  setText($('progress-label'), `Step ${step} of ${TOTAL_STEPS}`);

  if (step === 5) {
    maybeRenderTurnstile();
  }

  const heading = document.querySelector(`#step-${step} h1`);
  if (heading) heading.setAttribute('tabindex', '-1');
  if (heading) heading.focus({ preventScroll: false });
}

// ---------- Step 1: topic ----------

const topicInput = $('topic-input');
const topicCount = $('topic-count');
const step1Continue = $('step1-continue');

topicInput.addEventListener('input', () => {
  const len = topicInput.value.length;
  setText(topicCount, `${len.toLocaleString('en-US')} / 1,000`);
  step1Continue.disabled = topicInput.value.trim().length === 0;
});

step1Continue.addEventListener('click', () => {
  state.topic = topicInput.value.trim();
  if (!state.topic) return;
  showStep(2);
});

// ---------- Step 2: context ----------

const contextInput = $('context-input');
const contextCount = $('context-count');

contextInput.addEventListener('input', () => {
  setText(contextCount, `${contextInput.value.length.toLocaleString('en-US')} / 500`);
});

$('step2-skip').addEventListener('click', () => {
  state.context = '';
  contextInput.value = '';
  setText(contextCount, '0 / 500');
  showStep(3);
});

$('step2-continue').addEventListener('click', () => {
  state.context = contextInput.value.trim();
  showStep(3);
});

// ---------- Steps 3 & 4: option cards ----------

function buildOptionCards(container, options, stateKey, onSelect) {
  container.innerHTML = '';
  options.forEach((label, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-card';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.dataset.value = label;
    btn.id = `${stateKey}-option-${index}`;
    setText(btn, label);
    btn.addEventListener('click', () => {
      state[stateKey] = label;
      Array.from(container.children).forEach((child) => {
        child.setAttribute('aria-checked', String(child === btn));
      });
      onSelect(label);
    });
    container.appendChild(btn);
  });
}

buildOptionCards($('goal-options'), GOALS, 'goal', () => {
  showStep(4);
});

buildOptionCards($('model-options'), MODELS, 'model', () => {
  showStep(5);
});

// ---------- Step 5: Turnstile + generate ----------

window.onTurnstileLoad = function onTurnstileLoad() {
  turnstileApiReady = true;
  maybeRenderTurnstile();
};

function maybeRenderTurnstile() {
  if (!turnstileApiReady || turnstileWidgetId !== null) return;
  const container = $('turnstile-container');
  if (!container || !window.turnstile) return;
  turnstileWidgetId = window.turnstile.render(container, {
    sitekey: CONFIG.TURNSTILE_SITE_KEY,
    callback: handleTurnstileSuccess,
    'expired-callback': handleTurnstileExpired,
    'error-callback': handleTurnstileError,
  });
}

function resetTurnstile() {
  state.turnstileToken = null;
  if (turnstileWidgetId !== null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
  }
  updateGenerateButton();
}

function handleTurnstileSuccess(token) {
  state.turnstileToken = token;
  hideGenerateError();
  updateGenerateButton();
}

function handleTurnstileExpired() {
  state.turnstileToken = null;
  updateGenerateButton();
  showGenerateError('Verification expired. Please complete it again.');
}

function handleTurnstileError() {
  state.turnstileToken = null;
  updateGenerateButton();
  showGenerateError('Verification failed to load. Please refresh and try again.');
}

function updateGenerateButton() {
  $('generate-btn').disabled = generating || !state.turnstileToken;
}

function showGenerateError(message) {
  const el = $('generate-error');
  setText(el, message);
  el.hidden = false;
}

function hideGenerateError() {
  const el = $('generate-error');
  el.hidden = true;
  setText(el, '');
}

function setGenerating(isGenerating) {
  generating = isGenerating;
  $('loading-status').hidden = !isGenerating;
  updateGenerateButton();
}

function mapErrorStatus(status) {
  if (status === 429) return 'Too many requests. Please wait a minute and try again.';
  if (status === 403) return 'Verification failed. Please refresh and try again.';
  return 'Something went wrong. Please try again.';
}

$('generate-btn').addEventListener('click', async () => {
  if (generating || !state.turnstileToken) return;

  hideGenerateError();
  setGenerating(true);

  const payload = {
    topic: state.topic,
    context: state.context,
    goal: state.goal,
    model: state.model,
    turnstileToken: state.turnstileToken,
  };

  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      showGenerateError(mapErrorStatus(res.status));
      return;
    }

    const data = await res.json();
    if (!data || typeof data.prompt !== 'string') {
      showGenerateError('Something went wrong. Please try again.');
      return;
    }

    showOutput(data.prompt);
  } catch {
    showGenerateError('Something went wrong. Please try again.');
  } finally {
    setGenerating(false);
    // Turnstile tokens are single use — always reset, success or failure.
    resetTurnstile();
  }
});

// ---------- Output screen ----------

function modelDisplayName(model) {
  if (model === 'Claude (claude.ai)') return 'Claude';
  if (model === 'Other') return 'your AI model';
  return model;
}

function showOutput(promptText) {
  $('flow').hidden = true;
  $('progress').hidden = true;
  $('prompt-output').textContent = promptText;

  const name = modelDisplayName(state.model);
  setText(
    $('paste-instructions'),
    `Paste this into a new conversation in ${name} and press send. Your experts will introduce themselves and wait for your first question.`
  );

  $('output-screen').hidden = false;
  $('output-screen').querySelector('h1').setAttribute('tabindex', '-1');
  $('output-screen').querySelector('h1').focus();
}

$('copy-btn').addEventListener('click', async () => {
  const text = $('prompt-output').textContent;
  const status = $('copy-status');

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setText(status, 'Copied!');
  } catch {
    setText(status, 'Could not copy — please select and copy manually.');
  }

  setTimeout(() => setText(status, ''), 4000);
});

$('start-over-btn').addEventListener('click', () => {
  resetApp();
});

function resetApp() {
  state.topic = '';
  state.context = '';
  state.goal = null;
  state.model = null;
  state.turnstileToken = null;
  generating = false;

  topicInput.value = '';
  setText(topicCount, '0 / 1,000');
  step1Continue.disabled = true;

  contextInput.value = '';
  setText(contextCount, '0 / 500');

  Array.from($('goal-options').children).forEach((c) => c.setAttribute('aria-checked', 'false'));
  Array.from($('model-options').children).forEach((c) => c.setAttribute('aria-checked', 'false'));

  hideGenerateError();
  setGenerating(false);
  resetTurnstile();

  resetFeedback();

  $('output-screen').hidden = true;
  $('progress').hidden = false;
  $('flow').hidden = false;
  showStep(1);
}

// ---------- Feedback ----------

let feedbackRating = 0;

function buildStars() {
  const container = $('star-selector');
  container.innerHTML = '';
  for (let value = 1; value <= 5; value++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.setAttribute('aria-label', `${value} star${value === 1 ? '' : 's'}`);
    btn.dataset.value = String(value);
    setText(btn, '★');
    btn.addEventListener('click', () => {
      feedbackRating = feedbackRating === value ? 0 : value;
      renderStars();
      updateFeedbackButton();
    });
    container.appendChild(btn);
  }
}

function renderStars() {
  Array.from($('star-selector').children).forEach((btn) => {
    const value = Number(btn.dataset.value);
    const lit = value <= feedbackRating;
    btn.classList.toggle('lit', lit);
    btn.setAttribute('aria-checked', String(value === feedbackRating));
  });
}

const feedbackComment = $('feedback-comment');
const feedbackCommentCount = $('feedback-comment-count');

feedbackComment.addEventListener('input', () => {
  setText(feedbackCommentCount, `${feedbackComment.value.length.toLocaleString('en-US')} / 500`);
  updateFeedbackButton();
});

function updateFeedbackButton() {
  const hasRating = feedbackRating >= 1 && feedbackRating <= 5;
  const hasComment = feedbackComment.value.trim().length > 0;
  $('feedback-submit').disabled = !(hasRating || hasComment);
}

function resetFeedback() {
  feedbackRating = 0;
  renderStars();
  feedbackComment.value = '';
  setText(feedbackCommentCount, '0 / 500');
  updateFeedbackButton();
  setText($('feedback-status'), '');
  $('feedback-status').classList.remove('is-error');
  $('feedback-section').dataset.submitted = 'false';
}

$('feedback-submit').addEventListener('click', async () => {
  const submitBtn = $('feedback-submit');
  const statusEl = $('feedback-status');
  submitBtn.disabled = true;
  statusEl.classList.remove('is-error');
  setText(statusEl, '');

  const payload = {
    rating: feedbackRating,
    comment: feedbackComment.value.trim(),
  };

  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error('feedback request failed');
    }

    $('feedback-section').dataset.submitted = 'true';
    setText(statusEl, 'Thank you for your feedback.');
  } catch {
    statusEl.classList.add('is-error');
    setText(statusEl, 'Could not submit feedback. Please try again.');
    submitBtn.disabled = false;
  }
});

// ---------- Init ----------

buildStars();
setText($('footer-year'), String(new Date().getFullYear()));
showStep(1);
