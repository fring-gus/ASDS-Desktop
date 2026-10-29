"""
ASDS Python IPC daemon.

This process stays alive, reads JSON commands from stdin, and writes JSON
responses to stdout. Models are loaded lazily and then kept in memory for the
life of the daemon.

Supported analysis modes:
  - semantic
    - Intended for project or seminar abstracts.
    - Stage 1: bi-encoder similarity with `all-mpnet-base-v2`.
    - Stage 2: cross-encoder reranking with `stsb-roberta-base` for borderline
      pairs only.
    - If the bi-encoder score is 0.80 or higher, the pair is auto-flagged and
      the bi-encoder score is kept.
    - If the bi-encoder score is between the UI threshold and 0.80, the
      cross-encoder score replaces the bi-encoder score.
    - If the bi-encoder score is below the threshold, the pair is not flagged.
    - Result fields: `file_a`, `file_b`, `semantic_score`, `is_flagged`, `mode`

  - lexical
    - Intended for assignments.
    - Uses TF-IDF cosine similarity with unigrams and bigrams.
    - Result fields: `file_a`, `file_b`, `tfidf_score`, `is_flagged`, `mode`

Expected IPC commands:
  {"action": "analyze", "mode": "semantic", "file_paths": [...], "threshold": 0.65, "req_id": "..."}
  {"action": "analyze", "mode": "lexical",  "file_paths": [...], "threshold": 0.65, "req_id": "..."}
  {"action": "export",  "results": [...], "filenames": [...], "output_path": "...", "req_id": "..."}
"""

import sys
sys.dont_write_bytecode = True
import os
import json
import traceback
import re
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from tech_stopwords import TECH_STOPWORDS

# Compile regexes once at import time.
_RE_WHITESPACE  = re.compile(r'\s+')
_RE_PUNCTUATION = re.compile(r'[^\w\s]')

MIN_TOKENS = 20  # Skip files that do not contain enough extracted text.

ASDS_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'similarityscope'))

sys.path.insert(0, ASDS_ROOT)

def emit(obj):
    """Write a JSON line to stdout and flush immediately."""
    print(json.dumps(obj), flush=True)

ENGINE_VERSION = 'v2.1-ce-replace'
emit({'type': 'sys_boot', 'msg': f'Initializing ML environment... (engine {ENGINE_VERSION})'})

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine
from itertools import combinations

from core.file_reader import read_file
from core.exporter import export_to_excel

# ML models are loaded on first use and cached for the daemon lifetime.
bi_encoder    = None
cross_encoder = None

# Batch size is detected once and cached after the first call.
_BATCH_SIZE = None

def _get_batch_size():
    """Select encode batch size: 64 on GPU, 16 on CPU. Cached after first call."""
    global _BATCH_SIZE
    if _BATCH_SIZE is not None:
        return _BATCH_SIZE
    try:
        import torch
        _BATCH_SIZE = 64 if torch.cuda.is_available() else 16
    except Exception:
        _BATCH_SIZE = 16
    return _BATCH_SIZE

emit({'type': 'sys_ready', 'msg': 'Awaiting requests.'})


def preprocess(text):
    """Normalize text before similarity analysis.

    Lowercases text, removes punctuation, and strips project-specific technical
    stopwords. General English stopwords are still handled later by
    `TfidfVectorizer(stop_words='english')`.
    """
    text = text.lower()
    text = _RE_WHITESPACE.sub(' ', text)
    text = _RE_PUNCTUATION.sub('', text)
    words = [w for w in text.split() if w not in TECH_STOPWORDS]
    return ' '.join(words)


def _read_files(file_paths, req_id):
    """Shared file loading logic for both analysis modes.

    Duplicate basenames are given a counter suffix, and documents with too
    little extracted text are skipped with a warning.
    """
    filenames  = []
    raw_texts  = []
    errors     = []
    seen_names = {}  # basename -> number of times encountered

    for fp in file_paths:
        text, err = read_file(fp)
        if err:
            errors.append(err)
            continue

        # Skip documents that do not contain enough text to compare reliably.
        token_count = len(text.split())
        if token_count < MIN_TOKENS:
            errors.append(
                f"'{os.path.basename(fp)}' skipped: only {token_count} word(s) "
                f"extracted (minimum {MIN_TOKENS}). "
                f"Check for scanned images, password protection, or empty files."
            )
            continue

        # Keep displayed filenames unique even when basenames repeat.
        basename = os.path.basename(fp)
        if basename in seen_names:
            seen_names[basename] += 1
            name, ext = os.path.splitext(basename)
            basename  = f"{name} ({seen_names[basename]}){ext}"
        else:
            seen_names[basename] = 0

        filenames.append(basename)
        raw_texts.append(text)

    if len(filenames) < 2:
        emit({'req_id': req_id, 'type': 'error',
              'message': f'Need at least 2 readable files. Errors: {errors}'})
        return None, None

    emit({'req_id': req_id, 'type': 'filenames', 'data': filenames})
    emit({'req_id': req_id, 'type': 'progress', 'percent': 5,
          'msg': f'Read {len(filenames)} files successfully...'})
    return filenames, raw_texts


