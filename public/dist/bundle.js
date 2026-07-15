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
        toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25");
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
    const field = fieldMap[kind];
    if (!field) return;
    try {
      await API.patch(ep + "/" + id, { [field]: value });
      if (ep === "/api/inquiries" && field === "grade") {
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
      toast(err.status === 403 ? "\u65E0\u6743\u4FEE\u6539" : "\u4FDD\u5B58\u5931\u8D25");
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
    const [text, cls] = dsStatusMeta(s.status, s.type);
    const time = s.type === "manual" ? s.lastAt || "\u2014" : s.type === "sync" ? s.lastSyncAt || "\u2014" : "\u2014";
    const count = s.type === "manual" || s.type === "sync" ? s.count == null ? 0 : s.count : "\u2014";
    let extra = "";
    if (s.error) extra = `<span style="color:var(--primary)"> \xB7 \u9519\u8BEF\uFF1A${esc(s.error)}</span>`;
    else if (s.type === "sync" && s.missing && s.missing.length) extra = `<span class="dim"> \xB7 \u7F3A\u5C11 ${esc(s.missing.join(", "))}</span>`;
    else if (s.note === "google_oauth_required") extra = `<span class="dim"> \xB7 \u9700\u8981 OAuth \u6388\u6743</span>`;
    else if (s.note === "google_sync_ready") extra = `<span class="dim"> \xB7 \u53EF\u624B\u52A8\u540C\u6B65</span>`;
    else if (s.type === "provider" && s.status === "configured_unverified") extra = `<span class="dim"> \xB7 ${esc(s.provider || "")}${s.model ? " / " + esc(s.model) : ""}</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)"><div style="width:96px;font-weight:600">${esc(name)}</div><div style="width:74px;color:var(--text3);font-size:11px">${esc(typeText)}</div><span class="badge ${cls}">${esc(text)}</span><div style="flex:1"></div><div style="color:var(--text3);font-size:11px;white-space:nowrap">\u65F6\u95F4 ${esc(String(time))} \xB7 \u8BB0\u5F55 ${esc(String(count))}</div><div style="font-size:11px">${extra}</div></div>`;
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
    const badge2 = ok ? '<span class="badge b-green">\u5DF2\u6388\u6743</span>' : configured ? '<span class="badge b-amber">\u5F85\u6388\u6743</span>' : '<span class="badge b-gray">\u540E\u7AEF\u672A\u914D\u7F6E</span>';
    const missing = s.missing && s.missing.length ? `<div class="dim" style="font-size:11px;margin-top:4px">\u7F3A\u5C11\uFF1A${esc(s.missing.join(", "))}</div>` : "";
    const lastSync = s.lastSyncAt || "\u2014";
    const lastStatus = s.lastSyncStatus || "\u672A\u540C\u6B65";
    const lastError = s.lastError ? `<div style="color:var(--primary);font-size:11px;margin-top:4px">\u6700\u8FD1\u9519\u8BEF\uFF1A${esc(s.lastError)}</div>` : "";
    const providerConfigNote = provider === "gsc" ? s.siteUrlConfigured || project?.gsc_site_url ? "\u7AD9\u70B9\u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GSC_SITE_URL \u6216\u9879\u76EE\u7AD9\u70B9" : provider === "ga4" ? s.propertyConfigured || project?.ga4_property_id ? "Property \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GA4_PROPERTY_ID \u6216\u9879\u76EE Property" : s.customerConfigured || project?.ads_customer_id ? "Customer \u5DF2\u914D\u7F6E" : "\u8FD8\u9700\u8981 GOOGLE_ADS_CUSTOMER_ID \u6216\u9879\u76EE Customer";
    const authDisabled = configured ? "" : "disabled";
    const syncDisabled = ok ? "" : "disabled";
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
    <div style="width:230px;font-weight:700">${esc(INTEG_LABEL[provider] || provider)} ${badge2}</div>
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
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u5F52\u6863\u5931\u8D25");
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
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u6C89\u6DC0\u5931\u8D25");
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
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u6062\u590D\u5931\u8D25");
      }
    } else {
      if (!inlineConfirm(h, "\u786E\u8BA4\u5F7B\u5E95\u5220\u9664")) return;
      try {
        await API.del(ep + "/" + id + "?hard=1");
        tr.remove();
        toast("\u5DF2\u5F7B\u5E95\u5220\u9664");
      } catch (err) {
        toast(err.status === 403 ? "\u65E0\u6743\u64CD\u4F5C" : "\u5220\u9664\u5931\u8D25");
      }
    }
  });

  // public/src/main.js
  Object.assign(window, neg_ads_exports, ga4_view_exports, market_brain_exports, kpi_view_exports, tagselect_exports, google_projects_exports, archive_exports);
})();
