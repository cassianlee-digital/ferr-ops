(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // public/src/neg-ads.js
  var neg_ads_exports = {};
  __export(neg_ads_exports, {
    adRowHtml: () => adRowHtml,
    addAd: () => addAd,
    addNeg: () => addNeg,
    negRowHtml: () => negRowHtml
  });

  // public/src/ui-kit.js
  var ui_kit_exports = {};
  __export(ui_kit_exports, {
    closeModal: () => closeModal,
    esc: () => esc,
    hideToast: () => hideToast,
    mdToHtml: () => mdToHtml,
    openModal: () => openModal,
    renderText: () => renderText,
    showToast: () => showToast,
    toast: () => toast,
    toastGo: () => toastGo,
    toastUndo: () => toastUndo
  });
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderText(el, s) {
    if (el) el.textContent = s == null ? "" : String(s);
  }
  function mdToHtml(t) {
    const src = esc(t).split(/\n/);
    let html = "", para = [], inList = false;
    const flushP = () => {
      if (para.length) {
        html += "<p>" + para.join("<br>") + "</p>";
        para = [];
      }
    };
    const flushL = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };
    for (let line of src) {
      line = line.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
      const m = line.match(/^\s*[-*]\s+(.*)$/);
      if (m) {
        flushP();
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += "<li>" + m[1] + "</li>";
      } else if (line.trim() === "") {
        flushP();
        flushL();
      } else {
        flushL();
        para.push(line);
      }
    }
    flushP();
    flushL();
    return html;
  }
  function openModal(id) {
    document.getElementById(id).classList.add("show");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("show");
  }
  if (typeof document !== "undefined") {
    document.querySelectorAll(".modal-mask").forEach((m) => m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("show");
    }));
  }
  var tt;
  var toastEl = () => typeof document === "undefined" ? null : document.getElementById("toast");
  function showToast() {
    const t = toastEl();
    if (!t) return;
    t.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(tt);
    tt = setTimeout(hideToast, 3400);
    if (tt && typeof tt.unref === "function") tt.unref();
  }
  function hideToast() {
    const t = toastEl();
    if (!t) return;
    t.style.transform = "translateX(-50%) translateY(80px)";
  }
  function toast(m) {
    const t = toastEl();
    if (!t) return;
    t.textContent = m;
    showToast();
  }
  function toastUndo(m, fn) {
    const t = toastEl();
    if (!t) return;
    t.textContent = m == null ? "" : String(m);
    const b = document.createElement("b");
    b.textContent = "  \u64A4\u9500";
    b.style.color = "#ff8a82";
    b.style.cursor = "pointer";
    b.onclick = () => {
      hideToast();
      try {
        fn();
      } catch (e) {
      }
    };
    t.appendChild(b);
    showToast();
  }
  function toastGo(m, tab) {
    const t = toastEl();
    if (!t) return;
    t.textContent = m == null ? "" : String(m);
    if (tab) {
      t.appendChild(document.createTextNode("\xA0\xA0"));
      const b = document.createElement("b");
      b.textContent = "\u67E5\u770B \u2192";
      b.style.color = "#ff8a82";
      b.style.cursor = "pointer";
      b.onclick = () => {
        if (typeof window.go === "function") window.go(tab);
        hideToast();
      };
      t.appendChild(b);
    }
    showToast();
  }

  // public/src/keywords.js
  var keywords_exports = {};
  __export(keywords_exports, {
    activeCat: () => activeCat,
    addKeyword: () => addKeyword,
    applyKwPaging: () => applyKwPaging,
    clsOf: () => clsOf,
    filterKwByCat: () => filterKwByCat,
    inlineConfirm: () => inlineConfirm,
    kwDelete: () => kwDelete,
    kwRow: () => kwRow,
    loadKeywords: () => loadKeywords,
    renderCatTabs: () => renderCatTabs,
    renderKwPager: () => renderKwPager
  });

  // public/src/tagselect.js
  var tagselect_exports = {};
  __export(tagselect_exports, {
    OPT: () => OPT,
    persistTagChange: () => persistTagChange
  });

  // public/src/timerange.js
  var timerange_exports = {};
  __export(timerange_exports, {
    applyTimeRange: () => applyTimeRange,
    formatLocalDate: () => formatLocalDate,
    getCurrentRange: () => getCurrentRange,
    getRangeRevision: () => getRangeRevision,
    openCustomRange: () => openCustomRange,
    rangeText: () => rangeText,
    refreshRangeConsumers: () => refreshRangeConsumers,
    renderTimebar: () => renderTimebar,
    resolveRange: () => resolveRange,
    submitCustomRange: () => submitCustomRange,
    withRange: () => withRange2,
    ymd: () => ymd
  });
  var RANGES = ["\u4ECA\u5929", "\u6628\u5929", "\u8FD17\u5929", "\u8FD130\u5929", "\u8FD190\u5929", "\u8FD1\u4E00\u5E74", "\u81EA\u5B9A\u4E49"];
  window._customRange = null;
  try {
    const cr = JSON.parse(localStorage.getItem("ferr:customRange") || "null");
    if (cr && /^\d{4}-\d{2}-\d{2}$/.test(cr.start_date) && /^\d{4}-\d{2}-\d{2}$/.test(cr.end_date) && cr.start_date <= cr.end_date) window._customRange = cr;
  } catch (e) {
  }
  try {
    const t = localStorage.getItem("ferr:timeRange");
    window._timeRange = RANGES.includes(t) ? t : "\u8FD130\u5929";
  } catch (e) {
    window._timeRange = "\u8FD130\u5929";
  }
  try {
    const g = localStorage.getItem("ferr:gran");
    window._gran = ["day", "week", "month"].includes(g) ? g : "week";
  } catch (e) {
    window._gran = "week";
  }
  var GRAN_LABEL = { day: "\u6309\u5929", week: "\u6309\u5468", month: "\u6309\u6708" };
  function formatLocalDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function ymd(v) {
    v = String(v == null ? "" : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  }
  function resolveRange(label) {
    const today3 = /* @__PURE__ */ new Date();
    today3.setHours(0, 0, 0, 0);
    const back = (n) => {
      const d = new Date(today3);
      d.setDate(d.getDate() - n);
      return d;
    };
    const r = (s, e) => ({ start_date: formatLocalDate(s), end_date: formatLocalDate(e), period_label: label });
    switch (label) {
      case "\u4ECA\u5929":
        return r(today3, today3);
      case "\u6628\u5929": {
        const y = back(1);
        return r(y, y);
      }
      case "\u8FD17\u5929":
        return r(back(6), today3);
      case "\u8FD130\u5929":
        return r(back(29), today3);
      case "\u8FD190\u5929":
        return r(back(89), today3);
      case "\u8FD1\u4E00\u5E74":
        return r(back(364), today3);
      case "\u4E0A\u5468": {
        const day = (today3.getDay() + 6) % 7;
        const thisMon = back(day);
        const lastMon = new Date(thisMon);
        lastMon.setDate(thisMon.getDate() - 7);
        const lastSun = new Date(lastMon);
        lastSun.setDate(lastMon.getDate() + 6);
        return r(lastMon, lastSun);
      }
      case "\u4E0A\u534A\u6708": {
        const first = new Date(today3.getFullYear(), today3.getMonth(), 1);
        const mid = new Date(today3.getFullYear(), today3.getMonth(), 15);
        return r(first, mid);
      }
      case "\u8FD11\u6708":
        return r(back(29), today3);
      case "\u8FD13\u6708":
        return r(back(89), today3);
      case "\u8FD1\u534A\u5E74":
        return r(back(179), today3);
      case "\u8FD11\u5E74":
        return r(back(364), today3);
      case "\u81EA\u5B9A\u4E49": {
        const cr = window._customRange;
        if (!cr) return null;
        return { start_date: cr.start_date, end_date: cr.end_date, period_label: "\u81EA\u5B9A\u4E49 " + cr.start_date + "~" + cr.end_date };
      }
      default:
        return r(back(29), today3);
    }
  }
  var _range = resolveRange(window._timeRange);
  var _rangeRevision = 0;
  function getCurrentRange() {
    return _range;
  }
  function getRangeRevision() {
    return _rangeRevision;
  }
  function withRange2(path, range) {
    range = range || _range;
    if (!range || !range.start_date || !range.end_date) return path;
    const sep = path.includes("?") ? "&" : "?";
    return path + sep + "start_date=" + encodeURIComponent(range.start_date) + "&end_date=" + encodeURIComponent(range.end_date);
  }
  function rangeText(r) {
    return r && r.start_date ? r.start_date + " ~ " + r.end_date : "\u2014";
  }
  function syncRangeUi() {
    document.querySelectorAll("[data-time] .trange").forEach((x) => x.classList.toggle("active", x.textContent.trim() === window._timeRange));
    document.querySelectorAll("[data-tauto]").forEach((el) => el.innerHTML = '<i class="ti ti-calendar"></i> ' + rangeText(_range));
    const top = document.getElementById("topRange");
    if (top) {
      top.textContent = rangeText(_range);
      top.title = "\u5F53\u524D\u5168\u5C40\u65F6\u95F4\u8303\u56F4\uFF1A" + rangeText(_range);
    }
  }
  function refreshRangeConsumers() {
    _rangeRevision++;
    document.dispatchEvent(new CustomEvent("timerange", { detail: { range: _range, revision: _rangeRevision } }));
    loadInquiries();
    if (typeof loadGa4 === "function") loadGa4();
  }
  function applyTimeRange(label) {
    const nr = resolveRange(label);
    if (!nr) {
      if (label === "\u81EA\u5B9A\u4E49") openCustomRange();
      else toast("\u8BE5\u9884\u8BBE\u5C1A\u672A\u5B9E\u73B0\uFF0C\u672A\u6539\u53D8\u7B5B\u9009");
      return false;
    }
    window._timeRange = label;
    _range = nr;
    try {
      localStorage.setItem("ferr:timeRange", label);
    } catch (e) {
    }
    syncRangeUi();
    refreshRangeConsumers();
    toast("\u65F6\u95F4\u8303\u56F4\uFF1A" + _range.period_label);
    return true;
  }
  function renderTimebar(bar) {
    const grans = (bar.dataset.gran || "").split(",").map((s) => s.trim()).filter(Boolean);
    const onlyWeekly = grans.includes("week") && !grans.includes("day");
    const granHtml = grans.length ? '<span class="tlabel tlabel-gap"><i class="ti ti-chart-dots"></i> \u7C92\u5EA6</span><select class="tgran">' + grans.map((g) => `<option value="${g}"${g === window._gran ? " selected" : ""}>${GRAN_LABEL[g] || g}</option>`).join("") + "</select>" + (onlyWeekly ? '<span class="tgran-note">\xB7 \u6309\u5468\u8BB0\u5F55</span>' : "") : "";
    bar.innerHTML = '<span class="tlabel"><i class="ti ti-calendar-stats"></i> \u65F6\u95F4</span>' + RANGES.map((r) => `<button type="button" class="trange${r === window._timeRange ? " active" : ""}">${r}</button>`).join("") + `<button type="button" class="tauto tauto-btn" data-tauto title="\u9009\u62E9\u5177\u4F53\u65E5\u671F\u8303\u56F4"><i class="ti ti-calendar"></i> ${rangeText(_range)}</button>` + granHtml;
  }
  document.querySelectorAll("[data-time]").forEach((bar) => {
    renderTimebar(bar);
    bar.addEventListener("click", (e) => {
      const dateBtn = e.target.closest(".tauto-btn");
      if (dateBtn) {
        openCustomRange();
        return;
      }
      const btn = e.target.closest(".trange");
      if (!btn) return;
      const rg = btn.textContent.trim();
      if (rg === "\u81EA\u5B9A\u4E49" && !window._customRange) {
        openCustomRange();
        return;
      }
      applyTimeRange(rg);
    });
    bar.addEventListener("change", (e) => {
      const sel = e.target.closest(".tgran");
      if (!sel) return;
      window._gran = sel.value;
      try {
        localStorage.setItem("ferr:gran", sel.value);
      } catch (e2) {
      }
      document.querySelectorAll("[data-time] .tgran").forEach((s) => {
        if ([...s.options].some((o) => o.value === sel.value)) s.value = sel.value;
      });
      document.dispatchEvent(new CustomEvent("granularity", { detail: { gran: window._gran } }));
      toast("\u7C92\u5EA6\uFF1A" + (GRAN_LABEL[window._gran] || window._gran));
    });
  });
  syncRangeUi();
  function openCustomRange() {
    const cr = window._customRange || {};
    const today3 = formatLocalDate(/* @__PURE__ */ new Date());
    const back = (n) => {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - n);
      return formatLocalDate(d);
    };
    document.getElementById("cr-start").value = cr.start_date || back(29);
    document.getElementById("cr-end").value = cr.end_date || today3;
    openModal("customRangeMask");
    setTimeout(() => document.getElementById("cr-start").focus(), 50);
  }
  function submitCustomRange() {
    const s = document.getElementById("cr-start").value;
    const e = document.getElementById("cr-end").value;
    if (!s || !e) {
      toast("\u8BF7\u9009\u62E9\u5F00\u59CB\u548C\u7ED3\u675F\u65E5\u671F");
      return;
    }
    if (s > e) {
      toast("\u5F00\u59CB\u65E5\u671F\u4E0D\u80FD\u665A\u4E8E\u7ED3\u675F\u65E5\u671F");
      return;
    }
    const days = Math.floor((/* @__PURE__ */ new Date(e + "T00:00") - /* @__PURE__ */ new Date(s + "T00:00")) / 864e5);
    if (days > 365) {
      toast("\u533A\u95F4\u6700\u957F 1 \u5E74");
      return;
    }
    window._customRange = { start_date: s, end_date: e };
    try {
      localStorage.setItem("ferr:customRange", JSON.stringify(window._customRange));
    } catch (err) {
    }
    window._timeRange = "\u81EA\u5B9A\u4E49";
    try {
      localStorage.setItem("ferr:timeRange", "\u81EA\u5B9A\u4E49");
    } catch (err) {
    }
    _range = resolveRange("\u81EA\u5B9A\u4E49");
    syncRangeUi();
    refreshRangeConsumers();
    closeModal("customRangeMask");
    toast("\u5DF2\u5E94\u7528\uFF1A" + _range.period_label);
  }

  // public/src/ai.js
  var apiUnavailableMsg = '<div class="api-warn"><i class="ti ti-plug-connected-x"></i> AI \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF1A\u8BF7\u68C0\u67E5\u540E\u53F0 AI Provider\u3001API Key \u4E0E\u6A21\u578B\u914D\u7F6E\uFF0C\u6216\u7A0D\u540E\u91CD\u8BD5\u3002</div>';
  var aiAnalyses = /* @__PURE__ */ new Map();
  var activeAi = null;
  var aiViewIdx = -1;
  var lastAi = { text: "", dept: "SEO", quality: null };
  var splitActionItems = [];
  var modalRequestVersion = 0;
  function hashText(s) {
    let h = 5381;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function currentAiPage() {
    const p = document.querySelector(".panel.active");
    return { tab: (p && p.id || "").replace("panel-", ""), title: (p && p.querySelector(".page-title") || {}).textContent || "", sub: (p && p.querySelector(".page-sub") || {}).textContent || "" };
  }
  function rowContext(btn) {
    const tr = btn && btn.closest && btn.closest("tr");
    if (!tr) return null;
    const th = [...(tr.closest("table") || document).querySelectorAll("thead th")].map((x) => x.innerText.trim());
    const td2 = [...tr.children].map((x) => x.innerText.trim());
    const cells = {};
    td2.forEach((v, i) => cells[th[i] || "col" + (i + 1)] = v);
    return { text: td2.join(" | "), cells };
  }
  function aiDeptFromText(t) {
    return /SEM|Ads|广告|CPC|CTR|ROAS|否词|出价|系列|预算/i.test(t || "") ? "SEM" : "SEO";
  }
  function aiMeta(btn, prompt2, title) {
    const page = currentAiPage();
    const row = rowContext(btn);
    const box = btn && btn.closest && btn.closest(".ai-box");
    const boxTitle = box ? (box.querySelector(".ai-title") || {}).textContent : "";
    const finalTitle = title || boxTitle || "AI \u5206\u6790";
    const scope_type = page.tab || "general";
    const seed = [scope_type, finalTitle, prompt2, row && row.text].filter(Boolean).join("|");
    return { scope_key: scope_type + ":" + hashText(seed), scope_type, title: finalTitle, prompt: prompt2, context: { page, row, boxTitle }, dept: aiDeptFromText((finalTitle || "") + " " + (prompt2 || "")) };
  }
  function triggerPrompt(btn) {
    if (!btn || !btn.dataset || !btn.dataset.aiPrompt) return null;
    return { prompt: btn.dataset.aiPrompt, title: btn.dataset.aiTitle || null };
  }
  function markAiTrigger(btn, item) {
    if (!btn || !item || !btn.classList) return;
    btn.classList.add("analyzed");
    btn.innerHTML = '<i class="ti ti-check"></i> \u5DF2\u5206\u6790';
    const tr = btn.closest("tr");
    if (tr) tr.classList.add("ai-analyzed-row");
  }
  function applyAiAnalysisStates(root) {
    const base = root || document;
    base.querySelectorAll("button[data-ai-prompt]").forEach((btn) => {
      const p = triggerPrompt(btn);
      if (!p) return;
      const meta = aiMeta(btn, p.prompt, p.title);
      const item = aiAnalyses.get(meta.scope_key);
      if (item) markAiTrigger(btn, item);
    });
    base.querySelectorAll(".kw-ai").forEach((btn) => {
      const tr = btn.closest("tr");
      if (!tr) return;
      const n = tr.querySelector(".kw-name");
      const kw = (n ? n.textContent : tr.cells[0].textContent).trim();
      const prompt2 = "\u5206\u6790\u5173\u952E\u8BCD\u300C" + kw + "\u300D\u7684\u641C\u7D22\u610F\u56FE\u4E0E\u843D\u5730\u5EFA\u8BAE";
      const title = "\u300C" + kw + "\u300D\u610F\u56FE";
      const item = aiAnalyses.get(aiMeta(btn, prompt2, title).scope_key);
      if (item) markAiTrigger(btn, item);
    });
  }
  async function loadAiAnalyses() {
    try {
      const { items } = await API.get("/api/ai/analyses");
      aiAnalyses = new Map((items || []).filter((x) => x && x.scope_key).map((x) => [x.scope_key, x]));
      applyAiAnalysisStates();
    } catch (e) {
      aiAnalyses = /* @__PURE__ */ new Map();
      if (e && e.message !== "unauthorized") toast("AI \u5206\u6790\u8BB0\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "\u672A\u77E5\u9519\u8BEF") + "\uFF0C\u53EF\u5237\u65B0\u9875\u9762\u91CD\u8BD5");
    }
  }
  function onAiFooterClick(e) {
    const foot = e.currentTarget;
    const btn = e.target.closest("[data-ai-command]");
    if (!btn || !foot.contains(btn)) return;
    const cmd = btn.dataset.aiCommand;
    if (cmd === "reanalyze") reanalyzeActive();
    else if (cmd === "split") splitActions();
    else if (cmd === "archive") archiveAiAnalysis();
    else if (cmd === "deposit") depositAi();
    else if (cmd === "adopt") adoptAi();
    else if (cmd === "send") sendAiChat();
  }
  function setupAiFooter() {
    const foot = document.getElementById("aiModalFoot");
    if (!foot) return;
    foot.className = "ai-chat-compose";
    foot.style.display = "block";
    foot.innerHTML = '<textarea id="aiChatInput" placeholder="\u7EE7\u7EED\u8FFD\u95EE\u3001\u8865\u5145\u5224\u65AD\u6216\u8BA9 AI \u91CD\u5199\u6210\u6574\u6539\u52A8\u4F5C"></textarea><div class="ai-chat-tools"><label class="btn-ghost" for="aiChatFiles"><i class="ti ti-paperclip"></i> \u4E0A\u4F20\u6587\u4EF6/\u56FE\u7247</label><input class="csp-s-6aa34d7432" id="aiChatFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.csv,.txt"><span class="csp-s-ed524873cf" id="aiFileList"></span><button type="button" class="btn-ghost" data-ai-command="reanalyze"><i class="ti ti-refresh"></i> \u91CD\u65B0\u5206\u6790</button><button type="button" class="btn-ghost" data-ai-command="split"><i class="ti ti-list-check"></i> \u62C6\u6210\u6574\u6539\u52A8\u4F5C</button><button type="button" class="btn-ghost" data-ai-command="archive"><i class="ti ti-archive"></i> \u5F52\u6863</button><button type="button" class="btn-ghost" data-ai-command="deposit"><i class="ti ti-database-heart"></i> \u6C89\u6DC0</button><button type="button" class="btn-primary" id="aiAdoptBtn" data-ai-command="adopt"><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3\u5230\u6574\u6539\u6E05\u5355</button><button type="button" class="btn-primary csp-s-ca6fc035af" data-ai-command="send"><i class="ti ti-send"></i> \u53D1\u9001</button></div>';
    if (!foot.dataset.aiBound) {
      foot.addEventListener("click", onAiFooterClick);
      foot.dataset.aiBound = "1";
    }
    const blocked = !aiIsActionable(activeAi);
    ["adopt", "deposit", "split"].forEach((cmd) => {
      const btn = foot.querySelector('[data-ai-command="' + cmd + '"]');
      if (btn && blocked) {
        btn.disabled = true;
        btn.title = "\u8BE5\u7ED3\u8BBA\u672A\u901A\u8FC7\u53EF\u6267\u884C\u6027\u8BC4\u5206\uFF0C\u9700\u91CD\u65B0\u5206\u6790\u6216\u8865\u5145\u6570\u636E";
      }
    });
    const files = document.getElementById("aiChatFiles");
    if (files) files.addEventListener("change", () => {
      const list = document.getElementById("aiFileList");
      if (list) list.innerHTML = [...files.files].slice(0, 5).map((f) => '<span class="ai-file-chip">' + esc(f.name) + "</span>").join("");
    });
  }
  function aiMessages(item) {
    const msgs = item && item.messages && item.messages.length ? item.messages : [{ role: "assistant", content: item && item.result_text || "" }];
    return msgs.filter((m) => m.content).map((m) => '<div class="ai-chat-item ' + (m.role === "user" ? "user" : "assistant") + '"><div class="bubble ai-render">' + mdToHtml(m.content) + "</div></div>").join("");
  }
  function aiQualityBanner(quality, historical) {
    const q = quality && quality.confidenceAssessment;
    if (!q) return '<div class="hermes-confidence not_applicable"><div class="hermes-confidence-head"><strong>' + (historical ? "\u5386\u53F2\u56DE\u7B54\u672A\u8BC4\u5206" : "\u5F53\u524D\u56DE\u7B54\u672A\u8BC4\u5206") + "</strong><span>\u8BE5\u56DE\u7B54\u751F\u6210\u65F6\u5C1A\u672A\u542F\u7528\u8BC1\u636E\u8BC4\u5206\uFF0C\u9700\u91CD\u65B0\u5206\u6790\u540E\u518D\u51B3\u5B9A\u662F\u5426\u6267\u884C\u3002</span></div></div>";
    const dims = q.dimensions || {};
    const labels = { evidenceCoverage: "\u8BC1\u636E\u8986\u76D6", sourceQuality: "\u6765\u6E90\u8D28\u91CF", freshness: "\u6570\u636E\u65F6\u6548", inferenceDiscipline: "\u63A8\u7406\u7EA6\u675F", numericConsistency: "\u6570\u5B57\u4E00\u81F4", temporalConsistency: "\u65F6\u95F4\u4E00\u81F4" };
    const entries = Object.keys(labels).filter((k) => Number.isFinite(Number(dims[k]))).map((k) => "<span>" + labels[k] + " " + Number(dims[k]) + "</span>").join("");
    const title = q.applicable ? "\u7F6E\u4FE1\u5EA6 " + Number(q.score || 0) + "/100 \xB7 " + esc(q.label || "") : esc(q.label || "\u975E\u6570\u636E\u578B\u56DE\u7B54");
    return '<div class="hermes-confidence ' + esc(q.level || "not_applicable") + '"><div class="hermes-confidence-head"><strong>' + title + "</strong><span>" + esc(q.decision || "") + "</span></div>" + (entries ? '<div class="hermes-confidence-grid">' + entries + "</div>" : "") + "</div>";
  }
  function aiIsActionable(item) {
    const q = item && item.quality && item.quality.confidenceAssessment;
    return !!(q && q.level && q.level !== "low");
  }
  function fmtAiTime(v) {
    if (!v) return "";
    const d = /* @__PURE__ */ new Date(String(v).replace(" ", "T") + (/[Z+]/.test(String(v)) ? "" : "Z"));
    if (isNaN(d)) return String(v).slice(5, 16);
    const p = (n) => String(n).padStart(2, "0");
    return d.getMonth() + 1 + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function aiTimeline(item) {
    const hist = item && item.history || [];
    if (!hist.length) return "";
    const idx = aiViewIdx;
    let chips = '<button type="button" class="ai-tl-chip' + (idx < 0 ? " active" : "") + '" data-ai-snapshot="-1">\u672C\u6B21 \xB7 ' + fmtAiTime(item.updated_at) + "</button>";
    hist.forEach((h, i) => {
      chips += '<button type="button" class="ai-tl-chip' + (idx === i ? " active" : "") + '" data-ai-snapshot="' + i + '">' + (i === 0 ? "\u4E0A\u6B21" : "\u4E0A" + (i + 1) + "\u6B21") + " \xB7 " + fmtAiTime(h.at) + "</button>";
    });
    return '<div class="ai-timeline"><span class="ai-tl-label"><i class="ti ti-history"></i> \u5386\u53F2\u5BF9\u6BD4</span>' + chips + "</div>";
  }
  function showAiSnapshot(i) {
    aiViewIdx = i;
    renderAiBody();
  }
  function onAiBodyClick(e) {
    const body = e.currentTarget;
    const chip = e.target.closest("[data-ai-snapshot]");
    if (chip && body.contains(chip)) {
      showAiSnapshot(Number(chip.dataset.aiSnapshot));
      return;
    }
    const adopt = e.target.closest("[data-ai-split-index]");
    if (adopt && body.contains(adopt)) adoptSplitAction(adopt, splitActionItems[Number(adopt.dataset.aiSplitIndex)]);
  }
  function renderAiBody() {
    const item = activeAi;
    const body = document.getElementById("aiModalBody");
    if (!item || !body) return;
    const idx = aiViewIdx;
    splitActionItems = [];
    let html = aiTimeline(item) + '<div id="aiActionsBox"></div>';
    if (idx >= 0 && item.history && item.history[idx]) {
      html += aiQualityBanner(item.history[idx].quality, true);
      html += '<div class="ai-snap-note dim">\u2014 \u5386\u53F2\u5FEB\u7167\uFF08' + fmtAiTime(item.history[idx].at) + "\uFF09\xB7 \u53EA\u8BFB\uFF0C\u70B9\u300C\u672C\u6B21\u300D\u56DE\u5230\u6700\u65B0 \u2014</div>";
      html += '<div class="ai-chat-item assistant"><div class="bubble ai-render">' + mdToHtml(item.history[idx].result_text || "") + "</div></div>";
    } else {
      html += aiQualityBanner(item.quality, false);
      html += aiMessages(item);
    }
    body.innerHTML = html;
    if (!body.dataset.aiBound) {
      body.addEventListener("click", onAiBodyClick);
      body.dataset.aiBound = "1";
    }
  }
  function renderAiItem(item) {
    activeAi = item;
    aiViewIdx = -1;
    lastAi = { text: item.result_text || "", dept: aiDeptFromText((item.title || "") + " " + (item.prompt || "")), quality: item.quality || null };
    document.getElementById("aiModalTitle").textContent = item.title || "AI \u5206\u6790";
    renderAiBody();
    setupAiFooter();
    setTimeout(() => {
      const b = document.getElementById("aiModalBody");
      if (b) b.scrollTop = b.scrollHeight;
    }, 30);
  }
  async function reanalyzeActive() {
    const item = activeAi;
    if (!item) {
      toast("\u6682\u65E0\u53EF\u91CD\u65B0\u5206\u6790\u7684\u9879");
      return;
    }
    const requestVersion = ++modalRequestVersion;
    document.getElementById("aiModalBody").innerHTML = '<div class="ai-loading"><span class="spin"></span> AI \u6B63\u5728\u57FA\u4E8E\u5F53\u524D\u6700\u65B0\u6570\u636E\u91CD\u65B0\u5206\u6790\u2026</div>';
    try {
      const { item: next } = await API.post("/api/ai/analyze", { scope_key: item.scope_key, scope_type: item.scope_type, title: item.title, prompt: item.prompt, context: item.context, force: true });
      if (requestVersion !== modalRequestVersion) return;
      aiAnalyses.set(next.scope_key, next);
      renderAiItem(next);
      toast("\u5DF2\u57FA\u4E8E\u6700\u65B0\u6570\u636E\u91CD\u65B0\u5206\u6790\uFF0C\u4E0A\u6B21\u7ED3\u8BBA\u5DF2\u5B58\u5165\u5386\u53F2");
    } catch (e) {
      if (requestVersion !== modalRequestVersion) return;
      renderAiBody();
      toast("\u91CD\u65B0\u5206\u6790\u5931\u8D25\uFF1A" + (e.message || "ai_failed"));
    }
  }
  async function adoptSplitAction(btn, action) {
    if (!action || !btn) return;
    btn.disabled = true;
    try {
      await createEvidenceFix(action.dept, action.title, action.detail, action.evidence, "AI\u52A8\u4F5C\u62C6\u89E3");
      btn.innerHTML = '<i class="ti ti-check"></i> \u5DF2\u91C7\u7EB3';
      toastGo("\u5DF2\u91C7\u7EB3 \u2192 \u6574\u6539\u6E05\u5355 \xB7 \u5DF2\u5165\u5E93", "fix");
    } catch (e) {
      btn.disabled = false;
      toast(persistFailMsg(e));
    }
  }
  async function splitActions() {
    const item = activeAi;
    if (!item) {
      toast("\u6682\u65E0\u53EF\u62C6\u89E3\u7684\u5206\u6790");
      return;
    }
    if (!aiIsActionable(item)) {
      toast("\u5F53\u524D\u7ED3\u8BBA\u672A\u901A\u8FC7\u53EF\u6267\u884C\u6027\u8BC4\u5206\uFF0C\u9700\u91CD\u65B0\u5206\u6790\u6216\u8865\u5145\u6570\u636E\uFF0C\u4E0D\u80FD\u62C6\u6210\u53EF\u6267\u884C\u52A8\u4F5C");
      return;
    }
    let box = document.getElementById("aiActionsBox");
    if (!box) {
      renderAiBody();
      box = document.getElementById("aiActionsBox");
    }
    if (box) box.innerHTML = '<div class="ai-loading"><span class="spin"></span> \u6B63\u5728\u62C6\u89E3\u6210\u6574\u6539\u52A8\u4F5C\u2026</div>';
    try {
      const { actions, blocked } = await API.post("/api/ai/analyses/" + item.id + "/actions", {});
      if (!box) return;
      if (blocked) {
        box.innerHTML = '<div class="dim csp-s-46909fa053">\u5F53\u524D\u7ED3\u8BBA\u7F6E\u4FE1\u5EA6\u4F4E\uFF0C\u4E0D\u80FD\u62C6\u6210\u53EF\u6267\u884C\u52A8\u4F5C\u3002</div>';
        return;
      }
      splitActionItems = (actions || []).map((a) => ({ dept: a && a.dept === "SEM" ? "SEM" : "SEO", title: String(a && a.title || "AI \u6574\u6539\u52A8\u4F5C"), detail: String(a && a.detail || ""), evidence: String(a && a.evidence || ""), confidence: a && a.confidence || null }));
      if (!splitActionItems.length) {
        box.innerHTML = '<div class="dim csp-s-46909fa053">\u672A\u80FD\u4ECE\u7ED3\u8BBA\u4E2D\u63D0\u53D6\u5230\u660E\u786E\u53EF\u6267\u884C\u7684\u52A8\u4F5C\u3002</div>';
        return;
      }
      box.innerHTML = '<div class="ai-actions-list"><div class="ai-actions-h"><i class="ti ti-list-check"></i> \u53EF\u91C7\u7EB3\u7684\u6574\u6539\u52A8\u4F5C\uFF08\u9010\u6761\uFF09</div>' + splitActionItems.map((a, i) => '<div class="ai-action-row"><div class="ai-action-main"><div class="ai-action-t"><span class="badge ' + (a.dept === "SEM" ? "b-purple" : "b-blue") + '">' + a.dept + "</span> " + esc(a.title) + '</div><div class="ai-action-d">' + esc(a.detail) + "</div>" + (a.evidence ? '<div class="ai-action-e dim">\u4F9D\u636E\uFF1A' + esc(a.evidence) + "</div>" : "") + '</div><button type="button" class="btn-mini" data-ai-split-index="' + i + '"><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3</button></div>').join("") + "</div>";
    } catch (e) {
      splitActionItems = [];
      if (box) box.innerHTML = '<div class="dim csp-s-46909fa053">\u62C6\u89E3\u5931\u8D25\uFF1A' + esc(e.message || "ai_failed") + "</div>";
    }
  }
  async function runAiAnalysis(btn, prompt2, title, force) {
    const meta = aiMeta(btn, prompt2, title);
    const requestVersion = ++modalRequestVersion;
    activeAi = null;
    aiViewIdx = -1;
    splitActionItems = [];
    lastAi = { text: "", dept: meta.dept, quality: null };
    document.getElementById("aiModalTitle").textContent = meta.title;
    document.getElementById("aiModalBody").innerHTML = '<div class="ai-loading"><span class="spin"></span> AI \u6B63\u5728\u7ED3\u5408\u5F53\u524D\u9875\u9762\u6570\u636E\u548C\u5E02\u573A\u8BB0\u5FC6\u5206\u6790...</div>';
    document.getElementById("aiModalFoot").style.display = "none";
    if (btn) btn.disabled = true;
    openModal("aiMask");
    try {
      const { item } = await API.post("/api/ai/analyze", { ...meta, force: force === true });
      if (requestVersion !== modalRequestVersion) return;
      aiAnalyses.set(item.scope_key, item);
      markAiTrigger(btn, item);
      renderAiItem(item);
    } catch (e) {
      if (requestVersion !== modalRequestVersion) return;
      document.getElementById("aiModalBody").innerHTML = apiUnavailableMsg + '<p class="dim">\u5931\u8D25\u539F\u56E0\uFF1A' + esc(e.message || "ai_failed") + "</p>";
      setupAiFooter();
    } finally {
      if (requestVersion === modalRequestVersion && btn) btn.disabled = false;
    }
  }
  function aiBox(btn, prompt2) {
    const box = btn && btn.closest(".ai-box");
    runAiAnalysis(btn, prompt2, (box && box.querySelector(".ai-title") || {}).textContent, false);
  }
  async function sendAiChat() {
    const item = activeAi;
    if (!item) return;
    const input = document.getElementById("aiChatInput");
    const msg = (input && input.value || "").trim();
    if (!msg) {
      toast("\u8BF7\u8F93\u5165\u8981\u7EE7\u7EED\u95EE AI \u7684\u5185\u5BB9");
      return;
    }
    const files = [...(document.getElementById("aiChatFiles") || {}).files || []].slice(0, 5).map((f) => ({ name: f.name, type: f.type, size: f.size }));
    const requestVersion = ++modalRequestVersion;
    if (input) input.value = "";
    document.getElementById("aiModalBody").insertAdjacentHTML("beforeend", '<div class="ai-chat-item user"><div class="bubble">' + esc(msg) + '</div></div><div class="ai-loading"><span class="spin"></span> AI \u6B63\u5728\u7EE7\u7EED\u5206\u6790...</div>');
    try {
      const { item: next } = await API.post("/api/ai/analyses/" + item.id + "/chat", { message: msg, attachments: files });
      if (requestVersion !== modalRequestVersion) return;
      aiAnalyses.set(next.scope_key, next);
      renderAiItem(next);
    } catch (e) {
      if (requestVersion !== modalRequestVersion) return;
      if (input) input.value = msg;
      renderAiBody();
      toast("AI \u8FFD\u95EE\u5931\u8D25\uFF1A" + (e.message || "ai_failed"));
    }
  }
  async function archiveAiAnalysis() {
    const item = activeAi;
    if (!item) return;
    const requestVersion = ++modalRequestVersion;
    try {
      await API.post("/api/ai/analyses/" + item.id + "/archive", {});
      if (requestVersion !== modalRequestVersion) return;
      aiAnalyses.delete(item.scope_key);
      activeAi = null;
      lastAi = { text: "", dept: "SEO", quality: null };
      closeModal("aiMask");
      toast("\u5DF2\u5F52\u6863 AI \u5206\u6790");
    } catch (e) {
      if (requestVersion === modalRequestVersion) toast(persistFailMsg(e));
    }
  }
  async function depositAi() {
    const item = activeAi;
    if (!item || !item.result_text) {
      toast("\u6682\u65E0\u53EF\u6C89\u6DC0\u7684 AI \u5185\u5BB9");
      return;
    }
    if (!aiIsActionable(item)) {
      toast("\u5F53\u524D\u7ED3\u8BBA\u672A\u901A\u8FC7\u53EF\u6267\u884C\u6027\u8BC4\u5206\uFF0C\u9700\u91CD\u65B0\u5206\u6790\u6216\u8865\u5145\u6570\u636E\uFF0C\u4E0D\u80FD\u6C89\u6DC0");
      return;
    }
    const s = aiDeptFromText((item.title || "") + " " + (item.prompt || "")) === "SEM" ? { dept: "SEM", owner: "\u9648", c: "b-purple" } : { dept: "SEO", owner: "\u674E", c: "b-blue" };
    try {
      await API.post("/api/ai/analyses/" + item.id + "/action", { action: "deposited" });
      await persistLoop("deposit", s, item.result_text, "\u6C89\u6DC0");
      addDeposit(s, item.result_text, "\u6C89\u6DC0");
      toastGo("\u5DF2\u6C89\u6DC0\u5230\u6C89\u6DC0\u8868 \xB7 \u5DF2\u5165\u5E93", "deposit");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  async function adoptAi() {
    if (!lastAi.text) {
      toast("\u6682\u65E0\u53EF\u91C7\u7EB3\u7684 AI \u5185\u5BB9");
      return;
    }
    if (!lastAi.quality || !lastAi.quality.confidenceAssessment || lastAi.quality.confidenceAssessment.level === "low") {
      toast("\u5F53\u524D\u7ED3\u8BBA\u672A\u901A\u8FC7\u53EF\u6267\u884C\u6027\u8BC4\u5206\uFF0C\u9700\u91CD\u65B0\u5206\u6790\u6216\u8865\u5145\u6570\u636E\uFF0C\u4E0D\u80FD\u91C7\u7EB3");
      return;
    }
    const s = lastAi.dept === "SEM" ? { dept: "SEM", owner: "\u9648", c: "b-purple" } : { dept: "SEO", owner: "\u674E", c: "b-blue" };
    const first = lastAi.text.split("\n").map((x) => x.trim().replace(/^[•\-\*\d\.、:：\s]+/, "")).filter(Boolean)[0] || lastAi.text;
    const fixText = clip(first.replace(/\*\*/g, ""), 140), depText = clip(first.replace(/\*\*/g, ""), 40);
    const btn = document.getElementById("aiAdoptBtn");
    if (btn) btn.disabled = true;
    try {
      const [fx] = await Promise.all([persistFix(s, fixText), persistLoop("deposit", s, depText, "\u91C7\u7EB3")]);
      addFixFromObj(fx.item);
      addDeposit(s, depText, "\u91C7\u7EB3");
      if (activeAi && activeAi.id) await API.post("/api/ai/analyses/" + activeAi.id + "/action", { action: "adopted" });
      closeModal("aiMask");
      toastGo("\u5DF2\u91C7\u7EB3 \u2192 \u6574\u6539\u6E05\u5355\uFF08" + s.dept + "\uFF09\xB7 \u5DF2\u5165\u5E93", "fix");
    } catch (e) {
      toast(persistFailMsg(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // public/src/charts.js
  window.DEMO_MODE = window.DEMO_MODE || false;
  var DEMO = {
    inqTrend: { a: [2, 1, 2, 1, 2, 1, 2, 1], total: [6, 5, 7, 8, 6, 7, 8, 8] },
    seoMini: [95, 98, 92, 100, 104, 99, 108, 112],
    semMini: [2.8, 2.9, 3, 2.95, 3.1, 3, 3.15, 3.2],
    inqDonut: { a: 7, b: 5, c: 43, rate: "22%" },
    chanDonut: { seo: 42, sem: 33, direct: 17, other: 8 },
    seoSeries: {
      labels: Array.from({ length: 14 }, (_, i) => "5/" + (4 + i * 2)),
      clicks: [95, 98, 92, 100, 104, 99, 108, 112, 109, 115, 118, 114, 120, 124],
      impr: [120, 128, 124, 132, 140, 134, 145, 150, 148, 155, 160, 156, 165, 170]
    }
  };
  function loadFailureText(label, error) {
    const reason = error && error.message && error.message !== "unauthorized" ? error.message : "\u767B\u5F55\u72B6\u6001\u5DF2\u5931\u6548\u6216\u670D\u52A1\u4E0D\u53EF\u7528";
    return label + "\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason;
  }
  function loadFailureRow(cols, label, error) {
    return '<tr><td colspan="' + cols + '" class="dim csp-s-45c174bbec">' + esc(loadFailureText(label, error)) + "</td></tr>";
  }
  function chartEmpty(id, detail, title) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const wrap = cv.closest(".chart-wrap") || cv.parentElement;
    if (!wrap) return;
    cv.style.display = "none";
    let box = wrap.querySelector(".chart-empty");
    if (!box) {
      box = document.createElement("div");
      box.className = "chart-empty";
      box.appendChild(document.createElement("div"));
      const sub = document.createElement("div");
      sub.className = "ce-sub";
      box.appendChild(sub);
      wrap.appendChild(box);
    }
    box.firstElementChild.textContent = title || "\u6682\u65E0\u771F\u5B9E\u6570\u636E";
    box.querySelector(".ce-sub").textContent = detail || "\u8BF7\u5F55\u5165\u6570\u636E\u6216\u5B8C\u6210\u540C\u6B65";
  }
  function setDonutLegend(map) {
    Object.keys(map).forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.textContent = map[id];
    });
  }
  function fillDonutLegendDemo() {
    setDonutLegend({ lgInqA: DEMO.inqDonut.a, lgInqB: DEMO.inqDonut.b, lgInqC: DEMO.inqDonut.c, lgInqRate: DEMO.inqDonut.rate, lgChSeo: DEMO.chanDonut.seo + "%", lgChSem: DEMO.chanDonut.sem + "%", lgChDirect: DEMO.chanDonut.direct + "%", lgChOther: DEMO.chanDonut.other + "%" });
  }
  function blankDonutLegend() {
    setDonutLegend({ lgInqA: "\u2014", lgInqB: "\u2014", lgInqC: "\u2014", lgInqRate: "\u2014", lgChSeo: "\u2014", lgChSem: "\u2014", lgChDirect: "\u2014", lgChOther: "\u2014" });
  }
  var _inqDonutChart = null;
  var _chanDonutChart = null;
  function renderInqDonuts() {
    if (window.DEMO_MODE) return;
    const rows2 = window._inqCache || [];
    const cv1 = document.getElementById("inqDonut"), cv2 = document.getElementById("chanDonut");
    if (_inqDonutChart) {
      try {
        _inqDonutChart.destroy();
      } catch (e) {
      }
      _inqDonutChart = null;
    }
    if (_chanDonutChart) {
      try {
        _chanDonutChart.destroy();
      } catch (e) {
      }
      _chanDonutChart = null;
    }
    if (!rows2.length) {
      if (cv1) chartEmpty("inqDonut");
      if (cv2) chartEmpty("chanDonut");
      blankDonutLegend();
      return;
    }
    const q = { A: 0, B: 0, C: 0 };
    rows2.forEach((r) => {
      if (q[r.grade] != null) q[r.grade]++;
    });
    const total = q.A + q.B + q.C;
    const eff = q.A + q.B;
    const rate = total ? Math.round(eff * 100 / total) + "%" : "\u2014";
    if (cv1) {
      const w = cv1.closest(".chart-wrap") || cv1.parentElement;
      if (w) {
        const ce = w.querySelector(".chart-empty");
        if (ce) ce.remove();
      }
      cv1.style.display = "";
      _inqDonutChart = new Chart(cv1, { type: "doughnut", data: { labels: ["A", "B", "C"], datasets: [{ data: [q.A, q.B, q.C], backgroundColor: ["#15a85a", "#2f72e8", "#dfe2e8"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "66%" } });
    }
    const ch = { SEO: 0, SEM: 0, direct: 0, other: 0 };
    rows2.forEach((r) => {
      if (r.grade !== "A" && r.grade !== "B") return;
      const c = String(r.channel || "").trim();
      if (/SEO自然|SEO/i.test(c)) ch.SEO++;
      else if (/SEM付费|SEM/i.test(c)) ch.SEM++;
      else if (/直接/.test(c)) ch.direct++;
      else ch.other++;
    });
    const chTotal = ch.SEO + ch.SEM + ch.direct + ch.other;
    const pct3 = (v) => chTotal ? Math.round(v * 100 / chTotal) + "%" : "\u2014";
    if (cv2) {
      const w = cv2.closest(".chart-wrap") || cv2.parentElement;
      if (w) {
        const ce = w.querySelector(".chart-empty");
        if (ce) ce.remove();
      }
      cv2.style.display = "";
      _chanDonutChart = new Chart(cv2, { type: "doughnut", data: { labels: ["SEO", "SEM", "\u76F4\u63A5", "\u5176\u4ED6"], datasets: [{ data: [ch.SEO, ch.SEM, ch.direct, ch.other], backgroundColor: ["#2f72e8", "#7b54e0", "#0b9d8f", "#ef9514"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "66%" } });
    }
    setDonutLegend({ lgInqA: q.A, lgInqB: q.B, lgInqC: q.C, lgInqRate: rate, lgChSeo: pct3(ch.SEO), lgChSem: pct3(ch.SEM), lgChDirect: pct3(ch.direct), lgChOther: pct3(ch.other) });
  }
  var seoChart = null;
  var seoFull = null;
  function seoSeriesFromWeeks() {
    let w = window._seoWeeksView !== void 0 ? window._seoWeeksView : window._seoWeeks;
    if (w && w.length) {
      if (window._gran === "month") {
        const m = /* @__PURE__ */ new Map();
        w.forEach((x) => {
          const k = x.ym || x.date;
          if (!m.has(k)) m.set(k, { date: k, clicks: 0, impr: 0 });
          const o = m.get(k);
          o.clicks += +x.clicks || 0;
          o.impr += +x.impr || 0;
        });
        w = [...m.values()];
      }
      return { labels: w.map((x) => x.date), clicks: w.map((x) => x.clicks), impr: w.map((x) => Math.round(x.impr / 20)) };
    }
    return window.DEMO_MODE ? DEMO.seoSeries : null;
  }
  function buildSeoData(s) {
    return { labels: s.labels, datasets: [{ label: "\u70B9\u51FB", data: s.clicks, borderColor: "#2f72e8", backgroundColor: "rgba(47,114,232,.1)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }, { label: "\u5C55\u73B0\xF720", data: s.impr, borderColor: "#9aa1ae", borderDash: [4, 3], tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] };
  }
  function rebuildSeoChart() {
    if (window._gscBoard) {
      renderSeoBoard();
      return;
    }
    const cv = document.getElementById("seoBoard");
    if (!cv) return;
    const wrap = cv.closest(".chart-wrap") || cv.parentElement;
    if (wrap) {
      const ce = wrap.querySelector(".chart-empty");
      if (ce) ce.remove();
    }
    cv.style.display = "";
    if (seoChart) {
      try {
        seoChart.destroy();
      } catch (e) {
      }
      seoChart = null;
    }
    seoFull = seoSeriesFromWeeks();
    const so = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 7 } } } };
    if (seoFull && seoFull.labels && seoFull.labels.length) seoChart = new Chart(cv, { type: "line", data: buildSeoData(seoFull), options: so });
    else chartEmpty("seoBoard");
  }
  function refreshSeoWeekChart() {
    seoFull = seoSeriesFromWeeks();
    if (seoChart && seoFull) {
      seoChart.data = buildSeoData(seoFull);
      seoChart.update();
    }
  }
  async function loadSeoChartRange() {
    return loadSeoBoardGsc();
  }
  window._gscBoard = null;
  function _shiftRange(r) {
    const day = 864e5;
    const s = /* @__PURE__ */ new Date(r.start_date + "T00:00:00"), e = /* @__PURE__ */ new Date(r.end_date + "T00:00:00");
    const len = Math.round((e - s) / day) + 1;
    const prevEnd = new Date(s.getTime() - day);
    const prevStart = new Date(prevEnd.getTime() - (len - 1) * day);
    return { start_date: formatLocalDate(prevStart), end_date: formatLocalDate(prevEnd) };
  }
  async function loadSeoBoardGsc() {
    const cur = getCurrentRange();
    let data = null, prev = null;
    try {
      data = await API.get(withRange2("/api/google/gsc/summary"));
    } catch (e) {
      window._gscBoard = { error: e };
      renderSeoBoard();
      return;
    }
    if (cur) {
      try {
        prev = await API.get(withRange2("/api/google/gsc/summary", _shiftRange(cur)));
      } catch (e) {
        prev = null;
      }
    }
    window._gscBoard = { data, prev };
    renderSeoBoard();
  }
  function _aggByGran(byDate, gran) {
    if (!gran || gran === "day") return (byDate || []).map((x) => ({ label: (x.date || "").slice(5), clicks: +x.clicks || 0, impr: +x.impressions || 0 }));
    const m = /* @__PURE__ */ new Map();
    (byDate || []).forEach((x) => {
      const d = (x.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const k = gran === "month" ? d.slice(0, 7) : _weekStart(d);
      if (!m.has(k)) m.set(k, { clicks: 0, impr: 0 });
      const o = m.get(k);
      o.clicks += +x.clicks || 0;
      o.impr += +x.impressions || 0;
    });
    return [...m.keys()].sort().map((k) => ({ label: gran === "month" ? k : k.slice(5), clicks: m.get(k).clicks, impr: m.get(k).impr }));
  }
  function _seoDelta(id, cur, prev, lowerBetter, fmt2) {
    const el = document.getElementById(id);
    if (!el) return;
    if (prev == null || !isFinite(prev) || prev === 0 || cur == null) {
      el.textContent = "";
      el.className = "metric-delta";
      return;
    }
    const diff = cur - prev;
    const better = lowerBetter ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? "\u25B2" : diff < 0 ? "\u25BC" : "\u2014";
    const txt = fmt2 === "pct" ? Math.abs(diff / prev * 100).toFixed(1) + "%" : Math.abs(diff).toFixed(1);
    el.textContent = arrow + " " + txt;
    el.className = "metric-delta " + (better ? "delta-pos" : "delta-neg");
  }
  function _seoPath(u) {
    try {
      return new URL(u).pathname || u;
    } catch (e) {
      return u || "(\u672A\u77E5)";
    }
  }
  function renderSeoBoard() {
    const cv = document.getElementById("seoBoard");
    const board = window._gscBoard, data = board && board.data, prev = board && board.prev;
    const error = board && board.error;
    const t = data && data.totals || null;
    const _t = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    if (t) {
      _t("sb-clicks", (t.clicks || 0).toLocaleString());
      _t("sb-impr", (t.impressions || 0).toLocaleString());
      _t("sb-pos", t.position != null ? Number(t.position).toFixed(1) : "\u2014");
      _t("sb-cov", (data.queryCount || 0).toLocaleString());
      const pt = prev && prev.totals;
      _seoDelta("sb-clicks-d", t.clicks, pt ? pt.clicks : null, false, "pct");
      _seoDelta("sb-impr-d", t.impressions, pt ? pt.impressions : null, false, "pct");
      _seoDelta("sb-pos-d", t.position, pt ? pt.position : null, true, "abs");
      _seoDelta("sb-cov-d", data.queryCount, prev ? prev.queryCount : null, false, "abs");
    } else {
      ["sb-clicks", "sb-impr", "sb-pos", "sb-cov"].forEach((id) => _t(id, "\u2014"));
      ["sb-clicks-d", "sb-impr-d", "sb-pos-d", "sb-cov-d"].forEach((id) => {
        const e = document.getElementById(id);
        if (e) {
          e.textContent = "";
          e.className = "metric-delta";
        }
      });
    }
    if (cv) {
      const wrap = cv.closest(".chart-wrap") || cv.parentElement;
      if (seoChart) {
        try {
          seoChart.destroy();
        } catch (e) {
        }
        seoChart = null;
      }
      const gran = window._gran;
      let labels, clicks, impr;
      if (!gran || gran === "day") {
        const rng = board && board.data && board.data.range || (typeof getCurrentRange === "function" ? getCurrentRange() : null);
        const a = _alignDaily(data && data.byDate, rng, "date");
        labels = a.labels;
        clicks = a.rows.map((r) => r ? +r.clicks || 0 : null);
        impr = a.rows.map((r) => r ? +r.impressions || 0 : null);
      } else {
        const s = _aggByGran(data && data.byDate, gran);
        labels = s.map((x) => x.label);
        clicks = s.map((x) => x.clicks);
        impr = s.map((x) => x.impr);
      }
      if (labels.length && (clicks.some((v) => v != null) || impr.some((v) => v != null))) {
        if (wrap) {
          const ce = wrap.querySelector(".chart-empty");
          if (ce) ce.remove();
        }
        cv.style.display = "";
        seoChart = new Chart(cv, { type: "line", data: { labels, datasets: [
          { label: "\u70B9\u51FB", data: clicks, borderColor: "#2f72e8", backgroundColor: "rgba(47,114,232,.1)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, yAxisID: "y", spanGaps: false },
          { label: "\u5C55\u73B0", data: impr, borderColor: "#9aa1ae", borderDash: [4, 3], tension: 0.4, pointRadius: 0, borderWidth: 1.5, yAxisID: "y1", spanGaps: false }
        ] }, options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: { x: { ticks: { maxTicksLimit: _xTickLimit(labels.length) } }, y: { position: "left", beginAtZero: true, ticks: { precision: 0 } }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } }
        } });
      } else if (error) chartEmpty("seoBoard", loadFailureText("GSC", error), "\u52A0\u8F7D\u5931\u8D25");
      else chartEmpty("seoBoard");
    }
    const tb = document.getElementById("seoPageRows");
    if (tb) {
      const pages = data && data.topPages || [];
      if (error) {
        tb.innerHTML = loadFailureRow(7, "GSC", error);
      } else if (!pages.length) {
        tb.innerHTML = '<tr><td colspan="7" class="dim csp-s-45c174bbec">\u6682\u65E0\u771F\u5B9E\u6570\u636E \xB7 \u8BF7\u5B8C\u6210 GSC \u540C\u6B65</td></tr>';
      } else {
        tb.innerHTML = pages.slice(0, 20).map((p) => {
          const path = _seoPath(p.page);
          const ctr = p.ctr != null ? (p.ctr * 100).toFixed(1) + "%" : "\u2014";
          const pos = p.position != null ? Number(p.position).toFixed(1) : "\u2014";
          const q = "\u5206\u6790\u9875\u9762 " + path + " \u7684SEO\u8868\u73B0\uFF1A\u70B9\u51FB" + (p.clicks || 0) + "\u3001\u5C55\u73B0" + (p.impressions || 0) + "\u3001CTR" + ctr + "\u3001\u5747\u6392\u540D" + pos + "\u3002\u7ED9\u51FA\u6700\u8BE5\u5148\u6539\u76843\u4E2A\u52A8\u4F5C\u3002";
          const title = path + " \u8BCA\u65AD";
          return '<tr><td class="dim csp-s-33ee298127">' + esc(path) + '</td><td class="num">' + (p.clicks || 0).toLocaleString() + '</td><td class="num">' + (p.impressions || 0).toLocaleString() + '</td><td class="num">' + ctr + '</td><td class="num">' + pos + '</td><td class="num dim">\u2014</td><td class="ctr"><button type="button" class="btn-mini"' + _aiActionAttrs(q, title) + '><i class="ti ti-bulb"></i> \u8BCA\u65AD</button></td></tr>';
        }).join("");
      }
    }
  }
  function resizeScatters() {
    setTimeout(() => {
      [window._seoScatterChart, window._semScatterChart].forEach((c) => {
        if (c) {
          try {
            c.resize();
          } catch (e) {
          }
        }
      });
    }, 60);
  }
  window._seoSrcDonut = null;
  window._seoSrcArea = null;
  window._seoScatterChart = null;
  function _median(a) {
    const s = (a || []).filter((x) => x != null).sort((x, y) => x - y);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function _deltaHtml(cur, prev, lowerBetter, fmt2) {
    if (prev == null || !isFinite(prev) || prev === 0 || cur == null) return '<span class="dim">\u2014</span>';
    const diff = cur - prev;
    if (diff === 0) return '<span class="dim">\u2014</span>';
    const better = lowerBetter ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? "\u25B2" : "\u25BC";
    const txt = fmt2 === "pct" ? Math.abs(diff / prev * 100).toFixed(0) + "%" : Math.abs(diff).toFixed(fmt2 === "abs1" ? 1 : 0);
    return '<span class="' + (better ? "delta-pos" : "delta-neg") + '">' + arrow + txt + "</span>";
  }
  async function loadSeoBoardFull() {
    let d = null;
    try {
      d = await API.get(withRange2("/api/google/seo/board"));
    } catch (e) {
      d = { error: e };
    }
    renderSeoHighlights(d);
    renderSeoDeltaTables(d);
    renderSeoScatter(d);
    renderSeoSources(d);
  }
  function renderSeoHighlights(d) {
    const box = document.getElementById("seoHighlights");
    if (!box) return;
    if (d && d.error) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    const hs = d && d.highlights || [];
    if (!hs.length) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("is-hidden");
    box.innerHTML = '<span class="seo-hl-t"><i class="ti ti-flame"></i> \u672C\u5468\u8981\u70B9</span>' + hs.map((h) => '<span class="seo-hl-chip ' + (h.tone === "good" ? "good" : "bad") + '">' + esc(h.text) + "</span>").join("");
  }
  function renderSeoDeltaTables(d) {
    const error = d && d.error;
    const pt = document.getElementById("seoPagesDelta");
    if (pt) {
      const pages = d && d.pages || [];
      pt.innerHTML = error ? loadFailureRow(5, "SEO \u770B\u677F", error) : pages.length ? pages.map((p) => {
        const path = _seoPath(p.page);
        const q = "\u5206\u6790\u843D\u5730\u9875 " + path + " \u7684SEO\u8868\u73B0\uFF1A\u672C\u671F\u70B9\u51FB" + (p.clicks || 0) + "(\u4E0A\u671F" + (p.clicksPrev || 0) + ")\u3001\u5C55\u73B0" + (p.impressions || 0) + "\u3002\u7ED9\u51FA\u6700\u8BE5\u5148\u6539\u76843\u4E2A\u52A8\u4F5C\u3002";
        return '<tr><td class="dim csp-s-33ee298127">' + esc(path) + '</td><td class="num">' + (p.clicks || 0).toLocaleString() + '</td><td class="num">' + _deltaHtml(p.clicks, p.clicksPrev, false, "pct") + '</td><td class="num">' + (p.impressions || 0).toLocaleString() + '</td><td class="ctr"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u843D\u5730\u9875\u8BCA\u65AD") + '><i class="ti ti-bulb"></i> \u8BCA\u65AD</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="dim csp-s-45c174bbec">\u6682\u65E0\u6570\u636E \xB7 \u5B8C\u6210 GSC \u540C\u6B65</td></tr>';
    }
    const qt = document.getElementById("seoQueriesDelta");
    if (qt) {
      const qs = d && d.queries || [];
      qt.innerHTML = error ? loadFailureRow(6, "SEO \u770B\u677F", error) : qs.length ? qs.map((q) => {
        const pos = q.position != null ? Number(q.position).toFixed(1) : "\u2014";
        return "<tr><td>" + esc(q.query) + '</td><td class="num">' + (q.impressions || 0).toLocaleString() + '</td><td class="num">' + _deltaHtml(q.impressions, q.imprPrev, false, "pct") + '</td><td class="num">' + (q.clicks || 0).toLocaleString() + '</td><td class="num">' + pos + '</td><td class="num">' + _deltaHtml(q.position, q.positionPrev, true, "abs1") + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="dim csp-s-45c174bbec">\u6682\u65E0\u6570\u636E \xB7 \u5B8C\u6210 GSC \u540C\u6B65</td></tr>';
    }
  }
  function _seoScatterTitles(t, s) {
    const a = document.getElementById("seoScatterTitle"), b = document.getElementById("seoScatterSub");
    if (a) a.textContent = t;
    if (b) b.textContent = s;
  }
  function renderSeoScatterTargets(list) {
    const box = document.getElementById("seoScatterTargets");
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = '<div class="scatter-targets"><div class="st-head"><i class="ti ti-target-arrow"></i> \u91CD\u70B9\u4F18\u5316\u5BF9\u8C61 \xB7 \u9AD8\u6D41\u91CF\u9AD8\u8DF3\u51FA\uFF08' + list.length + "\uFF09</div>" + list.slice(0, 8).map((p) => {
      const path = _seoPath(p.page), b = Math.round((p.bounceRate || 0) * 100), dur = Math.round(p.avgDuration || 0);
      const q = "\u843D\u5730\u9875 " + path + " \u4F1A\u8BDD" + p.sessions + "\u3001\u8DF3\u51FA\u7387" + b + "%\u3001\u5747\u65F6\u957F" + dur + "s\uFF0C\u6D41\u91CF\u4E0D\u5C0F\u4F46\u8DF3\u51FA\u504F\u9AD8\u3002\u7ED9\u51FA\u964D\u4F4E\u8DF3\u51FA\u3001\u63D0\u5347\u7559\u5B58\u4E0E\u8F6C\u5316\u7684\u5177\u4F53\u4F18\u5316\u52A8\u4F5C\uFF08\u9996\u5C4F/\u5185\u5BB9\u5339\u914D/CTA/\u52A0\u8F7D\u901F\u5EA6\uFF09\u3002";
      const ti = "\u964D\u8DF3\u51FA\uFF1A" + path, de = "\u843D\u5730\u9875 " + path + " \u9AD8\u6D41\u91CF(" + p.sessions + "\u4F1A\u8BDD)\u9AD8\u8DF3\u51FA(" + b + "%)\uFF0C\u4F18\u5316\u9996\u5C4F/\u5185\u5BB9\u5339\u914D/CTA \u964D\u4F4E\u8DF3\u51FA\u3001\u63D0\u5347\u8F6C\u5316\u3002", ev = "GA4 \u4F1A\u8BDD" + p.sessions + " \u8DF3\u51FA" + b + "% \u65F6\u957F" + dur + "s";
      return '<div class="st-row"><div class="st-main"><span class="st-path">' + esc(path) + '</span><span class="st-meta dim">' + p.sessions.toLocaleString() + ' \u4F1A\u8BDD \xB7 \u8DF3\u51FA <b class="csp-s-371de31267">' + b + "%</b> \xB7 " + dur + 's</span></div><div class="st-acts"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u964D\u8DF3\u51FA\u8BCA\u65AD") + '><i class="ti ti-bulb"></i> \u8BCA\u65AD</button><button type="button" class="btn-mini"' + _adoptActionAttrs("SEO", ti, de, ev) + '><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3</button></div></div>';
    }).join("") + "</div>";
  }
  function renderSeoScatter(d) {
    const el = document.getElementById("seoScatter"), empty = document.getElementById("seoScatterEmpty");
    if (!el) return;
    const _tb = document.getElementById("seoScatterTargets");
    if (_tb) _tb.innerHTML = "";
    if (d && d.error) {
      el.style.display = "none";
      if (empty) {
        empty.classList.remove("is-hidden");
        empty.textContent = loadFailureText("SEO \u6563\u70B9", d.error);
      }
      return;
    }
    const ps = d && d.pageScatter || [];
    if (ps.length && typeof echarts !== "undefined") {
      el.style.display = "";
      if (empty) empty.classList.add("is-hidden");
      _seoScatterTitles("\u627E\u51FA\u9700\u8981\u4F18\u5316\u7684\u9875\u9762 \xB7 \u4F1A\u8BDD \xD7 \u8DF3\u51FA\u7387", "\u53F3\u4E0A\u7EA2\u533A=\u9AD8\u6D41\u91CF+\u9AD8\u8DF3\u51FA=\u91CD\u70B9\u4F18\u5316\u5BF9\u8C61\uFF1B\u4E2D\u4F4D\u7EBF\u5206\u56DB\u8C61\u9650\uFF1B\u70B9=\u843D\u5730\u9875");
      if (window._seoScatterChart) {
        try {
          window._seoScatterChart.dispose();
        } catch (e) {
        }
      }
      window._seoScatterChart = echarts.init(el);
      const medS = _median(ps.map((p) => p.sessions)), medB = _median(ps.map((p) => (p.bounceRate || 0) * 100));
      const maxS = Math.max(...ps.map((p) => p.sessions), 1) * 1.6;
      const isTarget = (p) => p.sessions >= medS && (p.bounceRate || 0) * 100 >= medB;
      const short = (u) => {
        const s = _seoPath(u);
        return s.length > 22 ? "\u2026" + s.slice(-21) : s;
      };
      const data2 = ps.map((p) => {
        const t = isTarget(p);
        return {
          value: [p.sessions, +((p.bounceRate || 0) * 100).toFixed(1), _seoPath(p.page), p.avgDuration || 0],
          itemStyle: { color: t ? "#e5484d" : "#2f72e8", opacity: t ? 0.85 : 0.6 },
          label: { show: t, position: "right", fontSize: 9, color: "#c93338", formatter: (o) => short(o.value[2]) }
        };
      });
      window._seoScatterChart.setOption({
        grid: { left: 52, right: 120, top: 16, bottom: 44 },
        xAxis: { type: "log", name: "\u4F1A\u8BDD", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10 } },
        yAxis: { type: "value", name: "\u8DF3\u51FA\u7387%", min: 0, max: 100, nameGap: 30, axisLabel: { fontSize: 10 } },
        tooltip: { formatter: (o) => esc(o.value[2]) + "<br/>\u4F1A\u8BDD " + o.value[0].toLocaleString() + " \xB7 \u8DF3\u51FA\u7387 " + o.value[1] + "% \xB7 \u5747\u65F6\u957F " + Math.round(o.value[3]) + "s" },
        series: [{
          type: "scatter",
          symbolSize: (v) => Math.min(32, 8 + Math.sqrt(v[0] || 0)),
          data: data2,
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#c2c7d0" }, label: { show: true, fontSize: 9, color: "#9aa1ae", formatter: (o) => o.dataType === "max" ? "" : "\u4E2D\u4F4D" }, data: [{ xAxis: medS }, { yAxis: medB }] },
          markArea: { silent: true, itemStyle: { color: "rgba(229,72,77,.07)" }, label: { show: true, position: ["85%", "6%"], color: "#e5484d", fontSize: 11, fontWeight: "bold", formatter: "\u91CD\u70B9\u4F18\u5316\u5BF9\u8C61" }, data: [[{ xAxis: medS, yAxis: medB }, { xAxis: maxS, yAxis: 100 }]] }
        }]
      });
      renderSeoScatterTargets(ps.filter(isTarget).sort((a, b) => b.sessions - a.sessions));
      return;
    }
    const pts = d && d.scatter || [];
    if (typeof echarts === "undefined" || !pts.length) {
      el.style.display = "none";
      if (empty) empty.classList.remove("is-hidden");
      return;
    }
    el.style.display = "";
    if (empty) empty.classList.add("is-hidden");
    _seoScatterTitles("\u673A\u4F1A\u8BCD\u8C61\u9650 \xB7 \u5C55\u73B0 \xD7 \u6392\u540D", "\uFF08GA4 \u8DF3\u51FA\u7387\u5F85\u91CD\u65B0\u540C\u6B65\u540E\u5207\u6362\u4E3A\u201C\u4F1A\u8BDD\xD7\u8DF3\u51FA\u7387\u201D\uFF09\u53F3\u4E0A=\u9AD8\u5C55\u73B0\u5DEE\u6392\u540D=\u91CD\u70B9\u653B\uFF1B\u70B9=\u5173\u952E\u8BCD");
    if (window._seoScatterChart) {
      try {
        window._seoScatterChart.dispose();
      } catch (e) {
      }
    }
    window._seoScatterChart = echarts.init(el);
    const data = pts.map((p) => [p.impressions, p.position, p.clicks, p.query]);
    const medImpr = _median(pts.map((p) => p.impressions)), medPos = _median(pts.map((p) => p.position));
    window._seoScatterChart.setOption({
      grid: { left: 52, right: 24, top: 16, bottom: 44 },
      xAxis: { type: "log", name: "\u5C55\u73B0", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: "\u6392\u540D(\u8D8A\u4F4E\u8D8A\u597D)", inverse: true, min: 1, nameGap: 30, axisLabel: { fontSize: 10 } },
      tooltip: { formatter: (o) => esc(o.data[3]) + "<br/>\u5C55\u73B0 " + o.data[0].toLocaleString() + " \xB7 \u6392\u540D " + o.data[1].toFixed(1) + " \xB7 \u70B9\u51FB " + o.data[2] },
      series: [{
        type: "scatter",
        symbolSize: (v) => Math.min(30, 7 + Math.sqrt(v[2] || 0) * 2.2),
        data,
        itemStyle: { color: "#2f72e8", opacity: 0.68 },
        markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#c2c7d0" }, label: { show: false }, data: [{ xAxis: medImpr }, { yAxis: medPos }] }
      }]
    });
  }
  function renderSeoSources(d) {
    const palette = ["#2f72e8", "#7b54e0", "#0b9d8f", "#ef9514", "#e5484d", "#9aa1ae"];
    const paletteClasses = ["chart-color-blue", "chart-color-purple", "chart-color-teal", "chart-color-amber", "chart-color-red", "chart-color-muted"];
    const srcs = d && d.sources || [];
    const error = d && d.error;
    const donutCv = document.getElementById("seoSrcDonut"), legend = document.getElementById("seoSrcLegend");
    if (donutCv) {
      if (window._seoSrcDonut) {
        try {
          window._seoSrcDonut.destroy();
        } catch (e) {
        }
        window._seoSrcDonut = null;
      }
      const top = srcs.slice(0, 6);
      if (top.length) {
        window._seoSrcDonut = new Chart(donutCv, { type: "doughnut", data: { labels: top.map((s) => s.source), datasets: [{ data: top.map((s) => s.sessions), backgroundColor: palette, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "62%" } });
        const total = top.reduce((a, s) => a + (s.sessions || 0), 0) || 1;
        if (legend) legend.innerHTML = top.map((s, i) => {
          const b = s.bounceRate != null ? '<span class="dim csp-s-128d24435a"> \xB7 \u8DF3\u51FA' + Math.round(s.bounceRate * 100) + "%</span>" : "";
          return '<div class="csp-s-ace6cccdf9"><span><span class="' + paletteClasses[i % paletteClasses.length] + '">\u25CF</span> ' + esc(s.source) + b + "</span><b>" + Math.round((s.sessions || 0) / total * 100) + "%</b></div>";
        }).join("");
      } else if (legend) {
        legend.innerHTML = '<span class="dim">' + (error ? esc(loadFailureText("SEO \u6765\u6E90", error)) : "\u6682\u65E0 GA4 \u6765\u6E90\u6570\u636E \xB7 \u5B8C\u6210\u540C\u6B65\u540E\u663E\u793A") + "</span>";
      }
    }
    const areaCv = document.getElementById("seoSrcArea");
    if (areaCv) {
      if (window._seoSrcArea) {
        try {
          window._seoSrcArea.destroy();
        } catch (e) {
        }
        window._seoSrcArea = null;
      }
      const ss = d && d.sourceSeries;
      if (ss && ss.dates && ss.dates.length) {
        const rng = d && d.range || (typeof getCurrentRange === "function" ? getCurrentRange() : null);
        const dRows = ss.dates.map((x, i) => ({ date: x, _i: i }));
        const aligned = _alignDaily(dRows, rng, "date");
        const datasets = ss.series.map((se, i) => ({ label: se.source, data: aligned.rows.map((r) => r ? se.values[r._i] || 0 : 0), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length] + "55", fill: true, stack: "s", tension: 0.3, pointRadius: 0, borderWidth: 1.4 }));
        window._seoSrcArea = new Chart(areaCv, { type: "line", data: { labels: aligned.labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { ticks: { maxTicksLimit: _xTickLimit(aligned.labels.length), font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
      } else if (error) chartEmpty("seoSrcArea", loadFailureText("SEO \u6765\u6E90\u8D8B\u52BF", error), "\u52A0\u8F7D\u5931\u8D25");
      else chartEmpty("seoSrcArea");
    }
  }
  window._adsBoard = null;
  function _money(m) {
    return m == null ? "\u2014" : (m / 1e6).toLocaleString(void 0, { maximumFractionDigits: 2 });
  }
  function _conv(v) {
    return v == null ? "\u2014" : Number(v).toLocaleString(void 0, { maximumFractionDigits: 2 });
  }
  function _adsBadge(cost, conv) {
    if ((cost || 0) === 0) return '<span class="badge b-gray">\u65E0\u82B1\u8D39</span>';
    if ((conv || 0) > 0) return '<span class="badge b-green">\u6709\u8F6C\u5316</span>';
    return '<span class="badge b-red">\u96F6\u6709\u6548</span>';
  }
  window._semCampaign = "";
  window._semAdGroup = "";
  function withSemCampaign(path) {
    let p = path;
    const add = (k, v) => {
      if (v) p += (p.includes("?") ? "&" : "?") + k + "=" + encodeURIComponent(v);
    };
    add("campaign_id", window._semCampaign);
    add("ad_group_id", window._semAdGroup);
    return p;
  }
  function _semScopeNote() {
    const el = document.getElementById("semAttrScope");
    if (el) el.classList.toggle("is-hidden", !(window._semCampaign || window._semAdGroup));
  }
  function onSemCampaignChange(v) {
    window._semCampaign = v || "";
    window._semAdGroup = "";
    const ag = document.getElementById("semAdGroupFilter");
    if (ag) {
      ag.value = "";
      ag.disabled = !window._semCampaign;
    }
    loadSemBoardAds();
    loadSemBoardFull();
    _semScopeNote();
  }
  function onSemAdGroupChange(v) {
    window._semAdGroup = v || "";
    loadSemBoardAds();
    loadSemBoardFull();
    _semScopeNote();
  }
  function _fillSemAdGroupFilter(list) {
    const sel = document.getElementById("semAdGroupFilter");
    if (!sel) return;
    if (!window._semCampaign) {
      sel.innerHTML = '<option value="">\u5168\u90E8\u5E7F\u544A\u7EC4</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const cur = sel.value;
    sel.innerHTML = ['<option value="">\u5168\u90E8\u5E7F\u544A\u7EC4</option>'].concat((list || []).map((g) => '<option value="' + esc(g.adGroupId) + '">' + esc(g.adGroupName || "(\u672A\u547D\u540D\u5E7F\u544A\u7EC4)") + "</option>")).join("");
    sel.value = cur;
  }
  function _fillSemCampaignFilter(list) {
    const sel = document.getElementById("semCampFilter");
    if (!sel || window._semCampaign) return;
    const cur = sel.value;
    sel.innerHTML = ['<option value="">\u5168\u90E8\u7CFB\u5217</option>'].concat((list || []).map((c) => '<option value="' + esc(c.campaignId) + '">' + esc(c.campaignName || "(\u672A\u547D\u540D)") + "</option>")).join("");
    sel.value = cur;
  }
  async function loadSemBoardAds() {
    let data = null;
    try {
      data = await API.get(withSemCampaign(withRange2("/api/google/ads/summary")));
    } catch (e) {
      window._adsBoard = { error: e };
      renderSemBoard();
      return;
    }
    window._adsBoard = data;
    renderSemBoard();
  }
  function renderSemBoard() {
    const data = window._adsBoard, t = data && data.totals;
    const error = data && data.error;
    const _t = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    const _int = (v) => v == null ? "\u2014" : Number(v).toLocaleString();
    const _pct = (v) => v == null ? "\u2014" : (Number(v) * 100).toFixed(2) + "%";
    const ids = ["sm-cost", "sm-impr", "sm-clicks", "sm-ctr", "sm-cpc", "sm-conv", "sm-cvr", "sm-cpconv"];
    if (t) {
      _t("sm-cost", _money(t.costMicros));
      _t("sm-impr", _int(t.impressions));
      _t("sm-clicks", _int(t.clicks));
      _t("sm-ctr", _pct(t.ctr));
      _t("sm-cpc", _money(t.averageCpcMicros));
      _t("sm-conv", _conv(t.conversions));
      _t("sm-cvr", t.clicks > 0 ? _pct(Number(t.conversions || 0) / t.clicks) : "\u2014");
      _t("sm-cpconv", _money(t.costPerConversionMicros));
    } else {
      ids.forEach((id) => _t(id, "\u2014"));
    }
    if (data) {
      _fillSemCampaignFilter(data.campaigns);
      _fillSemAdGroupFilter(data.adGroups);
    }
    const tb = document.getElementById("semHierRows");
    if (!tb) return;
    const camps = data && data.campaigns || [], kws = data && data.keywords || [];
    if (error) {
      tb.innerHTML = loadFailureRow(5, "Ads \u6982\u89C8", error);
      return;
    }
    if (!camps.length) {
      tb.innerHTML = '<tr><td colspan="5" class="dim csp-s-45c174bbec">\u6682\u65E0\u771F\u5B9E\u6570\u636E \xB7 \u8BF7\u5B8C\u6210 Google Ads \u540C\u6B65</td></tr>';
      return;
    }
    const byCamp = /* @__PURE__ */ new Map();
    kws.forEach((k) => {
      const n = k.campaignName || "";
      if (!byCamp.has(n)) byCamp.set(n, []);
      byCamp.get(n).push(k);
    });
    const cpc = (cost, conv) => conv && conv > 0 ? _money(cost / conv) : "\u2014";
    let html = "";
    camps.forEach((c) => {
      html += '<tr class="h-camp" data-chart-action="toggle-hier"><td><i class="ti ti-chevron-down hicon"></i> <b>' + esc(c.campaignName || "(\u672A\u547D\u540D)") + '</b></td><td class="num">' + _money(c.costMicros) + '</td><td class="num">' + _conv(c.conversions) + '</td><td class="num">' + cpc(c.costMicros, c.conversions) + '</td><td class="ctr">' + _adsBadge(c.costMicros, c.conversions) + "</td></tr>";
      (byCamp.get(c.campaignName || "") || []).forEach((k) => {
        const mt = k.matchType ? " \xB7 " + esc(k.matchType) : "";
        html += '<tr class="h-kw"><td>\u3000\u2022 ' + esc(k.keyword || "") + '<span class="dim csp-s-33ee298127">' + mt + '</span></td><td class="num">' + _money(k.costMicros) + '</td><td class="num">' + _conv(k.conversions) + '</td><td class="num">' + cpc(k.costMicros, k.conversions) + '</td><td class="ctr">' + _adsBadge(k.costMicros, k.conversions) + "</td></tr>";
      });
    });
    tb.innerHTML = html;
  }
  async function loadAttribution() {
    let d = null;
    try {
      d = await API.get(withRange2("/api/attribution"));
    } catch (e) {
      d = { error: e };
    }
    renderAttribution(d);
  }
  function renderAttribution(d) {
    const card = document.getElementById("semAttrCard"), body = document.getElementById("semAttrBody");
    if (!card || !body) return;
    if (d && d.error) {
      card.classList.remove("is-hidden");
      body.innerHTML = '<div class="dim">' + esc(loadFailureText("\u8BE2\u76D8\u5F52\u56E0", d.error)) + "</div>";
      return;
    }
    const sem = d && d.sem;
    if (!sem || !sem.costMicros && !sem.inquiriesTotal) {
      card.classList.add("is-hidden");
      return;
    }
    card.classList.remove("is-hidden");
    const cost = sem.costMicros / 1e6;
    const real = sem.costPerEffective != null ? Math.round(sem.costPerEffective).toLocaleString() : "\u2014";
    const adsCpa = sem.adsConversions > 0 ? Math.round(cost / sem.adsConversions).toLocaleString() : "\u2014";
    const gap = sem.costPerEffective != null && sem.adsConversions > 0 ? sem.costPerEffective / (cost / sem.adsConversions) : null;
    body.innerHTML = '<div class="attr-report-grid"><div class="attr-box"><div class="attr-num">' + (sem.inquiriesEffective || 0) + '<span class="dim csp-s-a49cca52be">/' + (sem.inquiriesTotal || 0) + '</span></div><div class="attr-lbl">\u771F\u5B9E\u6709\u6548\u8BE2\u76D8 (A/B)</div></div><div class="attr-box"><div class="attr-num">' + (sem.inquiriesA || 0) + '</div><div class="attr-lbl">A \u7EA7\u8BE2\u76D8\u6570\u91CF</div></div><div class="attr-box"><div class="attr-num">' + real + '</div><div class="attr-lbl">\u771F\u5B9E\u6BCF\u6709\u6548\u8BE2\u76D8\u6210\u672C \xB7 Ads \u81EA\u62A5 ' + adsCpa + "</div></div></div>" + (gap && gap >= 1.3 ? '<div class="attr-warn"><i class="ti ti-alert-triangle"></i> \u771F\u5B9E\u6BCF\u8BE2\u76D8\u6210\u672C\u7EA6\u4E3A Ads \u81EA\u62A5\u7684 ' + gap.toFixed(1) + " \u500D\u2014\u2014Ads \u8F6C\u5316\u7EDF\u8BA1\u53EF\u80FD\u865A\u9AD8\uFF0C\u522B\u53EA\u770B Ads \u540E\u53F0\u6570\u5B57\u3002</div>" : "") + (sem.inquiriesEffective === 0 && sem.costMicros > 0 ? '<div class="attr-warn"><i class="ti ti-alert-triangle"></i> \u672C\u533A\u95F4 SEM \u4ED8\u8D39\u82B1\u4E86 ' + _money(sem.costMicros) + " \u4F46\u771F\u5B9E\u6709\u6548\u8BE2\u76D8\u4E3A 0\u2014\u2014\u68C0\u67E5\u6E20\u9053\u6807\u6CE8\u6216\u6295\u653E\u6548\u679C\u3002</div>" : "");
  }
  window._semCostDonut = null;
  window._semTrend = null;
  window._semScatterChart = null;
  async function loadSemBoardFull() {
    let d = null;
    try {
      d = await API.get(withSemCampaign(withRange2("/api/google/ads/board")));
    } catch (e) {
      d = { error: e };
    }
    renderSemHighlights(d);
    renderSemDeltaTables(d);
    renderSemScatter(d);
    renderSemCostCharts(d);
  }
  function renderSemHighlights(d) {
    const box = document.getElementById("semHighlights");
    if (!box) return;
    if (d && d.error) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    const hs = d && d.highlights || [];
    if (!hs.length) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("is-hidden");
    box.innerHTML = '<span class="seo-hl-t"><i class="ti ti-flame"></i> \u672C\u5468\u8981\u70B9</span>' + hs.map((h) => '<span class="seo-hl-chip ' + (h.tone === "good" ? "good" : "bad") + '">' + esc(h.text) + "</span>").join("");
  }
  function renderSemDeltaTables(d) {
    const error = d && d.error;
    const cpc = (cost, conv) => conv && conv > 0 ? _money(cost / conv) : "\u2014";
    const rate = (a, b) => b && b > 0 ? (a / b * 100).toFixed(1) + "%" : "\u2014";
    const ct = document.getElementById("semCampFull");
    if (ct) {
      const cs = d && d.campaigns || [];
      ct.innerHTML = error ? loadFailureRow(10, "SEM \u770B\u677F", error) : cs.length ? cs.map((c) => {
        const ctr = rate(c.clicks, c.impressions), cvr = rate(Number(c.conversions || 0), c.clicks);
        const cpcCost = c.clicks && c.clicks > 0 ? _money(c.costMicros / c.clicks) : "\u2014";
        return "<tr><td>" + esc(c.name || "(\u672A\u547D\u540D)") + '</td><td class="num">' + (c.impressions || 0).toLocaleString() + '</td><td class="num">' + (c.clicks || 0).toLocaleString() + '</td><td class="num">' + ctr + '</td><td class="num">' + _money(c.costMicros) + '</td><td class="num">' + cpcCost + '</td><td class="num">' + _conv(c.conversions) + '</td><td class="num">' + cvr + '</td><td class="num">' + cpc(c.costMicros, c.conversions) + '</td><td class="ctr">' + _adsBadge(c.costMicros, c.conversions) + "</td></tr>";
      }).join("") : '<tr><td colspan="10" class="dim csp-s-45c174bbec">\u6682\u65E0\u6570\u636E \xB7 \u5B8C\u6210 Ads \u540C\u6B65</td></tr>';
    }
    const kt = document.getElementById("semKwRows");
    if (kt) {
      const ks = d && d.keywords || [];
      kt.innerHTML = error ? loadFailureRow(6, "SEM \u770B\u677F", error) : ks.length ? ks.map((k) => "<tr><td>" + esc(k.keyword || "") + '</td><td class="num">' + _money(k.costMicros) + '</td><td class="num">' + _conv(k.conversions) + '</td><td class="num">' + _deltaHtml(k.conversions, k.convPrev, false, "abs1") + '</td><td class="num">' + cpc(k.costMicros, k.conversions) + '</td><td class="ctr">' + _adsBadge(k.costMicros, k.conversions) + "</td></tr>").join("") : '<tr><td colspan="6" class="dim csp-s-45c174bbec">\u6682\u65E0\u6570\u636E \xB7 \u5B8C\u6210 Ads \u540C\u6B65</td></tr>';
    }
  }
  function _semScatterTitles(t, s) {
    const a = document.getElementById("semScatterTitle"), b = document.getElementById("semScatterSub");
    if (a) a.textContent = t;
    if (b) b.textContent = s;
  }
  function renderSemScatterTargets(list, coverage) {
    const box = document.getElementById("semScatterTargets");
    if (!box) return;
    const rows2 = Number(coverage && coverage.rowCount || 0), terms = Number(coverage && coverage.distinctTerms || 0);
    if (!rows2) {
      box.innerHTML = '<div class="scatter-targets"><div class="st-head"><i class="ti ti-alert-circle"></i> \u672A\u540C\u6B65\u5230\u771F\u5B9E\u641C\u7D22\u8BCD\u660E\u7EC6\uFF0C\u4E0D\u80FD\u751F\u6210\u5426\u8BCD\u5019\u9009</div></div>';
      return;
    }
    if (!list || !list.length) {
      box.innerHTML = '<div class="scatter-targets"><div class="st-head"><i class="ti ti-circle-check"></i> \u5DF2\u68C0\u67E5 ' + terms + " \u4E2A\u771F\u5B9E\u641C\u7D22\u8BCD\uFF0C\u672C\u533A\u95F4\u6682\u65E0\u9AD8\u82B1\u8D39\u96F6\u8F6C\u5316\u5019\u9009</div></div>";
      return;
    }
    box.innerHTML = '<div class="scatter-targets"><div class="st-head"><i class="ti ti-filter-search"></i> \u96F6\u8F6C\u5316\u771F\u5B9E\u641C\u7D22\u8BCD \xB7 \u5019\u9009\u5426\u8BCD/\u6392\u67E5\uFF08' + list.length + "\uFF09</div>" + list.slice(0, 10).map((p) => {
      const cost = p.costMicros / 1e6, c = Number(p.conversions || 0);
      const scope = [p.campaignName, p.adGroupName, p.matchType].filter(Boolean).join(" \xB7 ");
      const q = "\u771F\u5B9E\u641C\u7D22\u8BCD\u300C" + p.searchTerm + "\u300D\u5728\u6240\u9009\u533A\u95F4\u82B1\u8D39" + cost.toFixed(0) + "\u3001\u70B9\u51FB" + (p.clicks || 0) + "\u3001Ads\u8F6C\u5316" + c + "\u3002\u7ED3\u5408\u6709\u6548\u8BE2\u76D8\u5F52\u56E0\u548C\u4E70\u5BB6\u610F\u56FE\uFF0C\u5224\u65AD\u5E94\u52A0\u5426\u8BCD\u8FD8\u662F\u7EE7\u7EED\u89C2\u5BDF\uFF1B\u4E0D\u8981\u4EC5\u51ED\u96F6Ads\u8F6C\u5316\u76F4\u63A5\u5426\u5B9A\u3002";
      const ti = "\u6838\u9A8C\u5019\u9009\u5426\u8BCD\uFF1A" + p.searchTerm, de = "\u771F\u5B9E\u641C\u7D22\u8BCD\u300C" + p.searchTerm + "\u300D(" + (scope || "\u8303\u56F4\u672A\u77E5") + ") \u82B1\u8D39" + cost.toFixed(0) + "\u3001\u70B9\u51FB" + (p.clicks || 0) + "\u3001Ads\u8F6C\u5316" + c + "\u3002\u6838\u5BF9\u8BE2\u76D8\u5F52\u56E0\u548C\u610F\u56FE\u540E\u51B3\u5B9A\u662F\u5426\u52A0\u5426\u8BCD\u3002", ev = "Ads\u771F\u5B9E\u641C\u7D22\u8BCD \u82B1\u8D39" + cost.toFixed(0) + " \u8F6C\u5316" + c + " \u70B9\u51FB" + (p.clicks || 0);
      return '<div class="st-row"><div class="st-main"><span class="st-path">' + esc(p.searchTerm) + '</span><span class="st-meta dim">' + esc(scope || "\u8303\u56F4\u672A\u77E5") + ' \xB7 \u82B1 <b class="csp-s-371de31267">' + cost.toFixed(0) + "</b> \xB7 \u8F6C\u5316 " + c + '</span></div><div class="st-acts"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u641C\u7D22\u8BCD\u6838\u9A8C") + '><i class="ti ti-bulb"></i> \u6838\u9A8C</button><button type="button" class="btn-mini"' + _adoptActionAttrs("SEM", ti, de, ev) + '><i class="ti ti-clipboard-check"></i> \u8F6C\u4EFB\u52A1</button></div></div>';
    }).join("") + "</div>";
  }
  function renderSemScatter(d) {
    const el = document.getElementById("semScatter"), empty = document.getElementById("semScatterEmpty");
    if (!el) return;
    const _tb = document.getElementById("semScatterTargets");
    if (_tb) _tb.innerHTML = "";
    if (d && d.error) {
      el.style.display = "none";
      if (empty) {
        empty.classList.remove("is-hidden");
        empty.textContent = loadFailureText("SEM \u6563\u70B9", d.error);
      }
      return;
    }
    const all = d && d.scatter || [];
    const conv = all.filter((p) => Number(p.conversions || 0) > 0).map((p) => ({ ...p, cost: p.costMicros / 1e6, cpa: p.costMicros / 1e6 / Number(p.conversions) }));
    _semScatterTitles("\u82B1\u8D39 \xD7 \u6BCF\u8F6C\u5316\u6210\u672C \xB7 \u627E\u53C8\u8D35\u53C8\u4E0D\u5212\u7B97\u7684\u8BCD", "\u70B9=\u6709\u8F6C\u5316\u7684\u6295\u653E\u5173\u952E\u8BCD\uFF1B\u4E0B\u65B9\u5019\u9009\u5426\u8BCD\u53EA\u4F7F\u7528\u771F\u5B9E\u641C\u7D22\u8BCD\u660E\u7EC6");
    if (typeof echarts !== "undefined" && conv.length) {
      el.style.display = "";
      if (empty) empty.classList.add("is-hidden");
      if (window._semScatterChart) {
        try {
          window._semScatterChart.dispose();
        } catch (e) {
        }
      }
      window._semScatterChart = echarts.init(el);
      const medCpa = _median(conv.map((p) => p.cpa));
      const short = (s) => {
        s = String(s || "");
        return s.length > 20 ? s.slice(0, 19) + "\u2026" : s;
      };
      const data = conv.map((p) => {
        const t = p.cpa >= medCpa;
        return { value: [+p.cost.toFixed(0), +p.cpa.toFixed(0), p.keyword, p.conversions], itemStyle: { color: t ? "#e5484d" : "#7b54e0", opacity: t ? 0.85 : 0.62 }, label: { show: t, position: "right", fontSize: 9, color: "#c93338", formatter: (o) => short(o.value[2]) } };
      });
      window._semScatterChart.setOption({
        grid: { left: 56, right: 120, top: 16, bottom: 44 },
        xAxis: { type: "log", name: "\u82B1\u8D39", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10 } },
        yAxis: { type: "log", name: "\u6BCF\u8F6C\u5316\u6210\u672C", nameGap: 8, axisLabel: { fontSize: 10 } },
        tooltip: { formatter: (o) => esc(o.value[2]) + "<br/>\u82B1\u8D39 " + o.value[0] + " \xB7 \u6BCF\u8F6C\u5316\u6210\u672C " + o.value[1] + " \xB7 \u8F6C\u5316 " + o.value[3] },
        series: [{
          type: "scatter",
          symbolSize: (v) => Math.min(30, 8 + Math.sqrt(v[0] || 0) / 3),
          data,
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#c2c7d0" }, label: { show: true, fontSize: 9, color: "#9aa1ae", formatter: "\u4E2D\u4F4D\u6BCF\u8F6C\u5316" }, data: [{ yAxis: medCpa }] },
          markArea: { silent: true, itemStyle: { color: "rgba(229,72,77,.07)" }, label: { show: true, position: ["50%", "8%"], color: "#e5484d", fontSize: 11, fontWeight: "bold", formatter: "\u6BCF\u8F6C\u5316\u504F\u8D35" }, data: [[{ yAxis: medCpa }, { yAxis: "max" }]] }
        }]
      });
    } else {
      el.style.display = "none";
      if (window._semScatterChart) {
        try {
          window._semScatterChart.dispose();
        } catch (e) {
        }
        window._semScatterChart = null;
      }
      if (empty) {
        empty.classList.remove("is-hidden");
        empty.textContent = all.length ? "\u672C\u533A\u95F4\u6682\u65E0\u6709\u8F6C\u5316\u7684\u6295\u653E\u5173\u952E\u8BCD\uFF1B\u641C\u7D22\u8BCD\u5019\u9009\u89C1\u4E0B\u65B9" : "\u6682\u65E0\u8DB3\u591F\u6570\u636E \xB7 \u5B8C\u6210 Google Ads \u540C\u6B65\u540E\u663E\u793A";
      }
    }
    renderSemScatterTargets(d && d.wasteSearchTerms || [], d && d.searchTermCoverage);
  }
  function _dayDiff(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
  }
  function _alignDaily(rows2, range, dateKey) {
    const key = dateKey || "date";
    const r = range || (typeof getCurrentRange === "function" ? getCurrentRange() : null);
    if (!r || !r.start_date || !r.end_date) return { labels: (rows2 || []).map((x) => String(x[key]).slice(5, 10)), rows: (rows2 || []).slice(), isoDates: (rows2 || []).map((x) => String(x[key]).slice(0, 10)) };
    const m = new Map((rows2 || []).map((x) => [String(x[key]).slice(0, 10), x]));
    const labels = [], out = [], iso = [];
    let d = Date.parse(r.start_date + "T00:00:00Z");
    const end = Date.parse(r.end_date + "T00:00:00Z");
    while (d <= end) {
      const s = new Date(d).toISOString().slice(0, 10);
      iso.push(s);
      labels.push(s.slice(5));
      out.push(m.get(s) || null);
      d += 864e5;
    }
    return { labels, rows: out, isoDates: iso };
  }
  function _xTickLimit(n) {
    if (n <= 14) return n;
    if (n <= 31) return 10;
    if (n <= 90) return 12;
    if (n <= 180) return 12;
    return 14;
  }
  function renderSemCostCharts(d) {
    const palette = ["#7b54e0", "#2f72e8", "#0b9d8f", "#ef9514", "#e5484d", "#9aa1ae"];
    const paletteClasses = ["chart-color-purple", "chart-color-blue", "chart-color-teal", "chart-color-amber", "chart-color-red", "chart-color-muted"];
    const cs = d && d.campaigns || [];
    const error = d && d.error;
    const donutCv = document.getElementById("semCostDonut"), legend = document.getElementById("semCostLegend");
    if (donutCv) {
      if (window._semCostDonut) {
        try {
          window._semCostDonut.destroy();
        } catch (e) {
        }
        window._semCostDonut = null;
      }
      const top = cs.slice(0, 6);
      if (top.length) {
        window._semCostDonut = new Chart(donutCv, { type: "doughnut", data: { labels: top.map((c) => c.name), datasets: [{ data: top.map((c) => c.costMicros / 1e6), backgroundColor: palette, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "62%" } });
        const total = top.reduce((a, c) => a + (c.costMicros || 0), 0) || 1;
        if (legend) legend.innerHTML = top.map((c, i) => '<div class="csp-s-ace6cccdf9"><span><span class="' + paletteClasses[i % paletteClasses.length] + '">\u25CF</span> ' + esc(c.name) + "</span><b>" + Math.round((c.costMicros || 0) / total * 100) + "%</b></div>").join("");
      } else if (legend) {
        legend.innerHTML = '<span class="dim">' + (error ? esc(loadFailureText("SEM \u82B1\u8D39", error)) : "\u6682\u65E0 Ads \u6570\u636E \xB7 \u5B8C\u6210\u540C\u6B65\u540E\u663E\u793A") + "</span>";
      }
    }
    const trendCv = document.getElementById("semTrend");
    if (trendCv) {
      if (window._semTrend) {
        try {
          window._semTrend.destroy();
        } catch (e) {
        }
        window._semTrend = null;
      }
      const s = d && d.series || [];
      const rng = d && d.range || (typeof getCurrentRange === "function" ? getCurrentRange() : null);
      const aligned = _alignDaily(s, rng, "date");
      if (aligned.rows.some((r) => r)) {
        const cost = aligned.rows.map((r) => r ? +(r.costMicros / 1e6).toFixed(0) : null);
        const conv = aligned.rows.map((r) => r ? r.conversions : null);
        const sp = d && d.seriesPrev || [], pv = d && d.prev;
        const prevCost = [], prevConv = [], prevDate = [];
        if (sp.length && rng && pv) {
          const mCost = /* @__PURE__ */ new Map(), mConv = /* @__PURE__ */ new Map(), mDate = /* @__PURE__ */ new Map();
          sp.forEach((x) => {
            const o = _dayDiff(pv.start_date, x.date);
            mCost.set(o, +(x.costMicros / 1e6).toFixed(0));
            mConv.set(o, x.conversions);
            mDate.set(o, x.date);
          });
          aligned.isoDates.forEach((iso) => {
            const o = _dayDiff(rng.start_date, iso);
            prevCost.push(mCost.has(o) ? mCost.get(o) : null);
            prevConv.push(mConv.has(o) ? mConv.get(o) : null);
            prevDate.push(mDate.has(o) ? mDate.get(o) : null);
          });
        }
        const hasPrev = prevCost.some((v) => v != null);
        const datasets = [
          { label: "\u82B1\u8D39", data: cost, borderColor: "#7b54e0", backgroundColor: "rgba(123,84,224,.12)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: "y", spanGaps: false },
          { label: "\u8F6C\u5316", data: conv, borderColor: "#15a85a", tension: 0.3, pointRadius: 0, borderWidth: 1.6, yAxisID: "y1", spanGaps: false }
        ];
        if (hasPrev) {
          datasets.push(
            { label: "\u82B1\u8D39\xB7\u4E0A\u4E00\u533A\u95F4", data: prevCost, borderColor: "rgba(123,84,224,.45)", borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0, tension: 0.3, fill: false, spanGaps: true, yAxisID: "y" },
            { label: "\u8F6C\u5316\xB7\u4E0A\u4E00\u533A\u95F4", data: prevConv, borderColor: "rgba(21,168,90,.5)", borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: false, spanGaps: true, yAxisID: "y1" }
          );
        }
        window._semTrend = new Chart(trendCv, { type: "line", data: { labels: aligned.labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: hasPrev ? { callbacks: { footer: (items) => {
          const i = items && items[0] && items[0].dataIndex;
          const pd = i != null ? prevDate[i] : null;
          return pd ? "\u5BF9\u5E94\u4E0A\u4E00\u533A\u95F4\uFF1A" + pd : "";
        } } } : {} }, scales: { x: { ticks: { maxTicksLimit: _xTickLimit(aligned.labels.length), font: { size: 10 } } }, y: { position: "left", beginAtZero: true }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } } });
      } else if (error) chartEmpty("semTrend", loadFailureText("SEM \u8D8B\u52BF", error), "\u52A0\u8F7D\u5931\u8D25");
      else chartEmpty("semTrend");
    }
  }
  function _dataActionAttr(name, value) {
    return " data-" + name + '="' + esc(String(value == null ? "" : value)) + '"';
  }
  function _aiActionAttrs(prompt2, title) {
    return _dataActionAttr("ferr-action", "ai") + _dataActionAttr("ai-prompt", prompt2) + _dataActionAttr("ai-title", title);
  }
  function _adoptActionAttrs(dept, title, detail, evidence) {
    return _dataActionAttr("ferr-action", "adopt") + _dataActionAttr("dept", dept) + _dataActionAttr("title", title) + _dataActionAttr("detail", detail) + _dataActionAttr("evidence", evidence);
  }
  document.addEventListener("click", (e) => {
    const chartAction = e.target && e.target.closest ? e.target.closest('[data-chart-action="toggle-hier"]') : null;
    if (chartAction) {
      toggleHier(chartAction);
      return;
    }
    const btn = e.target && e.target.closest ? e.target.closest("[data-ferr-action]") : null;
    if (!btn) return;
    if (btn.dataset.ferrAction === "ai") {
      runAiAnalysis(btn, btn.dataset.aiPrompt || "", btn.dataset.aiTitle || "AI \u5206\u6790", false);
      return;
    }
    if (btn.dataset.ferrAction === "adopt") adoptFinding(btn, btn.dataset.dept || "SEO", btn.dataset.title || "", btn.dataset.detail || "", btn.dataset.evidence || "");
  });
  function _badgeCount(id, n) {
    const e = document.getElementById(id);
    if (!e) return;
    if (n > 0) {
      e.textContent = n;
      e.classList.remove("is-hidden");
    } else {
      e.textContent = "";
      e.classList.add("is-hidden");
    }
  }
  async function adoptFinding(btn, dept, title, detail, evidence) {
    try {
      await createEvidenceFix(dept, title, detail, evidence, "\u8BCA\u65AD\u5F15\u64CE");
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-check"></i> \u5DF2\u91C7\u7EB3';
      if (typeof toastGo === "function") toastGo("\u5DF2\u91C7\u7EB3 \u2192 \u6574\u6539\u6E05\u5355 \xB7 \u5DF2\u5165\u5E93", "fix");
      else toast("\u5DF2\u91C7\u7EB3 \u2192 \u6574\u6539\u6E05\u5355");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  async function loadDataFreshness() {
    const el = document.getElementById("dataFreshness");
    if (!el) return;
    let d = null;
    try {
      d = await API.get(withRange2("/api/data-freshness"));
    } catch (e) {
      el.innerHTML = '<span class="dim">' + esc(loadFailureText("\u6570\u636E\u65B0\u9C9C\u5EA6", e)) + "</span>";
      return;
    }
    const fmt2 = (v) => {
      if (!v) return "\u4ECE\u672A";
      const s = String(v).replace(" ", "T");
      const t = new Date(/Z|[+-]\d{2}/.test(s) ? s : s + "Z");
      if (isNaN(t)) return String(v).slice(5, 16);
      const p = (n) => String(n).padStart(2, "0");
      const dif = Math.floor((Date.now() - t.getTime()) / 6e4);
      if (dif < 60) return dif + " \u5206\u949F\u524D";
      if (dif < 1440) return Math.floor(dif / 60) + " \u5C0F\u65F6\u524D";
      return t.getMonth() + 1 + "/" + t.getDate() + " " + p(t.getHours()) + ":" + p(t.getMinutes());
    };
    const chip = (name, s) => {
      if (!s.connected) return '<span class="fresh-chip gray"><b>' + name + "</b> \u672A\u63A5\u5165</span>";
      const cov = s.days > 0 ? Math.round(s.daysWithData / s.days * 100) : 0;
      const tone = s.daysWithData === 0 ? "bad" : cov < 70 ? "warn" : "good";
      return '<span class="fresh-chip ' + tone + '"><b>' + name + "</b> \u6709\u6570\u636E " + s.daysWithData + "/" + s.days + ' \u5929<span class="dim"> \xB7 ' + fmt2(s.lastSync) + (s.status === "failed" ? ' <b class="csp-s-b0e08465c2">\u5931\u8D25</b>' : "") + "</span></span>";
    };
    el.innerHTML = '<i class="ti ti-database"></i> ' + chip("GSC", d.gsc) + chip("GA4", d.ga4) + chip("Ads", d.ads) + '<span class="dim fresh-help">\u533A\u95F4\u5B9E\u9645\u6709\u6570\u636E\u5929\u6570 / \u6240\u9009\u603B\u5929\u6570 \xB7 \u65F6\u95F4\u8303\u56F4\u5F71\u54CD\uFF1A\u8BE2\u76D8\u3001SEO(GSC)\u3001SEM(Ads)\u3001GA4</span>';
  }
  window._ovSeoMini = null;
  window._ovSemMini = null;
  function _ovSpark(id, rows2, valFn, color, emptyDetail) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const key = "_ov" + (id === "seoMini" ? "Seo" : "Sem") + "Mini";
    if (window[key]) {
      try {
        window[key].destroy();
      } catch (e) {
      }
      window[key] = null;
    }
    if (!rows2 || !rows2.length) {
      chartEmpty(id, emptyDetail, emptyDetail ? "\u52A0\u8F7D\u5931\u8D25" : void 0);
      return;
    }
    const wrap = cv.closest(".chart-wrap");
    if (wrap) {
      const ce = wrap.querySelector(".chart-empty");
      if (ce) ce.remove();
    }
    cv.style.display = "";
    window[key] = new Chart(cv, { type: "line", data: { labels: rows2.map((x) => (x.date || "").slice(5)), datasets: [{ data: rows2.map(valFn), borderColor: color, backgroundColor: color + "1a", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } } });
  }
  var dashboardBoardsRequestSequence = 0;
  async function loadDashboardBoards() {
    if (window.DEMO_MODE) return;
    const requestId = ++dashboardBoardsRequestSequence, revision = getRangeRevision(), r = getCurrentRange();
    const _t = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    const [gscResult, adsResult] = await Promise.allSettled([
      API.get(withRange2("/api/google/gsc/summary", r)),
      API.get(withRange2("/api/google/ads/board", r))
    ]);
    if (requestId !== dashboardBoardsRequestSequence || revision !== getRangeRevision()) return false;
    const g = gscResult.status === "fulfilled" ? gscResult.value : null;
    const gError = gscResult.status === "rejected" ? gscResult.reason : null;
    const gt = g && g.totals;
    _t("ov-seo-clicks", gt ? (gt.clicks || 0).toLocaleString() : "\u2014");
    _t("ov-seo-impr", gt ? (gt.impressions || 0).toLocaleString() : "\u2014");
    _t("ov-seo-pos", gt && gt.position != null ? Number(gt.position).toFixed(1) : "\u2014");
    _ovSpark("seoMini", g && g.byDate || [], (x) => +x.clicks || 0, "#2f72e8", gError ? loadFailureText("\u603B\u89C8 SEO", gError) : "");
    const a = adsResult.status === "fulfilled" ? adsResult.value : null;
    const aError = adsResult.status === "rejected" ? adsResult.reason : null;
    const at = a && a.totals;
    _t("ov-sem-cost", at ? _money(at.costMicros) : "\u2014");
    _t("ov-sem-conv", at ? _conv(at.conversions) : "\u2014");
    _t("ov-sem-cpa", at ? _money(at.costPerConversionMicros) : "\u2014");
    _ovSpark("semMini", a && a.series || [], (x) => (x.costMicros || 0) / 1e6, "#7b54e0", aError ? loadFailureText("\u603B\u89C8 SEM", aError) : "");
    _t("ov-seo-range", "GSC \xB7 " + rangeText(r));
    _t("ov-sem-range", "Ads \xB7 " + rangeText(r));
    return true;
  }
  async function loadDiagnostics() {
    let d = null;
    try {
      d = await API.get(withRange2("/api/diagnostics"));
    } catch (e) {
      d = { error: e };
    }
    renderDiagnostics(d);
  }
  function renderDiagnostics(d) {
    const error = d && d.error;
    const seo = d && d.seo || {}, opp = seo.opportunities || [], dec = seo.decay || [], can2 = seo.cannibalization || [];
    _badgeCount("diag-opp-n", opp.length);
    _badgeCount("diag-decay-n", dec.length);
    _badgeCount("diag-cann-n", can2.length);
    const t1 = document.getElementById("diagOppRows");
    if (t1) {
      t1.innerHTML = error ? loadFailureRow(5, "SEO \u673A\u4F1A\u8BCA\u65AD", error) : opp.length ? opp.map((o) => {
        const path = _seoPath(o.page), pos = o.position != null ? Number(o.position).toFixed(1) : "\u2014";
        const q = "\u5173\u952E\u8BCD\u300C" + o.query + "\u300D\u5F53\u524D\u6392\u540D" + pos + "\u3001\u9875\u9762" + path + "\u3001\u533A\u95F4\u66DD\u5149" + (o.impressions || 0) + "\uFF0C\u7ED9\u51FA\u51B2\u8FDBTop10\u7684\u5177\u4F53\u4F18\u5316\u6E05\u5355\uFF08\u6807\u9898/\u5185\u5BB9/\u5185\u94FE/\u5916\u94FE\uFF09\u3002";
        const ti = "\u673A\u4F1A\u8BCD\u51B2\u9996\u9875\uFF1A" + o.query, de = "\u5173\u952E\u8BCD\u300C" + o.query + "\u300D\u5F53\u524D\u6392\u540D" + pos + "\uFF08\u9875\u9762" + path + "\uFF09\uFF0C\u533A\u95F4\u66DD\u5149" + (o.impressions || 0) + "\u3002\u4F18\u5316\u6807\u9898/\u5185\u5BB9/\u5185\u94FE\u51B2\u8FDB Top10\u3002", ev = "GSC\u673A\u4F1A\u8BCD \u6392\u540D" + pos + " \u5C55\u73B0" + (o.impressions || 0) + " \u70B9\u51FB" + (o.clicks || 0);
        return "<tr><td>" + esc(o.query) + '</td><td class="dim csp-s-33ee298127">' + esc(path) + '</td><td class="num"><span class="badge b-amber">' + pos + '</span></td><td class="num">' + (o.impressions || 0).toLocaleString() + '</td><td class="ctr"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u673A\u4F1A\u8BCD\u8BCA\u65AD") + '><i class="ti ti-bulb"></i> \u600E\u4E48\u51B2\u9996\u9875</button> <button type="button" class="btn-mini"' + _adoptActionAttrs("SEO", ti, de, ev) + '><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="dim csp-s-45c174bbec">\u6682\u65E0\u673A\u4F1A\u8BCD \xB7 \u5B8C\u6210 GSC \u540C\u6B65\u540E\u6309\u89C4\u5219\u81EA\u52A8\u8BC6\u522B</td></tr>';
    }
    const t2 = document.getElementById("diagDecayRows");
    if (t2) {
      t2.innerHTML = error ? loadFailureRow(5, "SEO \u8870\u9000\u8BCA\u65AD", error) : dec.length ? dec.map((p) => {
        const path = _seoPath(p.page);
        const posChg = p.positionPrev != null && p.positionCur != null ? Number(p.positionPrev).toFixed(1) + "\u2192" + Number(p.positionCur).toFixed(1) : "\u2014";
        const q = path + " \u70B9\u51FB\u8FD1\u4E00\u7A97\u8DCC" + p.dropPct + "%\uFF08" + p.clicksPrev + "\u2192" + p.clicksCur + "\uFF09\uFF0C\u6392\u540D" + posChg + "\u3002\u7ED9\u51FA\u6392\u67E5\u4E0E\u6B62\u635F\u6B65\u9AA4\u3002";
        const ti = "\u8870\u9000\u6B62\u635F\uFF1A" + path, de = "\u9875\u9762" + path + " \u70B9\u51FB\u73AF\u6BD4\u8DCC" + p.dropPct + "%\uFF08" + p.clicksPrev + "\u2192" + p.clicksCur + "\uFF09\uFF0C\u6392\u540D" + posChg + "\u3002\u6392\u67E5\u539F\u56E0\u5E76\u6B62\u635F\u3002", ev = "GSC\u73AF\u6BD4 \u70B9\u51FB\u2193" + p.dropPct + "% \u6392\u540D" + posChg;
        return '<tr><td class="dim csp-s-33ee298127">' + esc(path) + '</td><td class="num csp-s-b0e08465c2">\u25BC' + p.dropPct + '%</td><td class="num">' + esc(posChg) + '</td><td class="ctr"><span class="badge b-gray">\u9700\u6392\u67E5</span></td><td class="ctr"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u8870\u9000\u6B62\u635F") + '><i class="ti ti-bulb"></i> \u6B62\u635F\u65B9\u6848</button> <button type="button" class="btn-mini"' + _adoptActionAttrs("SEO", ti, de, ev) + '><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="dim csp-s-45c174bbec">\u6682\u65E0\u660E\u663E\u8870\u9000\u9875 \xB7 \u9700\u22652 \u4E2A\u7B49\u957F\u7A97\u53E3\u6570\u636E\u624D\u80FD\u6BD4\u8F83</td></tr>';
    }
    const t3 = document.getElementById("diagCannRows");
    if (t3) {
      t3.innerHTML = error ? loadFailureRow(5, "SEO \u8695\u98DF\u8BCA\u65AD", error) : can2.length ? can2.map((g) => {
        const urls = g.pages.map((p) => esc(_seoPath(p.page))).join("<br>");
        const ranks = g.pages.map((p) => p.position != null ? Number(p.position).toFixed(0) : "\u2014").join(" / ");
        const detail = g.pages.map((p) => _seoPath(p.page) + "(\u6392\u540D" + (p.position != null ? Number(p.position).toFixed(1) : "\u2014") + ")").join("\u3001");
        const q = "\u5173\u952E\u8BCD\u300C" + g.query + "\u300D\u88AB" + g.pages.length + "\u4E2AURL\u540C\u65F6\u7ADE\u4E89\uFF1A" + detail + "\u3002\u7ED9\u51FA\u5408\u5E76\u65B9\u6848\uFF1A\u4FDD\u7559\u54EA\u4E2A\u4E3A\u4E3B\u9875\u3001\u5176\u4F59\u5982\u4F55301\u6216\u6539\u5199\u5DEE\u5F02\u5316\u610F\u56FE\u3001\u5185\u94FE\u600E\u4E48\u8C03\u3002";
        const ti = "\u8695\u98DF\u5408\u5E76\uFF1A" + g.query, de = "\u5173\u952E\u8BCD\u300C" + g.query + "\u300D\u88AB" + g.pages.length + "\u4E2AURL\u7ADE\u4E89\uFF1A" + detail + "\u3002\u5408\u5E76/\u5DEE\u5F02\u5316\u610F\u56FE\u3001\u8C03\u6574\u5185\u94FE\u3002", ev = "GSC " + g.pages.length + "\u9875\u5206\u6563\u6392\u540D " + ranks;
        return "<tr><td>" + esc(g.query) + '</td><td class="dim csp-s-33ee298127">' + urls + '</td><td class="num"><span class="badge b-red">' + esc(ranks) + '</span></td><td class="ctr"><span class="badge b-amber">' + g.pages.length + '\u9875\u62A21\u610F\u56FE</span></td><td class="ctr"><button type="button" class="btn-mini"' + _aiActionAttrs(q, "\u8695\u98DF\u5408\u5E76\u5EFA\u8BAE") + '><i class="ti ti-git-merge"></i> AI \u5408\u5E76\u5EFA\u8BAE</button> <button type="button" class="btn-mini"' + _adoptActionAttrs("SEO", ti, de, ev) + '><i class="ti ti-clipboard-check"></i> \u91C7\u7EB3</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="dim csp-s-45c174bbec">\u6682\u65E0\u8695\u98DF\u7EC4 \xB7 \u5B8C\u6210 GSC \u540C\u6B65\u540E\u6309\u89C4\u5219\u81EA\u52A8\u8BC6\u522B</td></tr>';
    }
  }
  var inqChart = null;
  function _weekStart(dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return formatLocalDate(d);
  }
  function inqSeriesByGran(rows2, gran) {
    const keyOf = (r) => {
      const d = (r.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
      if (gran === "month") return d.slice(0, 7);
      if (gran === "week") return _weekStart(d);
      return d;
    };
    const m = /* @__PURE__ */ new Map();
    (rows2 || []).forEach((r) => {
      const k = keyOf(r);
      if (!k) return;
      if (!m.has(k)) m.set(k, { eff: 0, total: 0 });
      const o = m.get(k);
      o.total++;
      if (r.grade === "A" || r.grade === "B") o.eff++;
    });
    const keys = [...m.keys()].sort();
    const lab = (k) => gran === "month" ? k : k.slice(5);
    return { labels: keys.map(lab), eff: keys.map((k) => m.get(k).eff), total: keys.map((k) => m.get(k).total) };
  }
  window._inqDashboardCache = [];
  var _inqDashboardError = null;
  var dashboardInqRequestSequence = 0;
  async function loadDashboardInq() {
    const requestId = ++dashboardInqRequestSequence, revision = getRangeRevision();
    try {
      const { items } = await API.get(withRange2("/api/inquiries"));
      if (requestId !== dashboardInqRequestSequence || revision !== getRangeRevision()) return false;
      window._inqDashboardCache = items || [];
      _inqDashboardError = null;
    } catch (e) {
      if (requestId !== dashboardInqRequestSequence || revision !== getRangeRevision()) return false;
      window._inqDashboardCache = [];
      _inqDashboardError = e;
    }
    renderInqTrend();
    return true;
  }
  function renderInqTrend() {
    const cv = document.getElementById("inqTrend");
    if (!cv || window.DEMO_MODE) return;
    const rows2 = window._inqDashboardCache || [], gran = window._gran || "day", r = getCurrentRange();
    const sub = document.getElementById("inqTrendSub");
    if (sub) {
      const granLabel = { day: "\u6309\u5929", week: "\u6309\u5468", month: "\u6309\u6708" }[gran] || gran;
      sub.textContent = rangeText(r) + " \xB7 " + granLabel;
    }
    if (inqChart) {
      try {
        inqChart.destroy();
      } catch (e) {
      }
      inqChart = null;
    }
    if (!rows2.length) {
      if (_inqDashboardError) chartEmpty("inqTrend", loadFailureText("\u8BE2\u76D8\u8D8B\u52BF", _inqDashboardError), "\u52A0\u8F7D\u5931\u8D25");
      else chartEmpty("inqTrend");
      return;
    }
    const wrap = cv.closest(".chart-wrap") || cv.parentElement;
    if (wrap) {
      const ce = wrap.querySelector(".chart-empty");
      if (ce) ce.remove();
    }
    cv.style.display = "";
    const s = inqSeriesByGran(rows2, gran);
    inqChart = new Chart(cv, { type: "line", data: { labels: s.labels, datasets: [
      { label: "\u6709\u6548\u8BE2\u76D8", data: s.eff, borderColor: "#15a85a", backgroundColor: "rgba(21,168,90,.1)", fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
      { label: "\u8BE2\u76D8\u603B\u91CF", data: s.total, borderColor: "#9aa1ae", backgroundColor: "rgba(154,161,174,.06)", fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 4, borderWidth: 1.5 }
    ] }, options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      // 鼠标对到 x 轴某天，两条线同时高亮
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, callbacks: { title: (items) => items[0] ? items[0].label : "", label: (ctx) => ctx.dataset.label + "\uFF1A" + ctx.parsed.y } }
        // 6.23 文档 2：悬停显示当日
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    } });
  }
  function charts() {
    Chart.defaults.color = "#9aa1ae";
    Chart.defaults.borderColor = "rgba(128,128,128,.12)";
    Chart.defaults.font.size = 10;
    const wk = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];
    const sp = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } };
    if (window.DEMO_MODE) {
      new Chart(inqTrend, { type: "line", data: { labels: wk, datasets: [{ data: DEMO.inqTrend.a, borderColor: "#15a85a", backgroundColor: "rgba(21,168,90,.1)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }, { data: DEMO.inqTrend.total, borderColor: "#9aa1ae", backgroundColor: "rgba(154,161,174,.06)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
      new Chart(seoMini, { type: "line", data: { labels: wk, datasets: [{ data: DEMO.seoMini, borderColor: "#2f72e8", backgroundColor: "rgba(47,114,232,.1)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }, options: sp });
      new Chart(semMini, { type: "line", data: { labels: wk, datasets: [{ data: DEMO.semMini, borderColor: "#7b54e0", backgroundColor: "rgba(123,84,224,.1)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }, options: sp });
      new Chart(inqDonut, { type: "doughnut", data: { labels: ["A", "B", "C"], datasets: [{ data: [DEMO.inqDonut.a, DEMO.inqDonut.b, DEMO.inqDonut.c], backgroundColor: ["#15a85a", "#2f72e8", "#dfe2e8"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "66%" } });
      new Chart(chanDonut, { type: "doughnut", data: { labels: ["SEO", "SEM", "\u76F4\u63A5", "\u5176\u4ED6"], datasets: [{ data: [DEMO.chanDonut.seo, DEMO.chanDonut.sem, DEMO.chanDonut.direct, DEMO.chanDonut.other], backgroundColor: ["#2f72e8", "#7b54e0", "#0b9d8f", "#ef9514"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "66%" } });
      fillDonutLegendDemo();
    } else {
      ["seoMini", "semMini"].forEach(chartEmpty);
      chartEmpty("inqTrend");
      chartEmpty("inqDonut");
      chartEmpty("chanDonut");
      blankDonutLegend();
    }
    seoFull = seoSeriesFromWeeks();
    const so = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 7 } } } };
    if (document.getElementById("seoBoard")) {
      if (seoFull && seoFull.labels && seoFull.labels.length) seoChart = new Chart(seoBoard, { type: "line", data: buildSeoData(seoFull), options: so });
      else chartEmpty("seoBoard");
    }
  }
  document.addEventListener("timerange", () => {
    loadDashboardInq();
    loadDashboardBoards();
    loadSeoChartRange();
    loadSeoBoardFull();
    loadSemBoardAds();
    loadSemBoardFull();
    loadAttribution();
    loadDiagnostics();
    loadDataFreshness();
  });
  document.addEventListener("granularity", () => {
    rebuildSeoChart();
    renderInqTrend();
  });

  // public/src/inquiries.js
  var REGION_BADGE = { "\u6B27\u6D32": "b-blue", "\u897F\u6B27": "b-blue", "\u5357\u6B27": "b-blue", "\u5317\u6B27": "b-blue", "\u4E2D\u4E1C\u6B27": "b-teal", "\u4E1C\u6B27/\u4FC4\u7F57\u65AF": "b-amber", "\u4FC4\u7F57\u65AF": "b-amber", "\u5317\u7F8E": "b-purple", "\u62C9\u7F8E": "b-red", "\u4E2D\u4E1C": "b-amber", "\u5317\u975E": "b-amber", "\u6492\u54C8\u62C9\u4EE5\u5357\u975E\u6D32": "b-gray", "\u5357\u4E9A": "b-teal", "\u4E1C\u5357\u4E9A": "b-red", "\u4E1C\u5357\u4E9A/\u5DF4\u897F": "b-red", "\u4E1C\u4E9A": "b-green", "\u4E2D\u4E9A": "b-gray", "\u5927\u6D0B\u6D32": "b-teal", "\u5176\u4ED6": "b-gray" };
  var CH_BADGE = { "SEO\u81EA\u7136": "b-blue", "SEM\u4ED8\u8D39": "b-purple", "\u76F4\u63A5": "b-teal", "\u5176\u4ED6": "b-gray" };
  var PROD_BADGE = { "\u94F8\u9020": "b-amber", "\u953B\u9020": "b-red", "\u673A\u52A0\u5DE5": "b-blue", "\u9600\u95E8": "b-purple", "\u7BA1\u4EF6": "b-teal", "\u7535\u529B\u91D1\u5177": "b-green" };
  var GRADE_BADGE = { A: "b-green", B: "b-blue", C: "b-gray" };
  var DEAL_BADGE = { "\u5DF2\u6210\u4EA4": "b-green", "\u672A\u6210\u4EA4": "b-gray" };
  var COMPANY_BADGE = { "\u8D1D\u5B5A\u7279": "b-teal", "\u8D39\u5C14\u745E": "b-purple" };
  window._inqCache = [];
  function openInquiry() {
    document.getElementById("f-date").value = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    ["f-country", "f-code", "f-sales", "f-source", "f-note"].forEach((i) => document.getElementById(i).value = "");
    document.getElementById("f-deal").value = "\u672A\u6210\u4EA4";
    document.getElementById("f-company").value = "";
    openModal("inqMask");
  }
  async function submitInquiry() {
    const g = (id) => document.getElementById(id).value.trim();
    const rec = {
      date: document.getElementById("f-date").value || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      customer_code: g("f-code"),
      // 录入改版：客户编码（可选，取代客户姓名）
      company: g("f-company"),
      salesperson: g("f-sales"),
      deal_status: g("f-deal"),
      // 公司 / 业务员 / 是否成交
      country: g("f-country") || "\u{1F3F3}\uFE0F \u672A\u586B",
      region: g("f-region"),
      channel: g("f-channel"),
      source: g("f-source") || "\u5F85\u8865",
      product: g("f-product"),
      grade: g("f-grade"),
      note: g("f-note")
    };
    try {
      const { item } = await API.post("/api/inquiries", rec);
      closeModal("inqMask");
      await loadInquiries();
      loadDashboardInq();
      if (window._curTab === "inquiry") {
        try {
          renderGlobe();
        } catch (e) {
        }
      }
      toast("\u5DF2\u4FDD\u5B58 1 \u6761\u8BE2\u76D8\uFF08" + item.grade + "\u7EA7\uFF09\xB7 \u5DF2\u5165\u5E93\uFF0C\u591A\u4EBA\u5171\u4EAB");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u5F55\u5165\uFF08\u9700\u767B\u5F55\u8FD0\u8425\u8D26\u53F7\uFF1A\u674E/\u9648/\u4E3B\u7BA1/\u8001\u677F\uFF09" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }
  function isUpgraded(r) {
    const ord = { A: 3, B: 2, C: 1 };
    return r.original_grade && ord[r.original_grade] && ord[r.grade] && ord[r.original_grade] < ord[r.grade];
  }
  var _trackEditing = null;
  function openTrack(tr) {
    const id = tr && tr.dataset.id;
    if (!id) return;
    const it = (window._inqCache || []).find((x) => String(x.id) === String(id));
    if (!it) return;
    _trackEditing = it;
    document.getElementById("track-cust").textContent = it.customer_code || it.customer_name || it.country || "#" + it.id;
    document.getElementById("track-text").value = it.tracking_feedback || "";
    openModal("trackMask");
    setTimeout(() => document.getElementById("track-text").focus(), 50);
  }
  async function submitTrack() {
    if (!_trackEditing) return;
    const text2 = document.getElementById("track-text").value.trim();
    try {
      await API.patch("/api/inquiries/" + _trackEditing.id, { tracking_feedback: text2 });
      _trackEditing.tracking_feedback = text2;
      const tr = document.querySelector('.inq-tb tr[data-id="' + _trackEditing.id + '"]');
      const cell2 = tr && tr.querySelector(".inq-track-feedback");
      if (cell2) cell2.innerHTML = trackCellHtml(_trackEditing);
      closeModal("trackMask");
      toast("\u5DF2\u4FDD\u5B58\u8DDF\u8E2A\u53CD\u9988");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || ""));
    }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".inq-tb .track-cell");
    if (!t) return;
    const tr = t.closest("tr");
    if (tr) openTrack(tr);
  });
  function trackCellHtml(r) {
    const has = (r.tracking_feedback || "").trim();
    if (has) {
      const short = has.length > 15 ? has.slice(0, 15) + "\u2026" : has;
      return `<span class="track-cell" title="${esc(has)}"><i class="ti ti-message-2"></i>${esc(short)}</span>`;
    }
    return `<span class="track-cell track-empty"><i class="ti ti-plus"></i>\u53CD\u9988</span>`;
  }
  function inqRowHtml(r) {
    const up = isUpgraded(r);
    const upMark = up ? ` <i class="ti ti-alert-triangle csp-s-d6508e1886" title="\u7B49\u7EA7\u5DF2\u4E0A\u8C03\uFF08\u539F ${esc(r.original_grade)} \u2192 \u73B0 ${esc(r.grade)}\uFF09 \xB7 \u91CD\u70B9\u5904\u7406"></i>` : "";
    return `<td>${esc(r.date.slice(5))}</td><td class="editable" contenteditable data-field="customer_code">${esc(r.customer_code || "")}</td><td>${esc(r.country)}</td><td class="ctr"><span class="badge ${REGION_BADGE[r.region] || "b-gray"}">${esc(r.region)}</span></td><td class="ctr"><span class="tagselect ${CH_BADGE[r.channel] || "b-gray"}" data-kind="channel">${esc(r.channel)}<i class="ti ti-chevron-down"></i></span></td><td>${esc(r.source)}</td><td class="ctr"><span class="tagselect ${PROD_BADGE[r.product] || "b-gray"}" data-kind="product">${esc(r.product)}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><span class="tagselect ${GRADE_BADGE[r.grade] || "b-gray"}" data-kind="grade">${esc(r.grade)}<i class="ti ti-chevron-down"></i></span>${upMark}</td><td class="ctr"><span class="tagselect ${COMPANY_BADGE[r.company] || "b-gray"}" data-kind="company">${esc(r.company || "\u672A\u6807\u6CE8")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr editable" contenteditable data-field="salesperson">${esc(r.salesperson || "")}</td><td class="ctr"><span class="tagselect ${DEAL_BADGE[r.deal_status] || "b-gray"}" data-kind="deal">${esc(r.deal_status || "\u672A\u6807\u8BB0")}<i class="ti ti-chevron-down"></i></span></td><td class="dim csp-s-33ee298127">${esc(r.note || "")}</td><td class="ctr inq-track-feedback">${trackCellHtml(r)}</td><td class="ctr"><button class="btn-mini inq-del csp-s-7ee38adc7c" title="\u5220\u9664\uFF08\u5F52\u6863\u5230\u5F52\u6863\u9875\uFF09"><i class="ti ti-trash"></i></button></td>`;
  }
  function monthLabel(ym) {
    const p = ym.split("-");
    return p[0] + "\u5E74" + +p[1] + "\u6708";
  }
  function latestVisibleMonth() {
    return (window._inqCache || []).reduce((latest, row) => row && /^\d{4}-\d{2}-\d{2}$/.test(row.date || "") && row.date.slice(0, 7) > latest ? row.date.slice(0, 7) : latest, "");
  }
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".inq-tb .inq-del");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr && tr.dataset.id;
    if (!id) return;
    if (!inlineConfirm(btn, "\u786E\u8BA4\u5220\u9664")) return;
    try {
      await API.del("/api/inquiries/" + id);
      await loadInquiries();
      loadDashboardInq();
      if (window._curTab === "archive") {
        try {
          loadArchive();
        } catch (_) {
        }
      }
      toast("\u5DF2\u5220\u9664 \xB7 \u5DF2\u5F52\u6863\u5230\u300C\u5F52\u6863\u300D\u9875");
    } catch (err) {
      toast(err && err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u5220\u9664\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
  });
  function renderInqList() {
    const tb = document.getElementById("tb-inq");
    if (!tb) return;
    tb.innerHTML = "";
    const latestMonth = latestVisibleMonth();
    const rows2 = (window._inqCache || []).filter((r) => r && r.date && r.date.slice(0, 7) !== latestMonth).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    if (!rows2.length) {
      tb.innerHTML = '<tr><td colspan="14" class="dim csp-s-d48bfa87bb">\u6240\u9009\u533A\u95F4\u6682\u65E0\u66F4\u65E9\u6708\u4EFD\u8BE2\u76D8</td></tr>';
      return;
    }
    const groups = [];
    const idx = {};
    rows2.forEach((r) => {
      const ym = r.date.slice(0, 7);
      if (idx[ym] == null) {
        idx[ym] = groups.length;
        groups.push({ ym, items: [] });
      }
      groups[idx[ym]].items.push(r);
    });
    groups.forEach((g) => {
      const sep = document.createElement("tr");
      sep.className = "inq-msep collapsed";
      sep.dataset.month = g.ym;
      sep.innerHTML = `<td colspan="14" class="inq-month-toggle"><i class="ti ti-chevron-down hicon"></i> ${esc(monthLabel(g.ym))} <span class="dim csp-s-8bde36d0d6">\xB7 ${g.items.length} \u6761</span></td>`;
      sep.querySelector(".inq-month-toggle").addEventListener("click", (e) => toggleInqMonth(e.currentTarget));
      tb.appendChild(sep);
      g.items.forEach((r) => {
        const tr = document.createElement("tr");
        tr.className = "inq-mrow" + (isUpgraded(r) ? " inq-upgraded" : "");
        tr.dataset.month = g.ym;
        if (r.id) {
          tr.dataset.id = r.id;
          tr.dataset.ep = "/api/inquiries";
        }
        tr.style.display = "none";
        tr.innerHTML = inqRowHtml(r);
        tb.appendChild(tr);
      });
    });
  }
  function toggleInqMonth(td2) {
    const sep = td2.closest("tr");
    if (!sep) return;
    sep.classList.toggle("collapsed");
    const hidden = sep.classList.contains("collapsed");
    let n = sep.nextElementSibling;
    while (n && !n.classList.contains("inq-msep")) {
      if (n.classList.contains("inq-mrow")) n.style.display = hidden ? "none" : "";
      n = n.nextElementSibling;
    }
  }
  function refreshInqStats(stats) {
    if (stats) window._inqStats = stats;
  }
  function renderInqFeed() {
    const tb = document.getElementById("tb-inq-cur");
    if (!tb) return;
    tb.innerHTML = "";
    const latestMonth = latestVisibleMonth();
    const rows2 = (window._inqCache || []).filter((r) => r && r.date && r.date.slice(0, 7) === latestMonth).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    const cnt = document.getElementById("inqFeedCount");
    if (cnt) cnt.textContent = rows2.length ? monthLabel(latestMonth) + " \xB7 " + rows2.length + " \u6761" : "\u6240\u9009\u533A\u95F4\u6682\u65E0";
    if (!rows2.length) {
      tb.innerHTML = '<tr><td colspan="14" class="dim csp-s-651d52088e">\u6240\u9009\u533A\u95F4\u6682\u65E0\u8BE2\u76D8</td></tr>';
      return;
    }
    const p = latestMonth.split("-");
    const sep = document.createElement("tr");
    sep.className = "inq-msep";
    sep.dataset.month = latestMonth;
    sep.innerHTML = `<td colspan="14" class="inq-month-toggle"><i class="ti ti-chevron-down hicon"></i> ${p[0]}\u5E74${+p[1]}\u6708 <span class="dim csp-s-8bde36d0d6">\xB7 ${rows2.length} \u6761</span><span class="badge b-green csp-s-4b17347c23">\u533A\u95F4\u6700\u65B0</span></td>`;
    sep.querySelector(".inq-month-toggle").addEventListener("click", (e) => toggleInqMonth(e.currentTarget));
    tb.appendChild(sep);
    rows2.forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = "inq-mrow" + (isUpgraded(r) ? " inq-upgraded" : "");
      tr.dataset.month = latestMonth;
      if (r.id) {
        tr.dataset.id = r.id;
        tr.dataset.ep = "/api/inquiries";
      }
      tr.innerHTML = inqRowHtml(r);
      tb.appendChild(tr);
    });
  }

  // public/src/tagselect.js
  var OPT = {
    channel: [["SEO\u81EA\u7136", "b-blue"], ["SEM\u4ED8\u8D39", "b-purple"], ["\u76F4\u63A5", "b-teal"], ["\u5176\u4ED6", "b-gray"]],
    product: [["\u94F8\u9020", "b-amber"], ["\u953B\u9020", "b-red"], ["\u673A\u52A0\u5DE5", "b-blue"], ["\u9600\u95E8", "b-purple"], ["\u7BA1\u4EF6", "b-teal"], ["\u7535\u529B\u91D1\u5177", "b-green"]],
    status: [["\u5F85\u5F00\u59CB", "b-gray"], ["\u8FDB\u884C\u4E2D", "b-amber"], ["\u5DF2\u5B8C\u6210", "b-green"]],
    result: [["\u5DF2\u6539", "b-green"], ["\u8FDB\u884C\u4E2D", "b-amber"], ["\u8BA1\u5212\u4E0B\u5468", "b-blue"], ["\u653E\u5F03", "b-gray"]],
    grade: [["A", "b-green"], ["B", "b-blue"], ["C", "b-gray"]],
    // 6.23 文档 8：询盘等级 tagselect 可点改
    deal: [["\u5DF2\u6210\u4EA4", "b-green"], ["\u672A\u6210\u4EA4", "b-gray"]],
    // 录入改版：询盘是否成交，点一下切换
    company: [["\u8D1D\u5B5A\u7279", "b-teal"], ["\u8D39\u5C14\u745E", "b-purple"]],
    // 录入改版：询价通过哪个主体来的
    owner: [["\u674E", "b-blue"], ["\u9648", "b-purple"]],
    dept: [["SEO", "b-blue"], ["SEM", "b-purple"]],
    match: [["\u5B8C\u5168\u5339\u914D", "b-green"], ["\u8BCD\u7EC4\u5339\u914D", "b-blue"], ["\u5E7F\u6CDB\u5339\u914D", "b-amber"]],
    comp: [["\u4F4E (10-30)", "b-green"], ["\u4E2D (30-60)", "b-amber"], ["\u9AD8 (60-90)", "b-red"]],
    kwtype: [["\u5546\u4E1A\u8C03\u67E5\u578B", "b-purple"], ["\u4FE1\u606F\u578B", "b-blue"], ["\u4EA4\u6613\u578B", "b-green"]],
    intent: [["\u4FE1\u606F\u578B", "b-blue"], ["\u5546\u4E1A\u8C03\u7814\u578B", "b-purple"], ["\u4EA4\u6613\u578B", "b-green"], ["\u5BFC\u822A\u578B", "b-teal"], ["\u89C4\u683C/\u6807\u51C6\u578B", "b-amber"], ["\u7075\u611F/\u6848\u4F8B\u578B", "b-red"]],
    optstatus: [["\u672A\u4F18\u5316", "b-red"], ["\u4F18\u5316\u4E2D", "b-amber"], ["\u5DF2\u4F18\u5316", "b-green"]],
    priority: [["\u6700\u9AD8", "b-red"], ["\u9AD8", "b-amber"], ["\u4E2D", "b-blue"], ["\u6301\u7EED", "b-gray"]],
    campaign: [["FERR-\u7403\u94C1-\u5FB7\u56FD", "b-purple"], ["FERR-\u6309\u56FE-\u7F8E\u56FD", "b-purple"], ["Bafaw-\u9600\u95E8-\u897F\u8BED", "b-teal"]],
    adgroup: [["\u5E7F\u544A\u7EC4 \u25BE", "b-gray"]],
    kw: [["\u5173\u952E\u8BCD \u25BE", "b-gray"]],
    negmatch: [["\u7CBE\u786E", "b-green"], ["\u8BCD\u7EC4", "b-blue"], ["\u5E7F\u6CDB", "b-amber"]],
    negstatus: [["\u751F\u6548", "b-green"], ["\u89C2\u5BDF", "b-amber"], ["\u5DF2\u79FB\u9664", "b-gray"]],
    adstatus: [["\u91C7\u7528\u4E2D", "b-green"], ["\u6D4B\u8BD5\u4E2D", "b-amber"], ["\u5DF2\u5F03\u7528", "b-gray"]]
  };
  var menu = document.getElementById("selMenu");
  var curSel = null;
  document.addEventListener("click", (e) => {
    const ts = e.target.closest(".tagselect");
    if (ts) {
      curSel = ts;
      const kind = ts.dataset.kind;
      const opts = OPT[kind] || [];
      const r = ts.getBoundingClientRect();
      menu.innerHTML = opts.map((o) => `<div class="opt" data-v="${o[0]}" data-c="${o[1]}"><span class="badge ${o[1]}">${o[0]}</span></div>`).join("");
      menu.style.display = "flex";
      menu.style.left = Math.min(r.left, window.innerWidth - 160) + "px";
      menu.style.top = r.bottom + 4 + "px";
      return;
    }
    if (e.target.closest("#selMenu")) {
      const o = e.target.closest(".opt");
      if (o && curSel) {
        curSel.className = "tagselect " + o.dataset.c;
        curSel.innerHTML = o.dataset.v + '<i class="ti ti-chevron-down"></i>';
        persistTagChange(curSel, o.dataset.v);
      }
      menu.style.display = "none";
      return;
    }
    menu.style.display = "none";
  });
  async function persistTagChange(el, value) {
    const kind = el.dataset.kind;
    const tr = el.closest("tr");
    const id = tr && tr.dataset.id;
    if (!id) return;
    if (tr.dataset.kwType) {
      const attrKey = { comp: "comp", optstatus: "optstatus", match: "match", priority: "priority", intent: "searchIntent" }[kind];
      if (!attrKey) return;
      try {
        await API.patch("/api/keywords/" + id, { attrs: { [attrKey]: value } });
      } catch (err) {
        toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
      return;
    }
    const ep = tr.dataset.ep;
    if (!ep) return;
    const fieldMap = {
      negmatch: "match_type",
      negstatus: "status",
      adstatus: "status",
      match: "match_type",
      priority: "priority",
      owner: "owner",
      status: "status",
      result: "status",
      dept: "dept",
      grade: "grade",
      deal: "deal_status",
      company: "company"
    };
    const field2 = fieldMap[kind];
    if (!field2) return;
    try {
      await API.patch(ep + "/" + id, { [field2]: value });
      if (ep === "/api/inquiries") {
        const it = (window._inqCache || []).find((x) => String(x.id) === String(id));
        if (it) {
          it[field2] = value;
          if (field2 === "grade" && tr) {
            tr.querySelectorAll("td[contenteditable][data-field]").forEach((td2) => {
              it[td2.dataset.field] = td2.innerText.trim();
            });
            tr.innerHTML = inqRowHtml(it);
            tr.classList.toggle("inq-upgraded", isUpgraded(it));
          }
        }
      }
      if (ep === "/api/loop-items" && kind === "status" && value === "\u5DF2\u5B8C\u6210" && (tr.querySelector('[data-field="content"]') || {}).innerText) {
        const dept = tr.querySelector('[data-kind="dept"]');
        const isSem = tr.closest("#tb-plan-sem") != null;
        const ak = isSem ? "sem" : "seo";
        await API.post(ep + "/" + id + "/archive", { archive_kind: ak });
        tr.remove();
        toast("\u5DF2\u5B8C\u6210 \xB7 \u5DF2\u81EA\u52A8\u5F52\u6863");
      }
    } catch (err) {
      toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
  }

  // public/src/editable.js
  function validateEditableValue(raw, type, opts) {
    opts = opts || {};
    if (type === "number") {
      const s = String(raw == null ? "" : raw).trim();
      if (s === "") return { ok: false, msg: opts.emptyMsg || "KPI \u76EE\u6807\u503C\u4E0D\u80FD\u4E3A\u7A7A" };
      if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, msg: "\u8BF7\u8F93\u5165\u6709\u6548\u6570\u5B57" };
      const value2 = Number(s);
      if (!Number.isFinite(value2)) return { ok: false, msg: "\u8BF7\u8F93\u5165\u6709\u6548\u6570\u5B57" };
      if (opts.min != null && value2 < opts.min) return { ok: false, msg: opts.minMsg || "KPI \u76EE\u6807\u503C\u4E0D\u80FD\u4E3A\u8D1F\u6570" };
      return { ok: true, value: value2 };
    }
    const value = String(raw == null ? "" : raw).trim();
    if (opts.nonempty && value === "") return { ok: false, msg: opts.emptyMsg || "\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" };
    return { ok: true, value };
  }
  function setSavingState(el, state) {
    if (!el) return;
    el.classList.remove("kpi-saving", "kpi-ok", "kpi-error");
    if (state === "saving") el.classList.add("kpi-saving");
    else if (state === "ok") {
      el.classList.add("kpi-ok");
      setTimeout(() => el.classList.remove("kpi-ok"), 1200);
    } else if (state === "error") {
      el.classList.add("kpi-error");
      setTimeout(() => el.classList.remove("kpi-error"), 2e3);
    }
  }
  function rollbackEditable(el, oldValue) {
    if (el) el.textContent = oldValue == null ? "" : String(oldValue);
  }
  function showSaveError(el, msg) {
    setSavingState(el, "error");
    toast(msg);
  }
  function placeCaretEnd(el) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) {
    }
  }

  // public/src/keywords.js
  var KW_TB = { seo: "tb-kw-seo", sem: "tb-kw-sem", high: "tb-kw-high", customer: "tb-kw-cust" };
  var KW_PAGE_OPTS = [10, 20, 50, 100, 200, 300];
  var _kwPage = { seo: 0, sem: 0, high: 0, customer: 0 };
  var _kwSize = { seo: 20, sem: 20, high: 20, customer: 20 };
  try {
    const saved = JSON.parse(localStorage.getItem("ferr:kwSize") || "null");
    if (saved && typeof saved === "object") {
      ["seo", "sem", "high", "customer"].forEach((t) => {
        if (KW_PAGE_OPTS.includes(saved[t])) _kwSize[t] = saved[t];
      });
    }
  } catch (e) {
  }
  function clsOf(kind, val) {
    const o = (OPT[kind] || []).find((x) => x[0] === val);
    return o ? o[1] : "b-gray";
  }
  function kwRow(type, r) {
    const a = r.attrs || {};
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    tr.dataset.kwType = type;
    tr.dataset.cat = r.category || "";
    const aiBtn = '<button class="btn-mini kw-ai"><i class="ti ti-bulb"></i> \u5206\u6790\u610F\u56FE</button>';
    const del = '<button class="btn-mini kw-del csp-s-7ee38adc7c" title="\u5220\u9664"><i class="ti ti-trash"></i></button>';
    const ev = (v) => v == null ? "" : v;
    const ed = (attr, val) => `<td class="editable" contenteditable data-attr="${attr}">${esc(ev(val))}</td>`;
    const ct = `<td class="dim csp-s-4a01f70563">${esc((r.created_at || "").slice(0, 10))}</td>`;
    if (type === "seo") {
      tr.innerHTML = ct + `<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td><td class="ctr"><span class="tagselect ${clsOf("intent", a.searchIntent)}" data-kind="intent">${esc(a.searchIntent || "\u9009\u610F\u56FE")}<i class="ti ti-chevron-down"></i></span></td>` + ed("gradeText", a.gradeText) + ed("volume", a.volume) + ed("gscRank", a.gscRank) + ed("landing", a.landing) + ed("spark", a.spark) + `<td class="ctr"><span class="tagselect ${clsOf("comp", a.comp)}" data-kind="comp">${esc(a.comp || "\u4E2D (30-60)")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><span class="tagselect ${clsOf("optstatus", a.optstatus)}" data-kind="optstatus">${esc(a.optstatus || "\u4F18\u5316\u4E2D")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr">${aiBtn} ${del}</td>`;
    } else if (type === "sem") {
      tr.innerHTML = ct + `<td class="editable" contenteditable data-cat="1">${esc(r.category || "")}</td><td class="editable kw-name" contenteditable>${esc(r.keyword)}</td><td class="ctr"><span class="tagselect ${clsOf("intent", a.searchIntent)}" data-kind="intent">${esc(a.searchIntent || "\u9009\u610F\u56FE")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><span class="tagselect ${clsOf("match", a.match)}" data-kind="match">${esc(a.match || "\u8BCD\u7EC4\u5339\u914D")}<i class="ti ti-chevron-down"></i></span></td>` + ed("landing", a.landing) + `<td class="ctr"><span class="tagselect ${clsOf("priority", a.priority)}" data-kind="priority">${esc(a.priority || "\u9AD8")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr">${aiBtn} ${del}</td>`;
    } else if (type === "high") {
      tr.innerHTML = ct + `<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>` + ed("ktype", a.ktype) + ed("channel", a.channel) + ed("inquiry", a.inquiry) + ed("gradeText", a.gradeText) + `<td class="ctr">${aiBtn} ${del}</td>`;
    } else {
      tr.innerHTML = ct + `<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>` + ed("sourceCustomer", a.sourceCustomer) + ed("mapped", a.mapped) + `<td class="ctr">${aiBtn} ${del}</td>`;
    }
    return tr;
  }
  document.addEventListener("focusin", (e) => {
    const c = e.target.closest && e.target.closest("#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]");
    if (c) c._old = c.innerText;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const c = e.target.closest && e.target.closest("#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]");
      if (c) {
        e.preventDefault();
        c.blur();
      }
    }
  });
  document.addEventListener("focusout", async (e) => {
    const c = e.target.closest && e.target.closest("#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]");
    if (!c) return;
    const tr = c.closest("tr");
    if (!tr || !tr.dataset.id) return;
    const val = c.innerText.trim();
    const oldVal = c._old != null ? c._old : c.innerText;
    if (val === String(oldVal).trim()) return;
    const isCat = c.dataset.cat != null;
    const body = isCat ? { category: val } : { attrs: { [c.dataset.attr]: val } };
    try {
      await API.patch("/api/keywords/" + tr.dataset.id, body);
      c._old = val;
      if (isCat) {
        tr.dataset.cat = val;
        renderCatTabs(tr.dataset.kwType);
      }
    } catch (err) {
      rollbackEditable(c, oldVal);
      toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539\uFF0C\u5DF2\u6062\u590D\u65E7\u503C" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
    }
  });
  function renderCatTabs(type) {
    if (type !== "seo" && type !== "sem") return;
    const sub = document.getElementById(type === "seo" ? "sub-kw-seo" : "sub-kw-sem");
    const box = sub && sub.querySelector(".cat-tabs");
    const tb = document.getElementById(KW_TB[type]);
    if (!box || !tb) return;
    const active = (box.querySelector(".cat-tab.active") || {}).textContent;
    const cats = [...new Set([...tb.querySelectorAll("tr")].map((tr) => tr.dataset.cat).filter(Boolean))];
    box.innerHTML = '<span class="cat-tab cat-all">\u5168\u90E8</span>' + cats.map((c) => `<span class="cat-tab">${esc(c)}</span>`).join("") + '<span class="cat-tab add"><i class="ti ti-plus"></i> \u65B0\u5EFA\u5206\u7C7B</span>';
    const keep = [...box.querySelectorAll(".cat-tab")].find((x) => x.textContent.trim() === (active || "").trim()) || box.querySelector(".cat-all");
    keep.classList.add("active");
    filterKwByCat(type, keep.classList.contains("cat-all") ? null : keep.textContent.trim());
  }
  function filterKwByCat(type, cat) {
    _kwPage[type] = 0;
    applyKwPaging(type);
  }
  function applyKwPaging(type) {
    const tb = document.getElementById(KW_TB[type]);
    if (!tb) return;
    const cat = type === "seo" || type === "sem" ? activeCat(type) : null;
    const all = [...tb.querySelectorAll("tr")];
    const rows2 = all.filter((tr) => !cat || tr.dataset.cat === cat);
    const size = _kwSize[type] || 20, total = rows2.length, pages = Math.max(1, Math.ceil(total / size));
    let p = _kwPage[type] || 0;
    if (p > pages - 1) p = pages - 1;
    if (p < 0) p = 0;
    _kwPage[type] = p;
    all.forEach((tr) => tr.style.display = "none");
    rows2.slice(p * size, (p + 1) * size).forEach((tr) => tr.style.display = "");
    renderKwPager(type, p, pages, total);
  }
  function renderKwPager(type, p, pages, total) {
    const tb = document.getElementById(KW_TB[type]);
    if (!tb) return;
    const card = tb.closest(".card") || (tb.closest("table") || {}).parentNode;
    if (!card) return;
    let pg = card.querySelector(".kw-pager");
    if (!pg) {
      pg = document.createElement("div");
      pg.className = "kw-pager";
      card.appendChild(pg);
    }
    const sizeSel = `<select class="kw-pg-size" data-kwsize="${type}" title="\u6BCF\u9875\u6761\u6570">${KW_PAGE_OPTS.map((n) => `<option value="${n}"${n === _kwSize[type] ? " selected" : ""}>${n}/\u9875</option>`).join("")}</select>`;
    if (pages <= 1) {
      pg.innerHTML = (total ? `<span class="kw-pg-info">\u5171 ${total} \u6761</span>` : '<span class="kw-pg-info">\u6682\u65E0\u6570\u636E</span>') + sizeSel;
      return;
    }
    let btns = "";
    for (let i = 0; i < pages; i++) {
      btns += `<button class="kw-pg${i === p ? " active" : ""}" data-kwpg="${type}" data-pg="${i}">${i + 1}</button>`;
    }
    pg.innerHTML = `<button class="kw-pg" data-kwpg="${type}" data-pg="${p - 1}"${p === 0 ? " disabled" : ""}>\u2039</button>${btns}<button class="kw-pg" data-kwpg="${type}" data-pg="${p + 1}"${p === pages - 1 ? " disabled" : ""}>\u203A</button><span class="kw-pg-info">\u5171 ${total} \u6761 \xB7 \u7B2C ${p + 1}/${pages} \u9875</span>${sizeSel}`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kwpg]");
    if (!b || b.disabled) return;
    const type = b.dataset.kwpg;
    const pg = parseInt(b.dataset.pg, 10);
    if (isNaN(pg)) return;
    _kwPage[type] = pg;
    applyKwPaging(type);
  });
  document.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-kwsize]");
    if (!sel) return;
    const type = sel.dataset.kwsize;
    const n = parseInt(sel.value, 10);
    if (!KW_PAGE_OPTS.includes(n)) return;
    _kwSize[type] = n;
    _kwPage[type] = 0;
    try {
      localStorage.setItem("ferr:kwSize", JSON.stringify(_kwSize));
    } catch (e2) {
    }
    applyKwPaging(type);
  });
  function activeCat(type) {
    const sub = document.getElementById(type === "seo" ? "sub-kw-seo" : type === "sem" ? "sub-kw-sem" : null);
    const t = sub && sub.querySelector(".cat-tab.active");
    if (!t || t.classList.contains("cat-all") || t.classList.contains("add")) return null;
    return t.textContent.trim();
  }
  async function loadKeywords() {
    try {
      const { items } = await API.get("/api/keywords");
      const byType = { seo: [], sem: [], high: [], customer: [] };
      (items || []).forEach((r) => {
        if (byType[r.type]) byType[r.type].push(r);
      });
      Object.keys(KW_TB).forEach((t) => {
        const tb = document.getElementById(KW_TB[t]);
        if (!tb) return;
        tb.innerHTML = "";
        byType[t].forEach((r) => tb.appendChild(kwRow(t, r)));
      });
      renderSparklines();
      renderCatTabs("seo");
      renderCatTabs("sem");
      applyKwPaging("high");
      applyKwPaging("customer");
    } catch (e) {
      if (e && e.message !== "unauthorized") {
        Object.keys(KW_TB).forEach((t) => {
          const tb = document.getElementById(KW_TB[t]);
          if (tb) tb.innerHTML = "";
        });
        toast("\u5173\u952E\u8BCD\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "\u672A\u77E5\u9519\u8BEF"));
      }
    }
  }
  async function addKeyword(type) {
    try {
      const category = activeCat(type);
      const { item } = await API.post("/api/keywords", { type, keyword: "\u65B0\u5173\u952E\u8BCD", attrs: {}, category });
      const tb = document.getElementById(KW_TB[type]);
      if (tb) {
        const tr = kwRow(type, item);
        tb.appendChild(tr);
        renderSparklines();
        if (type === "seo" || type === "sem") renderCatTabs(type);
        _kwPage[type] = 1e9;
        applyKwPaging(type);
        const c = tr.querySelector(".kw-name");
        if (c) {
          c.focus();
          placeCaretEnd(c);
        }
      }
      toast("\u5DF2\u52A0\u4E00\u884C \xB7 \u76F4\u63A5\u5728\u8868\u683C\u91CC\u6539");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }
  function inlineConfirm(btn, label) {
    if (!btn) return true;
    if (btn.dataset.confirm === "1") {
      clearTimeout(btn._t);
      btn.dataset.confirm = "";
      if (btn.dataset.old != null) btn.innerHTML = btn.dataset.old;
      btn.classList.remove("confirming");
      return true;
    }
    btn.dataset.confirm = "1";
    if (btn.dataset.old == null) btn.dataset.old = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-alert-triangle"></i> ' + (label || "\u786E\u8BA4");
    btn.classList.add("confirming");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.dataset.confirm = "";
      if (btn.dataset.old != null) btn.innerHTML = btn.dataset.old;
      btn.classList.remove("confirming");
    }, 3e3);
    return false;
  }
  async function kwDelete(tr, btn) {
    if (!tr || !tr.dataset.id) return;
    if (btn && btn.dataset.confirm !== "1") {
      btn.dataset.confirm = "1";
      if (!btn.dataset.old) btn.dataset.old = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-alert-triangle"></i> \u786E\u8BA4\u5220\u9664';
      btn.classList.add("confirming");
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.dataset.confirm = "";
        btn.innerHTML = btn.dataset.old;
        btn.classList.remove("confirming");
      }, 3e3);
      return;
    }
    if (btn) clearTimeout(btn._t);
    try {
      const type = tr.dataset.kwType;
      await API.del("/api/keywords/" + tr.dataset.id);
      tr.remove();
      if (type === "seo" || type === "sem") renderCatTabs(type);
      else applyKwPaging(type);
      toast("\u5DF2\u5220\u9664 \xB7 \u5DF2\u5165\u5E93");
    } catch (e) {
      if (btn) {
        btn.dataset.confirm = "";
        btn.innerHTML = btn.dataset.old;
        btn.classList.remove("confirming");
      }
      toast(e.status === 403 ? "\u65E0\u6743\u5220\u9664\uFF08\u8BE5\u8BCD\u5E93\u975E\u4F60\u8D1F\u8D23\uFF09" : "\u5220\u9664\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
  }
  document.addEventListener("click", (e) => {
    const ai = e.target.closest(".kw-ai");
    if (ai) {
      const tr = ai.closest("tr");
      const n = tr.querySelector(".kw-name");
      const kw = (n ? n.textContent : tr.cells[0].textContent).trim();
      runAiAnalysis(ai, "\u5206\u6790\u5173\u952E\u8BCD\u300C" + kw + "\u300D\u7684\u641C\u7D22\u610F\u56FE\u4E0E\u843D\u5730\u5EFA\u8BAE", "\u300C" + kw + "\u300D\u610F\u56FE", false);
      return;
    }
    const del = e.target.closest(".kw-del");
    if (del) {
      kwDelete(del.closest("tr"), del);
      return;
    }
  });
  document.addEventListener("focusin", (e) => {
    const cell2 = e.target.closest && e.target.closest(".kw-name");
    if (cell2) cell2.dataset.kwOld = cell2.textContent;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cell2 = e.target.closest && e.target.closest(".kw-name");
      if (cell2) {
        e.preventDefault();
        cell2.blur();
      }
    }
  });
  document.addEventListener("focusout", async (e) => {
    const cell2 = e.target.closest && e.target.closest(".kw-name");
    if (!cell2) return;
    const tr = cell2.closest("tr");
    if (!tr || !tr.dataset.id) return;
    const oldVal = cell2.dataset.kwOld != null ? cell2.dataset.kwOld : cell2.textContent;
    const vr = validateEditableValue(cell2.textContent, "text", { nonempty: true, emptyMsg: "\u5173\u952E\u8BCD\u4E0D\u80FD\u4E3A\u7A7A" });
    if (!vr.ok) {
      rollbackEditable(cell2, oldVal);
      showSaveError(cell2, vr.msg);
      return;
    }
    const v = vr.value;
    if (v === String(oldVal).trim()) {
      cell2.textContent = v;
      setSavingState(cell2, null);
      return;
    }
    setSavingState(cell2, "saving");
    try {
      await API.patch("/api/keywords/" + tr.dataset.id, { keyword: v });
      cell2.textContent = v;
      cell2.dataset.kwOld = v;
      setSavingState(cell2, "ok");
      toast("\u5DF2\u66F4\u65B0\u5173\u952E\u8BCD \xB7 \u5DF2\u5165\u5E93");
    } catch (err) {
      rollbackEditable(cell2, oldVal);
      showSaveError(cell2, err.status === 403 ? "\u65E0\u6743\u9650\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
    }
  });

  // public/src/sop.js
  var sop_exports = {};
  __export(sop_exports, {
    buildSopOverdueList: () => buildSopOverdueList,
    isOverduePeriodFirstDay: () => isOverduePeriodFirstDay,
    isSopWritable: () => isSopWritable,
    loadSops: () => loadSops,
    loadUrgent: () => loadUrgent,
    openSopModal: () => openSopModal,
    refreshNavTaskDot: () => refreshNavTaskDot,
    renderSopCards: () => renderSopCards,
    renderSopOverdueBanner: () => renderSopOverdueBanner,
    renderSopSettingsTable: () => renderSopSettingsTable,
    renderUrgentBanner: () => renderUrgentBanner,
    sopCardEl: () => sopCardEl,
    sopPeriodKey: () => sopPeriodKey,
    submitSop: () => submitSop,
    updateSopCounts: () => updateSopCounts
  });
  function sopPeriodKey(freq) {
    const d = /* @__PURE__ */ new Date();
    d.setHours(0, 0, 0, 0);
    if (freq === "monthly") {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0");
      return y + "-" + m;
    }
    if (freq === "weekly") {
      const tmp = new Date(d);
      tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
      const yearStart = new Date(tmp.getFullYear(), 0, 1);
      const week = Math.ceil(((tmp - yearStart) / 864e5 + 1) / 7);
      return tmp.getFullYear() + "-W" + String(week).padStart(2, "0");
    }
    return formatLocalDate(d);
  }
  window._sops = [];
  window._sopDone = { daily: /* @__PURE__ */ new Set(), weekly: /* @__PURE__ */ new Set(), monthly: /* @__PURE__ */ new Set() };
  var FREQ_LABEL = { daily: "\u6BCF\u65E5\u5FC5\u505A", weekly: "\u6BCF\u5468\u5FC5\u505A", monthly: "\u6BCF\u6708\u5FC5\u505A" };
  var FREQ_TAG = { daily: "\u65E5", weekly: "\u5468", monthly: "\u6708" };
  async function loadSops() {
    try {
      const { items } = await API.get("/api/sop");
      window._sops = items || [];
    } catch (e) {
      window._sops = [];
      if (e && e.message !== "unauthorized") toast("SOP \u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || ""));
    }
    try {
      const q = "daily=" + encodeURIComponent(sopPeriodKey("daily")) + "&weekly=" + encodeURIComponent(sopPeriodKey("weekly")) + "&monthly=" + encodeURIComponent(sopPeriodKey("monthly"));
      const { items } = await API.get("/api/sop/completions?" + q);
      window._sopDone = { daily: /* @__PURE__ */ new Set(), weekly: /* @__PURE__ */ new Set(), monthly: /* @__PURE__ */ new Set() };
      const keyToFreq = { [sopPeriodKey("daily")]: "daily", [sopPeriodKey("weekly")]: "weekly", [sopPeriodKey("monthly")]: "monthly" };
      (items || []).forEach((c) => {
        const f = keyToFreq[c.period_key];
        if (f) window._sopDone[f].add(c.sop_id);
      });
    } catch (e) {
    }
    renderSopCards();
    renderSopSettingsTable();
    updateSopCounts();
    renderSopOverdueBanner();
    refreshNavTaskDot();
  }
  function renderSopCards() {
    ["SEM", "SEO", "\u516C\u53F8"].forEach((dept) => {
      const anchor = document.getElementById(dept === "\u516C\u53F8" ? "sop-company" : "sop-" + dept.toLowerCase());
      if (!anchor) return;
      const list = window._sops.filter((s) => s.dept === dept);
      anchor.innerHTML = '<div class="colcap"><i class="ti ti-pin"></i> SOP \u56FA\u5B9A\u4EFB\u52A1</div>';
      if (!list.length) {
        anchor.insertAdjacentHTML("beforeend", '<div class="sop-empty-hint csp-s-fec2a1b122">\u6682\u65E0 SOP\uFF0C\u53BB\u300C\u8BBE\u7F6E \xB7 SOP \u8BBE\u7F6E\u300D\u6DFB\u52A0</div>');
        return;
      }
      const box = document.createElement("div");
      box.className = "sop-list";
      ["daily", "weekly", "monthly"].forEach((freq) => {
        list.filter((s) => s.freq === freq).forEach((s) => box.appendChild(sopCardEl(s)));
      });
      anchor.appendChild(box);
    });
  }
  function sopCardEl(s) {
    const done = window._sopDone[s.freq] && window._sopDone[s.freq].has(s.id);
    const row = document.createElement("div");
    row.className = "tcard" + (done ? " done" : "");
    row.dataset.sopId = s.id;
    row.dataset.sopFreq = s.freq;
    const due = s.time_hint ? `<span class="tdue"><i class="ti ti-clock"></i> ${esc(s.time_hint)}</span>` : "";
    row.innerHTML = `<span class="tcheck${done ? " on" : ""}">${done ? '<i class="ti ti-check"></i>' : ""}</span><span class="sop-text">${esc(s.title)}</span><span class="sop-right">${due}<span class="freq-tag" title="${esc(FREQ_LABEL[s.freq] || "")}">${esc(FREQ_TAG[s.freq] || "")}</span></span>`;
    row.querySelector(".tcheck").addEventListener("click", (e) => window.chk(e.currentTarget));
    return row;
  }
  function updateSopCounts() {
    [["SEM", "sem", "\u65B0\u589E"], ["SEO", "seo", "\u65B0\u589E"], ["\u516C\u53F8", "company", "\u6D3E\u53D1"]].forEach(([dept, key, verb]) => {
      const el = document.getElementById("kcount-" + key);
      if (!el) return;
      const sopN = window._sops.filter((s) => s.dept === dept).length;
      const addCol = document.getElementById("newtask-" + key);
      const addN = addCol ? addCol.querySelectorAll(".tcard:not(.subtask)").length : 0;
      el.textContent = "SOP " + sopN + " \xB7 " + verb + " " + addN;
    });
  }
  function isSopWritable() {
    const r = (window.ME || {}).role;
    return r === "manager" || r === "boss";
  }
  function renderSopSettingsTable() {
    const tb = document.getElementById("tb-sop");
    if (!tb) return;
    const addBtn = document.getElementById("sop-add-btn");
    const writable = isSopWritable();
    if (addBtn) addBtn.style.display = writable ? "" : "none";
    tb.innerHTML = "";
    const list = window._sops;
    if (!list.length) {
      const e2 = document.getElementById("sop-empty");
      if (e2) e2.style.display = "block";
      return;
    }
    const e = document.getElementById("sop-empty");
    if (e) e.style.display = "none";
    list.forEach((s) => {
      const tr = document.createElement("tr");
      tr.dataset.sopId = s.id;
      const ops = writable ? `<button class="btn-mini sop-edit"><i class="ti ti-edit"></i></button> <button class="btn-mini sop-del csp-s-b0e08465c2"><i class="ti ti-trash"></i></button>` : '<span class="dim csp-s-33ee298127">\u53EA\u8BFB</span>';
      tr.innerHTML = `<td>${esc(s.dept)}</td><td>${esc(FREQ_LABEL[s.freq] || s.freq)}</td><td>${esc(s.title)}</td><td class="dim csp-s-33ee298127">${esc(s.content || "")}</td><td>${esc(s.time_hint || "")}</td><td class="ctr">${ops}</td>`;
      tb.appendChild(tr);
    });
  }
  var _sopEditing = null;
  function openSopModal(sop) {
    if (!isSopWritable()) {
      toast("\u4EC5\u7ECF\u7406 / \u8001\u677F\u53EF\u7F16\u8F91 SOP");
      return;
    }
    _sopEditing = sop || null;
    document.getElementById("sop-mod-title").textContent = sop ? "\u7F16\u8F91 SOP" : "\u65B0\u589E SOP";
    document.getElementById("sop-dept").value = sop ? sop.dept : "SEM";
    document.getElementById("sop-freq").value = sop ? sop.freq : "daily";
    document.getElementById("sop-title").value = sop ? sop.title : "";
    document.getElementById("sop-content").value = sop ? sop.content || "" : "";
    document.getElementById("sop-time").value = sop ? sop.time_hint || "" : "";
    openModal("sopMask");
    setTimeout(() => document.getElementById("sop-title").focus(), 50);
  }
  async function submitSop() {
    const dept = document.getElementById("sop-dept").value;
    const freq = document.getElementById("sop-freq").value;
    const title = document.getElementById("sop-title").value.trim();
    const content = document.getElementById("sop-content").value.trim();
    const time_hint = document.getElementById("sop-time").value.trim();
    if (!title) {
      toast("\u8BF7\u586B\u5199\u6807\u9898");
      return;
    }
    try {
      if (_sopEditing) {
        await API.patch("/api/sop/" + _sopEditing.id, { dept, freq, title, content, time_hint });
        toast("\u5DF2\u66F4\u65B0 SOP");
      } else {
        await API.post("/api/sop", { dept, freq, title, content, time_hint });
        toast("\u5DF2\u65B0\u589E SOP");
      }
      closeModal("sopMask");
      await loadSops();
    } catch (e) {
      toast(e && e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF08\u4EC5\u7ECF\u7406/\u8001\u677F\uFF09" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || ""));
    }
  }
  document.addEventListener("click", async (e) => {
    const edit = e.target.closest(".sop-edit");
    const del = e.target.closest(".sop-del");
    if (!edit && !del) return;
    const tr = (edit || del).closest("tr");
    const id = tr && tr.dataset.sopId;
    if (!id) return;
    if (edit) {
      const s = window._sops.find((x) => String(x.id) === String(id));
      if (s) openSopModal(s);
      return;
    }
    if (del) {
      if (!inlineConfirm(del, "\u786E\u8BA4\u505C\u7528")) return;
      try {
        await API.del("/api/sop/" + id);
        toast("\u5DF2\u505C\u7528");
        await loadSops();
      } catch (err) {
        toast(err && err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF08\u4EC5\u7ECF\u7406/\u8001\u677F\uFF09" : "\u64CD\u4F5C\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
    }
  });
  function isOverduePeriodFirstDay(freq) {
    const now = /* @__PURE__ */ new Date();
    const h = now.getHours();
    if (h < 8) return false;
    if (freq === "daily") return true;
    if (freq === "weekly") return now.getDay() === 1;
    if (freq === "monthly") return now.getDate() === 1;
    return false;
  }
  function buildSopOverdueList() {
    const today3 = formatLocalDate(/* @__PURE__ */ new Date()).replace(/-/g, ".").replace(/^\d{4}\./, "");
    const lines = [];
    ["daily", "weekly", "monthly"].forEach((freq) => {
      if (!isOverduePeriodFirstDay(freq)) return;
      (window._sops || []).forEach((s) => {
        if (s.freq !== freq) return;
        const done = window._sopDone[freq] && window._sopDone[freq].has(s.id);
        if (done) return;
        lines.push(esc(s.dept) + "-" + today3 + "-" + esc(FREQ_LABEL[freq] || freq) + "\uFF1A" + esc(s.title) + " \u4EFB\u52A1\u672A\u505A\uFF0C\u8BF7\u53CA\u65F6\u5904\u7406\u3002");
      });
    });
    return lines;
  }
  function renderSopOverdueBanner() {
    const box = document.getElementById("sop-overdue-banner");
    const list = document.getElementById("sop-overdue-list");
    if (!box || !list) return;
    const lines = buildSopOverdueList();
    if (!lines.length) {
      box.style.display = "none";
      list.innerHTML = "";
      return;
    }
    box.style.display = "flex";
    list.innerHTML = lines.map((l) => "<div>" + l + "</div>").join("");
  }
  window._urgentTasks = [];
  async function loadUrgent() {
    try {
      const { items } = await API.get("/api/loop-items?urgent=1");
      window._urgentTasks = (items || []).filter((it) => {
        const st = it.state || "";
        const ss = it.status || "";
        return st !== "done" && ss !== "done";
      });
    } catch (e) {
      window._urgentTasks = [];
    }
    renderUrgentBanner();
    refreshNavTaskDot();
  }
  function renderUrgentBanner() {
    const box = document.getElementById("urgent-banner");
    const list = document.getElementById("urgent-list");
    if (!box || !list) return;
    const arr = window._urgentTasks || [];
    if (!arr.length) {
      box.style.display = "none";
      list.innerHTML = "";
      return;
    }
    box.style.display = "flex";
    list.innerHTML = arr.map((it) => {
      const due = it.task_date ? "\uFF08\u622A\u6B62 " + esc(it.task_date) + "\uFF09" : "";
      return "<div>" + esc(it.content || "") + due + "</div>";
    }).join("");
  }
  function refreshNavTaskDot() {
    const dot = document.getElementById("nav-tasks-dot");
    if (!dot) return;
    const overdue = buildSopOverdueList().length > 0;
    const urgent = (window._urgentTasks || []).length > 0;
    dot.classList.toggle("is-hidden", !(overdue || urgent));
  }

  // public/src/closed-loop.js
  var _2 = (n) => String(n).padStart(2, "0");
  var today = () => {
    const d = /* @__PURE__ */ new Date();
    return _2(d.getMonth() + 1) + "-" + _2(d.getDate());
  };
  function futureDate(days) {
    return formatLocalDate(new Date(Date.now() + days * 864e5));
  }
  function flashRow(tr) {
    tr.style.transition = "background .25s";
    tr.style.background = "var(--green-soft)";
    setTimeout(() => tr.style.background = "", 1700);
  }
  function prepend(tbId, html) {
    const tb = document.getElementById(tbId);
    if (!tb) return null;
    const state = tb.querySelector("tr[data-load-state]");
    if (state) state.remove();
    const tr = document.createElement("tr");
    tr.innerHTML = html;
    tb.insertBefore(tr, tb.firstChild);
    flashRow(tr);
    return tr;
  }
  function grabText(btn) {
    const it = btn.closest(".ai-item");
    if (it) {
      const b = it.querySelector(".body");
      return (b ? b.innerText : it.innerText).trim();
    }
    const rf = btn.closest(".rowflex");
    if (rf) {
      const s = rf.querySelector("span");
      return s ? s.innerText.trim() : "";
    }
    const cell2 = btn.closest(".review-grid>div");
    if (cell2) return cell2.innerText.trim();
    return "";
  }
  function scopeDept(btn, txt) {
    const head = (txt || "").slice(0, 8);
    let d = null;
    if (/SEM/i.test(head)) d = "SEM";
    else if (/SEO/i.test(head)) d = "SEO";
    if (!d) {
      const sp = btn.closest(".subpanel");
      if (sp && /sem/i.test(sp.id)) d = "SEM";
      else if (sp && /seo/i.test(sp.id)) d = "SEO";
    }
    if (!d) {
      const box = btn.closest(".ai-box");
      if (box && box.classList.contains("purple")) d = "SEM";
      else if (box && box.classList.contains("blue")) d = "SEO";
    }
    if (!d) {
      const card = btn.closest(".card");
      const t = card && card.querySelector(".card-title");
      if (t && /SEM/.test(t.textContent)) d = "SEM";
      else if (t && /SEO/.test(t.textContent)) d = "SEO";
    }
    if (!d) d = "SEO";
    return d === "SEM" ? { dept: "SEM", owner: "\u9648", c: "b-purple" } : { dept: "SEO", owner: "\u674E", c: "b-blue" };
  }
  function clip(s, n) {
    return s.length > n ? s.slice(0, n) + "\u2026" : s;
  }
  function addDeposit(s, text2, act) {
    const ac = act === "\u91C7\u7EB3" ? "b-green" : "b-teal";
    prepend("tb-dep", `<td class="num">${today()}</td><td class="ctr"><span class="badge ${s.c}">${esc(s.dept)}\u8BCA\u65AD</span></td><td>${esc(text2)}</td><td class="dim csp-s-33ee298127"></td><td class="ctr"><span class="badge ${ac}">${esc(act)}</span></td>`);
  }
  function fixRowHtml(f) {
    const dept = f.dept === "SEM" ? "SEM" : "SEO";
    const c = dept === "SEM" ? "b-purple" : "b-blue";
    const owner = f.owner || (dept === "SEM" ? "\u9648" : "\u674E");
    const oc = owner === "\u9648" ? "b-purple" : "b-blue";
    const RES = ["\u5DF2\u6539", "\u8FDB\u884C\u4E2D", "\u8BA1\u5212\u4E0B\u5468", "\u653E\u5F03"];
    const status = RES.includes(f.status) ? f.status : "\u8BA1\u5212\u4E0B\u5468";
    return `<td class="fix-title editable" contenteditable data-field="title">${esc(f.title || "")}</td><td class="fix-dept ctr"><span class="tagselect ${c}" data-kind="dept">${esc(dept)}<i class="ti ti-chevron-down"></i></span></td><td class="fix-evidence editable dim csp-s-33ee298127" contenteditable data-field="evidence">${esc(f.evidence || "")}</td><td class="fix-detail editable" contenteditable data-field="detail">${esc(f.detail || "")}</td><td class="fix-owner ctr"><span class="tagselect ${oc}" data-kind="owner">${esc(owner)}<i class="ti ti-chevron-down"></i></span></td><td class="fix-date"><input type="date" class="cell-date" data-field="due_date" value="${ymd(f.due_date)}"></td><td class="fix-result ctr"><span class="tagselect b-blue" data-kind="result">${esc(status)}<i class="ti ti-chevron-down"></i></span></td><td class="fix-actions ctr">${fixPlanHtml(f)} <button class="btn-mini row-dep" title="\u6C89\u6DC0\u5230\u6C89\u6DC0\u8868"><i class="ti ti-database-heart"></i> \u6C89\u6DC0</button> <button class="btn-mini row-archive csp-s-b0e08465c2" title="\u5F52\u6863"><i class="ti ti-archive"></i> \u5F52\u6863</button></td>`;
  }
  function fixPlanHtml(f) {
    if (f && f.planned_done) return `<span class="badge b-green row-plan-go csp-s-9463ff4798" title="\u65E5\u8BA1\u5212\u91CC\u5DF2\u5B8C\u6210\uFF0C\u70B9\u51FB\u67E5\u770B">\u5DF2\u505A\u5B8C</span>`;
    if (f && f.planned_task_id) return `<button class="btn-mini row-plan-go" title="\u5DF2\u5728\u65E5\u8BA1\u5212\u91CC\uFF0C\u70B9\u51FB\u67E5\u770B"><i class="ti ti-calendar-check"></i> \u5DF2\u6392</button>`;
    return `<button class="btn-mini row-plan" title="\u6392\u8FDB\u8D1F\u8D23\u4EBA\u7684\u65E5\u8BA1\u5212"><i class="ti ti-calendar-plus"></i> \u6392\u5165</button>`;
  }
  document.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-loop-action]");
    if (action) {
      const kind = action.dataset.loopAction;
      if (kind === "check") chk(action);
      else if (kind === "task-defer") taskDefer(action);
      else if (kind === "task-drop") taskDrop(action);
      else if (kind === "task-split") openSubtaskModal(action);
      else if (kind === "task-delete") taskDel(action);
      else if (kind === "task-edit") openTaskEdit(action);
      else if (kind === "task-push") taskPush(action);
      else if (kind === "deposit-delete") depDel(action);
      else if (kind === "content-delete") contentDel(action);
      else if (kind === "ai-action") aiAct(action, action.dataset.kind);
      return;
    }
    const jump = e.target.closest(".row-plan-go");
    if (jump) {
      go("planning");
      if (typeof setPlanningTab === "function") setPlanningTab("daily");
      return;
    }
    const btn = e.target.closest(".row-plan");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr && tr.dataset.id;
    if (!id) return;
    btn.disabled = true;
    try {
      const { item, existed } = await API.post("/api/fixes/" + id + "/plan", { start_date: formatLocalDate(/* @__PURE__ */ new Date()) });
      const tag = tr.querySelector('[data-kind="result"]');
      if (tag && tag.firstChild && !/已改|放弃/.test(tag.textContent)) tag.firstChild.nodeValue = "\u8FDB\u884C\u4E2D";
      btn.outerHTML = fixPlanHtml({ planned_task_id: item.id });
      if (!existed && document.getElementById("newtask-sem")) {
        addTaskCard(item.dept === "\u516C\u53F8" ? coScope() : sFromDept(item.dept), item.content, item);
        refreshTaskCols();
        updateSopCounts();
      }
      toastGo(existed ? "\u8FD9\u6761\u5DF2\u7ECF\u5728\u65E5\u8BA1\u5212\u91CC\u4E86" : "\u5DF2\u6392\u8FDB" + (item.owner || item.dept || "") + "\u7684\u65E5\u8BA1\u5212", "planning");
    } catch (err) {
      btn.disabled = false;
      toast(err && err.status === 409 ? "\u8BE5\u6574\u6539\u9879\u5DF2\u5F52\u6863\uFF0C\u4E0D\u80FD\u518D\u6392" : persistFailMsg(err));
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".src-fix")) return;
    go("action");
    if (typeof setActionTab === "function") setActionTab("fix");
  });
  function bindFixRow(tr, f) {
    if (tr && f && f.id) {
      tr.dataset.id = f.id;
      tr.dataset.ep = "/api/fixes";
    }
    return tr;
  }
  function addFixFromObj(f) {
    return bindFixRow(prepend("tb-fix", fixRowHtml(f)), f);
  }
  function bindLoopRow(tr, it) {
    if (tr && it && it.id) {
      tr.dataset.id = it.id;
      tr.dataset.ep = "/api/loop-items";
    }
    return tr;
  }
  function addTest(s, content, it) {
    it = it || {};
    const id = s.dept === "SEM" ? "tb-test-sem" : "tb-test-seo";
    return bindLoopRow(prepend(id, `<td class="editable" contenteditable data-field="content">${esc(content || it.content || "")}</td><td class="editable" contenteditable data-field="hypothesis">${esc(it.hypothesis || "")}</td><td class="editable" contenteditable data-field="variable">${esc(it.variable || "")}</td><td><input type="date" class="cell-date" data-field="period" value="${ymd((it.period || "").split("~")[0])}"> ~ <input type="date" class="cell-date" data-field="period" value="${ymd((it.period || "").split("~")[1])}"></td><td class="editable" contenteditable data-field="conclusion">${esc(it.conclusion || "")}</td><td class="ctr"><button class="btn-mini row-dep" title="\u6C89\u6DC0\u5230\u6C89\u6DC0\u8868"><i class="ti ti-database-heart"></i> \u6C89\u6DC0</button> <button class="btn-mini row-archive csp-s-b0e08465c2" title="\u5F52\u6863"><i class="ti ti-archive"></i></button></td>`), it);
  }
  function addPlan(s, content, it) {
    it = it || {};
    const id = s.dept === "SEM" ? "tb-plan-sem" : "tb-plan-seo";
    const status = it.status || "\u5F85\u5F00\u59CB";
    return bindLoopRow(prepend(id, `<td class="editable" contenteditable data-field="content">${esc(content || it.content || "")}</td><td class="editable" contenteditable data-field="hypothesis">${esc(it.hypothesis || "")}</td><td class="editable" contenteditable data-field="metric">${esc(it.metric || "")}</td><td class="editable" contenteditable data-field="due_or_budget">${esc(it.due_or_budget || "")}</td><td class="ctr"><span class="tagselect b-gray" data-kind="status">${esc(status)}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><button class="btn-mini row-archive csp-s-b0e08465c2" title="\u5F52\u6863"><i class="ti ti-archive"></i></button></td>`), it);
  }
  function coScope() {
    return { dept: "\u516C\u53F8", owner: "", c: "b-red" };
  }
  function taskColFor(dept) {
    return document.getElementById(dept === "\u516C\u53F8" ? "newtask-company" : dept === "SEM" ? "newtask-sem" : "newtask-seo");
  }
  var TASK_GROUPS = [["overdue", "\u903E\u671F"], ["today", "\u4ECA\u65E5"], ["doing", "\u8FDB\u884C\u4E2D"], ["later", "\u7A0D\u540E"]];
  function taskGroupOf(it) {
    const t = formatLocalDate(/* @__PURE__ */ new Date());
    const due = it && it.task_date || "", st = it && it.start_date || "";
    if (due && due < t) return "overdue";
    if (st && st > t) return "later";
    if (due && due > t) return st ? "doing" : "later";
    return "today";
  }
  function taskGroupEl(col, g) {
    let el = col.querySelector(':scope > .tgroup[data-g="' + g + '"]');
    if (el) return el;
    const label = (TASK_GROUPS.find((x) => x[0] === g) || [, g])[1];
    el = document.createElement("div");
    el.className = "tgroup";
    el.dataset.g = g;
    el.innerHTML = `<div class="tgroup-cap">${esc(label)} <span class="n"></span></div>`;
    const order = TASK_GROUPS.map((x) => x[0]);
    const after = [...col.querySelectorAll(":scope > .tgroup")].find((x) => order.indexOf(x.dataset.g) > order.indexOf(g)) || col.querySelector(".donefold") || col.querySelector(".add-task");
    if (after) col.insertBefore(el, after);
    else col.appendChild(el);
    return el;
  }
  function addTaskCard(s, content, it) {
    const col = taskColFor(s.dept);
    if (!col) return null;
    const item = Object.assign({}, it || {});
    item.content = content || item.content || "";
    const done = !!(item.state === "done" || item.status === "done");
    const isCoParent = s.dept === "\u516C\u53F8";
    const card = document.createElement("div");
    card.className = "tcard" + (isCoParent ? " cotask" : "") + (done ? " done" : "");
    if (item.id) card.dataset.id = item.id;
    card._item = item;
    card._scope = s;
    card.innerHTML = `<div class="ttitle"><span class="tcheck${done ? " on" : ""}" data-loop-action="check">${done ? '<i class="ti ti-check"></i>' : ""}</span>${esc(item.content)}</div><div class="tmeta"></div>`;
    if (isCoParent) {
      const box = document.createElement("div");
      box.className = "subtasks";
      card.appendChild(box);
    }
    renderTaskMeta(card);
    placeTaskCard(card);
    return card;
  }
  function renderTaskMeta(card) {
    const it = card._item || {}, s = card._scope || {}, box = card.querySelector(".tmeta");
    if (!box) return;
    const isCo = card.classList.contains("cotask"), g = taskGroupOf(it);
    const deptBadge = isCo ? `<span class="badge ${s.c || "b-gray"}">${esc(s.dept || "")}</span>` : "";
    const srcBadge = it.fix_id ? `<span class="badge b-amber src-fix" title="\u6765\u81EA\u6574\u6539\u6E05\u5355 \xB7 \u70B9\u51FB\u67E5\u770B\u4F9D\u636E">\u6574\u6539</span>` : "";
    const note = it.note ? `<span class="tnote">${esc(it.note)}</span>` : "";
    const ops = g === "overdue" && it.id ? `<button type="button" class="btn-mini task-defer" data-loop-action="task-defer" title="\u987A\u5EF6\u5230\u4ECA\u5929"><i class="ti ti-calendar-plus"></i></button><button type="button" class="btn-mini task-drop" data-loop-action="task-drop" title="\u653E\u5F03\u5E76\u5F52\u6863"><i class="ti ti-archive"></i></button>` : "";
    const push = taskPushHtml(it, g);
    const split = isCo ? `<button type="button" class="btn-mini cotask-split" data-loop-action="task-split"><i class="ti ti-git-branch"></i> \u5206\u53D1</button>` : "";
    const del = it.id ? `<button type="button" class="btn-mini csp-task-delete ${isCo || ops || push ? "csp-task-delete-spaced" : "csp-task-delete-pushed"}" data-loop-action="task-delete"><i class="ti ti-trash"></i></button>` : "";
    box.innerHTML = deptBadge + srcBadge + note + taskDueHtml(it) + taskAgeHtml(it, g) + push + ops + split + del;
  }
  function taskDueHtml(it) {
    const due = it.task_date || "", st = it.start_date || "", hr = it.task_hour || "";
    const span = st && due && st < due;
    const short = (d) => st.slice(0, 4) === due.slice(0, 4) ? d.slice(5) : d;
    const txt = span ? short(st) + " ~ " + short(due) : due;
    const time = hr ? (txt ? " " : "") + hr + ":00" : "";
    const empty = !txt && !time;
    if (empty && !it.id) return "";
    const cls = "tdue" + (empty ? " tdue-none" : "") + (it.id ? " task-edit" : "");
    const attrs = it.id ? ` data-loop-action="task-edit" title="${span ? esc(st + " ~ " + due) + " \xB7 " : ""}\u70B9\u51FB\u6539\u671F"` : "";
    return `<span class="${cls}"${attrs}><i class="ti ${empty ? "ti-calendar-plus" : "ti-clock"}"></i> ${empty ? "\u8BBE\u65E5\u671F" : esc(txt) + esc(time)}</span>`;
  }
  var dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 864e5);
  function taskAgeHtml(it, g) {
    const t = formatLocalDate(/* @__PURE__ */ new Date());
    if (g === "overdue" && it.task_date) {
      const n = dayDiff(it.task_date, t);
      return `<span class="tage tage-over">\u903E\u671F ${n} \u5929</span>`;
    }
    if (g === "doing" && it.start_date && it.task_date) {
      const total = dayDiff(it.start_date, it.task_date) + 1, cur = dayDiff(it.start_date, t) + 1;
      const ck = taskCheckin(it.id);
      const pushed = ck.days ? ` \xB7 \u5DF2\u63A8\u8FDB ${ck.days} \u5929` : "";
      const idle = !ck.today && (ck.last ? dayDiff(ck.last, t) >= 2 : dayDiff(it.start_date, t) >= 2);
      return `<span class="tage${idle ? " tage-idle" : ""}">\u7B2C ${cur}/${total} \u5929${pushed}</span>`;
    }
    return "";
  }
  var taskCheckins = /* @__PURE__ */ new Map();
  function taskCheckin(id) {
    return taskCheckins.get(Number(id)) || { days: 0, last: "", today: false };
  }
  function taskPushHtml(it, g) {
    if (!it.id || !it.start_date || !it.task_date || it.start_date >= it.task_date) return "";
    if (g !== "doing" && g !== "overdue") return "";
    const on = taskCheckin(it.id).today;
    return `<button type="button" class="btn-mini task-push${on ? " on" : ""}" data-loop-action="task-push" title="${on ? "\u4ECA\u5929\u5DF2\u8BB0\u63A8\u8FDB\uFF0C\u70B9\u4E00\u4E0B\u64A4\u9500" : "\u8BB0\u4E00\u7B14\uFF1A\u4ECA\u5929\u63A8\u8FDB\u4E86\u8FD9\u6761"}"><i class="ti ti-${on ? "check" : "player-track-next"}"></i> ${on ? "\u4ECA\u65E5\u5DF2\u63A8\u8FDB" : "\u63A8\u8FDB"}</button>`;
  }
  async function taskPush(btn) {
    const card = btn.closest(".tcard");
    const it = card && card._item;
    if (!it || !it.id) return;
    const day = formatLocalDate(/* @__PURE__ */ new Date());
    const cur = taskCheckin(it.id);
    const on = cur.today;
    btn.disabled = true;
    try {
      if (on) {
        await API.del("/api/task-checkins/" + it.id + "?day_key=" + encodeURIComponent(day));
        const days = Math.max(0, cur.days - 1);
        taskCheckins.set(Number(it.id), { days, last: days ? cur.last : "", today: false });
        toast("\u5DF2\u64A4\u9500\u4ECA\u65E5\u63A8\u8FDB \xB7 \u5DF2\u5165\u5E93");
      } else {
        await API.post("/api/task-checkins", { loop_item_id: it.id, day_key: day });
        taskCheckins.set(Number(it.id), { days: cur.days + 1, last: day, today: true });
        toast("\u5DF2\u8BB0\u4ECA\u65E5\u63A8\u8FDB \xB7 \u5DF2\u5165\u5E93");
      }
      renderTaskMeta(card);
    } catch (e) {
      btn.disabled = false;
      toast(persistFailMsg(e));
    }
  }
  async function loadTaskCheckins(isCurrent = () => true) {
    const nextCheckins = /* @__PURE__ */ new Map();
    try {
      const { items } = await API.get("/api/task-checkins/summary?day=" + encodeURIComponent(formatLocalDate(/* @__PURE__ */ new Date())));
      if (!isCurrent()) return null;
      (items || []).forEach((r) => nextCheckins.set(Number(r.loop_item_id), { days: r.days || 0, last: r.last_day || "", today: !!r.today_done }));
      taskCheckins = nextCheckins;
      return null;
    } catch (e) {
      if (!isCurrent()) return null;
      taskCheckins = /* @__PURE__ */ new Map();
      if (e && e.message !== "unauthorized") toast("\u4EFB\u52A1\u63A8\u8FDB\u8BB0\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "\u672A\u77E5\u9519\u8BEF"));
      return e;
    }
  }
  function placeTaskCard(card) {
    const s = card._scope || {}, col = taskColFor(s.dept);
    if (!col) return;
    const g = taskGroupOf(card._item || {});
    card.classList.toggle("t-overdue", g === "overdue");
    if (s.dept === "\u516C\u53F8") {
      const anchor = col.querySelector(".donefold") || col.querySelector(".add-task");
      if (anchor) col.insertBefore(card, anchor);
      else col.appendChild(card);
      return;
    }
    taskGroupEl(col, g).appendChild(card);
  }
  function taskDefer(btn) {
    const card = btn.closest(".tcard");
    const it = card && card._item;
    if (!it || !it.id) return;
    const t = formatLocalDate(/* @__PURE__ */ new Date());
    const body = { task_date: t };
    if (!it.start_date || it.start_date > t) body.start_date = t;
    API.patch("/api/loop-items/" + it.id, body).then(({ item }) => {
      Object.assign(it, item || body);
      renderTaskMeta(card);
      placeTaskCard(card);
      refreshTaskCols();
      toast("\u5DF2\u987A\u5EF6\u5230\u4ECA\u5929 \xB7 \u5DF2\u5165\u5E93");
    }).catch((e) => toast(persistFailMsg(e)));
  }
  function taskDrop(btn) {
    const card = btn.closest(".tcard");
    const it = card && card._item;
    if (!it || !it.id) return;
    if (!inlineConfirm(btn, "\u786E\u8BA4\u653E\u5F03")) return;
    const dept = (card._scope || {}).dept || it.dept;
    const ak = dept === "\u516C\u53F8" ? "company" : dept === "SEM" ? "sem" : "seo";
    API.post("/api/loop-items/" + it.id + "/archive", { archive_kind: ak }).then(() => {
      card.remove();
      refreshTaskCols();
      updateSopCounts();
      toastGo("\u5DF2\u653E\u5F03 \xB7 \u5F52\u6863\u7559\u75D5", "archive");
    }).catch((e) => toast(persistFailMsg(e)));
  }
  function subOwnerBadge(owner) {
    return owner === "\u9648" ? "b-purple" : "b-blue";
  }
  function addSubTaskCard(parentCard, it) {
    if (!parentCard) return null;
    let box = parentCard.querySelector(".subtasks");
    if (!box) {
      box = document.createElement("div");
      box.className = "subtasks";
      parentCard.appendChild(box);
    }
    const done = !!(it && (it.state === "done" || it.status === "done"));
    const card = document.createElement("div");
    card.className = "tcard subtask" + (done ? " done" : "");
    if (it && it.id) card.dataset.id = it.id;
    const owner = it && it.owner || "\u674E";
    const oc = subOwnerBadge(owner);
    const del = it && it.id ? `<button type="button" class="btn-mini" data-loop-action="task-delete"><i class="ti ti-trash"></i></button>` : "";
    const dt = it && it.task_date || "", hr = it && it.task_hour || "";
    const due = dt || hr ? `<span class="tdue"><i class="ti ti-clock"></i> ${esc(dt)}${hr ? (dt ? " " : "") + esc(hr) + ":00" : ""}</span>` : "";
    card.innerHTML = `<div class="ttitle"><span class="tcheck${done ? " on" : ""}" data-loop-action="check">${done ? '<i class="ti ti-check"></i>' : ""}</span><span class="sub-text">${esc(it && it.content || "")}</span><span class="sub-right">${due}<span class="badge ${oc}">${esc(owner)}</span>${del}</span></div>`;
    box.appendChild(card);
    return card;
  }
  var _subtaskParentId = null;
  function openSubtaskModal(btn) {
    const card = btn.closest(".tcard");
    const pid = card && card.dataset.id;
    if (!pid) {
      toast("\u8BF7\u5148\u4FDD\u5B58\u5927\u4EFB\u52A1\u518D\u5206\u53D1");
      return;
    }
    _subtaskParentId = pid;
    const t = document.getElementById("subtask-content");
    if (t) t.value = "";
    const o = document.getElementById("subtask-owner");
    if (o) o.value = "\u674E";
    const hs = document.getElementById("subtask-hour");
    if (hs && hs.options.length <= 1) {
      for (let h = 0; h < 24; h++) {
        const op = document.createElement("option");
        const hh = String(h).padStart(2, "0");
        op.value = hh;
        op.textContent = hh + ":00";
        hs.appendChild(op);
      }
    }
    if (hs) hs.value = "";
    const de = document.getElementById("subtask-date");
    if (de) de.value = "";
    const ti = document.getElementById("subtask-parent-title");
    if (ti) {
      const tt2 = card.querySelector(".ttitle");
      ti.textContent = tt2 ? tt2.innerText.trim() : "";
    }
    openModal("subtaskMask");
    if (t) setTimeout(() => t.focus(), 50);
  }
  async function submitSubtask() {
    const pid = _subtaskParentId;
    if (!pid) return;
    const content = (document.getElementById("subtask-content").value || "").trim();
    if (!content) {
      toast("\u8BF7\u586B\u5199\u5B50\u4EFB\u52A1\u5185\u5BB9");
      return;
    }
    const owner = document.getElementById("subtask-owner").value || "\u674E";
    const task_date = document.getElementById("subtask-date").value || "";
    const task_hour = document.getElementById("subtask-hour").value || "";
    try {
      const { item } = await API.post("/api/loop-items", { kind: "task", dept: "\u516C\u53F8", content, owner, status: "\u5F85\u529E", task_date, task_hour, parent_id: Number(pid) });
      const parentCard = document.querySelector('#newtask-company .tcard[data-id="' + pid + '"]');
      addSubTaskCard(parentCard, item);
      closeModal("subtaskMask");
      toast("\u5DF2\u5206\u53D1\u5B50\u4EFB\u52A1\u7ED9" + owner + " \xB7 \u5DF2\u5165\u5E93");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  var _taskScope = null;
  var _taskEditing = null;
  function openTaskModal(dept) {
    _taskEditing = null;
    const verb = document.getElementById("task-mod-verb");
    if (verb) verb.textContent = "\u65B0\u589E";
    _taskScope = dept === "\u516C\u53F8" ? coScope() : sFromDept(dept);
    const lbl = document.getElementById("task-deptlabel");
    if (lbl) lbl.textContent = dept;
    const hs = document.getElementById("task-hour");
    if (hs && hs.options.length <= 1) {
      for (let h = 0; h < 24; h++) {
        const o = document.createElement("option");
        const hh = String(h).padStart(2, "0");
        o.value = hh;
        o.textContent = hh + ":00";
        hs.appendChild(o);
      }
    }
    const today3 = formatLocalDate(/* @__PURE__ */ new Date());
    const de = document.getElementById("task-date");
    if (de) de.value = today3;
    const ds = document.getElementById("task-start");
    if (ds) ds.value = today3;
    if (hs) hs.value = "";
    const tc = document.getElementById("task-content");
    if (tc) tc.value = "";
    const tn = document.getElementById("task-note");
    if (tn) tn.value = "";
    const role = (window.ME || {}).role;
    const canUrgent = (role === "manager" || role === "boss") && dept === "\u516C\u53F8";
    const uf = document.getElementById("task-urgent-fld");
    if (uf) uf.classList.toggle("is-hidden", !canUrgent);
    const uc = document.getElementById("task-urgent");
    if (uc) uc.checked = false;
    openModal("taskMask");
    if (tc) tc.focus();
  }
  function openTaskEdit(el) {
    const card = el.closest(".tcard");
    const it = card && card._item;
    if (!it || !it.id) return;
    _taskScope = card._scope || coScope();
    _taskEditing = card;
    const verb = document.getElementById("task-mod-verb");
    if (verb) verb.textContent = "\u7F16\u8F91";
    const lbl = document.getElementById("task-deptlabel");
    if (lbl) lbl.textContent = _taskScope.dept || "";
    const hs = document.getElementById("task-hour");
    if (hs && hs.options.length <= 1) {
      for (let h = 0; h < 24; h++) {
        const o = document.createElement("option");
        const hh = String(h).padStart(2, "0");
        o.value = hh;
        o.textContent = hh + ":00";
        hs.appendChild(o);
      }
    }
    const de = document.getElementById("task-date");
    if (de) de.value = it.task_date || "";
    const ds = document.getElementById("task-start");
    if (ds) ds.value = it.start_date || "";
    if (hs) hs.value = it.task_hour || "";
    const tc = document.getElementById("task-content");
    if (tc) tc.value = it.content || "";
    const tn = document.getElementById("task-note");
    if (tn) tn.value = it.note || "";
    const uf = document.getElementById("task-urgent-fld");
    if (uf) uf.classList.add("is-hidden");
    openModal("taskMask");
    if (tc) tc.focus();
  }
  async function submitTask() {
    const s = _taskScope;
    if (!s) return;
    const content = (document.getElementById("task-content").value || "").trim();
    if (!content) {
      toast("\u8BF7\u586B\u5199\u4EFB\u52A1\u5185\u5BB9");
      return;
    }
    const task_date = document.getElementById("task-date").value || "";
    const startEl = document.getElementById("task-start");
    const start_date = startEl && startEl.value || "";
    if (start_date && task_date && start_date > task_date) {
      toast("\u5F00\u59CB\u65E5\u671F\u4E0D\u80FD\u665A\u4E8E\u622A\u6B62\u65E5\u671F");
      return;
    }
    const task_hour = document.getElementById("task-hour").value || "";
    const note = (document.getElementById("task-note").value || "").trim();
    const ucEl = document.getElementById("task-urgent");
    const urgent = ucEl && ucEl.checked && !document.getElementById("task-urgent-fld").classList.contains("is-hidden") ? 1 : void 0;
    if (_taskEditing) {
      const card = _taskEditing, it = card._item || {};
      try {
        const { item } = await API.patch("/api/loop-items/" + it.id, { content, task_date, start_date, task_hour, note });
        Object.assign(it, item || { content, task_date, start_date, task_hour, note });
        const t = card.querySelector(".ttitle");
        if (t) {
          [...t.childNodes].forEach((n) => {
            if (n.nodeType === 3) n.remove();
          });
          t.appendChild(document.createTextNode(it.content || ""));
        }
        renderTaskMeta(card);
        placeTaskCard(card);
        refreshTaskCols();
        closeModal("taskMask");
        _taskEditing = null;
        toast("\u5DF2\u66F4\u65B0 \xB7 \u5DF2\u5165\u5E93");
      } catch (e) {
        toast(persistFailMsg(e));
      }
      return;
    }
    try {
      const body = { kind: "task", dept: s.dept, content, owner: s.owner, status: "\u5F85\u529E", task_date, start_date, task_hour, note };
      if (urgent) body.urgent = 1;
      const { item } = await API.post("/api/loop-items", body);
      addTaskCard(s, item.content, item);
      refreshTaskCols();
      closeModal("taskMask");
      toast((s.dept === "\u516C\u53F8" ? urgent ? "\u5DF2\u6D3E\u53D1\u7D27\u6025\u516C\u53F8\u4EFB\u52A1" : "\u5DF2\u6D3E\u53D1\u516C\u53F8\u4EFB\u52A1" : "\u5DF2\u65B0\u589E" + s.dept + "\u4EFB\u52A1") + " \xB7 \u5DF2\u5165\u5E93");
      if (urgent) loadUrgent();
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  function taskDel(btn) {
    const card = btn.closest(".tcard");
    if (!card || !card.dataset.id) return;
    if (!inlineConfirm(btn, "\u786E\u8BA4\u5220\u9664")) return;
    API.del("/api/loop-items/" + card.dataset.id).then(() => {
      card.remove();
      refreshTaskCols();
    }).catch((e) => toast("\u5220\u9664\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25")));
  }
  function refreshTaskCols(col) {
    if (col === null) return;
    if (col === void 0) {
      ["company", "sem", "seo"].forEach((k) => refreshTaskCols(document.getElementById("newtask-" + k)));
      return;
    }
    const folded = col.classList.contains("folded");
    const foldable = (c) => c.classList.contains("done") && !c.classList.contains("nofold");
    const doneN = [...col.querySelectorAll(".tcard:not(.subtask)")].filter(foldable).length;
    col.querySelectorAll(":scope > .tgroup").forEach((g) => {
      const cards = [...g.querySelectorAll(":scope > .tcard")];
      if (!cards.length) {
        g.remove();
        return;
      }
      const shown = cards.filter((c) => !(folded && foldable(c))).length;
      g.classList.toggle("empty", shown === 0);
      const n = g.querySelector(".tgroup-cap .n");
      if (n) n.textContent = shown || "";
    });
    let bar = col.querySelector(".donefold");
    if (!doneN) {
      if (bar) bar.remove();
      col.classList.remove("folded");
      return;
    }
    if (!bar) {
      bar = document.createElement("button");
      bar.type = "button";
      bar.className = "donefold";
      bar.addEventListener("click", () => {
        col.classList.toggle("folded");
        refreshTaskCols(col);
      });
      const add = col.querySelector(".add-task");
      if (add) col.insertBefore(bar, add);
      else col.appendChild(bar);
      col.classList.add("folded");
      refreshTaskCols(col);
      return;
    }
    bar.innerHTML = `<i class="ti ti-${col.classList.contains("folded") ? "chevron-right" : "chevron-down"}"></i> \u5DF2\u5B8C\u6210 ${doneN} \u9879`;
  }
  var _boardDay = "";
  function checkDayRollover() {
    const d = formatLocalDate(/* @__PURE__ */ new Date());
    if (!_boardDay) {
      _boardDay = d;
      return;
    }
    if (d === _boardDay) return;
    _boardDay = d;
    rerenderTaskCards();
    loadSops();
    loadTaskCheckins().then(rerenderTaskCards);
  }
  function rerenderTaskCards() {
    ["company", "sem", "seo"].forEach((k) => {
      const col = document.getElementById("newtask-" + k);
      if (!col) return;
      [...col.querySelectorAll(".tcard:not(.subtask)")].forEach((card) => {
        if (card._item) {
          renderTaskMeta(card);
          placeTaskCard(card);
        }
      });
    });
    refreshTaskCols();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDayRollover();
  });
  window.addEventListener("focus", checkDayRollover);
  setInterval(checkDayRollover, 5 * 60 * 1e3);
  async function addFixRow() {
    const s = sFromDept("SEO");
    try {
      const { item } = await API.post("/api/fixes", { title: "\u65B0\u6574\u6539\u9879", dept: s.dept, detail: "", evidence: "", owner: s.owner, due_date: futureDate(7), status: "\u8BA1\u5212\u4E0B\u5468", source: "\u624B\u52A8" });
      const tr = addFixFromObj(item);
      const c = tr && tr.querySelector('[data-field="title"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
      toast("\u5DF2\u65B0\u589E\u6574\u6539\u9879 \xB7 \u5DF2\u5165\u5E93");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  function sFromDept(dept) {
    return dept === "SEM" ? { dept: "SEM", owner: "\u9648", c: "b-purple" } : { dept: "SEO", owner: "\u674E", c: "b-blue" };
  }
  function persistFix(s, text2) {
    return API.post("/api/fixes", { title: clip(text2, 24), dept: s.dept, detail: text2, owner: s.owner, due_date: futureDate(7), status: "\u8BA1\u5212\u4E0B\u5468", source: "AI\u8BCA\u65AD" });
  }
  function persistLoop(kind, s, content, status) {
    return API.post("/api/loop-items", { kind, dept: s.dept, content, owner: s.owner, status: status || "" });
  }
  async function createEvidenceFix(dept, title, detail, evidence, source = "\u8BCA\u65AD\u5F15\u64CE") {
    const s = sFromDept(dept);
    const { item } = await API.post("/api/fixes", { title: clip(String(title || ""), 40), dept: s.dept, detail: String(detail || ""), evidence: String(evidence || ""), owner: s.owner, due_date: futureDate(7), status: "\u8BA1\u5212\u4E0B\u5468", source });
    addFixFromObj(item);
    return item;
  }
  function persistFailMsg(e) {
    return e && e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF0C\u672A\u5165\u5E93" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u672A\u5165\u5E93\uFF1A" + (e && e.message || "\u8BF7\u6C42\u5931\u8D25");
  }
  var aiDone = { \u6C89\u6DC0: /* @__PURE__ */ new Set(), \u91C7\u7EB3: /* @__PURE__ */ new Set(), \u6D4B\u8BD5: /* @__PURE__ */ new Set() };
  var closedLoopLoadVersion = 0;
  var contentLoadVersion = 0;
  function loadFailureText2(label, e) {
    return label + "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e && e.message || "\u672A\u77E5\u9519\u8BEF");
  }
  function showTableFailure(id, colspan, label, e, retry) {
    const tb = document.getElementById(id);
    if (!tb) return;
    tb.innerHTML = "";
    const tr = document.createElement("tr");
    tr.dataset.loadState = "error";
    const td2 = document.createElement("td");
    td2.colSpan = colspan;
    td2.className = "dim csp-s-d48bfa87bb";
    td2.appendChild(document.createTextNode(loadFailureText2(label, e) + " "));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini";
    btn.innerHTML = '<i class="ti ti-refresh"></i> \u91CD\u8BD5';
    btn.addEventListener("click", retry);
    td2.appendChild(btn);
    tr.appendChild(td2);
    tb.appendChild(tr);
  }
  function resetClosedLoopView() {
    ["tb-fix", "tb-dep", "tb-test-sem", "tb-test-seo", "tb-plan-sem", "tb-plan-seo"].forEach((id) => {
      const tb = document.getElementById(id);
      if (tb) tb.innerHTML = "";
    });
    ["company", "sem", "seo"].forEach((key) => {
      const col = document.getElementById("newtask-" + key);
      if (!col) return;
      col.querySelectorAll(":scope > .tgroup, :scope > .tcard, :scope > .donefold, :scope > [data-closed-loop-load-state]").forEach((el) => el.remove());
      col.classList.remove("folded");
    });
    const depEmpty = document.getElementById("dep-empty");
    if (depEmpty) depEmpty.style.display = "none";
  }
  function showLoopLoadFailure(e) {
    [["tb-dep", 5, "\u6C89\u6DC0"], ["tb-test-sem", 6, "SEM \u6D4B\u8BD5"], ["tb-test-seo", 6, "SEO \u6D4B\u8BD5"], ["tb-plan-sem", 6, "SEM \u8BA1\u5212"], ["tb-plan-seo", 6, "SEO \u8BA1\u5212"]].forEach(([id, cols, label]) => showTableFailure(id, cols, label, e, loadClosedLoop));
    ["company", "sem", "seo"].forEach((key) => {
      const col = document.getElementById("newtask-" + key);
      if (!col) return;
      const box = document.createElement("div");
      box.className = "sop-empty-hint";
      box.dataset.closedLoopLoadState = "error";
      box.appendChild(document.createTextNode(loadFailureText2("\u4EFB\u52A1", e) + " "));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.innerHTML = '<i class="ti ti-refresh"></i> \u91CD\u8BD5';
      btn.addEventListener("click", loadClosedLoop);
      box.appendChild(btn);
      const anchor = col.querySelector(".add-task");
      if (anchor) col.insertBefore(box, anchor);
      else col.appendChild(box);
    });
  }
  function showTaskCheckinFailure(e) {
    ["company", "sem", "seo"].forEach((key) => {
      const col = document.getElementById("newtask-" + key);
      if (!col) return;
      const box = document.createElement("div");
      box.className = "sop-empty-hint";
      box.dataset.closedLoopLoadState = "checkins";
      box.appendChild(document.createTextNode(loadFailureText2("\u4EFB\u52A1\u63A8\u8FDB\u8BB0\u5F55", e) + " "));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.innerHTML = '<i class="ti ti-refresh"></i> \u91CD\u8BD5';
      btn.addEventListener("click", async () => {
        const retryError = await loadTaskCheckins();
        if (retryError) return;
        document.querySelectorAll('[data-closed-loop-load-state="checkins"]').forEach((el) => el.remove());
        rerenderTaskCards();
      });
      const anchor = col.querySelector(".add-task");
      if (anchor) col.insertBefore(box, anchor);
      else col.appendChild(box);
    });
  }
  async function loadClosedLoop() {
    const loadVersion = ++closedLoopLoadVersion;
    resetClosedLoopView();
    aiDone = { \u6C89\u6DC0: /* @__PURE__ */ new Set(), \u91C7\u7EB3: /* @__PURE__ */ new Set(), \u6D4B\u8BD5: /* @__PURE__ */ new Set() };
    try {
      const { items } = await API.get("/api/fixes");
      if (loadVersion !== closedLoopLoadVersion) return;
      (items || []).slice().reverse().forEach((f) => {
        addFixFromObj(f);
        aiDone.\u91C7\u7EB3.add(aiFp(f.dept, f.detail || f.title));
      });
    } catch (e) {
      if (loadVersion !== closedLoopLoadVersion) return;
      if (e && e.message !== "unauthorized") {
        showTableFailure("tb-fix", 8, "\u6574\u6539\u6E05\u5355", e, loadClosedLoop);
        toast(loadFailureText2("\u6574\u6539\u6E05\u5355", e));
      }
    }
    const depTb = document.getElementById("tb-dep");
    if (depTb) depTb.innerHTML = "";
    const checkinError = await loadTaskCheckins(() => loadVersion === closedLoopLoadVersion);
    if (loadVersion !== closedLoopLoadVersion) return;
    if (checkinError) showTaskCheckinFailure(checkinError);
    const _pendingSubtasks = [];
    const _autoArchiveParents = [];
    try {
      const { items } = await API.get("/api/loop-items");
      if (loadVersion !== closedLoopLoadVersion) return;
      (items || []).slice().reverse().forEach((it) => {
        const s = sFromDept(it.dept);
        if (it.kind === "deposit") {
          const tr = document.createElement("tr");
          tr.dataset.id = it.id;
          tr.dataset.ep = "/api/loop-items";
          tr.innerHTML = depRowHtml(it);
          depTb && depTb.appendChild(tr);
          aiDone[it.status === "\u91C7\u7EB3" ? "\u91C7\u7EB3" : "\u6C89\u6DC0"].add(aiFp(it.dept, it.content));
        } else if (it.kind === "test") {
          addTest(s, it.content, it);
          aiDone.\u6D4B\u8BD5.add(aiFp(it.dept, it.content));
        } else if (it.kind === "plan") addPlan(s, it.content, it);
        else if (it.kind === "task") {
          if (it.parent_id) {
            _pendingSubtasks.push(it);
            return;
          }
          const ts = it.dept === "\u516C\u53F8" ? coScope() : s;
          const today3 = formatLocalDate(/* @__PURE__ */ new Date());
          const isDone = it.state === "done" || it.status === "done";
          if (isDone && it.task_date && it.task_date < today3) {
            const ak = it.dept === "\u516C\u53F8" ? "company" : it.dept === "SEM" ? "sem" : "seo";
            _autoArchiveParents.push({ it, ts, ak });
          } else {
            addTaskCard(ts, it.content, it);
          }
        }
      });
      const archivedParentIds = /* @__PURE__ */ new Set();
      await Promise.all(_autoArchiveParents.map(async ({ it, ts, ak }) => {
        try {
          await API.post("/api/loop-items/" + it.id + "/archive", { archive_kind: ak });
          archivedParentIds.add(Number(it.id));
        } catch (e) {
          if (loadVersion !== closedLoopLoadVersion) return;
          addTaskCard(ts, it.content, it);
          toast("\u8FC7\u671F\u4EFB\u52A1\u81EA\u52A8\u5F52\u6863\u5931\u8D25\uFF1A" + (e && e.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      }));
      if (loadVersion !== closedLoopLoadVersion) return;
      _pendingSubtasks.sort((a, b) => a.id - b.id).forEach((it) => {
        if (archivedParentIds.has(Number(it.parent_id))) return;
        const parentCard = document.querySelector('#newtask-company .tcard[data-id="' + it.parent_id + '"]');
        if (parentCard) addSubTaskCard(parentCard, it);
        else addTaskCard(coScope(), it.content, it);
      });
    } catch (e) {
      if (loadVersion !== closedLoopLoadVersion) return;
      if (e && e.message !== "unauthorized") {
        showLoopLoadFailure(e);
        toast(loadFailureText2("\u95ED\u73AF\u6570\u636E", e));
      }
    }
    const de = document.getElementById("dep-empty");
    if (de) de.style.display = depTb && depTb.children.length ? "none" : "block";
    refreshTaskCols();
    applyAiDoneStates();
  }
  function depRowHtml(it) {
    const date = (it.created_at || "").slice(5, 10) || today();
    const badge3 = it.status === "\u91C7\u7EB3" ? '<span class="badge b-green">\u91C7\u7EB3</span>' : '<span class="badge b-teal">\u6C89\u6DC0</span>';
    return `<td class="num">${esc(date)}</td><td class="ctr">${badge3}</td><td class="editable" contenteditable data-field="content">${esc(it.content)}</td><td class="editable dim csp-s-33ee298127" contenteditable data-field="analysis">${esc(it.analysis || "")}</td><td class="ctr"><button type="button" class="btn-mini csp-s-b0e08465c2" data-loop-action="deposit-delete"><i class="ti ti-trash"></i></button></td>`;
  }
  async function addDepositRow() {
    try {
      const { item } = await API.post("/api/loop-items", { kind: "deposit", content: "", status: "\u6C89\u6DC0" });
      const tb = document.getElementById("tb-dep");
      const state = tb.querySelector("tr[data-load-state]");
      if (state) state.remove();
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;
      tr.dataset.ep = "/api/loop-items";
      tr.innerHTML = depRowHtml(item);
      tb.insertBefore(tr, tb.firstChild);
      document.getElementById("dep-empty").style.display = "none";
      const c = tr.querySelector('[data-field="content"]');
      if (c) {
        c.focus();
      }
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
  }
  function depDel(btn) {
    const tr = btn.closest("tr");
    if (!tr.dataset.id) return;
    if (!inlineConfirm(btn, "\u786E\u8BA4\u5220\u9664")) return;
    API.del("/api/loop-items/" + tr.dataset.id).then(() => {
      tr.remove();
      const tb = document.getElementById("tb-dep");
      if (tb && !tb.children.length) document.getElementById("dep-empty").style.display = "block";
    }).catch((e) => toast("\u5220\u9664\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25")));
  }
  async function addPlanRow(dept) {
    const s = sFromDept(dept);
    try {
      const { item } = await persistLoop("plan", s, "\u65B0\u6708\u5EA6\u8BA1\u5212", "\u5F85\u5F00\u59CB");
      const tr = addPlan(s, item.content, item);
      const c = tr && tr.querySelector('[data-field="content"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
      toast("\u5DF2\u65B0\u589E" + dept + "\u8BA1\u5212 \xB7 \u5DF2\u5165\u5E93");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  async function addTestRow(dept) {
    const s = sFromDept(dept);
    try {
      const { item } = await persistLoop("test", s, "\u65B0\u6D4B\u8BD5\u767B\u8BB0", "\u89C2\u5BDF\u4E2D");
      const tr = addTest(s, item.content, item);
      const c = tr && tr.querySelector('[data-field="content"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
      toast("\u5DF2\u65B0\u589E" + dept + "\u6D4B\u8BD5 \xB7 \u5DF2\u5165\u5E93");
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  var CA_PRIO = { "\u6700\u9AD8": "b-red", "\u9AD8": "b-amber", "\u4E2D": "b-blue", "\u6301\u7EED": "b-gray" };
  var CA_OWNER = { "\u674E": "b-blue", "\u9648": "b-purple", "\u4E3B\u7BA1": "b-teal" };
  var CA_STATUS = { "\u5F85\u5F00\u59CB": "b-gray", "\u8FDB\u884C\u4E2D": "b-amber", "\u5DF2\u5B8C\u6210": "b-green" };
  function contentRowHtml(r) {
    return `<td class="editable" contenteditable data-field="name">${esc(r.name)}</td><td class="editable dim csp-s-33ee298127" contenteditable data-field="problem">${esc(r.problem)}</td><td class="editable csp-s-33ee298127" contenteditable data-field="type">${esc(r.type)}</td><td class="ctr"><span class="tagselect ${CA_PRIO[r.priority] || "b-blue"}" data-kind="priority">${esc(r.priority || "\u4E2D")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><span class="tagselect ${CA_OWNER[r.owner] || "b-blue"}" data-kind="owner">${esc(r.owner || "\u674E")}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><span class="tagselect ${CA_STATUS[r.status] || "b-gray"}" data-kind="status">${esc(r.status || "\u5F85\u5F00\u59CB")}<i class="ti ti-chevron-down"></i></span></td><td class="num">${esc(r.add_date || "")}</td><td class="editable dim csp-s-33ee298127" contenteditable data-field="note">${esc(r.note)}</td><td class="ctr"><button type="button" class="btn-mini csp-s-b0e08465c2" data-loop-action="content-delete"><i class="ti ti-trash"></i></button></td>`;
  }
  async function loadContent() {
    const loadVersion = ++contentLoadVersion;
    try {
      const { items } = await API.get("/api/content-assets");
      if (loadVersion !== contentLoadVersion) return;
      const tb = document.getElementById("tb-content");
      if (!tb) return;
      tb.innerHTML = "";
      (items || []).forEach((r) => {
        const tr = document.createElement("tr");
        tr.dataset.id = r.id;
        tr.dataset.ep = "/api/content-assets";
        tr.innerHTML = contentRowHtml(r);
        tb.appendChild(tr);
      });
      const e = document.getElementById("content-empty");
      if (e) e.style.display = items && items.length ? "none" : "block";
    } catch (e) {
      if (loadVersion !== contentLoadVersion) return;
      if (e && e.message !== "unauthorized") {
        showTableFailure("tb-content", 9, "\u5185\u5BB9\u8D44\u4EA7", e, loadContent);
        const empty = document.getElementById("content-empty");
        if (empty) empty.style.display = "none";
        toast(loadFailureText2("\u5185\u5BB9\u8D44\u4EA7", e));
      }
    }
  }
  async function addContent() {
    try {
      const { item } = await API.post("/api/content-assets", {});
      const tb = document.getElementById("tb-content");
      const state = tb.querySelector("tr[data-load-state]");
      if (state) state.remove();
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;
      tr.dataset.ep = "/api/content-assets";
      tr.innerHTML = contentRowHtml(item);
      tb.appendChild(tr);
      document.getElementById("content-empty").style.display = "none";
      const c = tr.querySelector('[data-field="name"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
  }
  function contentDel(btn) {
    const tr = btn.closest("tr");
    if (!tr.dataset.id) return;
    if (!inlineConfirm(btn, "\u786E\u8BA4\u5220\u9664")) return;
    API.del("/api/content-assets/" + tr.dataset.id).then(() => {
      tr.remove();
      const tb = document.getElementById("tb-content");
      if (tb && !tb.children.length) document.getElementById("content-empty").style.display = "block";
    }).catch((e) => toast("\u5220\u9664\u5931\u8D25\uFF1A" + (e.message || "\u8BF7\u6C42\u5931\u8D25")));
  }
  function aiFp(dept, text2) {
    return (dept || "") + "|" + String(text2 || "").trim().slice(0, 200);
  }
  function aiMarkDone(grp, kind) {
    grp.querySelectorAll(".aibtn").forEach((b) => b.classList.add("done"));
    const btn = [...grp.querySelectorAll(".aibtn")].find((b) => b.dataset.kind === kind);
    if (btn) btn.textContent = "\u2713 \u5DF2" + kind;
  }
  function applyAiDoneStates(root) {
    (root || document).querySelectorAll(".ai-actions").forEach((grp) => {
      const it = grp.closest(".ai-item");
      if (!it) return;
      const text2 = grabText(grp.firstChild || grp);
      const s = scopeDept(grp, text2);
      const fp = aiFp(s.dept, text2);
      ["\u6C89\u6DC0", "\u91C7\u7EB3", "\u6D4B\u8BD5"].forEach((k) => {
        if (aiDone[k].has(fp)) aiMarkDone(grp, k);
      });
    });
  }
  async function aiAct(btn, kind) {
    const grp = btn.closest(".ai-actions");
    const text2 = grabText(btn);
    const s = scopeDept(btn, text2);
    btn.disabled = true;
    try {
      if (kind === "\u6C89\u6DC0") {
        await persistLoop("deposit", s, text2, "\u6C89\u6DC0");
        addDeposit(s, text2, "\u6C89\u6DC0");
        toastGo("\u5DF2\u6C89\u6DC0\u5230\u6C89\u6DC0\u8868 \xB7 \u5DF2\u5165\u5E93", "deposit");
      } else if (kind === "\u91C7\u7EB3") {
        const [fx] = await Promise.all([persistFix(s, text2), persistLoop("deposit", s, text2, "\u91C7\u7EB3")]);
        addFixFromObj(fx.item);
        addDeposit(s, text2, "\u91C7\u7EB3");
        toastGo("\u5DF2\u91C7\u7EB3 \u2192 \u6574\u6539\u6E05\u5355 + \u6C89\u6DC0\u8868 \xB7 \u5DF2\u5165\u5E93", "fix");
      } else if (kind === "\u6D4B\u8BD5") {
        const r = await persistLoop("test", s, text2, "\u89C2\u5BDF\u4E2D");
        addTest(s, r.item.content, r.item);
        toastGo("\u5DF2\u52A0\u5165\u6D4B\u8BD5\u767B\u8BB0\uFF08" + s.dept + "\uFF09\xB7 \u5DF2\u5165\u5E93", "test");
      }
      aiDone[kind].add(aiFp(s.dept, text2));
      aiMarkDone(grp, kind);
    } catch (e) {
      btn.disabled = false;
      toast(persistFailMsg(e));
    }
  }
  function injectAiActions() {
    document.querySelectorAll(".ai-item").forEach((it) => {
      if (it.querySelector(".ai-actions")) return;
      const wrap = document.createElement("span");
      wrap.className = "ai-actions";
      wrap.innerHTML = '<button type="button" class="aibtn dep" data-loop-action="ai-action" data-kind="\u6C89\u6DC0">\u6C89\u6DC0</button><button type="button" class="aibtn adopt" data-loop-action="ai-action" data-kind="\u91C7\u7EB3">\u91C7\u7EB3</button><button type="button" class="aibtn test" data-loop-action="ai-action" data-kind="\u6D4B\u8BD5">\u6D4B\u8BD5</button>';
      it.appendChild(wrap);
    });
    applyAiDoneStates();
  }
  injectAiActions();

  // public/src/neg-ads.js
  var NEGMATCH_BADGE = { "\u7CBE\u786E": "b-green", "\u8BCD\u7EC4": "b-blue", "\u5E7F\u6CDB": "b-amber" };
  var NEGSTATUS_BADGE = { "\u751F\u6548": "b-green", "\u89C2\u5BDF": "b-amber", "\u5DF2\u79FB\u9664": "b-gray" };
  var ADSTATUS_BADGE = { "\u91C7\u7528\u4E2D": "b-green", "\u6D4B\u8BD5\u4E2D": "b-amber", "\u5DF2\u5F03\u7528": "b-gray" };
  function clearLoadState(id) {
    const row = document.querySelector(`#${id} tr[data-load-state]`);
    if (row) row.remove();
  }
  function negRowHtml(r) {
    return `<td class="editable" contenteditable data-field="word">${esc(r.word)}</td><td class="ctr"><span class="tagselect ${NEGMATCH_BADGE[r.match_type] || "b-blue"}" data-kind="negmatch">${esc(r.match_type || "\u8BCD\u7EC4")}<i class="ti ti-chevron-down"></i></span></td><td class="editable" contenteditable data-field="added_date">${esc(r.added_date || "")}</td><td class="editable csp-s-33ee298127" contenteditable data-field="reason">${esc(r.reason || "")}</td><td class="editable" contenteditable data-field="source_campaign">${esc(r.source_campaign || "")}</td><td class="ctr"><span class="tagselect ${NEGSTATUS_BADGE[r.status] || "b-green"}" data-kind="negstatus">${esc(r.status || "\u751F\u6548")}<i class="ti ti-chevron-down"></i></span></td>`;
  }
  function adRowHtml(r) {
    return `<td class="editable" contenteditable data-field="title">${esc(r.title)}</td><td class="editable dim csp-s-33ee298127" contenteditable data-field="description">${esc(r.description || "")}</td><td class="editable" contenteditable data-field="ctr">${esc(r.ctr || "")}</td><td class="editable dim csp-s-33ee298127" contenteditable data-field="ab_conclusion">${esc(r.ab_conclusion || "")}</td><td class="ctr"><span class="tagselect ${ADSTATUS_BADGE[r.status] || "b-amber"}" data-kind="adstatus">${esc(r.status || "\u6D4B\u8BD5\u4E2D")}<i class="ti ti-chevron-down"></i></span></td>`;
  }
  async function addNeg() {
    try {
      const { item } = await API.post("/api/neg-keywords", { word: "\u65B0\u5426\u8BCD", reason: "" });
      clearLoadState("tb-neg");
      prepend("tb-neg", negRowHtml(item));
      const tr = document.getElementById("tb-neg").firstChild;
      tr.dataset.id = item.id;
      tr.dataset.ep = "/api/neg-keywords";
      const c = tr.querySelector('[data-field="word"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
      toast("\u5DF2\u52A0\u4E00\u884C \xB7 \u76F4\u63A5\u5728\u8868\u683C\u91CC\u6539");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }
  async function addAd() {
    try {
      const { item } = await API.post("/api/ad-creatives", { title: "\u65B0\u521B\u610F", description: "" });
      clearLoadState("tb-ad");
      prepend("tb-ad", adRowHtml(item));
      const tr = document.getElementById("tb-ad").firstChild;
      tr.dataset.id = item.id;
      tr.dataset.ep = "/api/ad-creatives";
      const c = tr.querySelector('[data-field="title"]');
      if (c) {
        c.focus();
        placeCaretEnd(c);
      }
      toast("\u5DF2\u52A0\u4E00\u884C \xB7 \u76F4\u63A5\u5728\u8868\u683C\u91CC\u6539");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }

  // public/src/ga4-view.js
  var ga4_view_exports = {};
  __export(ga4_view_exports, {
    loadGa4: () => loadGa42
  });
  var devicesChart = null;
  var requestSequence = 0;
  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value == null ? "\u2014" : String(value);
  }
  function formatNumber(value, maximumFractionDigits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "\u2014";
    return number.toLocaleString("zh-CN", { maximumFractionDigits });
  }
  function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return "\u2014";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return minutes ? `${minutes}\u5206${String(remainder).padStart(2, "0")}\u79D2` : `${remainder}\u79D2`;
  }
  function setHint({ visible, mode = "warning", title = "", detail = "", retry = false }) {
    const hint = document.getElementById("ga4-hint");
    if (!hint) return;
    hint.classList.toggle("ga4-hint-visible", visible);
    hint.classList.toggle("ga4-hint-error", mode === "error");
    setText("ga4-hint-title", title);
    setText("ga4-hint-detail", detail);
    const icon = document.getElementById("ga4-hint-icon");
    if (icon) icon.className = `ti ${mode === "error" ? "ti-alert-triangle" : "ti-plug-connected-x"} csp-s-fd44150866`;
    const button = document.getElementById("ga4-retry");
    if (button) button.classList.toggle("is-hidden", !retry);
  }
  function setStatus(connected, failed = false) {
    const status = document.getElementById("ga4-status");
    if (!status) return;
    status.className = `badge ${failed ? "b-red" : connected ? "b-green" : "b-gray"}`;
    status.textContent = failed ? "\u8BFB\u53D6\u5931\u8D25" : connected ? "\u5DF2\u63A5\u5165" : "\u672A\u63A5\u5165";
  }
  function clearMetrics() {
    ["ga4-users", "ga4-sessions", "ga4-views", "ga4-key-events", "ga4-bounce", "ga4-dur"].forEach((id) => setText(id, "\u2014"));
  }
  function fillTable(tableId, emptyId, rows2, renderCells, emptyText) {
    const body = document.getElementById(tableId);
    const empty = document.getElementById(emptyId);
    if (!body) return;
    const items = Array.isArray(rows2) ? rows2 : [];
    body.innerHTML = items.map((row) => `<tr>${renderCells(row).map((cell2) => {
      const value = cell2.html == null ? esc(cell2.value ?? "") : cell2.html;
      return `<td class="${cell2.cls || ""}">${value}</td>`;
    }).join("")}</tr>`).join("");
    if (empty) {
      empty.textContent = emptyText || "\u6682\u65E0\u6570\u636E";
      empty.classList.toggle("is-hidden", items.length > 0);
    }
  }
  function clearTables(message = "\u6682\u65E0\u6570\u636E") {
    const pairs = [
      ["ga4-sources", "ga4-sources-empty"],
      ["ga4-countries", "ga4-countries-empty"],
      ["ga4-landing", "ga4-landing-empty"],
      ["ga4-campaigns", "ga4-campaigns-empty"],
      ["ga4-events", "ga4-events-empty"]
    ];
    pairs.forEach(([tableId, emptyId]) => fillTable(tableId, emptyId, [], () => [], message));
    renderDevices([], message);
  }
  function renderDevices(rows2, emptyText = "\u6682\u65E0\u6570\u636E") {
    const wrap = document.getElementById("ga4-devices-chart");
    const empty = document.getElementById("ga4-devices-empty");
    const canvas = document.getElementById("ga4Devices");
    const items = Array.isArray(rows2) ? rows2.filter((row) => Number(row.sessions || 0) > 0) : [];
    if (devicesChart) {
      devicesChart.destroy();
      devicesChart = null;
    }
    if (!items.length || !canvas || typeof Chart === "undefined") {
      if (wrap) wrap.classList.add("is-hidden");
      if (empty) {
        empty.textContent = items.length ? "\u56FE\u8868\u7EC4\u4EF6\u672A\u52A0\u8F7D" : emptyText;
        empty.classList.remove("is-hidden");
      }
      return;
    }
    if (wrap) wrap.classList.remove("is-hidden");
    if (empty) empty.classList.add("is-hidden");
    devicesChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: items.map((row) => row.device || "\u672A\u77E5\u8BBE\u5907"),
        datasets: [{
          data: items.map((row) => Number(row.sessions || 0)),
          backgroundColor: ["#1677ff", "#00b42a", "#f59e0b", "#86909c", "#722ed1"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "64%",
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } }
      }
    });
  }
  function renderGa4(data) {
    const connected = Boolean(data.connected);
    const metrics = data.metrics;
    setStatus(connected);
    if (!connected) {
      setHint({
        visible: true,
        title: "GA4 \u5C1A\u672A\u63A5\u5165",
        detail: "\u8BF7\u524D\u5F80\u300C\u8BBE\u7F6E \xB7 API \u63A5\u5165\u300D\u914D\u7F6E Google OAuth \u4E0E Property ID\uFF0C\u6388\u6743\u540E\u6267\u884C\u4E00\u6B21\u540C\u6B65\u3002"
      });
    } else if (!metrics) {
      setHint({
        visible: true,
        title: "GA4 \u5DF2\u6388\u6743\uFF0C\u4F46\u6240\u9009\u533A\u95F4\u6CA1\u6709\u540C\u6B65\u6570\u636E",
        detail: "\u8BF7\u5728\u300C\u8BBE\u7F6E \xB7 API \u63A5\u5165\u300D\u6267\u884C GA4 \u540C\u6B65\uFF1B\u540E\u53F0\u4E0D\u4F1A\u7528\u793A\u4F8B\u6570\u636E\u586B\u5145\u7A7A\u767D\u3002",
        retry: true
      });
    } else {
      setHint({ visible: false });
    }
    clearMetrics();
    if (metrics) {
      setText("ga4-users", formatNumber(metrics.activeUsers));
      setText("ga4-sessions", formatNumber(metrics.sessions));
      setText("ga4-views", formatNumber(metrics.pageViews));
      setText("ga4-key-events", formatNumber(metrics.keyEvents, 1));
      setText("ga4-bounce", metrics.bounceRate == null ? "\u2014" : `${formatNumber(metrics.bounceRate, 1)}%`);
      setText("ga4-dur", formatDuration(metrics.avgDuration));
    }
    const baseEmpty = connected ? "\u6240\u9009\u533A\u95F4\u6682\u65E0\u6570\u636E" : "\u63A5\u5165\u5E76\u540C\u6B65\u540E\u663E\u793A";
    fillTable("ga4-sources", "ga4-sources-empty", data.sources, (row) => [
      { value: row.source || "(not set)" },
      { value: formatNumber(row.sessions), cls: "num" },
      { value: formatNumber(row.users), cls: "num" }
    ], baseEmpty);
    fillTable("ga4-countries", "ga4-countries-empty", data.countries, (row) => [
      { value: row.country || "(not set)" },
      { value: formatNumber(row.sessions), cls: "num" },
      { value: formatNumber(row.users), cls: "num" }
    ], baseEmpty);
    fillTable("ga4-landing", "ga4-landing-empty", data.landingPages, (row) => [
      { value: row.page || "(not set)" },
      { value: formatNumber(row.sessions), cls: "num" },
      { value: formatNumber(row.conversions, 1), cls: "num" }
    ], baseEmpty);
    fillTable("ga4-campaigns", "ga4-campaigns-empty", data.campaigns, (row) => [
      { value: row.campaign || "(not set)" },
      { value: formatNumber(row.sessions), cls: "num" },
      { value: formatNumber(row.users), cls: "num" },
      { value: formatNumber(row.conversions, 1), cls: "num" }
    ], metrics ? "\u6240\u9009\u533A\u95F4\u6CA1\u6709\u5E7F\u544A\u7CFB\u5217\u6570\u636E" : baseEmpty);
    const eventEmpty = !connected ? "\u63A5\u5165\u5E76\u540C\u6B65\u540E\u663E\u793A" : !data.eventCoverage?.synced ? "\u5173\u952E\u4E8B\u4EF6\u5C1A\u672A\u540C\u6B65\uFF0C\u8BF7\u91CD\u65B0\u6267\u884C GA4 \u540C\u6B65" : "\u5DF2\u540C\u6B65\u4E8B\u4EF6\uFF0C\u4F46\u6CA1\u6709\u5339\u914D\u7684\u8F6C\u5316\u6216\u5173\u952E\u4E8B\u4EF6";
    fillTable("ga4-events", "ga4-events-empty", data.conversionEvents, (row) => [
      { html: `<div class="ga4-event-label">${esc(row.label || "\u81EA\u5B9A\u4E49\u4E8B\u4EF6")}</div><div class="ga4-event-code">${esc(row.eventName || "")}</div>` },
      { value: formatNumber(row.eventCount), cls: "num" },
      { value: formatNumber(row.keyEvents, 1), cls: "num" },
      { value: formatNumber(row.users), cls: "num" }
    ], eventEmpty);
    renderDevices(data.devices, baseEmpty);
  }
  async function loadGa42() {
    const requestId = ++requestSequence;
    const retry = document.getElementById("ga4-retry");
    if (retry) retry.disabled = true;
    try {
      const data = await API.get(withRange("/api/ga4/overview"));
      if (requestId !== requestSequence) return;
      renderGa4(data || { connected: false });
    } catch (error) {
      if (requestId !== requestSequence) return;
      setStatus(false, true);
      clearMetrics();
      clearTables("\u8BFB\u53D6\u5931\u8D25");
      setHint({
        visible: true,
        mode: "error",
        title: "GA4 \u6570\u636E\u8BFB\u53D6\u5931\u8D25",
        detail: `\u539F\u56E0\uFF1A${error?.message || "\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25"}\u3002\u8BF7\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u3001\u540E\u7AEF\u670D\u52A1\u548C GA4 \u914D\u7F6E\u540E\u91CD\u8BD5\u3002`,
        retry: true
      });
    } finally {
      if (requestId === requestSequence && retry) retry.disabled = false;
    }
  }

  // public/src/market-brain.js
  var market_brain_exports = {};
  __export(market_brain_exports, {
    loadBrain: () => loadBrain,
    loadMarket: () => loadMarket,
    refreshBrain: () => refreshBrain,
    renderMarket: () => renderMarket
  });
  window._marketById = {};
  function mktEsc(s) {
    return esc(s);
  }
  function renderMarket(items) {
    const tb = document.getElementById("tb-market");
    if (!tb) return;
    tb.innerHTML = "";
    window._marketById = {};
    let lastSec = null;
    items.forEach((it) => {
      let ans = {};
      try {
        ans = JSON.parse(it.answers || "{}");
      } catch {
      }
      it._ans = ans;
      window._marketById[it.id] = it;
      if (it.section !== lastSec) {
        lastSec = it.section;
        const hr = document.createElement("tr");
        hr.innerHTML = `<td class="csp-s-24cc594aae" colspan="5">${mktEsc(it.section)}</td>`;
        tb.appendChild(hr);
      }
      const tr = document.createElement("tr");
      tr.dataset.id = it.id;
      tr.innerHTML = `<td class="dim csp-s-33ee298127">${mktEsc(it.section)}</td><td class="mkt-q editable csp-s-bd299c8ad6" contenteditable>${mktEsc(it.question)}</td>` + ["\u5B5F\u96EA", "\u738B\u7490\u5E73", "\u71D5\u654F"].map((r) => `<td class="mkt-ans editable csp-s-23e1d32409" contenteditable data-resp="${r}">${mktEsc(ans[r] || "")}</td>`).join("");
      tb.appendChild(tr);
    });
    const empty = document.getElementById("market-empty");
    if (empty) empty.style.display = items.length ? "none" : "block";
  }
  async function loadMarket() {
    try {
      const { items } = await API.get("/api/market/research");
      renderMarket(items || []);
    } catch (e) {
    }
  }
  document.addEventListener("focusout", (e) => {
    const cell2 = e.target.closest && e.target.closest("#tb-market [contenteditable]");
    if (!cell2) return;
    const tr = cell2.closest("tr");
    const id = tr && tr.dataset.id;
    if (!id) return;
    const it = window._marketById[id];
    if (!it) return;
    const body = {};
    if (cell2.classList.contains("mkt-q")) body.question = cell2.innerText.trim();
    else if (cell2.classList.contains("mkt-ans")) {
      it._ans = it._ans || {};
      it._ans[cell2.dataset.resp] = cell2.innerText;
      body.answers = JSON.stringify(it._ans);
    } else return;
    API.patch("/api/market/research/" + id, body).catch((err) => toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25"));
  });
  async function loadBrain() {
    try {
      const { state, summary } = await API.get("/api/market/brain");
      const chip = document.getElementById("brainStatus");
      if (chip) {
        if (!state.hasSummary) {
          chip.className = "badge b-gray";
          chip.textContent = "AI \u8BB0\u5FC6\uFF1A\u672A\u5B66\u4E60";
        } else if (state.needsUpdate) {
          chip.className = "badge b-amber";
          chip.textContent = state.reason === "new_month" ? "AI \u8BB0\u5FC6\uFF1A\u5DF2\u8DE8\u6708\uFF0C\u5EFA\u8BAE\u66F4\u65B0" : "AI \u8BB0\u5FC6\uFF1A\u8D44\u6599\u6709\u53D8\uFF0C\u5EFA\u8BAE\u66F4\u65B0";
        } else {
          chip.className = "badge b-green";
          chip.textContent = "AI \u8BB0\u5FC6\uFF1A\u5DF2\u662F\u6700\u65B0";
        }
      }
      const card = document.getElementById("brainSummaryCard");
      if (card) {
        if (summary) {
          card.style.display = "block";
          document.getElementById("brainSummary").innerHTML = mdToHtml(summary);
          document.getElementById("brainUpdatedAt").textContent = state.updatedAt ? "\u66F4\u65B0\u4E8E " + state.updatedAt : "";
        } else card.style.display = "none";
      }
    } catch (e) {
    }
  }
  async function refreshBrain(btn) {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader"></i> \u5B66\u4E60\u4E2D\u2026';
    }
    try {
      const r = await API.post("/api/market/brain/refresh", {});
      if (r && r.updated) toast("AI \u5DF2\u91CD\u65B0\u5B66\u4E60\u5E02\u573A\u8D44\u6599\uFF0C\u8BB0\u5FC6\u5DF2\u66F4\u65B0");
      else if (r && r.reason === "no_source") toast("\u6682\u65E0\u5E02\u573A\u8D44\u6599\u53EF\u5B66\u4E60");
      else toast("\u8BB0\u5FC6\u5DF2\u66F4\u65B0");
      await loadBrain();
    } catch (e) {
      toast(e.status === 503 ? "\u8BF7\u5148\u914D\u7F6E ANTHROPIC_API_KEY \u518D\u66F4\u65B0\u8BB0\u5FC6" : "\u66F4\u65B0\u5931\u8D25\uFF1A" + (e.body && e.body.error || e.message));
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-brain"></i> \u540C\u6B65 / \u66F4\u65B0 AI \u8BB0\u5FC6';
    }
  }

  // public/src/kpi-view.js
  var kpi_view_exports = {};
  __export(kpi_view_exports, {
    loadOverview: () => loadOverview,
    renderKPI: () => renderKPI2
  });

  // public/src/kpi.js
  var TOTAL = [{ n: "\u8BE2\u76D8\u603B\u91CF", w: 25, t: 60, a: 0, m: "r", u: "\u5C01" }, { n: "A\u7EA7\u8BE2\u76D8\u6570", w: 35, t: 10, a: 0, m: "r", u: "\u5C01" }, { n: "\u6709\u6548\u8BE2\u76D8\u6210\u672C", w: 25, t: 2e3, a: 0, m: "i", u: "\xA5" }, { n: "\u95ED\u73AF\u6267\u884C\u5EA6", w: 15, t: 5, a: 0, m: "r", u: "\u9879" }];
  var SEO = [{ n: "\u81EA\u7136\u6D41\u91CF\u73AF\u6BD4", w: 25, t: 10, a: 0, m: "r", u: "%" }, { n: "\u6838\u5FC3\u8BCD Top10 \u5360\u6BD4", w: 25, t: 40, a: 0, m: "r", u: "%" }, { n: "\u5173\u952E\u8BCD\u8986\u76D6/\u957F\u5C3E", w: 15, t: 500, a: 0, m: "r", u: "\u8BCD" }, { n: "\u65B0\u589E\u6536\u5F55\u9875\u9762", w: 15, t: 20, a: 0, m: "r", u: "\u9875" }, { n: "\u8DF3\u51FA\u7387", w: 10, t: 55, a: 0, m: "i", u: "%" }, { n: "\u9875\u9762\u505C\u7559\u65F6\u957F", w: 10, t: 150, a: 0, m: "r", u: "s" }];
  var SEM = [{ n: "CPC", w: 15, t: 4, a: 0, m: "i", u: "\xA5" }, { n: "CTR", w: 15, t: 3.5, a: 0, m: "r", u: "%" }, { n: "\u8D28\u91CF\u5206", w: 15, t: 7.5, a: 0, m: "r", u: "" }, { n: "ROAS", w: 20, t: 3.5, a: 0, m: "r", u: "x" }, { n: "\u8F6C\u5316\u6B21\u6570", w: 15, t: 60, a: 0, m: "r", u: "\u6B21" }, { n: "\u6BCF\u6B21\u8F6C\u5316\u8D39\u7528", w: 20, t: 300, a: 0, m: "i", u: "\xA5" }];
  var ratio = (k) => {
    const target = Number(k.t), actual = Number(k.a);
    if (!Number.isFinite(target) || !Number.isFinite(actual) || target <= 0 || actual <= 0) return 0;
    return k.m === "i" ? Math.min(target / actual, 1) : Math.min(actual / target, 1);
  };
  var blockRate = (a) => a.reduce((s, k) => s + ratio(k) * k.w, 0) / a.reduce((s, k) => s + k.w, 0);
  var tR;
  var seoR;
  var semR;
  var liScore;
  var chenScore;
  var company;
  function recomputeScores() {
    tR = blockRate(TOTAL);
    seoR = blockRate(SEO);
    semR = blockRate(SEM);
    liScore = (tR * 0.5 + seoR * 0.5) * 100;
    chenScore = (tR * 0.5 + semR * 0.5) * 100;
    company = (liScore + chenScore) / 2;
  }
  recomputeScores();
  window._seoWeeks = [];
  window._semWeeks = [];
  window._seoWeeksView = void 0;
  function applyKpiServer(rows2) {
    const byGrp = { total: TOTAL, seo: SEO, sem: SEM };
    (rows2 || []).forEach((r) => {
      const arr = byGrp[r.grp];
      if (!arr) return;
      const k = arr.find((x) => x.n === r.name);
      if (k) {
        if (typeof r.target === "number") k.t = r.target;
        if (Object.prototype.hasOwnProperty.call(r, "actual")) k.a = r.actual;
        k.actualAvailable = r.actual_available !== false && r.actual != null;
        k.actualSource = r.actual_source || "";
        k.id = r.id;
      }
    });
  }
  function syncKpiInputs() {
    document.querySelectorAll("#panel-settings [data-kpi]").forEach((el) => {
      const p = el.dataset.kpi.split(":"), arr = { TOTAL, SEO, SEM }[p[0]], idx = +p[1];
      if (arr && arr[idx] && arr[idx].t != null) {
        el.textContent = String(arr[idx].t);
        el.dataset.kpiOld = String(arr[idx].t);
      }
    });
  }
  var metricsRequestSequence = 0;
  async function loadMetrics() {
    const requestId = ++metricsRequestSequence, revision = getRangeRevision();
    try {
      const { rows: rows2 } = await API.get(withRange2("/api/kpi-targets"));
      if (requestId !== metricsRequestSequence || revision !== getRangeRevision()) return false;
      applyKpiServer(rows2);
      syncKpiInputs();
      return true;
    } catch (e) {
      if (e && e.message !== "unauthorized") toast("KPI \u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "\u672A\u77E5\u9519\u8BEF"));
    }
    return false;
  }
  function mapSeoWeek(w) {
    return { date: (w.week_date || "").slice(5), ym: (w.week_date || "").slice(0, 7), clicks: w.clicks, impr: w.impressions, pos: w.avg_position, top10: w.top10_ratio, coverage: w.coverage, indexed: w.indexed_pages, bounce: w.bounce_rate, dwell: w.dwell_seconds };
  }
  function mapSemWeek(w) {
    return { date: (w.week_date || "").slice(5), cost: w.cost, impr: w.impressions, clicks: w.clicks, conv: w.conversions, roas: w.roas, qs: w.quality_score, cpc: w.cpc, ctr: w.ctr, cpconv: w.cost_per_conv };
  }
  var weeksRequestSequence = 0;
  async function loadWeeks() {
    const requestId = ++weeksRequestSequence, revision = getRangeRevision();
    try {
      const [seo, sem] = await Promise.all([API.get(withRange2("/api/seo-weeks")), API.get(withRange2("/api/sem-weeks"))]);
      if (requestId !== weeksRequestSequence || revision !== getRangeRevision()) return false;
      window._seoWeeks = (seo.items || []).map(mapSeoWeek);
      window._semWeeks = (sem.items || []).map(mapSemWeek);
      renderBoardCards();
      return true;
    } catch (e) {
      if (requestId !== weeksRequestSequence || revision !== getRangeRevision()) return false;
      window._seoWeeks = [];
      window._semWeeks = [];
      if (e && e.message !== "unauthorized") toast("\u5468\u62A5\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "\u672A\u77E5\u9519\u8BEF"));
    }
    return false;
  }
  function renderBoardCards() {
  }
  document.addEventListener("change", (e) => {
    if (!e.target || e.target.id !== "sem-hlevel") return;
    const v = e.target.value;
    document.querySelectorAll("#sub-data-sem table.hierarchy tbody tr").forEach((tr) => {
      let show = true;
      if (v === "camp") show = tr.classList.contains("h-camp");
      else if (v === "grp") show = tr.classList.contains("h-camp") || tr.classList.contains("h-grp");
      tr.style.display = show ? "" : "none";
    });
  });
  var _fnum = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  };
  async function submitSeoWeek() {
    const body = {
      week_date: document.getElementById("sw-date").value || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      clicks: _fnum("sw-clicks") || 0,
      impressions: _fnum("sw-impr") || 0,
      avg_position: _fnum("sw-pos"),
      top10_ratio: _fnum("sw-top10"),
      coverage: _fnum("sw-cov"),
      indexed_pages: _fnum("sw-idx"),
      bounce_rate: _fnum("sw-bounce"),
      dwell_seconds: _fnum("sw-dwell")
    };
    try {
      await API.post("/api/seo-weeks", body);
      await Promise.all([loadMetrics(), loadWeeks()]);
      loadSeoBoardGsc();
      refreshSeoWeekChart();
      renderKPI();
      closeModal("seoWkMask");
      const wow = SEO[0].actualAvailable ? "\uFF0C\u81EA\u7136\u6D41\u91CF\u73AF\u6BD4 " + (SEO[0].a >= 0 ? "+" : "") + SEO[0].a + "%" : "";
      toast("\u5DF2\u5F55\u5165\u672C\u5468 GSC \u6570\u636E \xB7 \u5DF2\u5165\u5E93, \u56FE\u8868+KPI \u5DF2\u66F4\u65B0" + wow);
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u5F55\u5165\uFF08\u4EC5\u674E/SEO \u53EF\u5F55\uFF09" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }
  async function submitSemWeek() {
    const body = {
      week_date: document.getElementById("mw-date").value || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      cost: _fnum("mw-cost") || 0,
      impressions: _fnum("mw-impr") || 0,
      clicks: _fnum("mw-clicks") || 0,
      conversions: _fnum("mw-conv") || 0,
      roas: _fnum("mw-roas"),
      quality_score: _fnum("mw-qs")
    };
    try {
      const { item } = await API.post("/api/sem-weeks", body);
      const rec = mapSemWeek(item);
      await Promise.all([loadMetrics(), loadWeeks()]);
      loadSemBoardAds();
      renderKPI();
      closeModal("semWkMask");
      toast("\u5DF2\u5BFC\u5165\u672C\u5468 Ads \u6570\u636E \xB7 CPC \xA5" + (rec.cpc ?? "-") + " / CTR " + (rec.ctr ?? "-") + "% / \u6BCF\u8BE2\u76D8 \xA5" + (rec.cpconv ?? "-") + "\uFF08\u540E\u7AEF\u8BA1\u7B97\uFF09, KPI \u5DF2\u66F4\u65B0");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u5F55\u5165\uFF08\u4EC5\u9648/SEM \u53EF\u5F55\uFF09" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }

  // public/src/ledger.js
  var CARD_ID = "kpiLedger";
  var CELL_TEXT = {
    NOT_APPLICABLE: "N/A",
    MISSING_DATA: "\u5F85\u5F55\u5165",
    NO_SPEND: "\u65E0\u82B1\u8D39",
    SPEND_WITH_ZERO_QUALITY: "\u6709\u82B1\u8D39\xB7\u96F6\u4F18\u8D28",
    SPEND_WITH_ZERO_DEAL: "\u6709\u82B1\u8D39\xB7\u96F6\u6210\u4EA4"
  };
  function make(tag, className, text2) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text2 != null) el.textContent = String(text2);
    return el;
  }
  function cell(tag, className, text2, title) {
    const el = make(tag, className, text2);
    if (title) el.title = title;
    return el;
  }
  var money = (v, currency) => v == null || !Number.isFinite(Number(v)) ? null : (currency === "CNY" ? "\xA5" : "") + Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  var CURRENCY_HINT = "\u91D1\u989D\u4E3A\u5E7F\u544A\u8D26\u6237\u5E01\u79CD\uFF08Ads \u540C\u6B65\u672A\u5B58\u5E01\u79CD\uFF09\uFF0C\u6545\u4E0D\u52A0\u8D27\u5E01\u7B26\u53F7";
  var pct = (v) => v == null || !Number.isFinite(Number(v)) ? null : (Number(v) * 100).toFixed(1) + "%";
  function metricCell(item, extraTitle) {
    if (!item) return cell("td", "num dim", "\u2014", extraTitle || "");
    if (item.status === "VALID" && item.value != null) {
      const parts = [item.note, item.currency === "CNY" ? null : CURRENCY_HINT, extraTitle].filter(Boolean);
      return cell("td", "num", money(item.value, item.currency), parts.join(" \xB7 "));
    }
    const key = item.reason || item.status;
    const text2 = CELL_TEXT[key] || "\u2014";
    const warn = key === "SPEND_WITH_ZERO_DEAL" || key === "SPEND_WITH_ZERO_QUALITY";
    const title = item.note || (warn ? "\u8BE5\u6E20\u9053\u533A\u95F4\u5185\u6709\u82B1\u8D39\u4F46\u6CA1\u6709\u5BF9\u5E94\u7ED3\u679C" : "\u65E0\u6570\u636E\u6E90\uFF0C\u672A\u53C2\u4E0E\u8BA1\u7B97");
    return cell("td", "num " + (warn ? "ledger-warn" : "dim"), text2, extraTitle ? extraTitle + " \xB7 " + title : title);
  }
  function rateCell(value, title) {
    const text2 = pct(value);
    return cell("td", "num " + (text2 ? "" : "dim"), text2 || "\u2014", text2 ? title || "" : "\u8BE5\u53E3\u5F84\u5206\u6BCD\u4E3A 0\uFF0C\u65E0\u6CD5\u8BA1\u7B97");
  }
  function numCell(value) {
    return cell("td", "num", Number(value || 0).toLocaleString("zh-CN"), "");
  }
  function channelRow(row, isTotal) {
    const tr = make("tr", isTotal ? "ledger-total" : "");
    tr.appendChild(cell("td", "ledger-ch", row.label, ""));
    tr.appendChild(metricCell(row.spend));
    tr.appendChild(numCell(row.inquiries));
    tr.appendChild(numCell(row.quality));
    tr.appendChild(numCell(row.deals));
    tr.appendChild(rateCell(row.qualityRate, "\u4F18\u8D28(A/B) \xF7 \u8BE2\u76D8"));
    tr.appendChild(rateCell(row.dealRate, "\u4F18\u8D28\u6210\u4EA4 \xF7 \u4F18\u8D28\u8BE2\u76D8" + (row.dealRateOverall != null ? "\uFF1B\u603B\u53E3\u5F84 " + pct(row.dealRateOverall) : "")));
    tr.appendChild(metricCell(row.costPerQuality, isTotal ? "\u5408\u8BA1\u4E3A\u6DF7\u5408\u53E3\u5F84\uFF08\u5206\u5B50\u4EC5 SEM \u82B1\u8D39\uFF09" : ""));
    tr.appendChild(metricCell(row.cac, isTotal ? "\u5408\u8BA1\u4E3A\u6DF7\u5408\u53E3\u5F84\uFF08\u5206\u5B50\u4EC5 SEM \u82B1\u8D39\uFF09\uFF0C\u53EA\u80FD\u5F53\u4E0B\u9650\u770B" : ""));
    return tr;
  }
  function buildTable(data) {
    const table = make("table", "dt ledger-table");
    const thead = make("thead");
    const htr = make("tr");
    [
      ["\u6E20\u9053", "ledger-ch", ""],
      ["\u82B1\u8D39", "num", "\u4EC5 SEM \u6709\u771F\u5B9E\u5A92\u4F53\u82B1\u8D39\uFF1A\u4F18\u5148\u53D6 Google Ads \u540C\u6B65\uFF0C\u65E0\u540C\u6B65\u6570\u636E\u624D\u56DE\u9000\u4EBA\u5DE5\u5468\u62A5\uFF08\u60AC\u505C\u5355\u5143\u683C\u770B\u672C\u6B21\u7528\u7684\u662F\u54EA\u4E2A\uFF09"],
      ["\u8BE2\u76D8", "num", "\u533A\u95F4\u5185\u8BE5\u6E20\u9053\u8BE2\u76D8\u6570"],
      ["\u4F18\u8D28 A/B", "num", "\u7B49\u7EA7 A \u6216 B\uFF0C\u4E0E\u300C\u6709\u6548\u8BE2\u76D8\u300D\u540C\u53E3\u5F84"],
      ["\u6210\u4EA4", "num", "\u8BE2\u76D8\u5F55\u5165\u91CC\u6807\u6CE8\u300C\u5DF2\u6210\u4EA4\u300D\u7684\u6570\u91CF \xB7 \u6EDE\u540E\u7ED3\u679C"],
      ["\u4F18\u8D28\u7387", "num", "\u4F18\u8D28 \xF7 \u8BE2\u76D8"],
      ["\u6210\u4EA4\u7387", "num", "\u4F18\u8D28\u6210\u4EA4 \xF7 \u4F18\u8D28\u8BE2\u76D8\uFF08\u60AC\u505C\u770B\u603B\u53E3\u5F84\uFF09"],
      ["\u6BCF\u4F18\u8D28\u6210\u672C", "num", "\u82B1\u8D39 \xF7 \u4F18\u8D28\u8BE2\u76D8"],
      ["\u6BCF\u6210\u4EA4\u6210\u672C CAC", "num", "\u82B1\u8D39 \xF7 \u6210\u4EA4"]
    ].forEach(([text2, cls, title]) => htr.appendChild(cell("th", cls, text2, title)));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = make("tbody");
    (data.channels || []).forEach((row) => tbody.appendChild(channelRow(row, false)));
    if (data.totals) tbody.appendChild(channelRow(data.totals, true));
    table.appendChild(tbody);
    return table;
  }
  function buildTargets(targets) {
    const box = make("div", "ledger-targets");
    box.appendChild(make("div", "ledger-sec-title", "\u76EE\u6807 vs \u5F53\u524D\uFF08\u76EE\u6807\u4E3A\u8BBE\u7F6E\u9875\u6708\u5EA6\u76EE\u6807\uFF0C\u672A\u6309\u533A\u95F4\u6298\u7B97\uFF09"));
    (targets || []).forEach((t) => {
      const line = make("div", "ledger-target");
      line.appendChild(make("div", "ledger-target-name", t.label));
      const actualText = t.actual == null ? "\u2014" : t.unit === "\xA5" ? money(t.actual, t.currency) : Number(t.actual).toLocaleString("zh-CN") + t.unit;
      const targetText = t.target == null ? "\u76EE\u6807\u5F85\u5B9A" : "\u76EE\u6807 " + (t.unit === "\xA5" ? money(t.target, "CNY") : Number(t.target).toLocaleString("zh-CN") + t.unit);
      line.appendChild(cell(
        "div",
        "ledger-target-val" + (t.currency_mismatch ? " ledger-warn" : ""),
        actualText + " / " + targetText,
        t.currency_mismatch ? "\u5B9E\u9645\u503C\u6765\u81EA Ads\uFF08\u8D26\u6237\u5E01\u79CD\uFF09\uFF0C\u76EE\u6807\u6309\u4EBA\u6C11\u5E01\u8BBE\u5B9A \u2014\u2014 \u5E01\u79CD\u53EF\u80FD\u4E0D\u4E00\u81F4\uFF0C\u8FDB\u5EA6\u4EC5\u4F9B\u53C2\u8003" : ""
      ));
      const bar = make("div", "progress-bar ledger-progress");
      const fill = make("div", "progress-fill");
      const p = t.progress == null ? 0 : Math.max(0, Math.min(100, t.progress * 100));
      fill.style.width = p + "%";
      fill.classList.add(t.progress == null ? "ledger-fill-muted" : t.progress >= 1 ? "ledger-fill-green" : t.progress >= 0.6 ? "ledger-fill-blue" : "ledger-fill-amber");
      bar.appendChild(fill);
      line.appendChild(bar);
      const tail = t.status === "NO_TARGET" ? "\u5F85\u8001\u677F\u62CD\u677F" : t.status === "NO_ACTUAL" ? "\u6682\u65E0\u5B9E\u9645\u503C" : Math.round(t.progress * 100) + "%";
      line.appendChild(cell(
        "div",
        "ledger-target-pct" + (t.status === "VALID" ? "" : " dim"),
        tail,
        t.inverse ? "\u53CD\u5411\u6307\u6807\uFF1A\u8D8A\u4F4E\u8D8A\u597D\uFF0C\u8FBE\u6807\u5373\u5C01\u9876 100%" : ""
      ));
      box.appendChild(line);
    });
    return box;
  }
  function buildNotes(data) {
    const box = make("div", "ledger-notes");
    const notes = data.notes || {};
    [notes.deal, notes.spend, notes.quality, notes.dealRate].forEach((text2) => {
      if (text2) box.appendChild(make("div", "ledger-note", "\xB7 " + text2));
    });
    if (data.sources && data.sources.spend) {
      box.appendChild(make("div", "ledger-note", "\xB7 \u82B1\u8D39\u53D6\u6570\uFF1A" + data.sources.spend));
    }
    const missing = data.meta && data.meta.dealStatusMissing;
    if (missing) box.appendChild(make("div", "ledger-note ledger-warn", "\xB7 \u6709 " + missing + " \u5C01\u8BE2\u76D8\u672A\u6807\u6CE8\u662F\u5426\u6210\u4EA4\uFF0C\u672A\u8BA1\u5165\u6210\u4EA4\u6570\uFF08\u4E5F\u672A\u5F53\u4F5C\u672A\u6210\u4EA4\uFF09"));
    box.appendChild(make("div", "ledger-note", "\xB7 \u672C\u8868\u4E3A\u4E1A\u52A1\u603B\u8D26\uFF0C\u53EA\u8BFB\uFF1B\u4E0D\u53C2\u4E0E KPI \u7EE9\u6548\u8BC4\u5206"));
    return box;
  }
  function ensureCard() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    const panel = document.getElementById("panel-kpi");
    if (!panel) return null;
    card = make("div", "card ledger-card");
    card.id = CARD_ID;
    const head = make("div", "card-head");
    head.appendChild(make("span", "card-title", "\u8FD0\u8425\u603B\u8D26 \xB7 \u4E1A\u52A1\u7ED3\u679C\u6F0F\u6597"));
    head.appendChild(make("span", "card-sub ledger-range", "\u2014"));
    card.appendChild(head);
    card.appendChild(make("div", "ledger-body", "\u6B63\u5728\u52A0\u8F7D\u8FD0\u8425\u603B\u8D26\u2026"));
    card.addEventListener("click", (e) => {
      if (e.target && e.target.closest("[data-ledger-retry]")) loadLedger(true);
    });
    const tip = panel.querySelector(":scope > .sheet-tip");
    const anchor = tip || panel.querySelector(":scope > .timebar-inline") || panel.querySelector(":scope > .page-head");
    if (anchor && anchor.parentNode === panel) anchor.insertAdjacentElement("afterend", card);
    else panel.appendChild(card);
    return card;
  }
  function setBody(card, node) {
    const body = card.querySelector(".ledger-body");
    if (!body) return;
    body.textContent = "";
    body.appendChild(node);
  }
  function render(card, data) {
    const label = card.querySelector(".ledger-range");
    if (label) label.textContent = "\u5F53\u524D\u533A\u95F4 " + rangeText(data.range);
    const wrap = make("div");
    const scroller = make("div", "ledger-scroll");
    scroller.appendChild(buildTable(data));
    wrap.appendChild(scroller);
    wrap.appendChild(buildTargets(data.targets));
    wrap.appendChild(buildNotes(data));
    setBody(card, wrap);
  }
  function renderError(card, message) {
    const box = make("div", "ledger-error");
    box.appendChild(make("div", "", "\u8FD0\u8425\u603B\u8D26\u52A0\u8F7D\u5931\u8D25\uFF1A" + (message || "\u672A\u77E5\u9519\u8BEF")));
    box.appendChild(make("div", "ledger-note", "\u6570\u636E\u6E90\uFF1Ainquiries\uFF08\u8BE2\u76D8/\u7B49\u7EA7/\u662F\u5426\u6210\u4EA4\uFF09+ sem_weeks.cost\uFF08SEM \u82B1\u8D39\uFF09"));
    const btn = make("button", "btn-ghost", "\u91CD\u8BD5");
    btn.type = "button";
    btn.setAttribute("data-ledger-retry", "1");
    box.appendChild(btn);
    setBody(card, box);
  }
  var requestSequence2 = 0;
  var loadedRevision = null;
  async function loadLedger(force) {
    const card = ensureCard();
    if (!card) return false;
    const revision = getRangeRevision();
    if (!force && loadedRevision === revision) return true;
    const requestId = ++requestSequence2;
    try {
      const data = await API.get(withRange2("/api/kpi/ledger"));
      if (requestId !== requestSequence2 || revision !== getRangeRevision()) return false;
      render(card, data);
      loadedRevision = revision;
      return true;
    } catch (e) {
      if (requestId !== requestSequence2) return false;
      if (e && e.message === "unauthorized") return false;
      renderError(card, e && e.message);
    }
    return false;
  }
  function mountLedger() {
    return loadLedger(false);
  }
  document.addEventListener("timerange", () => {
    loadLedger(true);
  });

  // public/src/kpi-view.js
  function grade(s) {
    if (s >= 90) return { t: "\u4F18\u79C0", c: "var(--green)", bg: "var(--green-soft)", i: "ti-trophy" };
    if (s >= 75) return { t: "\u5408\u683C", c: "var(--blue)", bg: "var(--blue-soft)", i: "ti-circle-check" };
    if (s >= 60) return { t: "\u8B66\u544A", c: "var(--amber)", bg: "var(--amber-soft)", i: "ti-alert-triangle" };
    return { t: "\u6574\u6539", c: "var(--primary)", bg: "var(--primary-soft)", i: "ti-flame" };
  }
  function gauge(arc, sc, score) {
    const C = 364.4, g = grade(score), A = document.getElementById(arc), S = document.getElementById(sc);
    if (!A) return;
    A.style.stroke = g.c;
    S.style.color = g.c;
    let c = 0;
    (function st() {
      c += score / 40;
      if (c >= score) c = score;
      A.style.strokeDashoffset = C - C * c / 100;
      S.textContent = c.toFixed(0);
      if (c < score) requestAnimationFrame(st);
    })();
  }
  function badge(id, score) {
    const b = document.getElementById(id);
    if (!b) return;
    const g = grade(score);
    b.style.background = g.bg;
    b.style.color = g.c;
    b.innerHTML = '<i class="ti ' + g.i + '"></i> ' + g.t;
  }
  function fmt(k, v) {
    if (v == null || !Number.isFinite(Number(v))) return "\u2014";
    return k.u === "\xA5" ? "\xA5" + Number(v).toLocaleString() : k.u === "%" ? v + "%" : k.u === "" ? v : v + k.u;
  }
  function scoreTone(r) {
    return r >= 0.9 ? "kpi-tone-green" : r >= 0.7 ? "kpi-tone-blue" : r >= 0.5 ? "kpi-tone-amber" : "kpi-tone-primary";
  }
  function rows(arr, box) {
    const el = document.getElementById(box);
    if (!el) return;
    el.innerHTML = arr.map((k) => {
      const available = k.actualAvailable !== false && k.a != null, r = available ? ratio(k) : 0, tone = available ? scoreTone(r) : "kpi-tone-muted", progress = Math.max(0, Math.min(100, Number.isFinite(r) ? r * 100 : 0));
      return `<div class="csp-s-1b8e8a2860"><div class="csp-s-83725d2c6e"><div class="csp-s-6e8bcfac8d">${esc(k.n)}</div><div class="csp-s-10a2cb4f9a">\u76EE\u6807 ${fmt(k, k.t)} \xB7 \u5B9E\u9645 ${available ? fmt(k, k.a) : "\u2014"}</div></div><div class="csp-s-d3db975bed"><div class="progress-bar"><div class="progress-fill kpi-progress-fill ${tone}" data-progress="${progress}"></div></div></div><div class="kpi-score-value ${tone}">${available ? Math.round(r * 100) : "\u2014"}</div></div>`;
    }).join("");
    el.querySelectorAll("[data-progress]").forEach((fill) => {
      const progress = Number(fill.dataset.progress);
      fill.style.width = `${Number.isFinite(progress) ? progress : 0}%`;
    });
  }
  function mini(ov) {
    ov = ov || { current: {} };
    const c = ov.current || {};
    const d = ov.delta || {};
    const momTxt = (v) => v == null ? "" : v > 0 ? "\u25B2" + v : v < 0 ? "\u25BC" + Math.abs(v) : "\u2014";
    const m = [
      ["\u6709\u6548\u8BE2\u76D8", c.valid ?? "\u2014", "", ""],
      ["A\u7EA7\u5360\u6BD4", c.aRatio != null ? c.aRatio + "%" : "\u2014", "", momTxt(d.aRatio)],
      ["\u6709\u6548\u8BE2\u76D8\u7387", c.validRate != null ? c.validRate + "%" : "\u2014", "", momTxt(d.validRate)]
    ];
    const el = document.getElementById("miniScores");
    if (!el) return;
    el.innerHTML = m.map((x) => `<div class="csp-s-b478e20d45"><div class="csp-s-f9c9d2e5d2">${x[0]}</div><div class="csp-s-73eb966c81">${x[1]}<span class="csp-s-19439c522a">${x[2]}</span> <span class="kpi-mini-trend ${(x[3] || "").startsWith("\u25B2") ? "kpi-tone-green" : (x[3] || "").startsWith("\u25BC") ? "kpi-tone-primary" : "kpi-tone-muted"}">${x[3] || ""}</span></div></div>`).join("");
  }
  var overviewRequestSequence = 0;
  async function loadOverview() {
    const requestId = ++overviewRequestSequence, revision = getRangeRevision();
    try {
      const ov = await API.get(withRange2("/api/overview"));
      if (requestId !== overviewRequestSequence || revision !== getRangeRevision()) return false;
      const c = ov.current || {}, d = ov.delta || {}, comparison = ov.comparisonLabel || "vs \u4E0A\u6708";
      const set = (id, v) => {
        const e = document.getElementById(id);
        if (e) e.textContent = v;
      };
      set("topValid", (c.valid ?? "\u2014") + " / " + (c.total ?? "\u2014"));
      set("topAratio", c.aRatio != null ? c.aRatio + "%" : "\u2014");
      set("topRate", c.validRate != null ? c.validRate + "%" : "\u2014");
      const tg = document.getElementById("topGrade");
      if (tg) {
        tg.textContent = c.grade || "";
        tg.className = "kpi-delta " + (c.company >= 75 ? "delta-pos" : "delta-neg");
      }
      const mom = (el, v) => {
        if (!el) return;
        if (v == null) {
          el.textContent = "";
          return;
        }
        el.textContent = (v > 0 ? "\u25B2" + v : v < 0 ? "\u25BC" + Math.abs(v) : "\u2014") + " " + comparison;
        el.className = "kpi-delta " + (v > 0 ? "delta-pos" : v < 0 ? "delta-neg" : "");
      };
      mom(document.getElementById("topAratioMoM"), d.aRatio);
      mom(document.getElementById("topRateMoM"), d.validRate);
      const g1b = document.getElementById("g1b");
      if (g1b) {
        let chip = document.getElementById("g1mom");
        if (!chip) {
          chip = document.createElement("span");
          chip.id = "g1mom";
          chip.style.marginLeft = "8px";
          chip.style.fontSize = "11px";
          chip.style.fontWeight = "800";
          g1b.parentElement && g1b.parentElement.appendChild(chip);
        }
        if (d.company == null) {
          chip.textContent = "\u9996\u6708\u65E0\u73AF\u6BD4";
          chip.style.color = "var(--text3)";
        } else {
          chip.textContent = (d.company > 0 ? "\u25B2" + d.company : d.company < 0 ? "\u25BC" + Math.abs(d.company) : "\u2014") + " \u5206 " + comparison;
          chip.style.color = d.company > 0 ? "var(--green)" : d.company < 0 ? "var(--primary)" : "var(--text3)";
        }
      }
      set("overviewKpiTitle", "\u6240\u9009\u533A\u95F4 KPI \u8003\u6838\u603B\u5206");
      const rangeLabel = document.getElementById("kpiRangeLabel");
      if (rangeLabel) rangeLabel.textContent = "\u5F53\u524D\u533A\u95F4 " + rangeText(ov.range);
      mini(ov);
      return true;
    } catch (e) {
      if (requestId === overviewRequestSequence) mini();
    }
    return false;
  }
  function renderKPI2() {
    recomputeScores();
    rows(TOTAL, "totalRows");
    rows(SEO, "seoRows");
    rows(SEM, "semRows");
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    set("topScore", company.toFixed(0));
    badge("liBadge", liScore);
    badge("chenBadge", chenScore);
    gauge("g1", "g1s", company);
    gauge("g2", "g2s", company);
    badge("g1b", company);
    badge("g2b", company);
    gauge("liArc", "liScore", liScore);
    gauge("chenArc", "chenScore", chenScore);
    mountLedger();
  }
  var kpiRefreshSequence = 0;
  async function refreshKpiRange() {
    const requestId = ++kpiRefreshSequence, revision = getRangeRevision();
    await Promise.all([loadMetrics(), loadWeeks(), loadOverview()]);
    if (requestId !== kpiRefreshSequence || revision !== getRangeRevision()) return;
    renderKPI2();
  }
  document.addEventListener("timerange", refreshKpiRange);

  // public/src/google-projects.js
  var google_projects_exports = {};
  __export(google_projects_exports, {
    backfillGoogle: () => backfillGoogle,
    loadDataSourcesStatus: () => loadDataSourcesStatus,
    loadIntegrations: () => loadIntegrations,
    startGoogleAuth: () => startGoogleAuth,
    syncGoogle: () => syncGoogle
  });
  var INTEG_LABEL = { gsc: "Google Search Console", ga4: "Google Analytics 4 (GA4)", ads: "Google Ads" };
  var GOOGLE_PROVIDER_ORDER = ["gsc", "ga4", "ads"];
  var DS_LABEL = { inquiries: "\u8BE2\u76D8", seo_weeks: "SEO \u5468\u62A5", sem_weeks: "SEM \u5468\u62A5", gsc: "GSC", ga4: "GA4", ads: "Google Ads", ai: "AI Provider" };
  var DS_ORDER = ["inquiries", "seo_weeks", "sem_weeks", "gsc", "ga4", "ads", "ai"];
  var DS_TYPE_LABEL = { manual: "\u4EBA\u5DE5\u5F55\u5165", sync: "\u81EA\u52A8\u540C\u6B65", provider: "AI Provider" };
  function dsStatusMeta(status, type) {
    const map = {
      available: [type === "sync" ? "\u5DF2\u6388\u6743 \xB7 \u53EF\u540C\u6B65" : "\u4EBA\u5DE5\u5F55\u5165 \xB7 \u6709\u6570\u636E", type === "sync" ? "b-green" : "b-blue"],
      no_records: ["\u4EBA\u5DE5\u5F55\u5165 \xB7 \u6682\u65E0\u6570\u636E", "b-gray"],
      not_configured: type === "sync" ? ["\u540E\u7AEF\u672A\u914D\u7F6E", "b-gray"] : ["\u672A\u914D\u7F6E", "b-gray"],
      configured_not_synced: ["\u5DF2\u914D\u7F6E \xB7 \u5F85 OAuth \u6388\u6743", "b-amber"],
      not_implemented: ["\u672A\u63A5\u5165", "b-gray"],
      configured_unverified: ["\u5DF2\u914D\u7F6E \xB7 \u672A\u9A8C\u8BC1", "b-amber"],
      error: ["\u72B6\u6001\u83B7\u53D6\u5931\u8D25", "b-red"]
    };
    return map[status] || ["\u72B6\u6001\u83B7\u53D6\u5931\u8D25", "b-red"];
  }
  function dsRow(key, s) {
    s = s || {};
    const name = DS_LABEL[key] || key;
    const typeText = DS_TYPE_LABEL[s.type] || s.type || "";
    const [text2, cls] = dsStatusMeta(s.status, s.type);
    const time = s.type === "manual" ? s.lastAt || "\u2014" : s.type === "sync" ? s.lastSyncAt || "\u2014" : "\u2014";
    const count = s.type === "manual" || s.type === "sync" ? s.count == null ? 0 : s.count : "\u2014";
    let extra = "";
    if (s.error) extra = `<span class="csp-s-b0e08465c2"> \xB7 \u9519\u8BEF\uFF1A${esc(s.error)}</span>`;
    else if (s.type === "sync" && s.missing && s.missing.length) extra = `<span class="dim"> \xB7 \u7F3A\u5C11 ${esc(s.missing.join(", "))}</span>`;
    else if (s.note === "google_oauth_required") extra = `<span class="dim"> \xB7 \u9700\u8981 OAuth \u6388\u6743</span>`;
    else if (s.note === "google_sync_ready") extra = `<span class="dim"> \xB7 \u53EF\u624B\u52A8\u540C\u6B65</span>`;
    else if (s.type === "provider" && s.status === "configured_unverified") extra = `<span class="dim"> \xB7 ${esc(s.provider || "")}${s.model ? " / " + esc(s.model) : ""}</span>`;
    return `<div class="csp-s-6d1156dd83"><div class="csp-s-22dccc46c7">${esc(name)}</div><div class="csp-s-b57829faf1">${esc(typeText)}</div><span class="badge ${cls}">${esc(text2)}</span><div class="csp-s-83725d2c6e"></div><div class="csp-s-95144d7b86">\u65F6\u95F4 ${esc(String(time))} \xB7 \u8BB0\u5F55 ${esc(String(count))}</div><div class="csp-s-33ee298127">${extra}</div></div>`;
  }
  async function loadDataSourcesStatus() {
    const box = document.getElementById("ds-status-rows");
    if (!box) return;
    const tag = document.getElementById("ds-demo-tag");
    if (tag) tag.innerHTML = window.DEMO_MODE ? '<span class="badge b-amber csp-s-9d5367afed">\u793A\u4F8B\u6A21\u5F0F</span>' : "";
    try {
      const r = await API.get("/api/data-sources/status");
      const src = r && r.sources || {};
      box.innerHTML = DS_ORDER.map((k) => dsRow(k, src[k])).join("") + (window.DEMO_MODE ? '<div class="dim csp-s-5698104cf1">\u5F53\u524D\u4E3A\u6F14\u793A\u6807\u8BB0\uFF0C\u4E0B\u65B9\u4ECD\u4E3A\u63A5\u53E3\u771F\u5B9E\u72B6\u6001\u3002</div>' : "");
    } catch (e) {
      box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x csp-s-fd44150866"></i><div><div class="banner-t">\u72B6\u6001\u83B7\u53D6\u5931\u8D25</div><div class="banner-s">${esc(e && e.message ? e.message : "\u8BF7\u6C42\u5931\u8D25")}</div></div></div>`;
    }
  }
  async function loadIntegrations() {
    const box = document.getElementById("integ-rows");
    if (!box) return;
    try {
      const r = await API.get("/api/google/status");
      const providers = r && r.providers || {};
      const project = r && r.defaultProject;
      const projectText = project ? `\u9ED8\u8BA4\u9879\u76EE\uFF1A${esc(project.name || "\u672A\u547D\u540D\u9879\u76EE")}` : "\u672A\u521B\u5EFA\u9879\u76EE\u65F6\u4F7F\u7528 .env \u4E2D\u7684\u9ED8\u8BA4\u7AD9\u70B9 / Property / Customer";
      box.innerHTML = `<div class="sheet-tip csp-s-145afb7049"><i class="ti ti-info-circle"></i> ${projectText}</div>` + GOOGLE_PROVIDER_ORDER.map((p) => googleProviderRow(p, providers[p] || {}, project)).join("");
      bindGoogleProviderActions(box);
    } catch (e) {
      box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x csp-s-fd44150866"></i><div><div class="banner-t">Google \u63A5\u5165\u72B6\u6001\u83B7\u53D6\u5931\u8D25</div><div class="banner-s">${esc(e && e.message ? e.message : "\u8BF7\u6C42\u5931\u8D25")}</div></div></div>`;
    }
  }
  function googleProviderRow(provider, s, project) {
    const configured = !!s.configured;
    const authorized = !!s.authorized;
    const ok = configured && authorized;
    const badge3 = ok ? '<span class="badge b-green">\u5DF2\u6388\u6743</span>' : configured ? '<span class="badge b-amber">\u5F85\u6388\u6743</span>' : '<span class="badge b-gray">\u540E\u7AEF\u672A\u914D\u7F6E</span>';
    const missing = s.missing && s.missing.length ? `<div class="dim csp-s-c9f8cfee5a">\u7F3A\u5C11\uFF1A${esc(s.missing.join(", "))}</div>` : "";
    const lastSync = s.lastSyncAt || "\u2014";
    const lastStatus = s.lastSyncStatus || "\u672A\u540C\u6B65";
    const lastError = s.lastError ? `<div class="csp-s-5ade8bf698">\u6700\u8FD1\u9519\u8BEF\uFF1A${esc(s.lastError)}</div>` : "";
    const providerConfigNote = provider === "gsc" ? s.siteUrlConfigured || project?.gsc_site_url ? "\u7AD9\u70B9\u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GSC_SITE_URL \u6216\u9879\u76EE\u7AD9\u70B9" : provider === "ga4" ? s.propertyConfigured || project?.ga4_property_id ? "Property \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GA4_PROPERTY_ID \u6216\u9879\u76EE Property" : s.customerConfigured || project?.ads_customer_id ? "Customer \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GOOGLE_ADS_CUSTOMER_ID \u6216\u9879\u76EE Customer";
    const authDisabled = configured ? "" : "disabled";
    const syncDisabled = ok ? "" : "disabled";
    return `<div class="csp-s-98c17c8e1c">
    <div class="csp-s-fad0d7671e">${esc(INTEG_LABEL[provider] || provider)} ${badge3}</div>
    <div class="csp-s-fd03ebc21e">
      <div>${esc(providerConfigNote)} \xB7 \u6700\u8FD1\u540C\u6B65\uFF1A${esc(String(lastSync))} \xB7 \u72B6\u6001\uFF1A${esc(String(lastStatus))}</div>
      ${missing}${lastError}
    </div>
    <button type="button" class="btn-ghost" data-google-action="auth" data-provider="${esc(provider)}" ${authDisabled}><i class="ti ti-brand-google"></i> \u6388\u6743</button>
    <button type="button" class="btn-ghost" data-google-action="backfill" data-provider="${esc(provider)}" ${syncDisabled} title="\u56DE\u8865\u6700\u8FD1 90 \u5929\u5386\u53F2\uFF08\u9996\u6B21\u63A5\u5165\u6216\u56FE\u8868\u524D\u6BB5\u7A7A\u767D\u65F6\u7528\uFF0C\u53EF\u80FD\u8017\u65F6\u8F83\u4E45\uFF09"><i class="ti ti-history"></i> \u56DE\u886590\u5929</button>
    <button type="button" class="btn-primary" data-google-action="sync" data-provider="${esc(provider)}" ${syncDisabled}><i class="ti ti-refresh"></i> \u7ACB\u5373\u540C\u6B65</button>
  </div>`;
  }
  function bindGoogleProviderActions(box) {
    box.onclick = (e) => {
      const btn = e.target.closest("[data-google-action]");
      if (!btn || !box.contains(btn)) return;
      const provider = btn.dataset.provider;
      if (!GOOGLE_PROVIDER_ORDER.includes(provider)) return;
      const action = btn.dataset.googleAction;
      if (action === "auth") startGoogleAuth(provider);
      else if (action === "backfill") backfillGoogle(provider, 90, btn);
      else if (action === "sync") syncGoogle(provider, btn);
    };
  }
  function startGoogleAuth(provider) {
    location.href = "/api/google/auth/start?provider=" + encodeURIComponent(provider);
  }
  async function backfillGoogle(provider, days, btn) {
    const old = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2"></i> \u56DE\u8865\u4E2D\u2026';
    }
    try {
      const end = /* @__PURE__ */ new Date();
      end.setUTCDate(end.getUTCDate() - 1);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - (days - 1));
      const iso = (d) => d.toISOString().slice(0, 10);
      const r = await API.post("/api/sync/" + encodeURIComponent(provider), { start_date: iso(start), end_date: iso(end) });
      toast(`${INTEG_LABEL[provider] || provider} \u56DE\u8865 ${days} \u5929\u5B8C\u6210\uFF0C\u5199\u5165 ${r.rowsWritten || 0} \u884C`);
      await loadDataSourcesStatus();
      await loadIntegrations();
      if (provider === "ga4" && typeof loadGa4 === "function") await loadGa4();
      loadDataFreshness();
    } catch (e) {
      const missing = e && e.body && e.body.missing && e.body.missing.length ? `\uFF0C\u7F3A\u5C11\uFF1A${e.body.missing.join(", ")}` : "";
      toast(`\u56DE\u8865\u5931\u8D25\uFF1A${e.message}${missing}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = old;
      }
    }
  }
  async function syncGoogle(provider, btn) {
    const old = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2"></i> \u540C\u6B65\u4E2D';
    }
    try {
      const r = await API.post("/api/sync/" + encodeURIComponent(provider), {});
      toast(`${INTEG_LABEL[provider] || provider} \u540C\u6B65\u5B8C\u6210\uFF0C\u5199\u5165 ${r.rowsWritten || 0} \u884C`);
      await loadDataSourcesStatus();
      await loadIntegrations();
      if (provider === "ga4" && typeof loadGa4 === "function") await loadGa4();
    } catch (e) {
      const missing = e && e.body && e.body.missing && e.body.missing.length ? `\uFF0C\u7F3A\u5C11\uFF1A${e.body.missing.join(", ")}` : "";
      toast(`\u540C\u6B65\u5931\u8D25\uFF1A${e.message}${missing}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = old;
      }
    }
  }

  // public/src/archive.js
  var archive_exports = {};
  __export(archive_exports, {
    loadArchive: () => loadArchive2
  });
  document.addEventListener("click", async (e) => {
    const arc = e.target.closest(".row-archive");
    const dep = e.target.closest(".row-dep");
    if (!arc && !dep) return;
    const tr = (arc || dep).closest("tr");
    if (!tr) return;
    const id = tr.dataset.id, ep = tr.dataset.ep;
    if (!id || !ep) return;
    const dEl = tr.querySelector('[data-kind="dept"]');
    const deptTxt = dEl ? dEl.textContent.trim() : "";
    const isSem = deptTxt === "SEM" || /sem/i.test(tr.parentElement && tr.parentElement.id || "");
    const isCompany = deptTxt === "\u516C\u53F8";
    const ak = isCompany ? "company" : isSem ? "sem" : "seo";
    const content = (tr.querySelector('[data-field="content"]') || tr.querySelector('[data-field="title"]') || tr.cells[0]).innerText.trim();
    if (arc) {
      if (!inlineConfirm(arc, "\u786E\u8BA4\u5F52\u6863")) return;
      arc.disabled = true;
      try {
        await API.post(ep + "/" + id + "/archive", { archive_kind: ak });
        tr.remove();
        toast("\u5DF2\u5F52\u6863");
      } catch (err) {
        arc.disabled = false;
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u5F52\u6863\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
    } else if (dep) {
      dep.disabled = true;
      try {
        const s = { dept: isCompany ? "\u516C\u53F8" : isSem ? "SEM" : "SEO", owner: isSem ? "\u9648" : "\u674E", c: isSem ? "b-purple" : "b-blue" };
        const { item } = await persistLoop("deposit", s, content, "\u6C89\u6DC0");
        const depTb = document.getElementById("tb-dep");
        if (depTb) {
          const state = depTb.querySelector("tr[data-load-state]");
          if (state) state.remove();
          const ntr = document.createElement("tr");
          ntr.dataset.id = item.id;
          ntr.dataset.ep = "/api/loop-items";
          ntr.innerHTML = depRowHtml(item);
          depTb.insertBefore(ntr, depTb.firstChild);
          const de = document.getElementById("dep-empty");
          if (de) de.style.display = "none";
        }
        dep.disabled = false;
        toast("\u5DF2\u6C89\u6DC0\u5230\u6C89\u6DC0\u8868 \xB7 \u5DF2\u5165\u5E93");
      } catch (err) {
        dep.disabled = false;
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u6C89\u6DC0\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
    }
  });
  function archRowHtml(it, from) {
    const date = (it.archived_at || "").slice(0, 10);
    const dept = it.dept || "\u2014";
    const content = esc(it.content || it.title || it.detail || "");
    const fromBadge = '<span class="badge ' + (from === "fix" ? "b-amber" : "b-blue") + '">' + (from === "fix" ? "\u6574\u6539" : it.kind === "task" ? "\u4EFB\u52A1" : it.kind === "plan" ? "\u8BA1\u5212" : it.kind === "test" ? "\u6D4B\u8BD5" : it.kind === "deposit" ? "\u6C89\u6DC0" : "\u95ED\u73AF") + "</span>";
    const isBoss = (window.ME || {}).role === "boss";
    const ops = '<button class="btn-mini arch-restore" title="\u6062\u590D\u5230\u539F\u9875"><i class="ti ti-rotate"></i> \u6062\u590D</button>' + (isBoss ? ' <button class="btn-mini arch-hard csp-s-b0e08465c2" title="\u5F7B\u5E95\u5220\u9664\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"><i class="ti ti-trash"></i> \u5F7B\u5E95\u5220\u9664</button>' : "");
    return `<td class="archive-date num">${esc(date || "\u2014")}</td><td class="archive-source ctr">${fromBadge}</td><td class="archive-content"><span class="archive-text" title="${content}">${content}</span></td><td class="archive-dept ctr">${esc(dept)}</td><td class="archive-actions ctr">${ops}</td>`;
  }
  function archInqRowHtml(it) {
    const date = (it.archived_at || "").slice(0, 10);
    const isBoss = (window.ME || {}).role === "boss";
    const ops = '<button class="btn-mini arch-restore" title="\u6062\u590D\u5230\u8BE2\u76D8\u5217\u8868"><i class="ti ti-rotate"></i> \u6062\u590D</button>' + (isBoss ? ' <button class="btn-mini arch-hard csp-s-b0e08465c2" title="\u5F7B\u5E95\u5220\u9664\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"><i class="ti ti-trash"></i> \u5F7B\u5E95\u5220\u9664</button>' : "");
    const label = it.customer_code || it.customer_name;
    const cust = (label ? esc(label) + " \xB7 " : "") + esc(it.country || "");
    const source = esc(it.source || "");
    return `<td class="archive-date num">${esc(date || "\u2014")}</td><td class="archive-short-date num">${esc((it.date || "").slice(5))}</td><td class="archive-customer"><span class="archive-text" title="${cust}">${cust}</span></td><td class="archive-source-term dim"><span class="archive-text" title="${source}">${source}</span></td><td class="archive-grade ctr"><span class="badge ${GRADE_BADGE[it.grade] || "b-gray"}">${esc(it.grade || "")}</span></td><td class="archive-channel ctr dim">${esc(it.channel || "")}</td><td class="archive-actions ctr">${ops}</td>`;
  }
  async function loadArchive2() {
    const bucket = { sem: [], seo: [], company: [] };
    try {
      const { items } = await API.get("/api/fixes?archived=1");
      (items || []).forEach((f) => {
        const k = f.archive_kind || deriveAk(f.dept);
        if (bucket[k]) bucket[k].push({ ...f, _from: "fix" });
      });
    } catch (e) {
    }
    try {
      const { items } = await API.get("/api/loop-items?archived=1");
      (items || []).forEach((it) => {
        const k = it.archive_kind || deriveAk(it.dept);
        if (bucket[k]) bucket[k].push({ ...it, _from: "loop" });
      });
    } catch (e) {
    }
    ["sem", "seo", "company"].forEach((k) => {
      const tb = document.getElementById("tb-arc-" + k);
      if (!tb) return;
      tb.innerHTML = "";
      const rows2 = bucket[k].slice().sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")));
      rows2.forEach((it) => {
        const tr = document.createElement("tr");
        tr.dataset.id = it.id;
        tr.dataset.ep = it._from === "fix" ? "/api/fixes" : "/api/loop-items";
        tr.innerHTML = archRowHtml(it, it._from);
        tb.appendChild(tr);
      });
      const e = document.getElementById("arc-" + k + "-empty");
      if (e) e.style.display = rows2.length ? "none" : "block";
    });
    const itb = document.getElementById("tb-arc-inquiry");
    if (itb) {
      itb.innerHTML = "";
      let inqs = [];
      try {
        const { items } = await API.get("/api/inquiries?archived=1");
        inqs = items || [];
      } catch (e2) {
      }
      inqs.forEach((it) => {
        const tr = document.createElement("tr");
        tr.dataset.id = it.id;
        tr.dataset.ep = "/api/inquiries";
        tr.innerHTML = archInqRowHtml(it);
        itb.appendChild(tr);
      });
      const e = document.getElementById("arc-inquiry-empty");
      if (e) e.style.display = inqs.length ? "none" : "block";
    }
  }
  function deriveAk(dept) {
    return dept === "SEM" ? "sem" : dept === "\u516C\u53F8" ? "company" : "seo";
  }
  document.addEventListener("click", async (e) => {
    const r = e.target.closest(".arch-restore");
    const h = e.target.closest(".arch-hard");
    if (!r && !h) return;
    const tr = (r || h).closest("tr");
    if (!tr) return;
    const id = tr.dataset.id, ep = tr.dataset.ep;
    if (!id || !ep) return;
    if (r) {
      if (!inlineConfirm(r, "\u786E\u8BA4\u6062\u590D")) return;
      try {
        await API.post(ep + "/" + id + "/restore");
        tr.remove();
        if (ep === "/api/inquiries") {
          loadInquiries();
          loadDashboardInq();
        }
        toast("\u5DF2\u6062\u590D \xB7 \u8BF7\u56DE\u539F\u9875\u67E5\u770B");
      } catch (err) {
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u6062\u590D\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
    } else {
      if (!inlineConfirm(h, "\u786E\u8BA4\u5F7B\u5E95\u5220\u9664")) return;
      try {
        await API.del(ep + "/" + id + "?hard=1");
        tr.remove();
        toast("\u5DF2\u5F7B\u5E95\u5220\u9664");
      } catch (err) {
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u5220\u9664\u5931\u8D25\uFF1A" + (err.message || "\u8BF7\u6C42\u5931\u8D25"));
      }
    }
  });

  // public/src/hermes-memory.js
  var hermes_memory_exports = {};
  __export(hermes_memory_exports, {
    loadHermesMemories: () => loadHermesMemories,
    resetHermesFeedbackForm: () => resetHermesFeedbackForm,
    resetHermesMemoryForm: () => resetHermesMemoryForm,
    saveHermesFeedback: () => saveHermesFeedback,
    saveHermesMemory: () => saveHermesMemory
  });
  var KIND_LABEL = {
    company: "\u516C\u53F8\u4E8B\u5B9E",
    customer: "\u5BA2\u6237\u753B\u50CF",
    market: "\u5E02\u573A / \u5BA2\u6237",
    operation: "\u8FD0\u8425\u7ECF\u9A8C",
    decision: "\u51B3\u7B56\u6807\u51C6",
    learning: "\u6BCF\u65E5\u5B66\u4E60",
    preference: "\u504F\u597D",
    risk: "\u98CE\u9669\u63D0\u9192"
  };
  function byId(id) {
    return document.getElementById(id);
  }
  function text(value) {
    return value == null ? "" : String(value);
  }
  function setText2(el, value) {
    if (el) el.textContent = text(value);
  }
  function field(id) {
    const el = byId(id);
    return el ? el.value.trim() : "";
  }
  var FEEDBACK_LABEL = {
    adopted: "\u91C7\u7EB3 \xB7 \u6709\u4EF7\u503C",
    done: "\u5DF2\u6267\u884C \xB7 \u540E\u7EED\u53EF\u590D\u7528",
    rejected: "\u6682\u4E0D\u91C7\u7EB3 \xB7 \u4E0D\u7B26\u5408\u5F53\u524D\u7B56\u7565",
    wrong: "\u4E0D\u51C6 \xB7 \u5224\u65AD\u9519\u8BEF",
    generic: "\u592A\u6CDB \xB7 \u6CA1\u6709\u7ED3\u5408\u4E1A\u52A1"
  };
  function td(value, className) {
    const cell2 = document.createElement("td");
    if (className) cell2.className = className;
    cell2.textContent = text(value);
    return cell2;
  }
  function badge2(label, className) {
    const span = document.createElement("span");
    span.className = "badge " + (className || "b-gray");
    span.textContent = label;
    return span;
  }
  function renderMemory(row) {
    const tr = document.createElement("tr");
    const kind = td("", "");
    kind.appendChild(badge2(KIND_LABEL[row.kind] || row.kind || "\u8BB0\u5FC6", row.kind === "risk" ? "b-red" : row.kind === "decision" ? "b-amber" : "b-blue"));
    tr.appendChild(kind);
    const importance = td("", "ctr");
    importance.appendChild(badge2(String(row.importance || 3), Number(row.importance) >= 4 ? "b-green" : "b-gray"));
    tr.appendChild(importance);
    const main = document.createElement("td");
    const title = document.createElement("div");
    title.style.fontWeight = "800";
    title.style.marginBottom = "5px";
    title.textContent = text(row.title);
    const content = document.createElement("div");
    content.className = "dim";
    content.style.fontSize = "11.5px";
    content.style.whiteSpace = "pre-wrap";
    content.textContent = text(row.content);
    const source = document.createElement("div");
    source.className = "dim";
    source.style.fontSize = "11px";
    source.style.marginTop = "6px";
    source.textContent = row.source ? "\u6765\u6E90\uFF1A" + row.source : "";
    const trust = document.createElement("div");
    trust.style.marginTop = "6px";
    trust.appendChild(row.trust?.trusted ? badge2("\u53EF\u4F5C\u4E3A\u56DE\u7B54\u8BC1\u636E", "b-green") : badge2("\u5F85\u4EBA\u5DE5\u786E\u8BA4 \xB7 \u4E0D\u8FDB\u5165\u56DE\u7B54\u8BC1\u636E", "b-amber"));
    main.append(title, content, source, trust);
    tr.appendChild(main);
    const evidence = td(row.evidence || "\u2014", "");
    evidence.style.whiteSpace = "pre-wrap";
    evidence.style.fontSize = "11.5px";
    tr.appendChild(evidence);
    tr.appendChild(td(row.updated_at || row.created_at || "\u2014", "dim"));
    const action = td("", "ctr");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-ghost";
    editBtn.textContent = "\u7F16\u8F91";
    editBtn.addEventListener("click", () => editHermesMemory(row));
    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "btn-ghost";
    stopBtn.textContent = "\u505C\u7528";
    stopBtn.style.marginLeft = "6px";
    stopBtn.addEventListener("click", () => deactivateHermesMemory(row.id));
    action.append(editBtn, stopBtn);
    tr.appendChild(action);
    return tr;
  }
  async function loadHermesMemories(manual) {
    const tbody = byId("tb-hermes-memory");
    const empty = byId("hm-empty");
    const count = byId("hm-count");
    if (!tbody || !window.API) return;
    tbody.textContent = "";
    setText2(count, "\u52A0\u8F7D\u4E2D...");
    try {
      const data = await window.API.get("/api/hermes/memories");
      const items = data.items || [];
      items.forEach((item) => tbody.appendChild(renderMemory(item)));
      if (empty) empty.style.display = items.length ? "none" : "block";
      setText2(count, items.length ? items.length + " \u6761\u6709\u6548\u8BB0\u5FC6" : "\u6682\u65E0\u6709\u6548\u8BB0\u5FC6");
      if (manual) toast("AI \u8BB0\u5FC6\u5DF2\u5237\u65B0");
    } catch (e) {
      setText2(count, "\u52A0\u8F7D\u5931\u8D25");
      if (empty) empty.style.display = "block";
      toast("AI \u8BB0\u5FC6\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }
  function resetHermesMemoryForm() {
    ["hm-id", "hm-title", "hm-content", "hm-evidence"].forEach((id) => {
      const el = byId(id);
      if (el) el.value = "";
    });
    const kind = byId("hm-kind");
    if (kind) kind.value = "market";
    const importance = byId("hm-importance");
    if (importance) importance.value = "3";
    const source = byId("hm-source");
    if (source) source.value = "manual";
    setText2(byId("hm-submit-label"), "\u5B58\u5165 AI \u8BB0\u5FC6");
  }
  function editHermesMemory(row) {
    const id = byId("hm-id");
    if (id) id.value = row.id || "";
    const kind = byId("hm-kind");
    if (kind) kind.value = row.kind || "learning";
    const importance = byId("hm-importance");
    if (importance) importance.value = String(row.importance || 3);
    const title = byId("hm-title");
    if (title) title.value = text(row.title);
    const content = byId("hm-content");
    if (content) content.value = text(row.content);
    const evidence = byId("hm-evidence");
    if (evidence) evidence.value = text(row.evidence);
    const source = byId("hm-source");
    if (source) source.value = text(row.source || "manual");
    setText2(byId("hm-submit-label"), "\u66F4\u65B0 AI \u8BB0\u5FC6");
    const panel = byId("panel-ai-memory");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function saveHermesMemory() {
    const body = {
      kind: field("hm-kind") || "learning",
      importance: Number(field("hm-importance")) || 3,
      title: field("hm-title"),
      content: field("hm-content"),
      evidence: field("hm-evidence"),
      source: field("hm-source") || "manual"
    };
    if (!body.title || !body.content) {
      toast("\u6807\u9898\u548C\u8BB0\u5FC6\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    try {
      const id = field("hm-id");
      if (id) await window.API.patch("/api/hermes/memories/" + encodeURIComponent(id), body);
      else await window.API.post("/api/hermes/memories", body);
      resetHermesMemoryForm();
      await loadHermesMemories(false);
      toast(id ? "AI \u8BB0\u5FC6\u5DF2\u66F4\u65B0" : "\u5DF2\u5B58\u5165 AI \u8BB0\u5FC6");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u4FEE\u6539 AI \u8BB0\u5FC6" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }
  async function deactivateHermesMemory(id) {
    if (!id || !window.API) return;
    if (!confirm("\u786E\u5B9A\u505C\u7528\u8FD9\u6761 AI \u8BB0\u5FC6\u5417\uFF1F\u505C\u7528\u540E Hermes \u4E0D\u4F1A\u518D\u53C2\u8003\u5B83\u3002")) return;
    try {
      await window.API.del("/api/hermes/memories/" + encodeURIComponent(id));
      await loadHermesMemories(false);
      toast("\u5DF2\u505C\u7528\u8FD9\u6761 AI \u8BB0\u5FC6");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u505C\u7528 AI \u8BB0\u5FC6" : "\u505C\u7528\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }
  function resetHermesFeedbackForm() {
    ["hf-scope", "hf-suggestion", "hf-note"].forEach((id) => {
      const el = byId(id);
      if (el) el.value = "";
    });
    const result = byId("hf-result");
    if (result) result.value = "adopted";
  }
  async function saveHermesFeedback() {
    const result = field("hf-result") || "adopted";
    const suggestion = field("hf-suggestion");
    const note = field("hf-note");
    const scope = field("hf-scope") || "\u672A\u6307\u5B9A\u8303\u56F4";
    if (!suggestion || !note) {
      toast("\u539F\u5EFA\u8BAE\u548C\u4F60\u7684\u5224\u65AD\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    const negative = result === "wrong" || result === "generic";
    const body = {
      kind: negative ? "risk" : result === "rejected" ? "preference" : "learning",
      importance: negative ? 4 : 3,
      title: "Hermes\u5EFA\u8BAE\u53CD\u9988\uFF1A" + (FEEDBACK_LABEL[result] || result),
      content: [
        "\u9002\u7528\u8303\u56F4\uFF1A" + scope,
        "\u53CD\u9988\u7ED3\u679C\uFF1A" + (FEEDBACK_LABEL[result] || result),
        "\u539F\u5EFA\u8BAE\uFF1A" + suggestion,
        "\u4EBA\u5DE5\u5224\u65AD\uFF1A" + note
      ].join("\n"),
      evidence: "\u6765\u6E90\uFF1AAI\u8BB0\u5FC6\u9875\u4EBA\u5DE5\u53CD\u9988\uFF1B\u9875\u9762\uFF1A" + (window._curTab || location.pathname),
      source: "hermes_feedback"
    };
    try {
      await window.API.post("/api/hermes/memories", body);
      resetHermesFeedbackForm();
      await loadHermesMemories(false);
      toast("\u53CD\u9988\u5DF2\u6C89\u6DC0\uFF0CHermes \u540E\u7EED\u4F1A\u53C2\u8003");
    } catch (e) {
      toast(e.status === 403 ? "\u65E0\u6743\u6C89\u6DC0\u53CD\u9988" : "\u53CD\u9988\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }

  // public/src/inquiry-globe.js
  var inquiry_globe_exports = {};
  __export(inquiry_globe_exports, {
    renderGlobe: () => renderGlobe2
  });
  var QINGDAO = [120.38, 36.07];
  var WORLD_MAP_NAME = "ferrWorld";
  var WORLD_MAP_URLS = [
    "/world.geo.json"
  ];
  var COUNTRY_GEO = {
    "\u5FB7\u56FD": [10.45, 51.17],
    "\u7F8E\u56FD": [-98.5, 39.8],
    "\u897F\u73ED\u7259": [-3.7, 40.4],
    "\u5370\u5EA6": [78.96, 20.59],
    "\u610F\u5927\u5229": [12.57, 41.87],
    "\u52A0\u62FF\u5927": [-106.3, 56.13],
    "\u8377\u5170": [5.29, 52.13],
    "\u58A8\u897F\u54E5": [-102.55, 23.63],
    "\u65B0\u897F\u5170": [174, -40.9],
    "\u54E5\u4F26\u6BD4\u4E9A": [-74.3, 4.6],
    "\u514B\u7F57\u5730\u4E9A": [15.2, 45.1],
    "\u4FC4\u7F57\u65AF": [105, 61.5],
    "\u745E\u5178": [18.6, 60.1],
    "\u5DF4\u897F": [-51.9, -14.2],
    "\u82F1\u56FD": [-1.5, 52.4],
    "\u6CD5\u56FD": [2.2, 46.2],
    "\u6FB3\u5927\u5229\u4E9A": [133.8, -25.3],
    "\u65E5\u672C": [138.25, 36.2],
    "\u97E9\u56FD": [127.8, 36.5],
    "\u571F\u8033\u5176": [35.2, 39],
    "\u8D8A\u5357": [108.3, 14.1],
    "\u5370\u5EA6\u5C3C\u897F\u4E9A": [113.9, -0.8],
    "\u5370\u5C3C": [113.9, -0.8],
    "\u6CE2\u5170": [19.1, 51.9],
    "\u6BD4\u5229\u65F6": [4.5, 50.5],
    "\u745E\u58EB": [8.2, 46.8],
    "\u5965\u5730\u5229": [14.6, 47.5],
    "\u8461\u8404\u7259": [-8.2, 39.4],
    "\u5E0C\u814A": [21.8, 39.1],
    "\u963F\u8054\u914B": [54, 24],
    "\u6C99\u7279": [45, 24],
    "\u57C3\u53CA": [30.8, 26.8],
    "\u5357\u975E": [24, -29],
    "\u963F\u6839\u5EF7": [-64, -34],
    "\u667A\u5229": [-71.5, -35.7],
    "\u6CF0\u56FD": [101, 15],
    "\u9A6C\u6765\u897F\u4E9A": [101.97, 4.2],
    "\u4E4C\u514B\u5170": [31.2, 49],
    "\u6377\u514B": [15.5, 49.8],
    "\u4E39\u9EA6": [9.5, 56.3],
    "\u632A\u5A01": [8.5, 60.5],
    "\u82AC\u5170": [26, 64],
    "\u7231\u5C14\u5170": [-8.2, 53.4],
    // 拉美(本站主力市场)
    "\u4E4C\u62C9\u572D": [-56, -32.8],
    "\u79D8\u9C81": [-75, -9.2],
    "\u5384\u74DC\u591A\u5C14": [-78.2, -1.5],
    "\u59D4\u5185\u745E\u62C9": [-66.6, 6.4],
    "\u73BB\u5229\u7EF4\u4E9A": [-64.7, -16.3],
    "\u5DF4\u62C9\u572D": [-58.4, -23.4],
    "\u5371\u5730\u9A6C\u62C9": [-90.4, 15.7],
    "\u54E5\u65AF\u8FBE\u9ECE\u52A0": [-84.1, 9.9],
    "\u5DF4\u62FF\u9A6C": [-80.1, 8.5],
    "\u5C3C\u52A0\u62C9\u74DC": [-85.2, 12.9],
    "\u6D2A\u90FD\u62C9\u65AF": [-86.6, 15],
    "\u8428\u5C14\u74E6\u591A": [-88.9, 13.8],
    "\u591A\u7C73\u5C3C\u52A0": [-70.2, 18.7],
    "\u53E4\u5DF4": [-79, 21.5],
    "\u6CE2\u591A\u9ECE\u5404": [-66.5, 18.2],
    // 非洲 / 中东
    "\u4E4C\u5E72\u8FBE": [32.3, 1.4],
    "\u80AF\u5C3C\u4E9A": [37.9, 0],
    "\u5C3C\u65E5\u5229\u4E9A": [8.7, 9.1],
    "\u52A0\u7EB3": [-1, 7.9],
    "\u6469\u6D1B\u54E5": [-7.1, 31.8],
    "\u963F\u5C14\u53CA\u5229\u4E9A": [2.6, 28],
    "\u7A81\u5C3C\u65AF": [9.5, 33.9],
    "\u57C3\u585E\u4FC4\u6BD4\u4E9A": [40.5, 9.1],
    "\u5766\u6851\u5C3C\u4E9A": [34.9, -6.4],
    "\u4EE5\u8272\u5217": [34.9, 31],
    "\u4F0A\u6717": [53.7, 32.4],
    "\u4F0A\u62C9\u514B": [43.7, 33.2],
    "\u5361\u5854\u5C14": [51.2, 25.3],
    "\u79D1\u5A01\u7279": [47.5, 29.3],
    "\u7EA6\u65E6": [36.2, 31.2],
    "\u9ECE\u5DF4\u5AE9": [35.9, 33.9],
    "\u963F\u66FC": [56, 21.5],
    "\u5DF4\u6797": [50.6, 26.1],
    // 亚洲 / 其他
    "\u5DF4\u57FA\u65AF\u5766": [69.3, 30.4],
    "\u5B5F\u52A0\u62C9\u56FD": [90.4, 23.7],
    "\u5B5F\u52A0\u62C9": [90.4, 23.7],
    "\u65AF\u91CC\u5170\u5361": [80.8, 7.9],
    "\u83F2\u5F8B\u5BBE": [122.9, 12.9],
    "\u65B0\u52A0\u5761": [103.8, 1.35],
    "\u7F05\u7538": [96, 21.9],
    "\u67EC\u57D4\u5BE8": [104.9, 12.6],
    "\u5C3C\u6CCA\u5C14": [84.1, 28.4],
    "\u54C8\u8428\u514B\u65AF\u5766": [66.9, 48],
    "\u8499\u53E4": [103.8, 46.9],
    "\u5308\u7259\u5229": [19.5, 47.2],
    "\u7F57\u9A6C\u5C3C\u4E9A": [24.97, 45.9],
    "\u4FDD\u52A0\u5229\u4E9A": [25.5, 42.7],
    "\u585E\u5C14\u7EF4\u4E9A": [20.8, 44],
    "\u65AF\u6D1B\u4F10\u514B": [19.7, 48.7],
    "\u65AF\u6D1B\u6587\u5C3C\u4E9A": [14.8, 46.1],
    "\u7ACB\u9676\u5B9B": [23.9, 55.2]
  };
  var COUNTRY_ALIAS = {
    Germany: "\u5FB7\u56FD",
    USA: "\u7F8E\u56FD",
    "UnitedStates": "\u7F8E\u56FD",
    "UnitedStatesofAmerica": "\u7F8E\u56FD",
    Spain: "\u897F\u73ED\u7259",
    India: "\u5370\u5EA6",
    Italy: "\u610F\u5927\u5229",
    Canada: "\u52A0\u62FF\u5927",
    Netherlands: "\u8377\u5170",
    Mexico: "\u58A8\u897F\u54E5",
    Russia: "\u4FC4\u7F57\u65AF",
    Sweden: "\u745E\u5178",
    Brazil: "\u5DF4\u897F",
    UK: "\u82F1\u56FD",
    UnitedKingdom: "\u82F1\u56FD",
    France: "\u6CD5\u56FD",
    Australia: "\u6FB3\u5927\u5229\u4E9A",
    Japan: "\u65E5\u672C",
    Korea: "\u97E9\u56FD",
    SouthKorea: "\u97E9\u56FD",
    Turkey: "\u571F\u8033\u5176",
    Vietnam: "\u8D8A\u5357",
    Indonesia: "\u5370\u5EA6\u5C3C\u897F\u4E9A",
    Poland: "\u6CE2\u5170",
    Belgium: "\u6BD4\u5229\u65F6",
    Switzerland: "\u745E\u58EB",
    Austria: "\u5965\u5730\u5229",
    Portugal: "\u8461\u8404\u7259",
    Greece: "\u5E0C\u814A",
    UAE: "\u963F\u8054\u914B",
    SaudiArabia: "\u6C99\u7279",
    Egypt: "\u57C3\u53CA",
    SouthAfrica: "\u5357\u975E",
    Argentina: "\u963F\u6839\u5EF7",
    Chile: "\u667A\u5229",
    Thailand: "\u6CF0\u56FD",
    Malaysia: "\u9A6C\u6765\u897F\u4E9A",
    Ukraine: "\u4E4C\u514B\u5170",
    Czech: "\u6377\u514B",
    Denmark: "\u4E39\u9EA6",
    Norway: "\u632A\u5A01",
    Finland: "\u82AC\u5170",
    Ireland: "\u7231\u5C14\u5170",
    Uruguay: "\u4E4C\u62C9\u572D",
    Peru: "\u79D8\u9C81",
    Ecuador: "\u5384\u74DC\u591A\u5C14",
    Venezuela: "\u59D4\u5185\u745E\u62C9",
    Bolivia: "\u73BB\u5229\u7EF4\u4E9A",
    Paraguay: "\u5DF4\u62C9\u572D",
    Guatemala: "\u5371\u5730\u9A6C\u62C9",
    CostaRica: "\u54E5\u65AF\u8FBE\u9ECE\u52A0",
    Panama: "\u5DF4\u62FF\u9A6C",
    Nicaragua: "\u5C3C\u52A0\u62C9\u74DC",
    Honduras: "\u6D2A\u90FD\u62C9\u65AF",
    ElSalvador: "\u8428\u5C14\u74E6\u591A",
    DominicanRepublic: "\u591A\u7C73\u5C3C\u52A0",
    Cuba: "\u53E4\u5DF4",
    PuertoRico: "\u6CE2\u591A\u9ECE\u5404",
    Uganda: "\u4E4C\u5E72\u8FBE",
    Kenya: "\u80AF\u5C3C\u4E9A",
    Nigeria: "\u5C3C\u65E5\u5229\u4E9A",
    Ghana: "\u52A0\u7EB3",
    Morocco: "\u6469\u6D1B\u54E5",
    Algeria: "\u963F\u5C14\u53CA\u5229\u4E9A",
    Tunisia: "\u7A81\u5C3C\u65AF",
    Ethiopia: "\u57C3\u585E\u4FC4\u6BD4\u4E9A",
    Tanzania: "\u5766\u6851\u5C3C\u4E9A",
    Israel: "\u4EE5\u8272\u5217",
    Iran: "\u4F0A\u6717",
    Iraq: "\u4F0A\u62C9\u514B",
    Qatar: "\u5361\u5854\u5C14",
    Kuwait: "\u79D1\u5A01\u7279",
    Jordan: "\u7EA6\u65E6",
    Lebanon: "\u9ECE\u5DF4\u5AE9",
    Oman: "\u963F\u66FC",
    Bahrain: "\u5DF4\u6797",
    Pakistan: "\u5DF4\u57FA\u65AF\u5766",
    Bangladesh: "\u5B5F\u52A0\u62C9\u56FD",
    SriLanka: "\u65AF\u91CC\u5170\u5361",
    Philippines: "\u83F2\u5F8B\u5BBE",
    Singapore: "\u65B0\u52A0\u5761",
    Myanmar: "\u7F05\u7538",
    Cambodia: "\u67EC\u57D4\u5BE8",
    Nepal: "\u5C3C\u6CCA\u5C14",
    Kazakhstan: "\u54C8\u8428\u514B\u65AF\u5766",
    Mongolia: "\u8499\u53E4",
    Hungary: "\u5308\u7259\u5229",
    Romania: "\u7F57\u9A6C\u5C3C\u4E9A",
    Bulgaria: "\u4FDD\u52A0\u5229\u4E9A",
    Serbia: "\u585E\u5C14\u7EF4\u4E9A",
    Slovakia: "\u65AF\u6D1B\u4F10\u514B",
    Slovenia: "\u65AF\u6D1B\u6587\u5C3C\u4E9A",
    Lithuania: "\u7ACB\u9676\u5B9B"
  };
  var inqGlobeChart = null;
  var worldMapPromise = null;
  var worldMapReady = false;
  var renderSeq = 0;
  var resizeBound = false;
  function inqMapEsc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }
  function countryName(raw) {
    const cleaned = String(raw || "").replace(/[\uD800-\uDFFF]/g, "").replace(/[^\u4e00-\u9fa5A-Za-z]/g, "").trim();
    return COUNTRY_ALIAS[cleaned] || cleaned;
  }
  function modeOf(arr) {
    const counts = {};
    let best = "\u2014";
    let bestCount = 0;
    (arr || []).forEach((v) => {
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > bestCount) {
        best = v;
        bestCount = counts[v];
      }
    });
    return best;
  }
  function collectMapData() {
    const map = {};
    const unmapped = {};
    (window._inqCache || []).forEach((row) => {
      const name = countryName(row.country);
      const geo = COUNTRY_GEO[name];
      if (!name) return;
      if (!geo) {
        unmapped[name] = (unmapped[name] || 0) + 1;
        return;
      }
      const group = map[name] || (map[name] = {
        country: name,
        geo,
        total: 0,
        A: 0,
        B: 0,
        C: 0,
        products: [],
        channels: [],
        rows: []
      });
      group.total += 1;
      group[row.grade] = (group[row.grade] || 0) + 1;
      group.products.push(row.product);
      group.channels.push(row.channel);
      group.rows.push(row);
    });
    const groups = Object.values(map).sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
    const unmappedList = Object.entries(unmapped).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count);
    const unmappedTotal = unmappedList.reduce((sum, u) => sum + u.count, 0);
    return { groups, unmappedList, unmappedTotal };
  }
  function tooltipHtml(group) {
    const valid = (group.A || 0) + (group.B || 0);
    const aRatio = valid ? Math.round((group.A || 0) / valid * 100) : 0;
    const rows2 = group.rows.slice(0, 4).map((r) => `
    <div class="inq-map-tip-row">
      <b>${inqMapEsc(r.customer_code || r.customer_name || r.country || "\u672A\u586B\u5BA2\u6237")}</b>
      <span>${inqMapEsc(r.product || "\u672A\u586B\u4EA7\u54C1")} \xB7 ${inqMapEsc(r.grade || "\u2014")}\u7EA7 \xB7 ${inqMapEsc(r.channel || "\u672A\u586B\u6E20\u9053")}</span>
      <em>${inqMapEsc(r.source || r.note || "")}</em>
    </div>
  `).join("");
    const more = group.rows.length > 4 ? `<div class="inq-map-tip-more">\u8FD8\u6709 ${group.rows.length - 4} \u6761\u8BE2\u76D8</div>` : "";
    return `
    <div class="inq-map-tip-title">${inqMapEsc(group.country)} \xB7 ${group.total} \u6761\u8BE2\u76D8</div>
    <div class="inq-map-tip-stats">
      <span>A\u7EA7 ${group.A || 0}</span><span>B\u7EA7 ${group.B || 0}</span><span>C\u7EA7 ${group.C || 0}</span><span>A\u7EA7\u5360\u6BD4 ${aRatio}%</span>
    </div>
    <div class="inq-map-tip-meta">\u4E3B\u8BE2\u4EA7\u54C1\uFF1A${inqMapEsc(modeOf(group.products))} \xB7 \u4E3B\u8981\u6E20\u9053\uFF1A${inqMapEsc(modeOf(group.channels))}</div>
    ${rows2}${more}
  `;
  }
  async function ensureWorldMap() {
    if (!window.echarts) throw new Error("\u56FE\u8868\u7EC4\u4EF6\u6CA1\u6709\u52A0\u8F7D\u6210\u529F");
    if (worldMapReady) return;
    if (!worldMapPromise) {
      worldMapPromise = (async () => {
        let lastError = null;
        for (const url of WORLD_MAP_URLS) {
          try {
            const res = await fetch(url, { cache: "force-cache" });
            if (!res.ok) throw new Error(`\u5730\u56FE\u6570\u636E\u8FD4\u56DE ${res.status}`);
            const geoJson = await res.json();
            window.echarts.registerMap(WORLD_MAP_NAME, geoJson);
            worldMapReady = true;
            return;
          } catch (err) {
            lastError = err;
          }
        }
        throw lastError || new Error("\u4E16\u754C\u5730\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25");
      })();
    }
    await worldMapPromise;
  }
  function unmappedNoteHtml(unmappedList, unmappedTotal) {
    if (!unmappedTotal) return "";
    const names = unmappedList.map((u) => `${inqMapEsc(u.country)}${u.count > 1 ? ` \xD7${u.count}` : ""}`).join("\u3001");
    return `
    <div class="inq-map-note">
      \u6709 ${unmappedTotal} \u6761\u8BE2\u76D8\u56E0\u56FD\u5BB6\u6682\u65E0\u5730\u56FE\u5750\u6807\u672A\u753B\u4E0A\u98DE\u7EBF:${names}\u3002\u6570\u636E\u6CA1\u4E22,\u53EA\u662F\u5730\u56FE\u7F3A\u8BE5\u56FD\u5750\u6807,\u8BF7\u8865\u5145\u5750\u6807\u8868\u3002
    </div>
  `;
  }
  function renderShell(el, groups, bodyHtml, unmappedList, unmappedTotal) {
    el.innerHTML = `
    <div class="inq-flat-map inq-blue-map">
      <div class="inq-map-head">
        <div><span>\u771F\u5B9E\u4E16\u754C\u5730\u56FE</span><strong>\u5168\u7403\u8BE2\u76D8\u98DE\u7EBF</strong></div>
        <div class="inq-map-total">${groups.length} \u4E2A\u56FD\u5BB6 \xB7 ${(window._inqCache || []).length} \u6761\u8BE2\u76D8</div>
      </div>
      ${unmappedNoteHtml(unmappedList, unmappedTotal)}
      ${bodyHtml}
    </div>
  `;
  }
  function disposeMap() {
    try {
      if (window.echarts && inqGlobeChart) inqGlobeChart.dispose();
    } catch (_) {
    }
    inqGlobeChart = null;
  }
  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    window.addEventListener("resize", () => {
      try {
        if (inqGlobeChart) inqGlobeChart.resize();
      } catch (_) {
      }
    });
  }
  async function renderGlobe2() {
    const el = document.getElementById("inqGlobe");
    if (!el) return;
    const seq = ++renderSeq;
    const { groups, unmappedList, unmappedTotal } = collectMapData();
    const empty = document.getElementById("inqGlobe-empty");
    if (empty) empty.style.display = "none";
    disposeMap();
    renderShell(el, groups, '<div class="inq-map-loading">\u6B63\u5728\u52A0\u8F7D\u771F\u5B9E\u4E16\u754C\u5730\u56FE...</div>', unmappedList, unmappedTotal);
    try {
      await ensureWorldMap();
      if (seq !== renderSeq) return;
    } catch (err) {
      if (seq !== renderSeq) return;
      const msg = inqMapEsc(err && err.message ? err.message : "\u4E16\u754C\u5730\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25");
      renderShell(el, groups, `
      <div class="inq-map-error">
        <b>\u4E16\u754C\u5730\u56FE\u52A0\u8F7D\u5931\u8D25</b>
        <span>${msg}</span>
        <em>\u8BF7\u786E\u8BA4 public/world.geo.json \u5DF2\u968F\u9879\u76EE\u4E00\u8D77\u90E8\u7F72\u3002\u8BE2\u76D8\u6570\u636E\u6CA1\u6709\u4E22\uFF0C\u53EA\u662F\u5730\u56FE\u5E95\u56FE\u6CA1\u6709\u52A0\u8F7D\u3002</em>
      </div>
    `, unmappedList, unmappedTotal);
      return;
    }
    renderShell(el, groups, '<div class="inq-echarts-map"></div>', unmappedList, unmappedTotal);
    const chartEl = el.querySelector(".inq-echarts-map");
    if (!chartEl || !window.echarts) return;
    inqGlobeChart = window.echarts.init(chartEl, null, { renderer: "svg" });
    bindResize();
    const lineData = groups.map((group) => ({
      name: `\u9752\u5C9B \u2192 ${group.country}`,
      coords: [QINGDAO, group.geo],
      value: group.total,
      group,
      lineStyle: { width: Math.min(4.8, 2 + group.total * 0.35) }
    }));
    const pointData = groups.map((group) => ({
      name: group.country,
      value: [group.geo[0], group.geo[1], group.total],
      group
    }));
    inqGlobeChart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        confine: true,
        borderWidth: 1,
        borderColor: "#d8e3ec",
        backgroundColor: "rgba(255,255,255,.96)",
        extraCssText: "border-radius:8px;box-shadow:0 18px 42px rgba(38,57,79,.20);",
        textStyle: { color: "#243244", fontSize: 12 },
        formatter: (params) => {
          const group = params && params.data && params.data.group;
          if (group) return tooltipHtml(group);
          if (params && params.name === "\u9752\u5C9B") return "<b>\u9752\u5C9B</b><br/>\u8BE2\u76D8\u98DE\u7EBF\u51FA\u53D1\u70B9";
          return "";
        }
      },
      geo: {
        map: WORLD_MAP_NAME,
        roam: false,
        aspectScale: 1,
        left: 18,
        right: 18,
        top: 40,
        bottom: 16,
        silent: false,
        selectedMode: false,
        label: { show: false },
        itemStyle: {
          areaColor: "#ffffff",
          borderColor: "#1a1a1a",
          borderWidth: 0.8
        },
        emphasis: {
          disabled: false,
          itemStyle: { areaColor: "#eef1f5", borderColor: "#000" }
        },
        regions: [
          { name: "Antarctica", itemStyle: { areaColor: "#ffffff", borderColor: "rgba(0,0,0,.28)" } },
          { name: "Greenland", itemStyle: { areaColor: "#ffffff", borderColor: "rgba(0,0,0,.28)" } }
        ]
      },
      series: [
        {
          type: "lines",
          name: "\u8BE2\u76D8\u98DE\u7EBF",
          coordinateSystem: "geo",
          zlevel: 3,
          data: lineData,
          symbol: ["none", "arrow"],
          symbolSize: 9,
          effect: {
            show: true,
            period: 4.2,
            trailLength: 0.05,
            symbol: "arrow",
            symbolSize: 8,
            color: "#7dd3fc"
          },
          lineStyle: {
            color: "#38bdf8",
            width: 1.8,
            opacity: 0.85,
            curveness: 0.28
          },
          emphasis: {
            lineStyle: { opacity: 1, width: 3.2 }
          }
        },
        {
          type: "effectScatter",
          name: "\u8BE2\u76D8\u56FD\u5BB6",
          coordinateSystem: "geo",
          zlevel: 4,
          data: pointData,
          symbolSize: (value) => Math.min(20, 10 + (value[2] || 0) * 1.4),
          rippleEffect: { brushType: "stroke", scale: 2.5, period: 3.6 },
          itemStyle: { color: "#38bdf8", borderColor: "rgba(255,255,255,.9)", borderWidth: 1.6, shadowBlur: 12, shadowColor: "rgba(56,189,248,.7)" },
          label: {
            show: true,
            formatter: (params) => `${params.name} ${params.value[2] || ""}`,
            position: "right",
            color: "#172033",
            fontSize: 14,
            fontWeight: 800,
            fontFamily: "Inter, Microsoft YaHei, Arial, sans-serif",
            textBorderColor: "rgba(255,255,255,.95)",
            textBorderWidth: 3
          }
        },
        {
          type: "scatter",
          name: "\u9752\u5C9B",
          coordinateSystem: "geo",
          zlevel: 5,
          data: [{ name: "\u9752\u5C9B", value: [QINGDAO[0], QINGDAO[1], 1] }],
          symbolSize: 19,
          itemStyle: { color: "#fbbf24", borderColor: "rgba(255,255,255,.9)", borderWidth: 2.4, shadowBlur: 14, shadowColor: "rgba(251,191,36,.7)" },
          label: {
            show: true,
            formatter: "\u9752\u5C9B",
            position: "left",
            color: "#b45309",
            fontSize: 15,
            fontWeight: 800,
            fontFamily: "Inter, Microsoft YaHei, Arial, sans-serif",
            textBorderColor: "#ffffff",
            textBorderWidth: 3
          }
        }
      ]
    }, true);
  }

  // public/src/plan-history.js
  var plan_history_exports = {};
  __export(plan_history_exports, {
    planDayIsToday: () => planDayIsToday,
    setPlanDay: () => setPlanDay
  });
  var DEPTS = [
    { key: "\u516C\u53F8", label: "\u516C\u53F8\u4EFB\u52A1", badge: "b-red" },
    { key: "SEM", label: "SEM \u4EFB\u52A1\uFF08\u9648\uFF09", badge: "b-purple" },
    { key: "SEO", label: "SEO \u4EFB\u52A1\uFF08\u674E\uFF09", badge: "b-blue" }
  ];
  var FREQ_TAG2 = { daily: "\u65E5", weekly: "\u5468", monthly: "\u6708" };
  var _day = null;
  function planDayIsToday() {
    return !_day || _day === formatLocalDate(/* @__PURE__ */ new Date());
  }
  var today2 = () => formatLocalDate(/* @__PURE__ */ new Date());
  var shiftDay = (day, n) => {
    const d = /* @__PURE__ */ new Date(day + "T00:00:00");
    d.setDate(d.getDate() + n);
    return formatLocalDate(d);
  };
  function periodKeysFor(day) {
    const d = /* @__PURE__ */ new Date(day + "T00:00:00");
    const tmp = new Date(d);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const week = Math.ceil(((tmp - yearStart) / 864e5 + 1) / 7);
    return {
      weekly: tmp.getFullYear() + "-W" + String(week).padStart(2, "0"),
      monthly: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
    };
  }
  function taskStateFor(t, day, pushed) {
    const doneDay = (t.done_at || "").slice(0, 10);
    if (doneDay === day) return { cls: "hs-done", text: "\u5F53\u5929\u5B8C\u6210" };
    if (pushed.has(t.id)) return { cls: "hs-push", text: "\u5F53\u5929\u63A8\u8FDB" };
    if (doneDay && doneDay < day) return { cls: "hs-old", text: "\u6B64\u524D\u5DF2\u5B8C\u6210" };
    return { cls: "hs-none", text: "\u65E0\u8BB0\u5F55" };
  }
  function taskRowHtml(t, day, pushed, note) {
    const st = taskStateFor(t, day, pushed);
    const span = t.start_date && t.task_date && t.start_date < t.task_date ? `${esc(t.start_date.slice(5))} ~ ${esc(t.task_date.slice(5))}` : esc(t.task_date || "");
    const src = t.fix_id ? '<span class="badge b-amber">\u6574\u6539</span>' : "";
    const owner = t.owner ? `<span class="badge ${t.owner === "\u9648" ? "b-purple" : "b-blue"}">${esc(t.owner)}</span>` : "";
    const memo = note ? `<span class="hnote">${esc(note)}</span>` : "";
    return `<div class="hcard">
    <div class="hrow"><span class="htext">${esc(t.content || "")}</span>
      <span class="hright">${src}${owner}${span ? `<span class="hdue">${span}</span>` : ""}<span class="hstat ${st.cls}">${st.text}</span></span></div>
    ${memo ? `<div class="hmemo">${memo}</div>` : ""}
  </div>`;
  }
  function render2(data) {
    const box = document.getElementById("plan-history");
    if (!box) return;
    const day = data.day;
    const pushed = new Set((data.checkins || []).map((c) => c.loop_item_id));
    const noteOf = new Map((data.checkins || []).filter((c) => c.note).map((c) => [c.loop_item_id, c.note]));
    const subsByParent = /* @__PURE__ */ new Map();
    (data.subtasks || []).forEach((s) => {
      if (!subsByParent.has(s.parent_id)) subsByParent.set(s.parent_id, []);
      subsByParent.get(s.parent_id).push(s);
    });
    box.innerHTML = '<div class="tboard">' + DEPTS.map((d) => {
      const sops = (data.sops || []).filter((s) => s.dept === d.key);
      const tasks = (data.tasks || []).filter((t) => (t.dept || "SEO") === d.key);
      const sopDone = sops.filter((s) => s.done).length;
      const spoken = tasks.filter((t) => (t.done_at || "").slice(0, 10) === day || pushed.has(t.id)).length;
      const sopHtml = sops.length ? '<div class="sop-list">' + sops.map((s) => `<div class="hcard hsop${s.done ? " on" : ""}">
          <div class="hrow"><span class="hcheck">${s.done ? '<i class="ti ti-check"></i>' : ""}</span>
            <span class="htext">${esc(s.title)}</span>
            <span class="hright">${s.active ? "" : '<span class="badge b-gray">\u5DF2\u505C\u7528</span>'}<span class="freq-tag">${FREQ_TAG2[s.freq] || ""}</span></span></div>
        </div>`).join("") + "</div>" : '<div class="hempty">\u5F53\u65F6\u6CA1\u6709\u914D\u7F6E SOP</div>';
      const taskHtml = tasks.length ? tasks.map((t) => {
        const subs = subsByParent.get(t.id) || [];
        return taskRowHtml(t, day, pushed, noteOf.get(t.id)) + (subs.length ? `<div class="hsubs">${subs.map((s2) => taskRowHtml(s2, day, pushed, noteOf.get(s2.id))).join("")}</div>` : "");
      }).join("") : '<div class="hempty">\u90A3\u5929\u8FD9\u4E00\u5217\u6CA1\u6709\u4EFB\u52A1</div>';
      return `<div class="pblock">
      <div class="pblock-head"><span class="badge ${d.badge}">${esc(d.key)}</span><span class="pn">${esc(d.label)}</span>
        <span class="kcount">SOP ${sopDone}/${sops.length} \xB7 \u4EFB\u52A1 ${tasks.length} \xB7 \u6709\u4EA4\u4EE3 ${spoken}</span></div>
      <div class="sopnew">
        <div><div class="colcap"><i class="ti ti-pin"></i> SOP \u56FA\u5B9A\u4EFB\u52A1</div>${sopHtml}</div>
        <div><div class="colcap"><i class="ti ti-list-check"></i> \u5F53\u5929\u5728\u76D8\u5B50\u91CC\u7684\u4EFB\u52A1</div>${taskHtml}</div>
      </div>
    </div>`;
    }).join("") + "</div>";
  }
  async function load(day) {
    const box = document.getElementById("plan-history");
    if (!box) return;
    const pk = periodKeysFor(day);
    box.innerHTML = '<div class="hloading">\u6B63\u5728\u53D6 ' + esc(day) + " \u7684\u8BB0\u5F55\u2026</div>";
    try {
      const data = await API.get("/api/daily-plan?day=" + encodeURIComponent(day) + "&weekly=" + encodeURIComponent(pk.weekly) + "&monthly=" + encodeURIComponent(pk.monthly));
      render2(data);
    } catch (e) {
      box.innerHTML = '<div class="hempty">\u8BFB\u53D6\u5931\u8D25\uFF1A' + esc(e && e.message || "\u8BF7\u6C42\u5931\u8D25") + "<br>\u53EF\u91CD\u65B0\u9009\u4E00\u6B21\u65E5\u671F\u91CD\u8BD5</div>";
    }
  }
  function setPlanDay(day) {
    const isToday = !day || day === today2();
    _day = isToday ? null : day;
    const board = document.querySelector("#panel-tasks > .tboard");
    const hist = document.getElementById("plan-history");
    const hint = document.getElementById("planday-hint");
    const input = document.getElementById("planday-input");
    if (input) input.value = day || today2();
    if (board) board.style.display = isToday ? "" : "none";
    if (hist) hist.classList.toggle("is-hidden", isToday);
    if (hint) {
      hint.textContent = isToday ? "" : "\u56DE\u653E\u6A21\u5F0F \xB7 \u53EA\u8BFB";
      hint.className = "planday-hint" + (isToday ? "" : " on");
    }
    if (!isToday) load(day);
  }
  document.addEventListener("click", (e) => {
    const step = e.target.closest("[data-planday]");
    if (step) {
      const base = (document.getElementById("planday-input") || {}).value || today2();
      setPlanDay(shiftDay(base, Number(step.dataset.planday)));
      return;
    }
    if (e.target.closest("#planday-today")) setPlanDay(today2());
  });
  document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "planday-input") setPlanDay(e.target.value || today2());
  });
  var _dayInput = document.getElementById("planday-input");
  if (_dayInput && !_dayInput.value) _dayInput.value = today2();

  // public/src/weekly-review.js
  var weekly_review_exports = {};
  __export(weekly_review_exports, {
    renderMonthReview: () => renderMonthReview,
    renderReview: () => renderReview
  });

  // public/src/sop-rate.js
  var DEPTS2 = [["SEO", "\u674E", "b-blue"], ["SEM", "\u9648", "b-purple"], ["\u516C\u53F8", "\u516C\u53F8", "b-red"]];
  var FREQ_LABEL2 = { daily: "\u6BCF\u65E5", weekly: "\u6BCF\u5468", monthly: "\u6BCF\u6708" };
  function pct2(done, expected) {
    return expected > 0 ? Math.round(done / expected * 100) : null;
  }
  function rateClass(p) {
    return p === null ? "sr-na" : p >= 90 ? "sr-good" : p >= 60 ? "sr-mid" : "sr-bad";
  }
  function deptBlockHtml(dept, label, badge3, items) {
    const counted = items.filter((i) => i.expected !== null);
    const done = counted.reduce((a, i) => a + i.done, 0);
    const expected = counted.reduce((a, i) => a + i.expected, 0);
    const p = pct2(done, expected);
    const missed = counted.filter((i) => i.expected > i.done).sort((a, b) => b.expected - b.done - (a.expected - a.done));
    const missHtml = missed.length ? missed.map((i) => `<div class="sr-miss"><span class="sr-mt">${esc(i.title)}</span><span class="sr-mf">${FREQ_LABEL2[i.freq] || ""}</span><span class="sr-mn">\u7F3A ${i.expected - i.done}${i.missed_days.length ? " \xB7 " + i.missed_days.map((d) => d.slice(5)).join(" ") : ""}</span></div>`).join("") : '<div class="sr-miss sr-ok"><i class="ti ti-check"></i> \u8FD9\u4E00\u5468\u4E00\u6761\u6CA1\u6F0F</div>';
    return `<div class="sr-dept">
    <div class="sr-head"><span class="badge ${badge3}">${esc(label)}</span>
      <span class="sr-num ${rateClass(p)}">${expected ? `${done}/${expected}` : "\u2014"}${p === null ? "" : ` \xB7 ${p}%`}</span></div>
    <div class="sr-misses">${missHtml}</div>
  </div>`;
  }
  async function mountSopRate(el) {
    if (!el || el.dataset.loaded === "1") return;
    const from = el.dataset.from;
    const to = el.dataset.to;
    if (!from || !to) return;
    el.dataset.loaded = "1";
    el.innerHTML = '<div class="sr-loading">\u6B63\u5728\u7B97\u8FD9\u4E00\u5468\u7684 SOP \u6267\u884C\u7387\u2026</div>';
    try {
      const q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&today=${encodeURIComponent(formatLocalDate(/* @__PURE__ */ new Date()))}`;
      const data = await API.get("/api/sop/stats" + q);
      const items = data.items || [];
      if (!items.length) {
        el.innerHTML = '<div class="sr-loading">\u8FD8\u6CA1\u6709\u914D\u7F6E SOP</div>';
        return;
      }
      const hasMonthly = items.some((i) => i.expected === null);
      el.innerHTML = `<div class="sr-title"><i class="ti ti-checklist"></i> SOP \u6267\u884C\u7387
        <span class="sr-note">\u7EDF\u8BA1\u5230 ${esc(data.counted_to || to)} \xB7 \u6309\u6253\u5361\u53D1\u751F\u65F6\u95F4\u7B97 \xB7 \u5DF2\u505C\u7528\u7684\u4E0D\u8BA1${hasMonthly ? " \xB7 \u6708\u5EA6 SOP \u6309\u6708\u53E6\u7B97" : ""}</span></div>
      <div class="sr-cols">${DEPTS2.map(([d, label, badge3]) => deptBlockHtml(d, label, badge3, items.filter((i) => i.dept === d))).join("")}</div>`;
    } catch (e) {
      el.dataset.loaded = "";
      el.innerHTML = '<div class="sr-loading">\u6267\u884C\u7387\u8BFB\u53D6\u5931\u8D25\uFF1A' + esc(e && e.message || "\u8BF7\u6C42\u5931\u8D25") + "</div>";
    }
  }
  document.addEventListener("click", (e) => {
    const bar = e.target.closest("#review-acc .acc-bar");
    if (!bar) return;
    const week = bar.parentElement;
    if (!week || week.classList.contains("collapsed")) return;
    const el = week.querySelector(".sop-rate");
    if (el) mountSopRate(el);
  });

  // public/src/weekly-review.js
  var RV_SECTIONS = [
    ["summary", "\u2460 \u672C\u5468\u5DE5\u4F5C\u603B\u7ED3", []],
    ["problems", "\u2461 \u9047\u5230\u7684\u95EE\u9898", ["\u6D4B\u8BD5", "\u91C7\u7EB3"]],
    ["analysis", "\u2462 \u5206\u6790", ["\u91C7\u7EB3"]],
    ["next_plan", "\u2463 \u4E0B\u5468\u5DE5\u4F5C\u8BA1\u5212", []]
  ];
  var RV_MONTH_SECTIONS = [
    ["summary", "\u2460 \u672C\u6708\u5DE5\u4F5C\u603B\u7ED3", []],
    ["problems", "\u2461 \u9047\u5230\u7684\u95EE\u9898", ["\u6D4B\u8BD5", "\u91C7\u7EB3"]],
    ["analysis", "\u2462 \u5206\u6790", ["\u91C7\u7EB3"]],
    ["next_plan", "\u2463 \u4E0B\u6708\u5DE5\u4F5C\u8BA1\u5212", []]
  ];
  function rvPad2(n) {
    return String(n).padStart(2, "0");
  }
  function mondayOf(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function reportWeekStart(now = /* @__PURE__ */ new Date()) {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    if ((now.getDay() || 7) === 1 && now.getHours() < 9) d.setDate(d.getDate() - 7);
    return d;
  }
  function keyFromWeekStart(start) {
    const d = new Date(start);
    return `${d.getFullYear()}-${rvPad2(d.getMonth() + 1)}-${rvPad2(d.getDate())}`;
  }
  function curWeekKey() {
    return keyFromWeekStart(reportWeekStart());
  }
  function curMonthKey() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-month`;
  }
  function parseWeekKey(key) {
    const mon = mondayOf(key);
    if (!mon) return null;
    const thu = new Date(mon);
    thu.setDate(thu.getDate() + 3);
    const year = thu.getFullYear();
    const month = thu.getMonth() + 1;
    return { monday: mon, year, month, monthKey: `${year}-${month}` };
  }
  function parseMonthKey(key) {
    const m = String(key || "").match(/^(\d{4})-(\d{1,2})-month$/);
    return m ? { year: Number(m[1]), month: Number(m[2]), monthKey: `${Number(m[1])}-${Number(m[2])}` } : null;
  }
  function currentWeekShouldOpen() {
    const now = /* @__PURE__ */ new Date();
    const start = reportWeekStart(now);
    const openAt = new Date(start);
    openAt.setHours(9, 0, 0, 0);
    const closeAt = new Date(start);
    closeAt.setDate(closeAt.getDate() + 4);
    closeAt.setHours(22, 0, 0, 0);
    return now >= openAt && now < closeAt;
  }
  function weekLabel(key) {
    const p = parseWeekKey(key);
    if (!p) return key;
    const sun = new Date(p.monday);
    sun.setDate(sun.getDate() + 6);
    return `${p.monday.getMonth() + 1}\u6708${p.monday.getDate()}\u65E5 \u2013 ${sun.getMonth() + 1}\u6708${sun.getDate()}\u65E5`;
  }
  function canonicalWeekKey(key) {
    const mon = mondayOf(key);
    return mon ? keyFromWeekStart(mon) : key;
  }
  function monthLabel2(key) {
    const p = parseMonthKey(key) || parseWeekKey(key);
    return p ? `${p.year}\u5E74${p.month}\u6708\u6708\u62A5` : key;
  }
  function monthGroupLabel(monthKey) {
    const [year, month] = String(monthKey || "").split("-");
    return `${year}\u5E74${Number(month)}\u6708\u5468\u62A5`;
  }
  function sortWeekKeys(keys) {
    return [...keys].sort((a, b) => String(b).localeCompare(String(a)));
  }
  function sortMonthKeys(keys) {
    return [...keys].sort((a, b) => {
      const pa = parseMonthKey(a) || { year: 0, month: 0 };
      const pb = parseMonthKey(b) || { year: 0, month: 0 };
      return pb.year - pa.year || pb.month - pa.month;
    });
  }
  function rvItemHtml(text2, acts) {
    const btns = (acts || []).map((a) => `<button type="button" class="aibtn ${a === "\u91C7\u7EB3" ? "adopt" : "test"}" data-review-action="act" data-kind="${esc(a)}">${a}</button>`).join("");
    return `<div class="rv-item"><span class="txt" contenteditable>${esc(text2)}</span>${btns}<span class="rv-del" data-review-action="delete" title="\u5220\u9664"><i class="ti ti-x"></i></span></div>`;
  }
  function bindReviewActions(root) {
    root.onclick = (e) => {
      const el = e.target.closest("[data-review-action]");
      if (!el || !root.contains(el)) return;
      const action = el.dataset.reviewAction;
      if (action === "act") rvAct(el, el.dataset.kind);
      else if (action === "delete") rvDel(el);
      else if (action === "add") rvAdd(el);
      else if (action === "toggle" && el.parentElement) el.parentElement.classList.toggle("collapsed");
    };
  }
  function rvColHtml(dept, rec, key, prevPlan, sections = RV_SECTIONS) {
    const name = dept === "SEM" ? "SEM \xB7 \u9648" : "SEO \xB7 \u674E";
    let h = `<div class="rv-col ${dept === "SEM" ? "sem" : "seo"}"><div class="rv-owner">${name}</div>`;
    sections.forEach(([field2, title, acts]) => {
      const items = rec && rec[field2] || [];
      h += `<div class="rv-sec" data-field="${field2}" data-dept="${dept}" data-week="${key}"><h5>${title}</h5>`;
      if (field2 === "summary" && !items.length && prevPlan && prevPlan.length) {
        h += `<div class="rv-prev">\u4E0A\u671F\u8BA1\u5212\uFF1A${prevPlan.map((x) => esc(x)).join("\uFF1B")}</div>`;
      }
      h += `<div class="rv-list">${items.map((t) => rvItemHtml(t, acts)).join("")}</div>`;
      h += `<span class="rv-add" data-review-action="add"><i class="ti ti-plus"></i> \u6DFB\u52A0</span></div>`;
    });
    return h + "</div>";
  }
  function prevPlanOf(keys, byKey, key, dept) {
    const idx = keys.indexOf(key);
    for (let i = idx + 1; i < keys.length; i++) {
      const r = byKey[keys[i]][dept];
      if (r && r.next_plan && r.next_plan.length) return r.next_plan;
    }
    return null;
  }
  function sopRateShell(weekKey) {
    const mon = mondayOf(weekKey);
    if (!mon) return "";
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const fmt2 = (d) => `${d.getFullYear()}-${rvPad2(d.getMonth() + 1)}-${rvPad2(d.getDate())}`;
    return `<div class="sop-rate" data-from="${fmt2(mon)}" data-to="${fmt2(sun)}"></div>`;
  }
  async function renderReview() {
    const cur = curWeekKey();
    let items = [];
    try {
      const r = await API.get("/api/weekly-reports?current=" + encodeURIComponent(cur));
      items = r.items || [];
    } catch (e) {
    }
    const byWeek = {};
    items.filter((it) => !parseMonthKey(it.week_key)).forEach((it) => {
      const key = canonicalWeekKey(it.week_key);
      (byWeek[key] = byWeek[key] || {})[it.dept] = { ...it, week_key: key };
    });
    if (!byWeek[cur]) byWeek[cur] = {};
    const keys = sortWeekKeys(Object.keys(byWeek));
    const curMeta = parseWeekKey(cur);
    const currentMonthKey = curMeta && curMeta.monthKey;
    const currentKeys = keys.filter((key) => (parseWeekKey(key) || {}).monthKey === currentMonthKey);
    const oldGroups = {};
    keys.filter((key) => (parseWeekKey(key) || {}).monthKey !== currentMonthKey).forEach((key) => {
      const meta = parseWeekKey(key);
      if (!meta) return;
      (oldGroups[meta.monthKey] = oldGroups[meta.monthKey] || []).push(key);
    });
    const acc = document.getElementById("review-acc");
    if (!acc) return;
    const currentHtml = currentKeys.map((week) => {
      const isCurrent = week === cur;
      const collapsed = isCurrent ? !currentWeekShouldOpen() : true;
      return `<div class="acc-week${collapsed ? " collapsed" : ""}">
      <div class="acc-bar" data-review-action="toggle"><i class="ti ti-chevron-down hicon"></i> ${weekLabel(week)} ${isCurrent ? '<span class="badge b-green csp-s-4b17347c23">\u672C\u5468</span>' : ""}</div>
      <div class="acc-body">${sopRateShell(week)}${rvColHtml("SEO", byWeek[week].SEO, week, prevPlanOf(keys, byWeek, week, "SEO"))}${rvColHtml("SEM", byWeek[week].SEM, week, prevPlanOf(keys, byWeek, week, "SEM"))}</div>
    </div>`;
    }).join("");
    const groupHtml = Object.keys(oldGroups).sort((a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return by - ay || bm - am;
    }).map((monthKey) => {
      const inner = sortWeekKeys(oldGroups[monthKey]).map((week) => `
      <div class="acc-week collapsed">
        <div class="acc-bar" data-review-action="toggle"><i class="ti ti-chevron-down hicon"></i> ${weekLabel(week)}</div>
        <div class="acc-body">${sopRateShell(week)}${rvColHtml("SEO", byWeek[week].SEO, week, prevPlanOf(keys, byWeek, week, "SEO"))}${rvColHtml("SEM", byWeek[week].SEM, week, prevPlanOf(keys, byWeek, week, "SEM"))}</div>
      </div>`).join("");
      return `<div class="acc-month collapsed">
      <div class="acc-month-bar" data-review-action="toggle"><i class="ti ti-chevron-down hicon"></i> ${monthGroupLabel(monthKey)}</div>
      <div class="acc-month-body">${inner}</div>
    </div>`;
    }).join("");
    acc.innerHTML = currentHtml + groupHtml;
    bindReviewActions(acc);
    acc.querySelectorAll(".acc-week:not(.collapsed) .sop-rate").forEach((el) => {
      mountSopRate(el);
    });
  }
  async function renderMonthReview() {
    const cur = curMonthKey();
    let items = [];
    try {
      const r = await API.get("/api/weekly-reports?current=" + encodeURIComponent(cur));
      items = r.items || [];
    } catch (e) {
    }
    const byMonth = {};
    items.filter((it) => parseMonthKey(it.week_key)).forEach((it) => {
      (byMonth[it.week_key] = byMonth[it.week_key] || {})[it.dept] = it;
    });
    if (!byMonth[cur]) byMonth[cur] = {};
    const keys = sortMonthKeys(Object.keys(byMonth));
    const acc = document.getElementById("month-review-acc");
    if (!acc) return;
    acc.innerHTML = keys.map((key) => {
      const collapsed = key !== cur;
      return `<div class="acc-week${collapsed ? " collapsed" : ""}">
      <div class="acc-bar" data-review-action="toggle"><i class="ti ti-chevron-down hicon"></i> ${monthLabel2(key)} ${key === cur ? '<span class="badge b-green csp-s-4b17347c23">\u672C\u6708</span>' : ""}</div>
      <div class="acc-body">${rvColHtml("SEO", byMonth[key].SEO, key, null, RV_MONTH_SECTIONS)}${rvColHtml("SEM", byMonth[key].SEM, key, null, RV_MONTH_SECTIONS)}</div>
    </div>`;
    }).join("");
    bindReviewActions(acc);
  }
  function rvSectionSave(sec) {
    if (!sec) return;
    const field2 = sec.dataset.field;
    const dept = sec.dataset.dept;
    const week = sec.dataset.week;
    const items = [...sec.querySelectorAll(".rv-list .txt")].map((t) => t.innerText.trim()).filter(Boolean);
    API.put("/api/weekly-reports", { week_key: week, dept, field: field2, items }).catch((err) => toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25"));
  }
  function rvAdd(el) {
    const sec = el.closest(".rv-sec");
    const list = sec.querySelector(".rv-list");
    const isMonth = !!parseMonthKey(sec.dataset.week);
    const sections = isMonth ? RV_MONTH_SECTIONS : RV_SECTIONS;
    const acts = (sections.find((s) => s[0] === sec.dataset.field) || [])[2] || [];
    const tmp = document.createElement("div");
    tmp.innerHTML = rvItemHtml("", acts);
    const node = tmp.firstChild;
    list.appendChild(node);
    const t = node.querySelector(".txt");
    if (t) t.focus();
  }
  function rvDel(el) {
    const sec = el.closest(".rv-sec");
    el.closest(".rv-item").remove();
    rvSectionSave(sec);
  }
  async function rvAct(el, kind) {
    const item = el.closest(".rv-item");
    const text2 = item.querySelector(".txt").innerText.trim();
    if (!text2) {
      toast("\u8BF7\u5148\u586B\u5199\u5185\u5BB9");
      return;
    }
    const sec = el.closest(".rv-sec");
    const s = sFromDept(sec.dataset.dept);
    try {
      if (kind === "\u6D4B\u8BD5") {
        await persistLoop("test", s, text2, "\u89C2\u5BDF\u4E2D");
        addTest(s, text2);
        toastGo("\u5DF2\u52A0\u5165\u6D4B\u8BD5\u767B\u8BB0 \xB7 \u5DF2\u5165\u5E93", "test");
      } else {
        await persistLoop("deposit", s, text2, "\u91C7\u7EB3");
        addDeposit(s, text2, "\u91C7\u7EB3");
        toastGo("\u5DF2\u91C7\u7EB3 \u2192 \u6C89\u6DC0\u8868 \xB7 \u5DF2\u5165\u5E93", "deposit");
      }
    } catch (e) {
      toast(persistFailMsg(e));
    }
  }
  document.addEventListener("focusout", (e) => {
    const t = e.target.closest && e.target.closest("#review-acc .rv-list .txt, #month-review-acc .rv-list .txt");
    if (!t) return;
    rvSectionSave(t.closest(".rv-sec"));
  });

  // public/src/settings.js
  function bindSettings() {
    document.querySelectorAll("#panel-settings [data-kpi]").forEach((el) => {
      if (el.dataset.settingsBound === "1") return;
      el.dataset.settingsBound = "1";
      el.addEventListener("focusin", () => {
        el.dataset.kpiOld = el.textContent;
      });
      const commit = async () => {
        if (!can("kpiTarget")) {
          rollbackEditable(el, el.dataset.kpiOld != null ? el.dataset.kpiOld : el.textContent);
          toast("\u4EC5\u8001\u677F/\u4E3B\u7BA1\u53EF\u6539 KPI \u76EE\u6807");
          return;
        }
        const parts = el.dataset.kpi.split(":");
        const values = { TOTAL, SEO, SEM }[parts[0]];
        const item = values && values[Number(parts[1])];
        if (!item) return;
        const oldValue = el.dataset.kpiOld != null ? el.dataset.kpiOld : String(item.t);
        const result = validateEditableValue(el.textContent, "number", { min: 0 });
        if (!result.ok) {
          rollbackEditable(el, oldValue);
          showSaveError(el, result.msg);
          return;
        }
        if (result.value === item.t) {
          el.textContent = String(result.value);
          setSavingState(el, null);
          return;
        }
        setSavingState(el, "saving");
        try {
          const { rows: rows2 } = await API.put(withRange2("/api/kpi-targets"), { updates: [{ id: item.id, target: result.value }] });
          applyKpiServer(rows2);
          renderKPI2();
          el.textContent = String(item.t);
          el.dataset.kpiOld = String(item.t);
          setSavingState(el, "ok");
          toast("\u5DF2\u66F4\u65B0\u300C" + item.n + "\u300D\u76EE\u6807 \u2192 " + item.t + " \xB7 \u5DF2\u5165\u5E93, \u8BC4\u5206\u5DF2\u91CD\u7B97");
        } catch (error) {
          rollbackEditable(el, oldValue);
          showSaveError(el, error.status === 403 ? "\u4EC5\u8001\u677F\u53EF\u6539 KPI \u76EE\u6807" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
        }
      };
      el.addEventListener("blur", commit);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          el.blur();
        }
      });
    });
  }
  function openPwd() {
    ["pwd-old", "pwd-new", "pwd-new2"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    openModal("pwdMask");
  }
  async function submitPwd() {
    const oldPassword = document.getElementById("pwd-old").value;
    const newPassword = document.getElementById("pwd-new").value;
    const confirmation = document.getElementById("pwd-new2").value;
    if (!oldPassword || !newPassword) {
      toast("\u8BF7\u586B\u5199\u5F53\u524D\u5BC6\u7801\u4E0E\u65B0\u5BC6\u7801");
      return;
    }
    if (newPassword.length < 6) {
      toast("\u65B0\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
      return;
    }
    if (newPassword !== confirmation) {
      toast("\u4E24\u6B21\u8F93\u5165\u7684\u65B0\u5BC6\u7801\u4E0D\u4E00\u81F4");
      return;
    }
    try {
      await API.post("/api/change-password", { oldPassword, newPassword });
      closeModal("pwdMask");
      toast("\u5BC6\u7801\u5DF2\u4FEE\u6539\uFF0C\u4E0B\u6B21\u767B\u5F55\u7528\u65B0\u5BC6\u7801");
    } catch (error) {
      toast(error.status === 401 ? "\u5F53\u524D\u5BC6\u7801\u4E0D\u6B63\u786E" : "\u4FEE\u6539\u5931\u8D25\uFF1A" + error.message);
    }
  }

  // public/src/table-editor.js
  var EDITABLE_CELL = "td[contenteditable][data-field]";
  var DATE_INPUT = "input.cell-date[data-field]";
  var tableEditorBound = false;
  function closest(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }
  function setCellBusy(cell2, busy, previousEditable) {
    if (busy) {
      cell2.setAttribute("contenteditable", "false");
      cell2.setAttribute("aria-busy", "true");
      return;
    }
    if (previousEditable == null) cell2.removeAttribute("contenteditable");
    else cell2.setAttribute("contenteditable", previousEditable);
    cell2.removeAttribute("aria-busy");
  }
  function setDateInputsBusy(inputs, busy) {
    inputs.forEach((input) => {
      if (busy) {
        input._tableEditorWasDisabled = input.disabled;
        input.disabled = true;
        input.setAttribute("aria-busy", "true");
      } else {
        input.disabled = Boolean(input._tableEditorWasDisabled);
        delete input._tableEditorWasDisabled;
        input.removeAttribute("aria-busy");
      }
    });
  }
  function dateFieldValue(inputs) {
    return inputs.length === 2 ? (inputs[0].value || "") + "~" + (inputs[1].value || "") : inputs[0].value;
  }
  function handleFocusIn(event) {
    const cell2 = closest(event.target, EDITABLE_CELL);
    if (cell2) {
      cell2._old = cell2.innerText;
      return;
    }
    const input = closest(event.target, DATE_INPUT);
    if (input) input._oldValue = input.value;
  }
  async function handleDateChange(event) {
    const input = closest(event.target, DATE_INPUT);
    if (!input) return;
    const row = input.closest("tr");
    const endpoint = row && row.dataset.ep;
    const id = row && row.dataset.id;
    if (!endpoint || !id) return;
    const container = input.closest("td");
    const inputs = [...container.querySelectorAll("input.cell-date")];
    const oldValue = input._oldValue != null ? input._oldValue : input.defaultValue;
    setDateInputsBusy(inputs, true);
    try {
      await API.patch(endpoint + "/" + id, { [input.dataset.field]: dateFieldValue(inputs) });
      inputs.forEach((item) => {
        item._oldValue = item.value;
        item.defaultValue = item.value;
      });
      toast("\u5DF2\u4FDD\u5B58 \xB7 \u5DF2\u5165\u5E93");
    } catch (error) {
      input.value = oldValue || "";
      toast(error && error.status === 403 ? "\u65E0\u6743\u4FEE\u6539\uFF0C\u5DF2\u6062\u590D\u65E7\u503C" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
    } finally {
      setDateInputsBusy(inputs, false);
    }
  }
  async function handleFocusOut(event) {
    const cell2 = closest(event.target, EDITABLE_CELL);
    if (!cell2) return;
    const row = cell2.closest("tr");
    const id = row && row.dataset.id;
    const endpoint = row && row.dataset.ep;
    if (!id || !endpoint) return;
    const value = cell2.innerText.trim();
    const oldValue = cell2._old != null ? cell2._old : cell2.innerText;
    if (value === String(oldValue).trim()) return;
    const previousEditable = cell2.getAttribute("contenteditable");
    setCellBusy(cell2, true, previousEditable);
    try {
      await API.patch(endpoint + "/" + id, { [cell2.dataset.field]: value });
      cell2._old = value;
    } catch (error) {
      rollbackEditable(cell2, oldValue);
      toast(error && error.status === 403 ? "\u65E0\u6743\u4FEE\u6539\uFF0C\u5DF2\u6062\u590D\u65E7\u503C" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
    } finally {
      setCellBusy(cell2, false, previousEditable);
    }
  }
  function handleKeyDown(event) {
    const cell2 = closest(event.target, "td[contenteditable]");
    if (!cell2) return;
    const table = cell2.closest("table");
    if (!table) return;
    if (event.key === "Tab") {
      event.preventDefault();
      const cells = [...table.querySelectorAll("td[contenteditable]")];
      const current = cells.indexOf(cell2);
      const next = cells[current + (event.shiftKey ? -1 : 1)];
      if (next) {
        cell2.blur();
        next.focus();
        placeCaretEnd(next);
      }
      return;
    }
    if (cell2.classList.contains("mkt-ans")) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const direction = event.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling";
    const column = cell2.cellIndex;
    let row = cell2.parentElement[direction];
    while (row) {
      const next = row.cells && row.cells[column];
      if (next && next.isContentEditable) {
        event.preventDefault();
        cell2.blur();
        next.focus();
        placeCaretEnd(next);
        return;
      }
      row = row[direction];
    }
  }
  function bindTableEditor() {
    if (tableEditorBound) return;
    tableEditorBound = true;
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("change", handleDateChange);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("keydown", handleKeyDown);
  }

  // public/src/rank-snapshots.js
  function renderRankTrend(snapshots) {
    if (!snapshots || snapshots.length < 2) return;
    const first = snapshots[0];
    const latest = snapshots[snapshots.length - 1];
    [...document.querySelectorAll("#mp-seo-opp tbody tr")].forEach((row) => {
      const keyword = row.cells[0].textContent.trim();
      const start = first.items.find((item) => item.keyword === keyword);
      const end = latest.items.find((item) => item.keyword === keyword);
      if (!start || !end || start.rank == null || end.rank == null) return;
      const difference = start.rank - end.rank;
      let trend = row.querySelector(".rk-trend");
      if (!trend) {
        trend = document.createElement("span");
        trend.className = "rk-trend";
        trend.style.marginLeft = "6px";
        trend.style.fontSize = "11px";
        trend.style.fontWeight = "800";
        row.cells[2].appendChild(trend);
      }
      trend.textContent = difference > 0 ? "\u25B2" + difference : difference < 0 ? "\u25BC" + -difference : "\u2014";
      trend.style.color = difference > 0 ? "var(--green)" : difference < 0 ? "var(--primary)" : "var(--text3)";
    });
    const note = document.getElementById("rankTrendNote");
    if (note) note.textContent = "\u5DF2\u8BB0\u5F55 " + snapshots.length + " \u5468 \xB7 \u5BF9\u6BD4\u9996\u672B\u5FEB\u7167\uFF08\u25B2\u5347 \u25BC\u964D\uFF09";
  }
  async function loadRankSnapshots() {
    try {
      const { snapshots } = await API.get("/api/rank-snapshots");
      if (snapshots && snapshots.length >= 2) renderRankTrend(snapshots);
    } catch (error) {
    }
  }
  async function snapshotRanks() {
    const rows2 = [...document.querySelectorAll("#mp-seo-opp tbody tr")];
    const items = rows2.map((row) => ({
      keyword: row.cells[0].textContent.trim(),
      rank: parseInt(row.cells[2].textContent, 10) || null
    }));
    try {
      const { weeks, snapshots } = await API.post("/api/rank-snapshots", { items });
      renderRankTrend(snapshots);
      toast("\u5DF2\u8BB0\u5F55\u672C\u5468\u6392\u540D\u5FEB\u7167\uFF08" + items.length + " \u8BCD\uFF09\xB7 \u5171 " + weeks + " \u5468\uFF0C\u53EF\u770B\u8D8B\u52BF");
    } catch (error) {
      toast(error && error.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF08\u4EC5\u674E/SEO \u53EF\u8BB0\u5F55\u5FEB\u7167\uFF09" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (error && error.message || "\u672A\u77E5\u9519\u8BEF"));
    }
  }

  // public/src/risks.js
  var STATUS_LABELS = { fail: "\u5931\u8D25", unverified: "\u5F85\u9A8C\u8BC1", warn: "\u8B66\u544A", pass: "\u901A\u8FC7" };
  var SOURCE_LABELS = { production_live: "\u6700\u8FD1\u751F\u4EA7\u9A8C\u6536", current_static: "\u5F53\u524D\u914D\u7F6E\u4E0E\u6570\u636E\u5E93" };
  var EVIDENCE_LABELS = {
    mode: "\u8FD0\u884C\u6A21\u5F0F",
    provider: "AI \u670D\u52A1",
    model: "\u6A21\u578B",
    project: "\u6570\u636E\u9879\u76EE",
    missing: "\u7F3A\u5931\u9879",
    authorized: "\u5DF2\u6388\u6743",
    updatedAt: "\u51ED\u636E\u66F4\u65B0\u65F6\u95F4",
    date: "\u9A8C\u6536\u65E5\u671F",
    runId: "\u540C\u6B65\u8BB0\u5F55",
    rowsWritten: "\u5199\u5165\u884C\u6570",
    status: "\u540C\u6B65\u72B6\u6001",
    finishedAt: "\u5B8C\u6210\u65F6\u95F4",
    totalRows: "\u4E8B\u5B9E\u603B\u884C\u6570",
    complete: "\u8BC1\u636E\u5B8C\u6574",
    missingTables: "\u7F3A\u5931\u4E8B\u5B9E\u8868",
    integrity: "\u6570\u636E\u5E93\u5B8C\u6574\u6027",
    elapsedMs: "\u8017\u65F6"
  };
  var TABLE_LABELS = {
    gsc_daily: "GSC \u6BCF\u65E5\u6C47\u603B",
    gsc_query_daily: "GSC \u641C\u7D22\u8BCD\u660E\u7EC6",
    ga4_daily: "GA4 \u6BCF\u65E5\u6C47\u603B",
    ga4_event_daily: "GA4 \u8F6C\u5316\u4E8B\u4EF6",
    google_ads_campaign_daily: "Google Ads \u5E7F\u544A\u7CFB\u5217",
    google_ads_search_term_daily: "Google Ads \u641C\u7D22\u8BCD"
  };
  var register = null;
  var requestSequence3 = 0;
  function byId2(id) {
    return document.getElementById(id);
  }
  function setText3(id, value) {
    const element = byId2(id);
    if (element) element.textContent = String(value == null ? "\u2014" : value);
  }
  function formatDate(value) {
    if (!value) return "\u5C1A\u672A\u9A8C\u8BC1";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  function labelValue(key, value) {
    if (key === "authorized" || key === "complete") return value ? "\u662F" : "\u5426";
    if (key === "rowsWritten" || key === "totalRows" || key === "elapsedMs") return key === "elapsedMs" ? `${value} ms` : String(value);
    if (Array.isArray(value)) return value.map((item) => TABLE_LABELS[item] || String(item)).join("\u3001") || "\u65E0";
    return String(value == null ? "\u2014" : value);
  }
  function evidenceLines(evidence) {
    const lines = [];
    for (const [key, value] of Object.entries(evidence || {})) {
      if (key === "rows" && Array.isArray(value)) {
        value.forEach((row) => {
          const name = TABLE_LABELS[row && row.table] || "\u4E8B\u5B9E\u6570\u636E";
          lines.push(`${name}\uFF1A${Number(row && row.rowCount || 0)} \u884C${row && row.lastDate ? `\uFF0C\u6700\u8FD1 ${row.lastDate}` : ""}`);
        });
        continue;
      }
      const label = EVIDENCE_LABELS[key];
      if (!label || value == null || value === "") continue;
      lines.push(`${label}\uFF1A${labelValue(key, value)}`);
    }
    return lines.slice(0, 6);
  }
  function make2(tag, className, text2) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text2 != null) element.textContent = String(text2);
    return element;
  }
  function statusBadge(item) {
    const badge3 = make2("span", `risk-badge risk-status risk-status-${item.status}`, STATUS_LABELS[item.status] || item.status);
    badge3.setAttribute("aria-label", `\u72B6\u6001\uFF1A${STATUS_LABELS[item.status] || item.status}`);
    return badge3;
  }
  function severityBadge(item) {
    const badge3 = make2("span", `risk-badge risk-severity risk-severity-${item.severity.toLowerCase()}`, item.severity);
    badge3.setAttribute("aria-label", `\u4E25\u91CD\u7EA7\u522B\uFF1A${item.severity}`);
    return badge3;
  }
  function renderSummary(summary) {
    setText3("risk-p0-open", summary.p0Open || 0);
    setText3("risk-p1-open", summary.p1Open || 0);
    setText3("risk-fail-count", summary.fail || 0);
    setText3("risk-unverified-count", summary.unverified || 0);
    setText3("risk-pass-count", summary.pass || 0);
    const navDot = byId2("nav-risks-dot");
    if (navDot) navDot.classList.toggle("is-hidden", !(summary.p0Open > 0));
  }
  function renderAcceptance(acceptance) {
    const status = byId2("risk-acceptance-status");
    if (!status) return;
    if (!acceptance || !acceptance.available) {
      status.textContent = "\u751F\u4EA7\u5B9E\u6D4B\uFF1A\u5C1A\u672A\u6267\u884C\u6216\u5C1A\u672A\u4FDD\u5B58";
      status.dataset.state = "unverified";
      return;
    }
    const verdict = { pass: "\u901A\u8FC7", fail: "\u5931\u8D25", not_verified: "\u672A\u5B8C\u6210" }[acceptance.verdict] || "\u672A\u77E5";
    status.textContent = `\u751F\u4EA7\u5B9E\u6D4B\uFF1A${verdict} \xB7 ${formatDate(acceptance.checkedAt)}`;
    status.dataset.state = acceptance.verdict;
  }
  function appendEvidence(cell2, item) {
    cell2.appendChild(make2("div", "risk-evidence-main", item.detail || "\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u8BC1\u636E\u8BF4\u660E\u3002"));
    const lines = evidenceLines(item.evidence);
    if (lines.length) {
      const list = make2("ul", "risk-evidence-list");
      lines.forEach((line) => list.appendChild(make2("li", "", line)));
      cell2.appendChild(list);
    }
    cell2.appendChild(make2("div", "risk-evidence-source", SOURCE_LABELS[item.source] || "\u5F53\u524D\u68C0\u67E5"));
  }
  function renderRows() {
    if (!register) return;
    const tbody = byId2("risk-rows");
    const state = byId2("risk-state");
    const wrap = byId2("risk-table-wrap");
    if (!tbody || !state || !wrap) return;
    const severity = byId2("risk-filter-severity")?.value || "all";
    const status = byId2("risk-filter-status")?.value || "open";
    const items = register.items.filter((item) => (severity === "all" || item.severity === severity) && (status === "all" || (status === "open" ? item.status !== "pass" : item.status === status)));
    tbody.replaceChildren();
    state.replaceChildren();
    if (!items.length) {
      wrap.hidden = true;
      state.appendChild(make2("div", "risk-state-message", "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u98CE\u9669\u9879\u3002"));
      return;
    }
    wrap.hidden = false;
    items.forEach((item) => {
      const row = document.createElement("tr");
      const severityCell = document.createElement("td");
      severityCell.appendChild(severityBadge(item));
      const statusCell = document.createElement("td");
      statusCell.appendChild(statusBadge(item));
      const titleCell = make2("td", "risk-title-cell");
      titleCell.appendChild(make2("strong", "", item.title));
      const evidenceCell = make2("td", "risk-evidence-cell");
      appendEvidence(evidenceCell, item);
      const ownerCell = make2("td", "risk-owner-cell", item.owner);
      const updatedCell = make2("td", "risk-updated-cell", formatDate(item.updatedAt));
      const actionCell = make2("td", "risk-action-cell", item.nextAction);
      row.append(severityCell, statusCell, titleCell, evidenceCell, ownerCell, updatedCell, actionCell);
      tbody.appendChild(row);
    });
  }
  function renderError2(error) {
    const state = byId2("risk-state");
    const wrap = byId2("risk-table-wrap");
    if (wrap) wrap.hidden = true;
    if (!state) return;
    state.replaceChildren();
    const message = make2("div", "risk-state-message risk-state-error");
    message.appendChild(make2("strong", "", "\u98CE\u9669\u6E05\u5355\u52A0\u8F7D\u5931\u8D25"));
    message.appendChild(make2("span", "", `\uFF1A${error && error.message ? error.message : "\u672A\u77E5\u9519\u8BEF"}`));
    const retry = make2("button", "btn-ghost", "\u91CD\u8BD5");
    retry.type = "button";
    retry.addEventListener("click", loadRisks);
    message.appendChild(retry);
    state.appendChild(message);
  }
  function bindControls() {
    const refresh = byId2("risk-refresh");
    if (refresh && refresh.dataset.bound !== "1") {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", loadRisks);
    }
    ["risk-filter-severity", "risk-filter-status"].forEach((id) => {
      const control = byId2(id);
      if (control && control.dataset.bound !== "1") {
        control.dataset.bound = "1";
        control.addEventListener("change", renderRows);
      }
    });
  }
  async function loadRisks() {
    bindControls();
    const requestId = ++requestSequence3;
    const refresh = byId2("risk-refresh");
    const state = byId2("risk-state");
    const wrap = byId2("risk-table-wrap");
    if (refresh) {
      refresh.disabled = true;
      refresh.setAttribute("aria-busy", "true");
    }
    if (wrap) wrap.hidden = true;
    if (state) {
      state.replaceChildren(make2("div", "risk-state-message", "\u6B63\u5728\u6838\u5BF9\u5F53\u524D\u914D\u7F6E\u3001\u6570\u636E\u5E93\u8BC1\u636E\u548C\u6700\u8FD1\u751F\u4EA7\u9A8C\u6536\u2026"));
    }
    try {
      const result = await API.get("/api/risks");
      if (requestId !== requestSequence3) return;
      register = result;
      renderSummary(result.summary || {});
      renderAcceptance(result.latestLiveAcceptance);
      renderRows();
    } catch (error) {
      if (requestId === requestSequence3) renderError2(error);
    } finally {
      if (requestId === requestSequence3 && refresh) {
        refresh.disabled = false;
        refresh.removeAttribute("aria-busy");
      }
    }
  }

  // public/src/app.js
  var app_exports = {};
  __export(app_exports, {
    applyRoleUi: () => applyRoleUi,
    chk: () => chk2,
    go: () => go2,
    hydrate: () => hydrate,
    loadInquiries: () => loadInquiries2,
    renderSparklines: () => renderSparklines2,
    restoreRoute: () => restoreRoute,
    setActionTab: () => setActionTab2,
    setPlanningTab: () => setPlanningTab2,
    toggleHier: () => toggleHier2
  });
  var STATIC_UI_ACTIONS = {
    "toggle-theme": () => toggleTheme(),
    go: (el) => go2(el.dataset.tab),
    ai: (el) => runAiAnalysis(el, el.dataset.aiPrompt, el.dataset.aiTitle || "AI \u5206\u6790", false),
    "ai-box": (el) => aiBox(el, el.dataset.aiPrompt),
    "ai-ask": (el) => runAiAnalysis(el, el.dataset.aiPrompt, el.dataset.aiTitle, false),
    "open-inquiry": () => openInquiry(),
    "add-plan": (el) => addPlanRow(el.dataset.dept),
    "add-test": (el) => addTestRow(el.dataset.dept),
    "snapshot-ranks": () => snapshotRanks(),
    "reload-ga4": () => loadGa42(),
    "add-fix": () => addFixRow(),
    "add-keyword": (el) => addKeyword(el.dataset.keywordType),
    "add-neg": () => addNeg(),
    "add-ad": () => addAd(),
    "add-content": () => addContent(),
    "refresh-brain": (el) => refreshBrain(el),
    "create-hermes-daily-learning": () => createHermesDailyLearning(),
    "load-hermes-memories": () => loadHermesMemories(true),
    "reset-hermes-memory-form": () => resetHermesMemoryForm(),
    "save-hermes-memory": () => saveHermesMemory(),
    "reset-hermes-feedback-form": () => resetHermesFeedbackForm(),
    "save-hermes-feedback": () => saveHermesFeedback(),
    "add-deposit": () => addDepositRow(),
    "open-task": (el) => openTaskModal(el.dataset.dept),
    "open-password": () => openPwd(),
    logout: () => API.logout(),
    "open-sop": () => openSopModal(),
    "open-hermes-panel": () => openHermesPanel(),
    toast: (el) => toast(el.dataset.message),
    "close-hermes-panel": () => closeHermesPanel(),
    "toggle-hermes-maximize": () => toggleHermesMaximize(),
    "load-hermes-morning-brief": () => loadHermesMorningBrief(),
    "ask-hermes-starter": (el) => askHermesStarter(el.dataset.prompt),
    "sync-hermes-page-detail": () => syncHermesPageDetail(true),
    "toggle-hermes-deep-thinking": () => toggleHermesDeepThinking(),
    "send-hermes-prompt": () => sendHermesPrompt(),
    "clear-hermes-chat": () => clearHermesChat(),
    "toggle-hermes-history": () => toggleHermesHistory(),
    "load-hermes-latest": () => loadHermesLatest(true),
    "learn-hermes-conversation": () => learnHermesConversation(),
    "archive-hermes-conversation": () => archiveHermesConversation(),
    "refresh-hermes-status": () => refreshHermesStatus(true),
    "reset-hermes-window": () => resetHermesWindow(),
    "close-modal": (el) => closeModal(el.dataset.modal),
    "submit-inquiry": () => submitInquiry(),
    "submit-custom-range": () => submitCustomRange(),
    "submit-track": () => submitTrack(),
    "submit-seo-week": () => submitSeoWeek(),
    "submit-sem-week": () => submitSemWeek(),
    "submit-password": () => submitPwd(),
    "submit-task": () => submitTask(),
    "submit-subtask": () => submitSubtask(),
    "submit-sop": () => submitSop(),
    "adopt-ai": () => adoptAi()
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-ui-action]");
    if (!el) return;
    const action = STATIC_UI_ACTIONS[el.dataset.uiAction];
    if (action) action(el);
  });
  var semCampFilter = document.getElementById("semCampFilter");
  if (semCampFilter) semCampFilter.addEventListener("change", (e) => onSemCampaignChange(e.target.value));
  var semAdGroupFilter = document.getElementById("semAdGroupFilter");
  if (semAdGroupFilter) semAdGroupFilter.addEventListener("change", (e) => onSemAdGroupChange(e.target.value));
  function toggleTheme() {
    document.body.classList.toggle("dark");
    const dk = document.body.classList.contains("dark");
    document.getElementById("themeBtn").innerHTML = '<i class="ti ti-' + (dk ? "sun" : "moon") + '"></i>';
    try {
      localStorage.setItem("ferr:theme", dk ? "dark" : "light");
    } catch (e) {
    }
  }
  (function() {
    try {
      if (localStorage.getItem("ferr:theme") === "dark") {
        document.body.classList.add("dark");
        const b = document.getElementById("themeBtn");
        if (b) b.innerHTML = '<i class="ti ti-sun"></i>';
      }
    } catch (e) {
    }
  })();
  function setPlanningTab2(tab) {
    const content = document.querySelector(".content");
    if (!content) return;
    const active = tab || "daily";
    content.dataset.planTab = active;
    document.querySelectorAll(".planning-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.planTab === active));
    try {
      localStorage.setItem("ferr:planningTab", active);
    } catch (e) {
    }
    if (active === "week") {
      try {
        renderReview();
      } catch (e) {
      }
    }
    if (active === "month-summary") {
      try {
        renderMonthReview();
      } catch (e) {
      }
    }
  }
  function setActionTab2(tab) {
    const content = document.querySelector(".content");
    if (!content) return;
    const active = tab || "test";
    content.dataset.actionTab = active;
    document.querySelectorAll(".action-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.actionTab === active));
    try {
      localStorage.setItem("ferr:actionTab", active);
    } catch (e) {
    }
  }
  function mountGa4IntoData() {
    const host = document.getElementById("sub-data-ga4");
    const ga4 = document.getElementById("panel-ga4");
    if (!host || !ga4) return;
    ga4.classList.remove("panel", "active");
    ga4.classList.add("ga4-embedded");
    if (ga4.parentElement !== host) host.appendChild(ga4);
  }
  function go2(tab) {
    if (tab === "ga4") {
      try {
        localStorage.setItem("ferr:sub:data", "data-ga4");
      } catch (e) {
      }
      tab = "data";
    }
    mountGa4IntoData();
    const planCombo = tab === "planning";
    const actionCombo = tab === "action";
    const p = planCombo ? document.getElementById("panel-tasks") : actionCombo ? document.getElementById("panel-test") : document.getElementById("panel-" + tab);
    if (!p) return;
    const content = document.querySelector(".content");
    if (content) {
      content.classList.toggle("planning-composite", planCombo);
      content.classList.toggle("action-composite", actionCombo);
      if (!planCombo) delete content.dataset.planTab;
      if (!actionCombo) delete content.dataset.actionTab;
    }
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((n2) => n2.classList.remove("active"));
    if (planCombo) {
      ["tasks", "plan", "review", "month-review"].forEach((id) => {
        const panel = document.getElementById("panel-" + id);
        if (panel) panel.classList.add("active");
      });
      let planTab = "daily";
      try {
        planTab = localStorage.getItem("ferr:planningTab") || "daily";
      } catch (e) {
      }
      setPlanningTab2(planTab);
    } else if (actionCombo) {
      ["test", "fix"].forEach((id) => {
        const panel = document.getElementById("panel-" + id);
        if (panel) panel.classList.add("active");
      });
      let actionTab = "test";
      try {
        actionTab = localStorage.getItem("ferr:actionTab") || "test";
      } catch (e) {
      }
      setActionTab2(actionTab);
    } else {
      p.classList.add("active");
    }
    const n = document.querySelector('.nav-item[data-tab="' + tab + '"]');
    if (n) {
      n.classList.add("active");
      if (window.matchMedia("(max-width:760px)").matches) n.scrollIntoView({ block: "nearest", inline: "center" });
    }
    document.querySelector(".main").scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    window._curTab = tab;
    try {
      localStorage.setItem("ferr:tab", tab);
    } catch (e) {
    }
    if (tab === "data") resizeScatters();
    if (tab === "risks") {
      try {
        loadRisks();
      } catch (e) {
      }
    }
    if (tab === "inquiry") setTimeout(() => {
      try {
        renderGlobe2();
      } catch (e) {
      }
    }, 80);
    if (tab === "archive") {
      try {
        loadArchive2();
      } catch (e) {
      }
    }
    if (tab === "tasks" || planCombo) {
      try {
        loadUrgent();
        renderSopOverdueBanner();
        renderReview();
      } catch (e) {
      }
    }
  }
  document.querySelectorAll(".nav-item").forEach((n) => n.addEventListener("click", () => go2(n.dataset.tab)));
  document.querySelectorAll(".planning-tab").forEach((btn) => btn.addEventListener("click", () => setPlanningTab2(btn.dataset.planTab)));
  document.querySelectorAll(".action-tab").forEach((btn) => btn.addEventListener("click", () => setActionTab2(btn.dataset.actionTab)));
  document.querySelectorAll(".subtab[data-sub]").forEach((t) => t.addEventListener("click", () => {
    const g = t.closest(".panel");
    const id = t.dataset.sub;
    g.querySelectorAll(".subtab").forEach((x) => x.classList.remove("active"));
    g.querySelectorAll(".subpanel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const sp = g.querySelector("#sub-" + id);
    if (sp) sp.classList.add("active");
    const tab = (g.id || "").replace("panel-", "");
    try {
      localStorage.setItem("ferr:sub:" + tab, id);
    } catch (e) {
    }
    resizeScatters();
  }));
  function restoreRoute() {
    let tab = "dashboard";
    try {
      tab = localStorage.getItem("ferr:tab") || "dashboard";
    } catch (e) {
    }
    if (tab === "ga4") {
      tab = "data";
      try {
        localStorage.setItem("ferr:sub:data", "data-ga4");
      } catch (e) {
      }
    }
    if (tab !== "planning" && tab !== "action" && !document.getElementById("panel-" + tab)) tab = "dashboard";
    go2(tab);
    let sub = null;
    try {
      sub = localStorage.getItem("ferr:sub:" + tab);
    } catch (e) {
    }
    if (sub) {
      const panel = document.getElementById("panel-" + tab);
      const st = panel && panel.querySelector('.subtab[data-sub="' + sub + '"]');
      if (st) st.click();
    }
  }
  document.querySelectorAll(".cat-tabs").forEach((box) => box.addEventListener("click", (e) => {
    const t = e.target.closest(".cat-tab");
    if (!t) return;
    const sub = box.closest(".subpanel");
    const type = sub && sub.id === "sub-kw-sem" ? "sem" : "seo";
    if (t.classList.contains("add")) {
      const name = (prompt("\u65B0\u5EFA\u5206\u7C7B\u540D\u79F0\uFF1A") || "").trim();
      if (!name) return;
      if (![...box.querySelectorAll(".cat-tab")].some((x) => x.textContent.trim() === name)) {
        const span = document.createElement("span");
        span.className = "cat-tab";
        span.textContent = name;
        box.insertBefore(span, t);
      }
      box.querySelectorAll(".cat-tab").forEach((x) => x.classList.remove("active"));
      const target = [...box.querySelectorAll(".cat-tab")].find((x) => x.textContent.trim() === name);
      if (target) target.classList.add("active");
      filterKwByCat(type, name);
      return;
    }
    box.querySelectorAll(".cat-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    filterKwByCat(type, t.classList.contains("cat-all") ? null : t.textContent.trim());
  }));
  function toggleHier2(row) {
    row.classList.toggle("collapsed");
    const hidden = row.classList.contains("collapsed");
    let n = row.nextElementSibling;
    while (n && !n.classList.contains("h-camp")) {
      n.style.display = hidden ? "none" : "";
      n = n.nextElementSibling;
    }
  }
  document.querySelectorAll(".minitab[data-mini]").forEach((t) => t.addEventListener("click", () => {
    const wrap = t.closest(".subpanel");
    wrap.querySelectorAll(".minitab").forEach((x) => x.classList.remove("active"));
    wrap.querySelectorAll(".minipanel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const mp = wrap.querySelector("#mp-" + t.dataset.mini);
    if (mp) mp.classList.add("active");
    resizeScatters();
  }));
  function renderSparklines2() {
    document.querySelectorAll("[data-spark]").forEach((td2) => {
      const v = td2.dataset.spark.split(",").map(Number);
      const w = 58, h = 18, max = Math.max(...v), min = Math.min(...v), rng = Math.max(max - min, 1);
      const pts = v.map((d, i) => {
        const x = i / (v.length - 1) * (w - 4) + 2;
        const y = (d - min) / rng * (h - 6) + 3;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      const up = v[v.length - 1] < v[0];
      const col = up ? "var(--green)" : v[v.length - 1] > v[0] ? "var(--primary)" : "var(--text3)";
      const last = v[v.length - 1], lx = w - 4 + 2, ly = (last - min) / rng * (h - 6) + 3;
      td2.innerHTML = `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2" fill="${col}"/></svg>`;
    });
  }
  function tableLoadState(id, colspan, state, message, retryAction) {
    const tb = document.getElementById(id);
    if (!tb) return;
    const retry = typeof retryAction === "function" ? ' <button type="button" class="btn-mini table-retry"><i class="ti ti-refresh"></i> \u91CD\u8BD5</button>' : "";
    tb.innerHTML = `<tr data-load-state="${state}"><td colspan="${colspan}" class="dim csp-s-d48bfa87bb">${esc(message)}${retry}</td></tr>`;
    const retryBtn = tb.querySelector(".table-retry");
    if (retryBtn) retryBtn.addEventListener("click", retryAction);
  }
  var inquiryRequestSequence = 0;
  async function loadInquiries2() {
    const requestId = ++inquiryRequestSequence;
    const revision = typeof getRangeRevision === "function" ? getRangeRevision() : 0;
    try {
      const { items, stats } = await API.get(withRange2("/api/inquiries"));
      if (requestId !== inquiryRequestSequence || typeof getRangeRevision === "function" && revision !== getRangeRevision()) return;
      window._inqCache = items || [];
      renderInqList();
      try {
        renderInqFeed();
      } catch (_) {
      }
      refreshInqStats(stats);
      renderInqDonuts();
      if (window._curTab === "inquiry") {
        try {
          renderGlobe2();
        } catch (e) {
        }
      }
    } catch (e) {
      if (requestId === inquiryRequestSequence && e && e.message !== "unauthorized") {
        window._inqCache = [];
        window._inqStats = null;
        const reason = e.message || "\u672A\u77E5\u9519\u8BEF";
        tableLoadState("tb-inq-cur", 11, "error", "\u8BE2\u76D8\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason, loadInquiries2);
        tableLoadState("tb-inq", 11, "error", "\u8BE2\u76D8\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason, loadInquiries2);
        const count = document.getElementById("inqFeedCount");
        if (count) count.textContent = "\u52A0\u8F7D\u5931\u8D25";
        renderInqDonuts();
        if (window._curTab === "inquiry") {
          try {
            renderGlobe2();
          } catch (_) {
          }
        }
        toast("\u8BE2\u76D8\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason);
      }
    }
  }
  async function loadNegKeywords() {
    try {
      const { items } = await API.get("/api/neg-keywords");
      const tb = document.getElementById("tb-neg");
      if (!tb) return;
      tb.innerHTML = "";
      const rows2 = items || [];
      if (!rows2.length) {
        tableLoadState("tb-neg", 6, "empty", "\u6682\u65E0\u5426\u8BCD\u8BB0\u5F55\uFF0C\u70B9\u51FB\u201C\u52A0\u5426\u8BCD\u201D\u5F00\u59CB\u8BB0\u5F55\u3002");
        return;
      }
      rows2.slice().reverse().forEach((r) => {
        prepend("tb-neg", negRowHtml(r));
        tb.firstChild.dataset.id = r.id;
        tb.firstChild.dataset.ep = "/api/neg-keywords";
      });
    } catch (e) {
      if (e && e.message !== "unauthorized") {
        const reason = e.message || "\u672A\u77E5\u9519\u8BEF";
        tableLoadState("tb-neg", 6, "error", "\u5426\u8BCD\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason, loadNegKeywords);
        toast("\u5426\u8BCD\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason);
      }
    }
  }
  async function loadAdCreatives() {
    try {
      const { items } = await API.get("/api/ad-creatives");
      const tb = document.getElementById("tb-ad");
      if (!tb) return;
      tb.innerHTML = "";
      const rows2 = items || [];
      if (!rows2.length) {
        tableLoadState("tb-ad", 5, "empty", "\u6682\u65E0\u5E7F\u544A\u521B\u610F\u8BB0\u5F55\uFF0C\u70B9\u51FB\u201C\u52A0\u521B\u610F\u201D\u5F00\u59CB\u8BB0\u5F55\u3002");
        return;
      }
      rows2.slice().reverse().forEach((r) => {
        prepend("tb-ad", adRowHtml(r));
        tb.firstChild.dataset.id = r.id;
        tb.firstChild.dataset.ep = "/api/ad-creatives";
      });
    } catch (e) {
      if (e && e.message !== "unauthorized") {
        const reason = e.message || "\u672A\u77E5\u9519\u8BEF";
        tableLoadState("tb-ad", 5, "error", "\u5E7F\u544A\u521B\u610F\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason, loadAdCreatives);
        toast("\u5E7F\u544A\u521B\u610F\u52A0\u8F7D\u5931\u8D25\uFF1A" + reason);
      }
    }
  }
  async function hydrate() {
    await loadInquiries2();
    await loadNegKeywords();
    await loadAdCreatives();
    await loadRankSnapshots();
  }
  var LOOP = [["\u2460 \u8BA1\u5212", "plan"], ["\u2461 \u6D4B\u8BD5", "test"], ["\u2462 \u6570\u636E", "data"], ["\u2463 \u6574\u6539", "fix"], ["\u2464 \u590D\u76D8", "review"]];
  function renderLoopbars() {
    document.querySelectorAll(".loopbar").forEach((bar) => {
      const cur = +bar.dataset.step;
      bar.innerHTML = LOOP.map((x, i) => {
        const n = i + 1;
        const cls = n === cur ? "active" : n < cur ? "done" : "";
        return `<span class="loopstep ${cls}" data-loop-tab="${esc(x[1])}">${x[0]}</span>` + (n < LOOP.length ? '<span class="loopsep"></span>' : "");
      }).join("");
      bar.onclick = (e) => {
        const step = e.target.closest("[data-loop-tab]");
        if (step && bar.contains(step)) go2(step.dataset.loopTab);
      };
    });
  }
  renderLoopbars();
  function chk2(el) {
    el.classList.toggle("on");
    const c = el.closest(".tcard");
    const on = el.classList.contains("on");
    if (on) {
      el.innerHTML = '<i class="ti ti-check"></i>';
      c.classList.add("done");
    } else {
      el.innerHTML = "";
      c.classList.remove("done");
    }
    if (c) {
      c.classList.add("nofold");
      if (typeof refreshTaskCols === "function") refreshTaskCols();
    }
    const id = c && c.dataset.id;
    const sopId = c && c.dataset.sopId;
    const recount = () => {
      if (typeof refreshTaskCols === "function") refreshTaskCols();
    };
    const rollback = () => {
      el.classList.toggle("on");
      if (on) {
        el.innerHTML = "";
        c.classList.remove("done");
      } else {
        el.innerHTML = '<i class="ti ti-check"></i>';
        c.classList.add("done");
      }
      recount();
    };
    if (id) {
      if (on && c.classList.contains("cotask")) {
        API.post("/api/loop-items/" + id + "/archive", { archive_kind: "company" }).then(() => {
          toast("\u5927\u4EFB\u52A1\u5B8C\u6210 \xB7 \u5DF2\u5F52\u6863\uFF08\u542B\u5B50\u4EFB\u52A1\uFF09");
          c.remove();
          recount();
          loadUrgent();
          if (typeof updateSopCounts === "function") updateSopCounts();
        }).catch((e) => {
          rollback();
          toast(e && e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF0C\u672A\u5165\u5E93" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D");
        });
        return;
      }
      API.patch("/api/loop-items/" + id, { state: on ? "done" : "todo", status: on ? "done" : "\u5F85\u529E" }).then(() => {
        const fx = c._item && c._item.fix_id;
        if (on) toastUndo("\u4EFB\u52A1\u5B8C\u6210 \xB7 \u5DF2\u5165\u5E93" + (fx ? " \xB7 \u6574\u6539\u5DF2\u6807\u300C\u5DF2\u6539\u300D" : ""), () => chk2(el));
        else toast("\u64A4\u9500\u5B8C\u6210 \xB7 \u5DF2\u5165\u5E93" + (fx ? " \xB7 \u6574\u6539\u56DE\u5230\u300C\u8FDB\u884C\u4E2D\u300D" : ""));
        loadUrgent();
      }).catch((e) => {
        rollback();
        toast(e && e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF0C\u672A\u5165\u5E93" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D");
      });
    } else if (sopId) {
      const freq = c.dataset.sopFreq || "daily";
      const pk = sopPeriodKey(freq);
      const req = on ? API.post("/api/sop/completions", { sop_id: Number(sopId), period_key: pk }) : API.del("/api/sop/completions/" + sopId + "?period_key=" + encodeURIComponent(pk));
      req.then(() => {
        toast(on ? "SOP \u5B8C\u6210 \xB7 \u5DF2\u5165\u5E93" : "\u64A4\u9500\u5B8C\u6210 \xB7 \u5DF2\u5165\u5E93");
        const set = window._sopDone && window._sopDone[freq];
        if (set) {
          if (on) set.add(Number(sopId));
          else set.delete(Number(sopId));
        }
        updateSopCounts();
        renderSopOverdueBanner();
        refreshNavTaskDot();
      }).catch((e) => {
        rollback();
        toast(e && e.status === 403 ? "\u65E0\u6743\u64CD\u4F5C\uFF0C\u672A\u5165\u5E93" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D");
      });
    } else {
      toast(on ? "\u5DF2\u5B8C\u6210" : "");
    }
  }
  window.addEventListener("load", async () => {
    await ensureAuth();
    applyRoleUi();
    restoreRoute();
    await loadMetrics();
    await loadWeeks();
    renderKPI2();
    await loadOverview();
    charts();
    bindSettings();
    renderSparklines2();
    await hydrate();
    loadDashboardInq();
    loadDashboardBoards();
    await loadKeywords();
    await loadClosedLoop();
    await loadAiAnalyses();
    await loadArchive2();
    await loadSops();
    await loadUrgent();
    await loadContent();
    await loadGa42();
    loadSeoBoardGsc();
    loadSeoBoardFull();
    loadSemBoardAds();
    loadSemBoardFull();
    loadAttribution();
    loadDiagnostics();
    loadDataFreshness();
    await loadDataSourcesStatus();
    await loadIntegrations();
    await loadMarket();
    if (typeof loadHermesMemories === "function") await loadHermesMemories(false);
    await loadBrain();
    await renderReview();
    refreshInqStats();
  });
  var ROLE_LABEL = { seo: "\u674E \xB7 SEO", sem: "\u9648 \xB7 SEM", manager: "\u4E3B\u7BA1", boss: "\u8001\u677F" };
  function applyRoleUi() {
    const me = window.ME || {};
    const pn = document.getElementById("prof-name");
    if (pn) pn.textContent = me.name || "\u2014";
    const pr = document.getElementById("prof-role");
    if (pr) pr.textContent = ROLE_LABEL[me.role] || me.role || "\u2014";
    const pu = document.getElementById("prof-user");
    if (pu) pu.textContent = me.username || "\u2014";
    if (!can("kpiTarget")) {
      document.querySelectorAll("#panel-settings [data-kpi]").forEach((el) => {
        el.removeAttribute("contenteditable");
        el.style.opacity = ".7";
      });
    }
    if (!can("inquiry")) {
      document.querySelectorAll('[data-ui-action="open-inquiry"]').forEach((b) => b.style.display = "none");
    }
    if (!can("seo")) document.querySelectorAll('[data-ui-action="open-seo-week"]').forEach((b) => b.style.display = "none");
    if (!can("sem")) document.querySelectorAll('[data-ui-action="open-sem-week"]').forEach((b) => b.style.display = "none");
    if (!can("sem")) {
      document.querySelectorAll('[data-ui-action="add-neg"],[data-ui-action="add-ad"]').forEach((b) => b.style.display = "none");
    }
    if (!can("seo")) document.querySelectorAll('[data-ui-action="snapshot-ranks"]').forEach((b) => b.style.display = "none");
    if (!can("seo")) document.querySelectorAll('[data-ui-action="add-keyword"][data-keyword-type="seo"],[data-ui-action="add-keyword"][data-keyword-type="high"],[data-ui-action="add-keyword"][data-keyword-type="customer"]').forEach((b) => b.style.display = "none");
    if (!can("sem")) document.querySelectorAll('[data-ui-action="add-keyword"][data-keyword-type="sem"]').forEach((b) => b.style.display = "none");
  }

  // public/src/main.js
  bindTableEditor();
  var inquiryCompatibility = { openInquiry, submitInquiry, submitTrack, renderInqList, refreshInqStats, renderInqFeed };
  var kpiCompatibility = { TOTAL, SEO, SEM, applyKpiServer, loadMetrics, loadWeeks, submitSeoWeek, submitSemWeek };
  var chartCompatibility = { charts, loadDashboardInq, loadDashboardBoards, renderInqDonuts, loadSeoBoardGsc, loadSeoBoardFull, loadSemBoardAds, loadSemBoardFull, loadAttribution, loadDiagnostics, loadDataFreshness, onSemCampaignChange, onSemAdGroupChange, resizeScatters };
  var closedLoopCompatibility = { prepend, refreshTaskCols, addFixRow, addDepositRow, addPlanRow, addTestRow, addContent, openTaskModal, submitTask, submitSubtask, loadClosedLoop, loadContent };
  var aiCompatibility = { runAiAnalysis, aiBox, loadAiAnalyses, adoptAi };
  var settingsCompatibility = { bindSettings, openPwd, submitPwd };
  var rankSnapshotCompatibility = { loadRankSnapshots, snapshotRanks };
  var riskCompatibility = { loadRisks };
  Object.assign(window, ui_kit_exports, neg_ads_exports, ga4_view_exports, market_brain_exports, kpi_view_exports, tagselect_exports, google_projects_exports, archive_exports, timerange_exports, sop_exports, keywords_exports, hermes_memory_exports, inquiry_globe_exports, plan_history_exports, weekly_review_exports, inquiryCompatibility, kpiCompatibility, chartCompatibility, closedLoopCompatibility, aiCompatibility, settingsCompatibility, rankSnapshotCompatibility, riskCompatibility, app_exports);
})();