def _should_emit_progress(done, total, last_pct, base_pct, span_pct):
    """Emit progress only when it advances by at least 5 percent."""
    pct = base_pct + int((done / total) * span_pct)
    if pct >= last_pct + 5 or done == total:
        return True, pct
    return False, last_pct


# Semantic mode: bi-encoder scoring with optional cross-encoder reranking.

def run_semantic(file_paths, req_id, threshold=None):
    filenames, raw_texts = _read_files(file_paths, req_id)
    if filenames is None:
        return

    global bi_encoder, cross_encoder

    emit({'req_id': req_id, 'type': 'progress', 'percent': 10,
          'msg': f'Preprocessing {len(filenames)} documents...'})
    # Remove noisy technical terms before computing semantic similarity.
    processed = [preprocess(t) for t in raw_texts]

    # Load the bi-encoder once and reuse it across requests.
    if bi_encoder is None:
        emit({'req_id': req_id, 'type': 'progress', 'percent': 15,
              'msg': 'Waking AI model (first time may take 5-15s)...'})
        from sentence_transformers import SentenceTransformer

        max_retries = 2
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    emit({'req_id': req_id, 'type': 'progress', 'percent': 15,
                          'msg': f'Recovering model (Retry {attempt}/{max_retries - 1})...'})
                bi_encoder = SentenceTransformer('all-mpnet-base-v2')
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    emit({'req_id': req_id, 'type': 'error',
                          'message': f'Failed to load model: {str(e)}'})
                    return
                hf_cache = os.environ.get('HF_HOME') or os.path.expanduser('~/.cache/huggingface')
                hub_path = os.path.join(hf_cache, 'hub')
                if os.path.exists(hub_path):
                    try:
                        shutil.rmtree(hub_path)
                    except Exception:
                        pass

    # Build the pairwise semantic similarity matrix.
    emit({'req_id': req_id, 'type': 'progress', 'percent': 30,
          'msg': 'Computing semantic embeddings...'})
    from sentence_transformers import util as st_util
    embeddings      = bi_encoder.encode(processed, convert_to_tensor=True,
                                        show_progress_bar=False,
                                        batch_size=_get_batch_size())
    semantic_matrix = st_util.cos_sim(embeddings, embeddings)

    THRESHOLD = threshold if threshold is not None else 0.65
    CE_SKIP   = 0.80   # High-confidence pairs skip cross-encoder reranking.
    n         = len(filenames)
    total     = n * (n - 1) // 2
    results   = []

    emit({'req_id': req_id, 'type': 'progress', 'percent': 50,
          'msg': f'Comparing {total} pairs...'})

    last_pct = 50
    for i, j in combinations(range(n), 2):
        bi_score = round(float(semantic_matrix[i][j]), 4)

        results.append({
            'file_a':         filenames[i],
            'file_b':         filenames[j],
            'semantic_score': bi_score,       # Replaced later for borderline pairs.
            'is_flagged':     bi_score >= THRESHOLD,
            'mode':           'semantic',
        })

        should, last_pct = _should_emit_progress(len(results), total, last_pct, 50, 30)
        if should:
            emit({'req_id': req_id, 'type': 'progress', 'percent': last_pct,
                  'msg': f'Comparing pairs... {len(results)}/{total}'})

    # Rerank only borderline pairs that passed the threshold but are below the
    # high-confidence auto-flag cutoff.
    gray_zone = [idx for idx, r in enumerate(results)
                 if r['is_flagged'] and r['semantic_score'] < CE_SKIP]
    auto_flag = sum(1 for r in results if r['semantic_score'] >= CE_SKIP)

    if gray_zone:
        if cross_encoder is None:
            emit({'req_id': req_id, 'type': 'progress', 'percent': 82,
                  'msg': 'Loading cross-encoder for reranking...'})
            from sentence_transformers import CrossEncoder
            cross_encoder = CrossEncoder('cross-encoder/stsb-roberta-base')

        emit({'req_id': req_id, 'type': 'progress', 'percent': 85,
              'msg': f'Cross-encoding {len(gray_zone)} borderline pairs '
                     f'({auto_flag} high-confidence pairs skipped)...'})

        name_idx = {name: i for i, name in enumerate(filenames)}
        pairs = []
        for idx in gray_zone:
            r = results[idx]
            pairs.append([processed[name_idx[r['file_a']]],
                          processed[name_idx[r['file_b']]]])

        ce_scores = cross_encoder.predict(pairs, show_progress_bar=False)

        # Replace the bi-encoder score and recompute the flagged status.
        promoted = 0
        demoted  = 0
        for k, idx in enumerate(gray_zone):
            ce_score = round(float(ce_scores[k]), 4)
            results[idx]['semantic_score'] = ce_score   # Cross-encoder score becomes the final score.
            results[idx]['is_flagged'] = ce_score >= THRESHOLD
            if ce_score >= THRESHOLD:
                promoted += 1
            else:
                demoted += 1

        emit({'req_id': req_id, 'type': 'progress', 'percent': 95,
              'msg': f'Cross-encoding complete. '
                     f'{promoted} confirmed, {demoted} demoted, '
                     f'{auto_flag} auto-confirmed (Ã¢â€°Â¥80%).'})

    # Count flagged pairs after all reranking is complete.
    flagged = sum(1 for r in results if r['is_flagged'])

    results.sort(key=lambda x: x['semantic_score'], reverse=True)

    emit({'req_id': req_id, 'type': 'progress', 'percent': 98,
          'msg': f'Done! {flagged} flagged pairs found.'})

    for r in results:
        emit({'req_id': req_id, 'type': 'result', 'data': r})

    emit({'req_id': req_id, 'type': 'done', 'flagged_count': flagged, 'total_pairs': total})


