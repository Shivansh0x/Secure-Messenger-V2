let SPAM_MODEL = null;

export async function loadSpamModel(url = "/spam_model.json") {
  if (SPAM_MODEL) return SPAM_MODEL;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load spam model");
  SPAM_MODEL = await res.json();
  return SPAM_MODEL;
}

const norm = (s) =>
  s.toLowerCase()
    .replace(/https?:\/\/\S+/g, " httpurl ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokenize(text, maxN) {
  const toks = text.split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);                       // unigram
    if (maxN >= 2 && i + 1 < toks.length) {  // bigram
      out.push(`${toks[i]} ${toks[i + 1]}`);
    }
  }
  return out;
}

export function spamScore(text, model = SPAM_MODEL) {
  if (!model) throw new Error("Model not loaded");
  const { vocabulary, weights, bias, ngram_range } = model;

  const tokens = tokenize(norm(text), ngram_range[1]);
  if (!tokens.length) return { prob: 0, logit: bias };

  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  let logit = bias;
  for (const [t, count] of tf) {
    const idx = vocabulary[t];
    if (idx !== undefined) logit += weights[idx] * count;
  }
  const prob = 1 / (1 + Math.exp(-logit));
  return { prob, logit };
}
