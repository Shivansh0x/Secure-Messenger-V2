import pandas as pd
import json, re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# --- Load CSV ---
df = pd.read_csv(
    "frontend/data/sms_spam.csv",
    encoding="latin-1",  # safer than utf-8 here
    usecols=[0, 1],      # only keep v1 and v2
    names=["label", "text"],  # rename them
    header=0             # skip the first row (v1,v2,,,)
)

# --- Clean labels ---
df["y"] = (df["label"].str.lower() == "spam").astype(int)

# --- Normalize text ---
def normalize(s):
    s = str(s).lower()
    s = re.sub(r"https?://\S+", " httpurl ", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

X = df["text"].map(normalize)
y = df["y"]

# --- Train model ---
vec = TfidfVectorizer(max_features=12000, ngram_range=(1,2), min_df=2)
Xv = vec.fit_transform(X)

clf = LogisticRegression(max_iter=1000)
clf.fit(Xv, y)

# --- Export model ---
vocab = {term: int(idx) for term, idx in vec.vocabulary_.items()}
weights = clf.coef_.ravel().tolist()
bias = float(clf.intercept_[0])

model = {
    "vocabulary": vocab,
    "weights": weights,
    "bias": bias,
    "ngram_range": [1, 2],
    "lowercase": True,
    "pre": {"url_token": "httpurl", "strip_non_alnum": True}
}

with open("frontend/public/spam_model.json", "w", encoding="utf-8") as f:
    json.dump(model, f)

print("✅ Wrote public/spam_model.json")