# Lexical mode: TF-IDF cosine similarity over unigrams and bigrams.

def run_lexical(file_paths, req_id, threshold=None):
    filenames, raw_texts = _read_files(file_paths, req_id)
    if filenames is None:
        return

    emit({'req_id': req_id, 'type': 'progress', 'percent': 15,
          'msg': f'Preprocessing {len(filenames)} documents...'})
    processed = [preprocess(t) for t in raw_texts]

    # Build the pairwise TF-IDF similarity matrix.
    emit({'req_id': req_id, 'type': 'progress', 'percent': 35,
          'msg': 'Computing TF-IDF similarity...'})
    vectorizer   = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, stop_words='english')
    tfidf_vecs   = vectorizer.fit_transform(processed)
    tfidf_matrix = sk_cosine(tfidf_vecs)

    THRESHOLD = threshold if threshold is not None else 0.65
    n         = len(filenames)
    total     = n * (n - 1) // 2
    results   = []
    flagged   = 0

    emit({'req_id': req_id, 'type': 'progress', 'percent': 50,
          'msg': f'Comparing {total} pairs...'})

    last_pct = 50
    for i, j in combinations(range(n), 2):
        score      = round(float(tfidf_matrix[i][j]), 4)
        is_flagged = score >= THRESHOLD
        if is_flagged:
            flagged += 1

        results.append({
            'file_a':      filenames[i],
            'file_b':      filenames[j],
            'tfidf_score': score,
            'is_flagged':  is_flagged,
            'mode':        'lexical',
        })

        should, last_pct = _should_emit_progress(len(results), total, last_pct, 50, 45)
        if should:
            emit({'req_id': req_id, 'type': 'progress', 'percent': last_pct,
                  'msg': f'Comparing pairs... {len(results)}/{total}'})

    results.sort(key=lambda x: x['tfidf_score'], reverse=True)

    emit({'req_id': req_id, 'type': 'progress', 'percent': 98,
          'msg': f'Done! {flagged} flagged pairs found.'})

    for r in results:
        emit({'req_id': req_id, 'type': 'result', 'data': r})

    emit({'req_id': req_id, 'type': 'done', 'flagged_count': flagged, 'total_pairs': total})


# Export handler shared by both analysis modes.

def run_export(results, filenames, output_path, req_id):
    # The exporter only needs the row data, not the full similarity matrix.
    err = export_to_excel(results, None, filenames, output_path)
    if err:
        emit({'req_id': req_id, 'type': 'error', 'message': err})
    else:
        emit({'req_id': req_id, 'type': 'done', 'path': output_path})


# Main IPC event loop.

if __name__ == '__main__':
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data   = json.loads(line)
            req_id = data.get('req_id', 'unknown')
            action = data.get('action', 'analyze')
            mode   = data.get('mode', 'semantic')
            thresh = data.get('threshold')  # Optional threshold sent by the UI.

            if action == 'export':
                run_export(data['results'], data['filenames'],
                           data['output_path'], req_id)
            elif mode == 'lexical':
                run_lexical(data['file_paths'], req_id, threshold=thresh)
            else:
                run_semantic(data['file_paths'], req_id, threshold=thresh)

        except Exception as e:
            emit({
                'req_id':  data.get('req_id', 'unknown') if 'data' in locals() else 'unknown',
                'type':    'error',
                'message': str(e),
                'trace':   traceback.format_exc()
            })
