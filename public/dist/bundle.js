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
  var NEGMATCH_BADGE = { "\u7CBE\u786E": "b-green", "\u8BCD\u7EC4": "b-blue", "\u5E7F\u6CDB": "b-amber" };
  var NEGSTATUS_BADGE = { "\u751F\u6548": "b-green", "\u89C2\u5BDF": "b-amber", "\u5DF2\u79FB\u9664": "b-gray" };
  var ADSTATUS_BADGE = { "\u91C7\u7528\u4E2D": "b-green", "\u6D4B\u8BD5\u4E2D": "b-amber", "\u5DF2\u5F03\u7528": "b-gray" };
  function negRowHtml(r) {
    return `<td class="editable" contenteditable data-field="word">${esc(r.word)}</td><td class="ctr"><span class="tagselect ${NEGMATCH_BADGE[r.match_type] || "b-blue"}" data-kind="negmatch">${esc(r.match_type || "\u8BCD\u7EC4")}<i class="ti ti-chevron-down"></i></span></td><td class="editable" contenteditable data-field="added_date">${esc(r.added_date || "")}</td><td class="editable" contenteditable data-field="reason" style="font-size:11px">${esc(r.reason || "")}</td><td class="editable" contenteditable data-field="source_campaign">${esc(r.source_campaign || "")}</td><td class="ctr"><span class="tagselect ${NEGSTATUS_BADGE[r.status] || "b-green"}" data-kind="negstatus">${esc(r.status || "\u751F\u6548")}<i class="ti ti-chevron-down"></i></span></td>`;
  }
  function adRowHtml(r) {
    return `<td class="editable" contenteditable data-field="title">${esc(r.title)}</td><td class="editable dim" contenteditable data-field="description" style="font-size:11px">${esc(r.description || "")}</td><td class="editable" contenteditable data-field="ctr">${esc(r.ctr || "")}</td><td class="editable dim" contenteditable data-field="ab_conclusion" style="font-size:11px">${esc(r.ab_conclusion || "")}</td><td class="ctr"><span class="tagselect ${ADSTATUS_BADGE[r.status] || "b-amber"}" data-kind="adstatus">${esc(r.status || "\u6D4B\u8BD5\u4E2D")}<i class="ti ti-chevron-down"></i></span></td>`;
  }
  async function addNeg() {
    try {
      const { item } = await API.post("/api/neg-keywords", { word: "\u65B0\u5426\u8BCD", reason: "" });
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
    loadGa4: () => loadGa4
  });
  async function loadGa4() {
    let r = { connected: false };
    try {
      r = await API.get(withRange("/api/ga4/overview"));
    } catch (e) {
    }
    const st = document.getElementById("ga4-status");
    if (st) {
      st.className = "badge " + (r.connected ? "b-green" : "b-gray");
      st.textContent = r.connected ? "\u5DF2\u63A5\u5165" : "\u672A\u63A5\u5165";
    }
    const hint = document.getElementById("ga4-hint");
    if (hint) hint.style.display = r.connected ? "none" : "flex";
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v == null ? "\u2014" : v;
    };
    const m = r.metrics;
    if (m) {
      set("ga4-users", m.activeUsers);
      set("ga4-sessions", m.sessions);
      set("ga4-views", m.pageViews);
      set("ga4-bounce", m.bounceRate != null ? m.bounceRate + "%" : "\u2014");
      set("ga4-dur", m.avgDuration);
    }
    const fill = (tbId, rows, cols) => {
      const tb = document.getElementById(tbId);
      if (!tb) return;
      if (rows && rows.length) {
        tb.innerHTML = rows.map((x) => "<tr>" + cols.map((c) => `<td class="${c.cls || ""}">${esc(x[c.k] ?? "")}</td>`).join("") + "</tr>").join("");
        const card = tb.closest(".card");
        const e = card && card.querySelector(".ga4-empty");
        if (e) e.style.display = "none";
      }
    };
    fill("ga4-sources", r.sources, [{ k: "source" }, { k: "sessions", cls: "num" }, { k: "users", cls: "num" }]);
    fill("ga4-countries", r.countries, [{ k: "country" }, { k: "sessions", cls: "num" }, { k: "users", cls: "num" }]);
    fill("ga4-landing", r.landingPages, [{ k: "page" }, { k: "sessions", cls: "num" }, { k: "conversions", cls: "num" }]);
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
        hr.innerHTML = `<td colspan="5" style="background:var(--bg3);font-weight:800;color:var(--primary)">${mktEsc(it.section)}</td>`;
        tb.appendChild(hr);
      }
      const tr = document.createElement("tr");
      tr.dataset.id = it.id;
      tr.innerHTML = `<td class="dim" style="font-size:11px">${mktEsc(it.section)}</td><td class="mkt-q editable" contenteditable style="font-size:11.5px">${mktEsc(it.question)}</td>` + ["\u5B5F\u96EA", "\u738B\u7490\u5E73", "\u71D5\u654F"].map((r) => `<td class="mkt-ans editable" contenteditable data-resp="${r}" style="font-size:11.5px;white-space:pre-wrap">${mktEsc(ans[r] || "")}</td>`).join("");
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
    const cell = e.target.closest && e.target.closest("#tb-market [contenteditable]");
    if (!cell) return;
    const tr = cell.closest("tr");
    const id = tr && tr.dataset.id;
    if (!id) return;
    const it = window._marketById[id];
    if (!it) return;
    const body = {};
    if (cell.classList.contains("mkt-q")) body.question = cell.innerText.trim();
    else if (cell.classList.contains("mkt-ans")) {
      it._ans = it._ans || {};
      it._ans[cell.dataset.resp] = cell.innerText;
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

  // public/src/main.js
  Object.assign(window, neg_ads_exports, ga4_view_exports, market_brain_exports);
})();
