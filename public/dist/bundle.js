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
    loadGa4: () => loadGa42
  });
  async function loadGa42() {
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
    const fill = (tbId, rows2, cols) => {
      const tb = document.getElementById(tbId);
      if (!tb) return;
      if (rows2 && rows2.length) {
        tb.innerHTML = rows2.map((x) => "<tr>" + cols.map((c) => `<td class="${c.cls || ""}">${esc(x[c.k] ?? "")}</td>`).join("") + "</tr>").join("");
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

  // public/src/kpi-view.js
  var kpi_view_exports = {};
  __export(kpi_view_exports, {
    badge: () => badge,
    fmt: () => fmt,
    gauge: () => gauge,
    grade: () => grade,
    loadOverview: () => loadOverview,
    mini: () => mini,
    renderKPI: () => renderKPI,
    rows: () => rows
  });
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
    return k.u === "\xA5" ? "\xA5" + v.toLocaleString() : k.u === "%" ? v + "%" : k.u === "" ? v : v + k.u;
  }
  function rows(arr, box) {
    const el = document.getElementById(box);
    if (!el) return;
    el.innerHTML = arr.map((k) => {
      const r = ratio(k), col = r >= 0.9 ? "var(--green)" : r >= 0.7 ? "var(--blue)" : r >= 0.5 ? "var(--amber)" : "var(--primary)";
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11.5px"><div style="flex:1"><div style="font-weight:600">${esc(k.n)}</div><div style="color:var(--text3);font-size:10px">\u76EE\u6807 ${fmt(k, k.t)} \xB7 \u5B9E\u9645 ${fmt(k, k.a)}</div></div><div style="width:64px"><div class="progress-bar"><div class="progress-fill" style="width:${r * 100}%;background:${col}"></div></div></div><div style="width:30px;text-align:right;font-weight:800;color:${col}">${Math.round(r * 100)}</div></div>`;
    }).join("");
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
    el.innerHTML = m.map((x) => `<div style="background:var(--bg3);border-radius:9px;padding:9px 10px"><div style="font-size:10px;color:var(--text3)">${x[0]}</div><div style="font-size:16px;font-weight:800;margin-top:2px">${x[1]}<span style="font-size:10px;color:var(--text3);font-weight:500">${x[2]}</span> <span style="font-size:10px;font-weight:700;color:${(x[3] || "").startsWith("\u25B2") ? "var(--green)" : (x[3] || "").startsWith("\u25BC") ? "var(--primary)" : "var(--text3)"}">${x[3] || ""}</span></div></div>`).join("");
  }
  async function loadOverview() {
    try {
      const ov = await API.get("/api/overview");
      const c = ov.current || {}, d = ov.delta || {};
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
        el.textContent = (v > 0 ? "\u25B2" + v : v < 0 ? "\u25BC" + Math.abs(v) : "\u2014") + " vs\u4E0A\u6708";
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
          chip.textContent = (d.company > 0 ? "\u25B2" + d.company : d.company < 0 ? "\u25BC" + Math.abs(d.company) : "\u2014") + " \u5206 vs\u4E0A\u6708";
          chip.style.color = d.company > 0 ? "var(--green)" : d.company < 0 ? "var(--primary)" : "var(--text3)";
        }
      }
      mini(ov);
    } catch (e) {
      mini();
    }
  }
  function renderKPI() {
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
  }

  // public/src/tagselect.js
  var tagselect_exports = {};
  __export(tagselect_exports, {
    OPT: () => OPT,
    persistTagChange: () => persistTagChange
  });
  var OPT = {
    channel: [["SEO\u81EA\u7136", "b-blue"], ["SEM\u4ED8\u8D39", "b-purple"], ["\u76F4\u63A5", "b-teal"], ["\u5176\u4ED6", "b-gray"]],
    product: [["\u94F8\u9020", "b-amber"], ["\u953B\u9020", "b-red"], ["\u673A\u52A0\u5DE5", "b-blue"], ["\u9600\u95E8", "b-purple"], ["\u7BA1\u4EF6", "b-teal"]],
    status: [["\u5F85\u5F00\u59CB", "b-gray"], ["\u8FDB\u884C\u4E2D", "b-amber"], ["\u5DF2\u5B8C\u6210", "b-green"]],
    result: [["\u5DF2\u6539", "b-green"], ["\u8FDB\u884C\u4E2D", "b-amber"], ["\u8BA1\u5212\u4E0B\u5468", "b-blue"], ["\u653E\u5F03", "b-gray"]],
    grade: [["A", "b-green"], ["B", "b-blue"], ["C", "b-gray"]],
    // 6.23 文档 8：询盘等级 tagselect 可点改
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
      grade: "grade"
    };
    const field2 = fieldMap[kind];
    if (!field2) return;
    try {
      await API.patch(ep + "/" + id, { [field2]: value });
      if (ep === "/api/inquiries" && field2 === "grade") {
        const it = (window._inqCache || []).find((x) => String(x.id) === String(id));
        if (it) {
          it.grade = value;
          if (tr) {
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
    if (s.error) extra = `<span style="color:var(--primary)"> \xB7 \u9519\u8BEF\uFF1A${esc(s.error)}</span>`;
    else if (s.type === "sync" && s.missing && s.missing.length) extra = `<span class="dim"> \xB7 \u7F3A\u5C11 ${esc(s.missing.join(", "))}</span>`;
    else if (s.note === "google_oauth_required") extra = `<span class="dim"> \xB7 \u9700\u8981 OAuth \u6388\u6743</span>`;
    else if (s.note === "google_sync_ready") extra = `<span class="dim"> \xB7 \u53EF\u624B\u52A8\u540C\u6B65</span>`;
    else if (s.type === "provider" && s.status === "configured_unverified") extra = `<span class="dim"> \xB7 ${esc(s.provider || "")}${s.model ? " / " + esc(s.model) : ""}</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)"><div style="width:96px;font-weight:600">${esc(name)}</div><div style="width:74px;color:var(--text3);font-size:11px">${esc(typeText)}</div><span class="badge ${cls}">${esc(text2)}</span><div style="flex:1"></div><div style="color:var(--text3);font-size:11px;white-space:nowrap">\u65F6\u95F4 ${esc(String(time))} \xB7 \u8BB0\u5F55 ${esc(String(count))}</div><div style="font-size:11px">${extra}</div></div>`;
  }
  async function loadDataSourcesStatus() {
    const box = document.getElementById("ds-status-rows");
    if (!box) return;
    const tag = document.getElementById("ds-demo-tag");
    if (tag) tag.innerHTML = window.DEMO_MODE ? '<span class="badge b-amber" style="margin-left:8px">\u793A\u4F8B\u6A21\u5F0F</span>' : "";
    try {
      const r = await API.get("/api/data-sources/status");
      const src = r && r.sources || {};
      box.innerHTML = DS_ORDER.map((k) => dsRow(k, src[k])).join("") + (window.DEMO_MODE ? '<div class="dim" style="font-size:11px;margin-top:6px">\u5F53\u524D\u4E3A\u6F14\u793A\u6807\u8BB0\uFF0C\u4E0B\u65B9\u4ECD\u4E3A\u63A5\u53E3\u771F\u5B9E\u72B6\u6001\u3002</div>' : "");
    } catch (e) {
      box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x" style="color:var(--primary);font-size:18px"></i><div><div class="banner-t">\u72B6\u6001\u83B7\u53D6\u5931\u8D25</div><div class="banner-s">${esc(e && e.message ? e.message : "\u8BF7\u6C42\u5931\u8D25")}</div></div></div>`;
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
      box.innerHTML = `<div class="sheet-tip" style="margin-bottom:2px"><i class="ti ti-info-circle"></i> ${projectText}</div>` + GOOGLE_PROVIDER_ORDER.map((p) => googleProviderRow(p, providers[p] || {}, project)).join("");
    } catch (e) {
      box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x" style="color:var(--primary);font-size:18px"></i><div><div class="banner-t">Google \u63A5\u5165\u72B6\u6001\u83B7\u53D6\u5931\u8D25</div><div class="banner-s">${esc(e && e.message ? e.message : "\u8BF7\u6C42\u5931\u8D25")}</div></div></div>`;
    }
  }
  function googleProviderRow(provider, s, project) {
    const configured = !!s.configured;
    const authorized = !!s.authorized;
    const ok = configured && authorized;
    const badge3 = ok ? '<span class="badge b-green">\u5DF2\u6388\u6743</span>' : configured ? '<span class="badge b-amber">\u5F85\u6388\u6743</span>' : '<span class="badge b-gray">\u540E\u7AEF\u672A\u914D\u7F6E</span>';
    const missing = s.missing && s.missing.length ? `<div class="dim" style="font-size:11px;margin-top:4px">\u7F3A\u5C11\uFF1A${esc(s.missing.join(", "))}</div>` : "";
    const lastSync = s.lastSyncAt || "\u2014";
    const lastStatus = s.lastSyncStatus || "\u672A\u540C\u6B65";
    const lastError = s.lastError ? `<div style="color:var(--primary);font-size:11px;margin-top:4px">\u6700\u8FD1\u9519\u8BEF\uFF1A${esc(s.lastError)}</div>` : "";
    const providerConfigNote = provider === "gsc" ? s.siteUrlConfigured || project?.gsc_site_url ? "\u7AD9\u70B9\u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GSC_SITE_URL \u6216\u9879\u76EE\u7AD9\u70B9" : provider === "ga4" ? s.propertyConfigured || project?.ga4_property_id ? "Property \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GA4_PROPERTY_ID \u6216\u9879\u76EE Property" : s.customerConfigured || project?.ads_customer_id ? "Customer \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GOOGLE_ADS_CUSTOMER_ID \u6216\u9879\u76EE Customer";
    const authDisabled = configured ? "" : "disabled";
    const syncDisabled = ok ? "" : "disabled";
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
    <div style="width:230px;font-weight:700">${esc(INTEG_LABEL[provider] || provider)} ${badge3}</div>
    <div style="flex:1;min-width:260px;color:var(--text2);font-size:12px;line-height:1.6">
      <div>${esc(providerConfigNote)} \xB7 \u6700\u8FD1\u540C\u6B65\uFF1A${esc(String(lastSync))} \xB7 \u72B6\u6001\uFF1A${esc(String(lastStatus))}</div>
      ${missing}${lastError}
    </div>
    <button class="btn-ghost" onclick="startGoogleAuth('${provider}')" ${authDisabled}><i class="ti ti-brand-google"></i> \u6388\u6743</button>
    <button class="btn-ghost" onclick="backfillGoogle('${provider}',90,this)" ${syncDisabled} title="\u56DE\u8865\u6700\u8FD1 90 \u5929\u5386\u53F2\uFF08\u9996\u6B21\u63A5\u5165\u6216\u56FE\u8868\u524D\u6BB5\u7A7A\u767D\u65F6\u7528\uFF0C\u53EF\u80FD\u8017\u65F6\u8F83\u4E45\uFF09"><i class="ti ti-history"></i> \u56DE\u886590\u5929</button>
    <button class="btn-primary" onclick="syncGoogle('${provider}',this)" ${syncDisabled}><i class="ti ti-refresh"></i> \u7ACB\u5373\u540C\u6B65</button>
  </div>`;
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
      if (typeof loadDataFreshness === "function") loadDataFreshness();
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
    loadArchive: () => loadArchive
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
    const ops = '<button class="btn-mini arch-restore" title="\u6062\u590D\u5230\u539F\u9875"><i class="ti ti-rotate"></i> \u6062\u590D</button>' + (isBoss ? ' <button class="btn-mini arch-hard" title="\u5F7B\u5E95\u5220\u9664\uFF08\u4E0D\u53EF\u6062\u590D\uFF09" style="color:var(--primary)"><i class="ti ti-trash"></i> \u5F7B\u5E95\u5220\u9664</button>' : "");
    return `<td class="archive-date num">${esc(date || "\u2014")}</td><td class="archive-source ctr">${fromBadge}</td><td class="archive-content"><span class="archive-text" title="${content}">${content}</span></td><td class="archive-dept ctr">${esc(dept)}</td><td class="archive-actions ctr">${ops}</td>`;
  }
  function archInqRowHtml(it) {
    const date = (it.archived_at || "").slice(0, 10);
    const isBoss = (window.ME || {}).role === "boss";
    const ops = '<button class="btn-mini arch-restore" title="\u6062\u590D\u5230\u8BE2\u76D8\u5217\u8868"><i class="ti ti-rotate"></i> \u6062\u590D</button>' + (isBoss ? ' <button class="btn-mini arch-hard" title="\u5F7B\u5E95\u5220\u9664\uFF08\u4E0D\u53EF\u6062\u590D\uFF09" style="color:var(--primary)"><i class="ti ti-trash"></i> \u5F7B\u5E95\u5220\u9664</button>' : "");
    const cust = (it.customer_name ? esc(it.customer_name) + " \xB7 " : "") + esc(it.country || "");
    const source = esc(it.source || "");
    return `<td class="archive-date num">${esc(date || "\u2014")}</td><td class="archive-short-date num">${esc((it.date || "").slice(5))}</td><td class="archive-customer"><span class="archive-text" title="${cust}">${cust}</span></td><td class="archive-source-term dim"><span class="archive-text" title="${source}">${source}</span></td><td class="archive-grade ctr"><span class="badge ${GRADE_BADGE[it.grade] || "b-gray"}">${esc(it.grade || "")}</span></td><td class="archive-channel ctr dim">${esc(it.channel || "")}</td><td class="archive-actions ctr">${ops}</td>`;
  }
  async function loadArchive() {
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

  // public/src/timerange.js
  var timerange_exports = {};
  __export(timerange_exports, {
    applyTimeRange: () => applyTimeRange,
    formatLocalDate: () => formatLocalDate,
    getCurrentRange: () => getCurrentRange,
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
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const back = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d;
    };
    const r = (s, e) => ({ start_date: formatLocalDate(s), end_date: formatLocalDate(e), period_label: label });
    switch (label) {
      case "\u4ECA\u5929":
        return r(today, today);
      case "\u6628\u5929": {
        const y = back(1);
        return r(y, y);
      }
      case "\u8FD17\u5929":
        return r(back(6), today);
      case "\u8FD130\u5929":
        return r(back(29), today);
      case "\u8FD190\u5929":
        return r(back(89), today);
      case "\u8FD1\u4E00\u5E74":
        return r(back(364), today);
      case "\u4E0A\u5468": {
        const day = (today.getDay() + 6) % 7;
        const thisMon = back(day);
        const lastMon = new Date(thisMon);
        lastMon.setDate(thisMon.getDate() - 7);
        const lastSun = new Date(lastMon);
        lastSun.setDate(lastMon.getDate() + 6);
        return r(lastMon, lastSun);
      }
      case "\u4E0A\u534A\u6708": {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        const mid = new Date(today.getFullYear(), today.getMonth(), 15);
        return r(first, mid);
      }
      case "\u8FD11\u6708":
        return r(back(29), today);
      case "\u8FD13\u6708":
        return r(back(89), today);
      case "\u8FD1\u534A\u5E74":
        return r(back(179), today);
      case "\u8FD11\u5E74":
        return r(back(364), today);
      case "\u81EA\u5B9A\u4E49": {
        const cr = window._customRange;
        if (!cr) return null;
        return { start_date: cr.start_date, end_date: cr.end_date, period_label: "\u81EA\u5B9A\u4E49 " + cr.start_date + "~" + cr.end_date };
      }
      default:
        return r(back(29), today);
    }
  }
  var _range = resolveRange(window._timeRange);
  function getCurrentRange() {
    return _range;
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
  function refreshRangeConsumers() {
    document.dispatchEvent(new CustomEvent("timerange", { detail: { range: _range } }));
    loadInquiries();
    loadSeoChartRange();
    if (typeof loadSeoBoardFull === "function") loadSeoBoardFull();
    if (typeof loadSemBoardAds === "function") loadSemBoardAds();
    if (typeof loadSemBoardFull === "function") loadSemBoardFull();
    if (typeof loadAttribution === "function") loadAttribution();
    if (typeof loadDiagnostics === "function") loadDiagnostics();
    if (typeof loadGa4 === "function") loadGa4();
    if (typeof loadDataFreshness === "function") loadDataFreshness();
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
    document.querySelectorAll("[data-time] .trange").forEach((x) => x.classList.toggle("active", x.textContent.trim() === label));
    document.querySelectorAll("[data-tauto]").forEach((el) => el.innerHTML = '<i class="ti ti-calendar"></i> ' + rangeText(_range));
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
      rebuildSeoChart();
      toast("\u7C92\u5EA6\uFF1A" + (GRAN_LABEL[window._gran] || window._gran));
    });
  });
  function openCustomRange() {
    const cr = window._customRange || {};
    const today = formatLocalDate(/* @__PURE__ */ new Date());
    const back = (n) => {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - n);
      return formatLocalDate(d);
    };
    document.getElementById("cr-start").value = cr.start_date || back(29);
    document.getElementById("cr-end").value = cr.end_date || today;
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
    document.querySelectorAll("[data-time] .trange").forEach((x) => x.classList.toggle("active", x.textContent.trim() === "\u81EA\u5B9A\u4E49"));
    document.querySelectorAll("[data-tauto]").forEach((el) => el.innerHTML = '<i class="ti ti-calendar"></i> ' + rangeText(_range));
    refreshRangeConsumers();
    closeModal("customRangeMask");
    toast("\u5DF2\u5E94\u7528\uFF1A" + _range.period_label);
  }

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
  var DEPT_BADGE = { SEM: "b-purple", SEO: "b-blue", "\u516C\u53F8": "b-red" };
  var FREQ_LABEL = { daily: "\u6BCF\u65E5\u5FC5\u505A", weekly: "\u6BCF\u5468\u5FC5\u505A", monthly: "\u6BCF\u6708\u5FC5\u505A" };
  var FREQ_ICON = { daily: "ti-repeat", weekly: "ti-calendar-week", monthly: "ti-calendar-month" };
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
        anchor.insertAdjacentHTML("beforeend", '<div class="sop-empty-hint" style="font-size:11px;color:var(--text3);padding:8px 0">\u6682\u65E0 SOP\uFF0C\u53BB\u300C\u8BBE\u7F6E \xB7 SOP \u8BBE\u7F6E\u300D\u6DFB\u52A0</div>');
        return;
      }
      ["daily", "weekly", "monthly"].forEach((freq) => {
        const subset = list.filter((s) => s.freq === freq);
        if (!subset.length) return;
        anchor.insertAdjacentHTML("beforeend", `<div class="freq-cap"><i class="ti ${FREQ_ICON[freq]}"></i> ${FREQ_LABEL[freq]}</div>`);
        subset.forEach((s) => anchor.appendChild(sopCardEl(s)));
      });
    });
  }
  function sopCardEl(s) {
    const done = window._sopDone[s.freq] && window._sopDone[s.freq].has(s.id);
    const card = document.createElement("div");
    card.className = "tcard must" + (done ? " done" : "");
    card.dataset.sopId = s.id;
    card.dataset.sopFreq = s.freq;
    const badge3 = DEPT_BADGE[s.dept] || "b-gray";
    const due = s.time_hint ? `<span class="tdue"><i class="ti ti-clock"></i> ${esc(s.time_hint)}</span>` : done ? '<span class="tdue">\u5DF2\u5B8C\u6210</span>' : "";
    card.innerHTML = `<div class="ttitle"><span class="tcheck${done ? " on" : ""}" onclick="chk(this)">${done ? '<i class="ti ti-check"></i>' : ""}</span>${esc(s.title)}</div><div class="tmeta"><span class="badge ${badge3}">${esc(s.dept)}</span>${due}</div>`;
    return card;
  }
  function updateSopCounts() {
    [["SEM", "sem", "\u65B0\u589E"], ["SEO", "seo", "\u65B0\u589E"], ["\u516C\u53F8", "company", "\u6D3E\u53D1"]].forEach(([dept, key, verb]) => {
      const el = document.getElementById("kcount-" + key);
      if (!el) return;
      const sopN = window._sops.filter((s) => s.dept === dept).length;
      const addCol = document.getElementById("newtask-" + key);
      const addN = addCol ? addCol.querySelectorAll(".tcard").length : 0;
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
      const ops = writable ? `<button class="btn-mini sop-edit"><i class="ti ti-edit"></i></button> <button class="btn-mini sop-del" style="color:var(--primary)"><i class="ti ti-trash"></i></button>` : '<span class="dim" style="font-size:11px">\u53EA\u8BFB</span>';
      tr.innerHTML = `<td>${esc(s.dept)}</td><td>${esc(FREQ_LABEL[s.freq] || s.freq)}</td><td>${esc(s.title)}</td><td class="dim" style="font-size:11px">${esc(s.content || "")}</td><td>${esc(s.time_hint || "")}</td><td class="ctr">${ops}</td>`;
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
    const today = formatLocalDate(/* @__PURE__ */ new Date()).replace(/-/g, ".").replace(/^\d{4}\./, "");
    const lines = [];
    ["daily", "weekly", "monthly"].forEach((freq) => {
      if (!isOverduePeriodFirstDay(freq)) return;
      (window._sops || []).forEach((s) => {
        if (s.freq !== freq) return;
        const done = window._sopDone[freq] && window._sopDone[freq].has(s.id);
        if (done) return;
        lines.push(esc(s.dept) + "-" + today + "-" + esc(FREQ_LABEL[freq] || freq) + "\uFF1A" + esc(s.title) + " \u4EFB\u52A1\u672A\u505A\uFF0C\u8BF7\u53CA\u65F6\u5904\u7406\u3002");
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
    dot.style.display = overdue || urgent ? "" : "none";
  }

  // public/src/keywords.js
  var keywords_exports = {};
  __export(keywords_exports, {
    activeCat: () => activeCat,
    addKeyword: () => addKeyword,
    applyKwPaging: () => applyKwPaging,
    clsOf: () => clsOf,
    filterKwByCat: () => filterKwByCat,
    inlineConfirm: () => inlineConfirm2,
    kwDelete: () => kwDelete,
    kwRow: () => kwRow,
    loadKeywords: () => loadKeywords,
    renderCatTabs: () => renderCatTabs,
    renderKwPager: () => renderKwPager
  });
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
    const del = '<button class="btn-mini kw-del" title="\u5220\u9664" style="color:var(--primary);border-color:var(--border2)"><i class="ti ti-trash"></i></button>';
    const ev = (v) => v == null ? "" : v;
    const ed = (attr, val) => `<td class="editable" contenteditable data-attr="${attr}">${esc(ev(val))}</td>`;
    const ct = `<td class="dim" style="font-size:11px;white-space:nowrap">${esc((r.created_at || "").slice(0, 10))}</td>`;
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
  function inlineConfirm2(btn, label) {
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
      aiAsk("\u5206\u6790\u5173\u952E\u8BCD\u300C" + kw + "\u300D\u7684\u641C\u7D22\u610F\u56FE\u4E0E\u843D\u5730\u5EFA\u8BAE", "\u300C" + kw + "\u300D\u610F\u56FE");
      return;
    }
    const del = e.target.closest(".kw-del");
    if (del) {
      kwDelete(del.closest("tr"), del);
      return;
    }
  });
  document.addEventListener("focusin", (e) => {
    const cell = e.target.closest && e.target.closest(".kw-name");
    if (cell) cell.dataset.kwOld = cell.textContent;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cell = e.target.closest && e.target.closest(".kw-name");
      if (cell) {
        e.preventDefault();
        cell.blur();
      }
    }
  });
  document.addEventListener("focusout", async (e) => {
    const cell = e.target.closest && e.target.closest(".kw-name");
    if (!cell) return;
    const tr = cell.closest("tr");
    if (!tr || !tr.dataset.id) return;
    const oldVal = cell.dataset.kwOld != null ? cell.dataset.kwOld : cell.textContent;
    const vr = validateEditableValue(cell.textContent, "text", { nonempty: true, emptyMsg: "\u5173\u952E\u8BCD\u4E0D\u80FD\u4E3A\u7A7A" });
    if (!vr.ok) {
      rollbackEditable(cell, oldVal);
      showSaveError(cell, vr.msg);
      return;
    }
    const v = vr.value;
    if (v === String(oldVal).trim()) {
      cell.textContent = v;
      setSavingState(cell, null);
      return;
    }
    setSavingState(cell, "saving");
    try {
      await API.patch("/api/keywords/" + tr.dataset.id, { keyword: v });
      cell.textContent = v;
      cell.dataset.kwOld = v;
      setSavingState(cell, "ok");
      toast("\u5DF2\u66F4\u65B0\u5173\u952E\u8BCD \xB7 \u5DF2\u5165\u5E93");
    } catch (err) {
      rollbackEditable(cell, oldVal);
      showSaveError(cell, err.status === 403 ? "\u65E0\u6743\u9650\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u503C");
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
  function setText(el, value) {
    if (el) el.textContent = text(value);
  }
  function toastSafe(message) {
    if (window.toast) window.toast(message);
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
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text(value);
    return cell;
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
    main.append(title, content, source);
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
    setText(count, "\u52A0\u8F7D\u4E2D...");
    try {
      const data = await window.API.get("/api/hermes/memories");
      const items = data.items || [];
      items.forEach((item) => tbody.appendChild(renderMemory(item)));
      if (empty) empty.style.display = items.length ? "none" : "block";
      setText(count, items.length ? items.length + " \u6761\u6709\u6548\u8BB0\u5FC6" : "\u6682\u65E0\u6709\u6548\u8BB0\u5FC6");
      if (manual) toastSafe("AI \u8BB0\u5FC6\u5DF2\u5237\u65B0");
    } catch (e) {
      setText(count, "\u52A0\u8F7D\u5931\u8D25");
      if (empty) empty.style.display = "block";
      toastSafe("AI \u8BB0\u5FC6\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
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
    setText(byId("hm-submit-label"), "\u5B58\u5165 AI \u8BB0\u5FC6");
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
    setText(byId("hm-submit-label"), "\u66F4\u65B0 AI \u8BB0\u5FC6");
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
      toastSafe("\u6807\u9898\u548C\u8BB0\u5FC6\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    try {
      const id = field("hm-id");
      if (id) await window.API.patch("/api/hermes/memories/" + encodeURIComponent(id), body);
      else await window.API.post("/api/hermes/memories", body);
      resetHermesMemoryForm();
      await loadHermesMemories(false);
      toastSafe(id ? "AI \u8BB0\u5FC6\u5DF2\u66F4\u65B0" : "\u5DF2\u5B58\u5165 AI \u8BB0\u5FC6");
    } catch (e) {
      toastSafe(e.status === 403 ? "\u65E0\u6743\u4FEE\u6539 AI \u8BB0\u5FC6" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }
  async function deactivateHermesMemory(id) {
    if (!id || !window.API) return;
    if (!confirm("\u786E\u5B9A\u505C\u7528\u8FD9\u6761 AI \u8BB0\u5FC6\u5417\uFF1F\u505C\u7528\u540E Hermes \u4E0D\u4F1A\u518D\u53C2\u8003\u5B83\u3002")) return;
    try {
      await window.API.del("/api/hermes/memories/" + encodeURIComponent(id));
      await loadHermesMemories(false);
      toastSafe("\u5DF2\u505C\u7528\u8FD9\u6761 AI \u8BB0\u5FC6");
    } catch (e) {
      toastSafe(e.status === 403 ? "\u65E0\u6743\u505C\u7528 AI \u8BB0\u5FC6" : "\u505C\u7528\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
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
      toastSafe("\u539F\u5EFA\u8BAE\u548C\u4F60\u7684\u5224\u65AD\u4E0D\u80FD\u4E3A\u7A7A");
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
      toastSafe("\u53CD\u9988\u5DF2\u6C89\u6DC0\uFF0CHermes \u540E\u7EED\u4F1A\u53C2\u8003");
    } catch (e) {
      toastSafe(e.status === 403 ? "\u65E0\u6743\u6C89\u6DC0\u53CD\u9988" : "\u53CD\u9988\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || "unknown_error"));
    }
  }

  // public/src/inquiry-globe.js
  var inquiry_globe_exports = {};
  __export(inquiry_globe_exports, {
    renderGlobe: () => renderGlobe
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
      <b>${inqMapEsc(r.customer_name || r.country || "\u672A\u586B\u5BA2\u6237")}</b>
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
  async function renderGlobe() {
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

  // public/src/main.js
  Object.assign(window, neg_ads_exports, ga4_view_exports, market_brain_exports, kpi_view_exports, tagselect_exports, google_projects_exports, archive_exports, timerange_exports, sop_exports, keywords_exports, hermes_memory_exports, inquiry_globe_exports);
})();
