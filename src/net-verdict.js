/* =============================================================================
   net-verdict.js  (MAIN world, LeetCode)

   Reads verdicts from LeetCode's own network traffic instead of its DOM.

   WHY
   When you Run or Submit, LeetCode's frontend POSTs to interpret_solution/
   (Run) or submit/ (Submit), gets back an id, then polls
   /submissions/detail/<id>/v2/check/ until the JSON says state: "SUCCESS". That
   final JSON is the ground truth:
     status_msg          "Accepted" | "Wrong Answer" | "Time Limit Exceeded" | ...
     correct_answer      Run only: did your output match the expected output?
                         (a Run whose tests fail is status_msg "Accepted" --
                         it ran -- with correct_answer false)
     runtime_percentile  Submit, Accepted only: the "Beats x%" figure
     total_correct / total_testcases, pretty_lang, status_runtime
   Reading the DOM instead missed every Wrong Answer submission: the submission
   page only carries data-e2e-locator="submission-result" on some verdicts, and
   an earlier Run's console result masked the text fallback. See CLAUDE.md.

   WHAT IT DOES
   Wraps window.fetch and XMLHttpRequest, and for those three URLs only reads
   a CLONE of the response. The page gets its original response untouched,
   before we look; any error here is swallowed. One small JSON string per
   finished verdict is sent to the isolated world as a CustomEvent
   ("lcts:net-verdict"; a string, because object details do not cross worlds).
   It sends nothing anywhere else.
============================================================================= */
(() => {
  if (window.__lctsNetVerdict) return;
  window.__lctsNetVerdict = true;

  /* LeetCode versions this path: it is /submissions/detail/<id>/v2/check/ today
     (the unversioned form stopped being used), so any /vN/ is accepted */
  const CHECK = /\/submissions\/detail\/([^/?#]+)\/(?:v\d+\/)?check\/?(?:[?#]|$)/;
  const RUN = /\/interpret_solution\/?(?:[?#]|$)/;
  const SUBMIT = /\/problems\/[^/]+\/submit\/?(?:[?#]|$)/;
  const interesting = (u) => CHECK.test(u) || RUN.test(u) || SUBMIT.test(u);

  const actionOf = new Map();   // id -> 'run' | 'submit', learned from the POST responses
  const sent = new Set();       // ids already reported (the check URL is polled repeatedly)

  function inspect(url, d) {
    if (!d || typeof d !== 'object') return;
    if (RUN.test(url) && d.interpret_id) { actionOf.set(String(d.interpret_id), 'run'); return; }
    if (SUBMIT.test(url) && d.submission_id != null) { actionOf.set(String(d.submission_id), 'submit'); return; }
    const m = CHECK.exec(url);
    if (!m || d.state !== 'SUCCESS') return;
    const id = m[1];
    if (sent.has(id)) return;
    sent.add(id);
    const action = actionOf.get(id) ||
      (/^runcode/.test(id) || 'correct_answer' in d || 'expected_code_answer' in d ? 'run' : 'submit');
    const out = {
      id, action,
      status: String(d.status_msg || ''),
      correct: typeof d.correct_answer === 'boolean' ? d.correct_answer : null,
      beats: typeof d.runtime_percentile === 'number' ? d.runtime_percentile : null,
      memBeats: typeof d.memory_percentile === 'number' ? d.memory_percentile : null,
      runtime: d.status_runtime || null,
      lang: d.pretty_lang || d.lang || null,
      passed: typeof d.total_correct === 'number' ? d.total_correct : null,
      total: typeof d.total_testcases === 'number' ? d.total_testcases : null
    };
    document.dispatchEvent(new CustomEvent('lcts:net-verdict', { detail: JSON.stringify(out) }));
  }

  /* ---- fetch ---- */
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const p = origFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
        if (interesting(url)) {
          p.then((res) => {
            try { res.clone().json().then((d) => inspect(url, d), () => {}); } catch (e) {}
          }, () => {});
        }
      } catch (e) {}
      return p;
    };
  }

  /* ---- XMLHttpRequest ---- */
  const X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (X) {
    const origOpen = X.open, origSend = X.send;
    X.open = function (method, url) {
      try { this.__lctsUrl = String(url || ''); } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    X.send = function () {
      try {
        const url = this.__lctsUrl;
        if (url && interesting(url)) {
          this.addEventListener('load', () => {
            try {
              let d = null;
              if (this.responseType === 'json') d = this.response;
              else if (this.responseType === '' || this.responseType === 'text') d = JSON.parse(this.responseText);
              inspect(url, d);
            } catch (e) {}
          });
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }
})();
