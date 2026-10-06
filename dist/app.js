/* Mr Mushakk UI. Stored timetable + user input + rules. No live tracking, no AI. */
const Mushakk = (function () {
  "use strict";
  const E = Engine;
  const D = { trains: [], buses: [], metro: [], fares: [], ganpati: [], devi: [], meta: { ganpati_target: 150, devi_target: 50 } };
  const S = { skips: {}, plan: {}, sel: { ganpati: null, devi: null }, finder: {}, filters: {}, loadError: "", editing: null };
  const VIEWS = ["home", "plan", "local", "bus", "metro", "ganpati", "devi", "saved", "college", "notifications", "profile", "settings"];
  const MODES = ["Any", "Local Train", "BEST Bus", "Metro", "Walking"];
  const NOTE_STORED = "This is not live data; services may be delayed, changed or cancelled.";

  /* ---------- tiny helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id) ? $(id).value.trim() : "");
  const settings = () => Store.get("settings");
  const demo = () => settings().demo === true;
  const pace = () => Number(settings().pace) || E.DEFAULT_PACE_M_PER_MIN;
  const nowHHMM = () => { const n = new Date(); return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"); };
  const uuid = () => "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const data = () => ({ trains: D.trains, buses: D.buses, metro: D.metro, fares: D.fares });
  const unavail = (t) => `<span class="warning">${esc(t || "Data unavailable")}</span>`;

  /* ---------- data loading ---------- */
  async function loadJson(name) {
    const r = await fetch("data/" + name + ".json");
    if (!r.ok) throw new Error(name + ".json (" + r.status + ")");
    return r.json();
  }
  async function loadAll() {
    const files = { trains: "local-trains", buses: "buses", metro: "metro", fares: "fares", ganpati: "ganpati", devi: "devi", meta: "meta" };
    const failed = [];
    await Promise.all(Object.entries(files).map(async ([k, f]) => {
      try { D[k] = await loadJson(f); } catch (e) { failed.push(f); }
    }));
    ["trains", "buses", "metro", "fares", "ganpati", "devi"].forEach((k) => { if (!Array.isArray(D[k])) D[k] = []; });
    S.loadError = failed.length ? "Could not load: " + failed.join(", ") + ". Some sections will be empty. (If you opened index.html directly from disk, serve the folder over http, e.g. with npm start.)" : "";
  }

  /* ---------- context for the engine ---------- */
  function savedPlaces() { return Store.get("saved_locations"); }
  function placeByLabel(label) { return savedPlaces().find((p) => p.label === label); }
  function stationSet() {
    const set = new Set();
    const add = (s) => E.stationsFromText(s).forEach((x) => set.add(x.key));
    for (const list of [D.trains, D.buses, D.metro]) for (const r of E.usable(list, demo())) {
      add(r.from); add(r.to); (r.stops || []).forEach((s) => add(s.station));
    }
    [...D.ganpati, ...D.devi].forEach((m) => add(m.nearest));
    savedPlaces().forEach((p) => add(p.station));
    return set;
  }
  const ctx = () => ({ saved: savedPlaces(), mandals: [...D.ganpati, ...D.devi], stations: stationSet(), pace: pace() });
  const resolve = (text) => E.resolveLocation(text, ctx());

  /* ---------- router ---------- */
  function current() { const h = (location.hash || "").replace(/^#\//, "").split("?")[0]; return VIEWS.includes(h) ? h : "home"; }
  function go(view) { if (current() === view) render(); else location.hash = "#/" + view; }
  function render() {
    const v = current();
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + v));
    const views = { home: vHome, plan: vPlan, local: () => vMode("Local Train"), bus: () => vMode("BEST Bus"), metro: () => vMode("Metro"),
      ganpati: () => vMandals("ganpati"), devi: () => vMandals("devi"), saved: vSaved, college: vCollege, notifications: vNotifications,
      profile: vProfile, settings: vSettings };
    let html;
    try { html = views[v](); }
    catch (e) { console.error(e); html = `<section class="section"><div class="banner err">Something went wrong showing this page (${esc(e.message)}). Try Settings → Reset my data, or reload.</div></section>`; }
    $("view").innerHTML = (S.loadError ? `<div class="section" style="padding-bottom:0"><div class="banner err">${esc(S.loadError)}</div></div>` : "") + html;
    window.scrollTo(0, 0);
    if (v === "plan" && S.plan.autorun) { S.plan.autorun = false; runPlan(true); }
  }

  /* ---------- shared UI bits ---------- */
  const banner = (t, cls) => `<div class="banner ${cls || ""}">${t}</div>`;
  const storedBanner = () => banner("<b>Based on stored timetable.</b> " + esc(NOTE_STORED));
  const demoBanner = () => demo() ? banner("<b>DEMO SAMPLE DATA IS ON.</b> The sample trains, buses and metro rows are placeholders, <u>not a real timetable</u>. Turn this off in Settings.", "warn") : "";
  const head = (n, t, pill) => `<div class="section-title"><div><span class="eyebrow">${n}</span><h2>${t}</h2></div>${pill ? `<span class="pill">${pill}</span>` : ""}</div>`;
  const counts = (list) => ({ verified: list.filter((r) => r.verified === true).length, sample: list.filter((r) => r.verified !== true).length });

  /* ---------- HOME ---------- */
  function vHome() {
    const t = counts(D.trains), b = counts(D.buses), m = counts(D.metro);
    const stat = (n, label, sub) => `<div class="stat"><b>${n}</b><small>${label}</small><br><small>${sub}</small></div>`;
    const home = placeByLabel("Home"), col = placeByLabel("College");
    const today = E.todayStr(), eff = E.effectiveCollege(Store.get("schedules"), today);
    return `<section class="hero"><div><p class="eyebrow">MUMBAI • LOCAL • METRO • BEST • WALK</p><h1>Plan the journey.<br><span>Not the confusion.</span></h1>
      <p>Schedule-based multi-modal journey planning from stored timetable data, your saved places and simple rules. Not live tracking.</p>
      <a class="btn" href="#/plan">Plan a Journey</a></div>
      <div class="hero-card"><div class="mouse">🐭</div><strong>Mr Mushakk</strong><small>No AI • No live tracking • Stored timetable only</small></div></section>
      <section class="section">${head("00 • STATUS", "What data is loaded", "Honest data status")}
      ${demoBanner()}
      <div class="grid4">
        ${stat(t.verified, "Verified local-train services", t.sample ? t.sample + " placeholder rows hidden" : "none hidden")}
        ${stat(b.verified, "Verified BEST bus routes", b.sample ? b.sample + " placeholder rows hidden" : "none hidden")}
        ${stat(m.verified, "Verified metro entries", m.sample ? m.sample + " placeholder rows hidden" : "none hidden")}
        ${stat(D.fares.filter((f) => f.verified === true).length, "Verified fares", "otherwise: Fare information unavailable")}
        ${stat(D.ganpati.length + " / " + D.meta.ganpati_target, "Ganpati mandals loaded", "remaining not yet verified")}
        ${stat(D.devi.length + " / " + D.meta.devi_target, "Devi mandals loaded", "remaining not yet verified")}
        ${stat(home ? "✓" : "—", "Home saved", home ? esc(home.name) : '<a href="#/saved">Set Home</a>')}
        ${stat(col ? "✓" : "—", "College saved", col ? esc(col.name) : '<a href="#/saved">Set College</a>')}
      </div>
      ${t.verified + b.verified + m.verified === 0 ? banner("No verified train, bus or metro timetable is stored yet, so journey results will say <b>Timetable not available</b>. Add verified data in <code>data/</code> (see data/README.md), or switch on demo sample data in Settings to try the flow with placeholder rows.", "warn") : ""}
      <div class="panel" style="margin-top:14px"><b>Today (${esc(today)})</b>
        <p class="note">${eff.status === "ok" ? "College ends at " + E.fmt(eff.end) + (eff.note ? " • " + esc(eff.note) : "") + "." : esc(eff.note || "No college schedule set.")}
        <a href="#/college">College Schedule</a> • <a href="#/notifications">Reminders</a></p></div></section>`;
  }

  /* ---------- PLAN JOURNEY ---------- */
  function placeOptions() {
    const names = new Set(["Home", "College", "Work"]);
    savedPlaces().forEach((p) => names.add(p.name));
    D.ganpati.forEach((m) => names.add(m.name)); D.devi.forEach((m) => names.add(m.name));
    stationSet().forEach((s) => names.add(s.replace(/\b\w/g, (c) => c.toUpperCase())));
    return [...names].map((n) => `<option value="${esc(n)}">`).join("");
  }
  function vPlan() {
    const p = S.plan, home = placeByLabel("Home"), prefMode = Store.get("profile").transport;
    return `<section class="section">${head("01 • JOURNEY", "Plan your journey", "Stored-timetable mode")}
      ${demoBanner()}${storedBanner()}
      ${!home ? banner('Tip: save your <a href="#/saved">Home and College</a> so you can plan with one tap.') : ""}
      <datalist id="places">${placeOptions()}</datalist>
      <div class="panel grid2">
        <label>From<input id="from" list="places" autocomplete="off" placeholder="Home / College / station / mandal" value="${esc(p.from ?? (home ? "Home" : ""))}"></label>
        <label>To<input id="to" list="places" autocomplete="off" placeholder="Home / College / station / mandal" value="${esc(p.to ?? "")}"></label>
        <label>Date<input id="date" type="date" value="${esc(p.date || E.todayStr())}"></label>
        <label>Departure time <button class="btn small secondary" type="button" data-act="now">Use current time</button><input id="time" type="time" value="${esc(p.time || nowHHMM())}"></label>
        <label>Transport<select id="mode">${MODES.map((m) => `<option ${(p.mode || prefMode) === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label>Direct walking distance in metres (optional)<input id="walkm" type="number" min="0" max="20000" inputmode="numeric" placeholder="only for a walking-only estimate" value="${esc(p.walkm ?? "")}"></label>
        <button class="btn full" type="button" data-act="plan">Calculate Journey</button>
      </div><div id="result" class="result"></div></section>`;
  }
  function runPlan(resetSkips) {
    if (resetSkips) S.skips = {};
    S.plan = { from: val("from"), to: val("to"), date: val("date"), time: val("time"), mode: val("mode"), walkm: val("walkm") };
    const out = $("result"); if (!out) return;
    const p = S.plan;
    const err = (m) => { out.innerHTML = banner(esc(m), "err"); };
    if (!p.from || !p.to) return err("Enter both From and To.");
    if (E.dayIndex(p.date) == null) return err("Choose a valid date.");
    if (E.toMin(p.time) == null) return err("Choose a valid departure time.");
    const o = resolve(p.from), d = resolve(p.to);
    if (!o.ok) return err("From: " + o.error + " Save it in Saved Places or pick a suggestion.");
    if (!d.ok) return err("To: " + d.error + " Save it in Saved Places or pick a suggestion.");
    if (o.place.label.toLowerCase() === d.place.label.toLowerCase()) return err("From and To are the same place.");
    const res = E.planJourney({ origin: o.place, dest: d.place, departMin: E.toMin(p.time), dayIdx: E.dayIndex(p.date), mode: p.mode, directWalkM: p.walkm, skips: S.skips, demo: demo(), pace: pace() }, data());
    out.innerHTML = renderPlanResult(res, o.place, d.place);
  }
  function chain(opt, o, d) {
    const w = (m, who) => m == null ? `<i>→</i><span>🚶 walk (distance to ${esc(who)} not stored)</span>` : `<i>→</i><span>🚶 ${m} min walk (estimated)</span>`;
    if (opt.mode === "Walking") return `<span>${esc(o.label)}</span><i>→</i><span>🚶 ${opt.walkTo} min walk (estimated)</span><i>→</i><span>${esc(d.label)}</span>`;
    return `<span>${esc(o.label)}</span>${w(opt.walkTo, opt.boarding)}<span>${esc(opt.boarding)}</span><i>→</i><span>${opt.icon} ${esc(opt.mode)} ${E.fmt(opt.depMin)}</span><i>→</i><span>${esc(opt.alighting)}</span>${w(opt.walkFrom, d.label)}<span>${esc(d.label)}</span>`;
  }
  function renderPlanResult(res, o, d) {
    const msgs = res.messages.map((m) => banner(esc(m), "warn")).join("");
    const notes = [o, d].filter((x) => x.note).map((x) => `<li>${esc(x.label)}: ${esc(x.note)}</li>`).join("");
    if (!res.options.length) return `<div class="panel"><b>No route found</b>${msgs ? "<div style='margin-top:10px'>" + msgs + "</div>" : ""}${notes ? "<ul class='note'>" + notes + "</ul>" : ""}
      <p class="note">Mr Mushakk only searches stored data; it never guesses. Try another mode or add verified timetable data.</p></div>`;
    const cards = res.options.map((opt) => {
      const basis = opt.basis === "interval" ? "scheduled interval from stored first/last/frequency, not an exact departure time" : "based on stored timetable";
      const miss = opt.mode === "Walking" ? "" : `<div class="row" style="margin-top:12px"><button class="btn small secondary" data-act="missed" data-key="${esc(opt.key)}">I missed it, show next service</button>
        ${opt.missed ? `<span class="note">${opt.missed} earlier service${opt.missed > 1 ? "s" : ""} skipped</span> <button class="btn small secondary" data-act="resetmiss" data-key="${esc(opt.key)}">Undo</button>` : ""}</div>`;
      const walkTxt = opt.mode === "Walking" ? opt.walkTo + " min" : `to station ${opt.walkTo == null ? unavail("distance not stored") : opt.walkTo + " min"} • from station ${opt.walkFrom == null ? unavail("distance not stored") : opt.walkFrom + " min"}`;
      return `<div class="panel" style="margin-top:12px"><div>${opt.mode === "Walking" ? '<span class="badge ok">Rule-based estimate</span>' : opt.verified ? '<span class="badge ok">Stored timetable</span>' : '<span class="badge sample">Sample data, not real</span>'}
        <span class="badge">Not live</span><b>${opt.icon} ${esc(opt.mode)}${opt.mode !== "Walking" && opt.service ? " • " + esc(opt.service) : ""}</b></div>
        <div class="chain">${chain(opt, o, d)}</div>
        <dl class="kv">
          ${opt.mode === "Walking" ? "" : `<dt>Boarding</dt><dd>${esc(opt.boarding)}</dd><dt>Destination station</dt><dd>${esc(opt.alighting)}</dd>
          <dt>Next scheduled service</dt><dd><b>${E.fmt(opt.depMin)}</b> <span class="note">(${basis})</span></dd>
          <dt>Wait at station</dt><dd>${opt.waitMin} min after estimated walking</dd>
          <dt>Arrival at ${esc(opt.alighting)}</dt><dd>${opt.arrMin != null ? E.fmt(opt.arrMin) : unavail("Arrival time not stored")}</dd>`}
          <dt>Estimated walking time</dt><dd>${walkTxt}</dd>
          <dt>Estimated arrival</dt><dd>${opt.finalArrMin != null ? "<b>" + E.fmt(opt.finalArrMin) + "</b>" : unavail("Cannot be calculated")}</dd>
          <dt>Estimated total journey</dt><dd>${opt.totalMin != null ? opt.totalMin + " min (estimate)" : unavail("Cannot be calculated: arrival time not stored")}</dd>
          <dt>Transfers</dt><dd>${opt.transfers} <span class="note">(multi-leg transfers need interchange data, which is not stored)</span></dd>
          <dt>Fare</dt><dd>${opt.mode === "Walking" ? "None" : opt.fare != null ? esc(opt.fareText) : unavail(opt.fareText)}</dd>
        </dl>${miss}</div>`;
    }).join("");
    return `${msgs}<div class="panel"><b>Suggested scheduled options</b> <span class="note">sorted by earliest estimated arrival</span></div>${cards}
      ${notes ? "<ul class='note'>" + notes + "</ul>" : ""}<p class="note">${esc(NOTE_STORED)}</p>`;
  }

  /* ---------- LOCAL / BUS / METRO ---------- */
  const MODE_META = {
    "Local Train": { key: "trains", icon: "🚆", lines: ["Central", "Western", "Harbour"], unavailable: "Timetable not available" },
    "BEST Bus": { key: "buses", icon: "🚌", lines: [], unavailable: "Timetable unavailable for this route" },
    Metro: { key: "metro", icon: "🚇", lines: [], unavailable: "Timetable not available" },
  };
  function summarize(list) {
    const g = new Map();
    for (const r of list) {
      const name = r.route || r.line || r.service || r.id, k = [name, r.from, r.to, r.days].join("|");
      if (!g.has(k)) g.set(k, { name, from: r.from, to: r.to, days: r.days || "—", times: [], verified: r.verified === true, freq: null });
      const e = g.get(k); if (r.departure) e.times.push(r.departure);
      if (r.first && r.last) e.freq = `${r.first}–${r.last}, every ${r.frequency_min} min`;
    }
    return [...g.values()].map((e) => { const t = e.times.slice().sort();
      return { ...e, times: e.freq || (t.length ? t.length + " departures, " + t[0] + " to " + t[t.length - 1] : "Timetable unavailable") }; });
  }
  function vMode(mode) {
    const M = MODE_META[mode], use = E.usable(D[M.key], demo()), f = S.finder[mode] || {};
    const lineRows = M.lines.length ? `<div class="table-wrap"><table><thead><tr><th>Line</th><th>Stored services</th><th>Status</th></tr></thead><tbody>${M.lines.map((l) => {
      const n = use.filter((r) => (r.line || "").toLowerCase() === l.toLowerCase()).length;
      return `<tr><td>${l}</td><td>${n}</td><td>${n ? "Stored timetable" : unavail("Timetable not available")}</td></tr>`; }).join("")}</tbody></table></div>` : "";
    const routes = use.length ? `<div class="table-wrap"><table><thead><tr><th>${mode === "BEST Bus" ? "Route" : "Line / service"}</th><th>From</th><th>To</th><th>Times</th><th>Days</th><th>Data</th></tr></thead><tbody>${
      summarize(use).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.times)}</td><td>${esc(r.days)}</td><td>${r.verified ? '<span class="badge ok">Stored</span>' : '<span class="badge sample">Sample</span>'}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">${esc(M.unavailable)}.<br><small>No verified ${esc(mode)} data is stored. Nothing is guessed or shown as fake.</small></div>`;
    return `<section class="section">${head(mode === "Local Train" ? "03 • LOCAL" : mode === "BEST Bus" ? "04 • BEST" : "05 • METRO", M.icon + " " + mode, "Scheduled / stored, not live")}
      ${demoBanner()}${storedBanner()}
      <datalist id="places">${placeOptions()}</datalist>
      <div class="panel grid2"><label>From station / stop<input id="f_from" list="places" value="${esc(f.from || "")}"></label><label>To station / stop<input id="f_to" list="places" value="${esc(f.to || "")}"></label>
      <label>Date<input id="f_date" type="date" value="${esc(f.date || E.todayStr())}"></label><label>After time <button class="btn small secondary" type="button" data-act="fnow">Use current time</button><input id="f_time" type="time" value="${esc(f.time || nowHHMM())}"></label>
      <button class="btn full" data-act="find" data-mode="${esc(mode)}">Find next scheduled service</button></div>
      <div id="finderOut" class="result">${f.html || ""}</div>
      <div class="panel" style="margin-top:18px"><b>Stored ${esc(mode)} data</b>${lineRows}${routes}</div></section>`;
  }
  function runFinder(mode) {
    const prev = S.finder[mode] || {};
    const f = S.finder[mode] = { from: val("f_from"), to: val("f_to"), date: val("f_date"), time: val("f_time"), skip: prev.skip || 0 };
    const out = $("finderOut"), M = MODE_META[mode];
    const err = (m, c) => { out.innerHTML = banner(esc(m), c || "err"); f.html = out.innerHTML; };
    if (!f.from || !f.to) return err("Enter both From and To.");
    if (E.dayIndex(f.date) == null) return err("Choose a valid date.");
    if (E.toMin(f.time) == null) return err("Choose a valid time.");
    const a = resolve(f.from), b = resolve(f.to);
    if (!a.ok) return err("From: " + a.error);
    if (!b.ok) return err("To: " + b.error);
    const use = E.usable(D[M.key], demo());
    if (!use.length) return err(M.unavailable + ". No verified " + mode + " data is stored.", "warn");
    const cands = [];
    for (const so of a.place.stations) for (const sd of b.place.stations) if (so.key !== sd.key) cands.push(...E.legCandidates(use, so.key, sd.key, E.dayIndex(f.date)));
    cands.sort((x, y) => x.depMin - y.depMin);
    if (!cands.length) return err("No stored " + mode + " service found between " + f.from + " and " + f.to + ".", "warn");
    const up = cands.filter((c) => c.depMin >= E.toMin(f.time));
    if (!up.length) return err("No further scheduled " + mode + " service today after " + E.fmt(E.toMin(f.time)) + ".", "warn");
    f.skip = Math.min(f.skip, up.length - 1);
    const rows = up.slice(f.skip, f.skip + 5).map((c, i) => `<tr><td>${i === 0 ? "<b>Next scheduled service</b>" : "Later"}</td><td><b>${E.fmt(c.depMin)}</b></td><td>${c.arrMin != null ? E.fmt(c.arrMin) : unavail("not stored")}</td><td>${esc(c.rec.service || c.rec.route || c.rec.line || "")}</td><td>${c.basis === "interval" ? "Scheduled interval" : "Stored timetable"}${c.rec.verified === true ? "" : ' <span class="badge sample">Sample</span>'}</td></tr>`).join("");
    const last = f.skip >= up.length - 1;
    out.innerHTML = `<div class="panel"><div class="table-wrap"><table><thead><tr><th></th><th>Departs</th><th>Arrives</th><th>Service</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn small secondary" data-act="fmissed" data-mode="${esc(mode)}" ${last ? "disabled" : ""}>I missed it, show next service</button>${f.skip ? `<span class="note">${f.skip} skipped</span><button class="btn small secondary" data-act="fundo" data-mode="${esc(mode)}">Undo</button>` : ""}
      ${last ? '<span class="note">That is the last stored service for this date.</span>' : ""}</div>
      <p class="note">Based on stored timetable. ${esc(NOTE_STORED)}</p></div>`;
    f.html = out.innerHTML;
  }

  /* ---------- MANDALS ---------- */
  function filterMandals(type) {
    const f = S.filters[type] || { q: "", area: "", station: "" }, q = (f.q || "").toLowerCase();
    return D[type].filter((m) =>
      (!q || (m.name + " " + m.area + " " + m.location).toLowerCase().includes(q)) &&
      (!f.area || m.area === f.area) &&
      (!f.station || E.stationsFromText(m.nearest).some((s) => s.label === f.station)));
  }
  function mandalCards(type, shown) {
    if (!shown.length) return `<div class="empty" style="grid-column:1/-1">No mandal matches your search. Clear the filters or try a different word.</div>`;
    return shown.map((m) => `<article class="card ${m.id === S.sel[type] ? "sel" : ""}"><div class="verified">${esc(m.source || "Source not recorded")}</div><h3>${esc(m.name)}</h3>
      <div class="mandal-photo-wrap">${m.photo ? `<img class="mandal-photo" src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="mandal-photo placeholder">No photo added</div>`}</div>
      <p>📌 ${esc(m.area || "Area unavailable")}</p><p>📍 ${m.locationVerified === false ? '<span class="warning">Exact location not verified</span>' : esc(m.location || "Location unavailable")}</p>
      <p>🚉 ${m.nearest ? esc(m.nearest) : unavail("Nearest station not verified")}</p>
      ${m.possibleDuplicateOf ? `<p class="warning">Possible duplicate of ${esc((D[type].find((x) => x.id === m.possibleDuplicateOf) || {}).name || m.possibleDuplicateOf)}</p>` : ""}
      <div class="row" style="margin-top:8px">${mandalMapsButton(m)}<button class="btn small secondary" data-act="details" data-type="${type}" data-id="${esc(m.id)}">View details</button><button class="btn small" data-act="mandalplan" data-type="${type}" data-id="${esc(m.id)}">Plan Journey</button></div></article>`).join("");
  }
  function mandalMapsUrl(m) {
    if (m.mapsUrl) return m.mapsUrl;
    const q = [m.name, m.location || m.area, "Mumbai"].filter(Boolean).join(", ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }
  function mandalMapsButton(m) {
    const url = mandalMapsUrl(m);
    return `<a class="btn small secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">📍 Google Maps</a>`;
  }
  function mandalDetail(m, type) {
    return `<div class="panel detail">${m.photo ? `<img class="mandal-detail-photo" src="${esc(m.photo)}" alt="${esc(m.name)}" onerror="this.style.display='none'">` : ""}<b style="font-size:20px">${esc(m.name)}</b><dl class="kv">
      <dt>Area</dt><dd>${esc(m.area || "Data unavailable")}</dd>
      <dt>Address / location</dt><dd>${m.locationVerified === false ? unavail("Exact address not verified (only the city is recorded)") : esc(m.location)}</dd>
      <dt>Nearby railway station</dt><dd>${m.nearest ? esc(m.nearest) : unavail("Not verified")}</dd>
      <dt>Nearby Metro station</dt><dd>${unavail("Data unavailable")}</dd>
      <dt>Nearby BEST route / stop</dt><dd>${unavail("Data unavailable")}</dd>
      <dt>Coordinates</dt><dd>${m.latitude != null && m.longitude != null ? esc(m.latitude + ", " + m.longitude) : unavail("Data unavailable")}</dd>
      <dt>Photo</dt><dd>${m.photo ? esc(m.photo) : unavail("No photo added")}</dd>
      <dt>Google Maps</dt><dd><a href="${esc(mandalMapsUrl(m))}" target="_blank" rel="noopener noreferrer">Open location in Google Maps</a></dd>
      <dt>Source</dt><dd>${esc(m.source || "—")}</dd></dl>
      <div class="row" style="margin-top:12px">${mandalMapsButton(m)}<button class="btn" data-act="mandalplan" data-type="${type}" data-id="${esc(m.id)}">Plan Journey</button><button class="btn secondary" data-act="closedetail" data-type="${type}">Close</button></div></div>`;
  }
  function vMandals(type) {
    const list = D[type], target = D.meta[type + "_target"], f = S.filters[type] || { q: "", area: "", station: "" };
    const areas = [...new Set(list.map((m) => m.area).filter(Boolean))].sort();
    const stations = [...new Set(list.flatMap((m) => E.stationsFromText(m.nearest).map((s) => s.label)))].sort();
    const shown = filterMandals(type), sel = list.find((m) => m.id === S.sel[type]);
    return `<section class="section">${head(type === "ganpati" ? "06 • GANPATI" : "07 • DEVI", type === "ganpati" ? "🐘 Ganpati Mandals" : "🌺 Devi Mandals", `${list.length} of ~${target} loaded`)}
      ${banner(`<b>${list.length} record${list.length === 1 ? "" : "s"} loaded, target ≈ ${target}.</b> The remaining ${Math.max(0, target - list.length)} are <u>not added</u> because no verified source data was available. Nothing is padded or invented.`, "warn")}
      ${sel ? mandalDetail(sel, type) : ""}
      <div class="panel grid3"><label>Search<input id="m_q" data-filter="q" value="${esc(f.q)}" placeholder="Name / area / location"></label>
      <label>Area<select id="m_area" data-filter="area"><option value="">All areas</option>${areas.map((a) => `<option ${f.area === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label>
      <label>Nearby station<select id="m_station" data-filter="station"><option value="">All stations</option>${stations.map((a) => `<option ${f.station === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label></div>
      <p class="note" id="m_count">${shown.length} result${shown.length === 1 ? "" : "s"}</p>
      <div id="m_list" class="cards">${mandalCards(type, shown)}</div></section>`;
  }

  /* ---------- SAVED PLACES ---------- */
  function vSaved() {
    const list = savedPlaces(), ed = list.find((p) => p.id === S.editing) || { label: "Home", name: "", address: "", station: "", distanceM: "" };
    const rows = list.length ? list.map((p) => {
      const w = p.distanceM === "" || p.distanceM == null ? null : E.walkMinutes(p.distanceM, pace());
      return `<tr><td><b>${esc(p.label)}</b></td><td>${esc(p.name)}</td><td>${esc(p.address || "—")}</td><td>${p.station ? esc(p.station) : unavail("not set")}</td><td>${w == null ? unavail("not set") : w + " min (estimated)"}</td>
      <td><button class="btn small secondary" data-act="editplace" data-id="${p.id}">Edit</button> <button class="btn small danger" data-act="delplace" data-id="${p.id}">Delete</button></td></tr>`; }).join("")
      : `<tr><td colspan="6"><div class="empty">No saved places yet. Add Home and College below.</div></td></tr>`;
    return `<section class="section">${head("08 • PLACES", "Saved places", "Stored on this device")}
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Type</th><th>Name</th><th>Address</th><th>Nearest station</th><th>Walk to station</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <datalist id="places">${placeOptions()}</datalist>
      <div class="panel grid2" style="margin-top:16px"><div class="full"><b>${S.editing ? "Edit place" : "Add a place"}</b> <span class="note">Walking time is an estimate from the distance you enter at ${pace()} m/min. It is not GPS navigation.</span></div>
        <label>Type<select id="p_label">${["Home", "College", "Work", "Favourite"].map((l) => `<option ${ed.label === l ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Name<input id="p_name" value="${esc(ed.name)}" placeholder="Leave blank to use the type (e.g. Home)"></label>
        <label>Address / area (optional)<input id="p_address" value="${esc(ed.address)}"></label>
        <label>Nearest railway / metro station<input id="p_station" list="places" value="${esc(ed.station)}" placeholder="e.g. Bhandup"></label>
        <label>Walking distance to that station (metres)<input id="p_dist" type="number" min="0" max="20000" value="${esc(ed.distanceM)}"></label>
        <div class="row"><button class="btn" data-act="saveplace">${S.editing ? "Update" : "Save place"}</button>${S.editing ? '<button class="btn secondary" data-act="cancelplace">Cancel</button>' : ""}</div><div id="p_msg" class="full"></div></div></section>`;
  }
  function savePlace() {
    const label = val("p_label"), name = val("p_name") || (label === "Favourite" ? "" : label);
    const msg = (t) => { $("p_msg").innerHTML = banner(esc(t), "err"); };
    if (!name) return msg("Give this favourite place a name.");
    const dist = val("p_dist");
    if (dist !== "" && (!isFinite(Number(dist)) || Number(dist) < 0 || Number(dist) > 20000)) return msg("Walking distance must be between 0 and 20000 metres.");
    const list = savedPlaces();
    if (list.some((p) => p.id !== S.editing && p.name.toLowerCase() === name.toLowerCase())) return msg("A place named \u201C" + name + "\u201D already exists. Edit it instead.");
    const rec = { id: S.editing || uuid(), label, name, address: val("p_address"), station: val("p_station"), distanceM: dist === "" ? "" : Number(dist) };
    let next = list.filter((p) => p.id !== rec.id);
    if (["Home", "College", "Work"].includes(label)) next = next.filter((p) => p.label !== label); // one of each
    next.push(rec); Store.set("saved_locations", next); S.editing = null; render();
  }

  /* ---------- COLLEGE SCHEDULE ---------- */
  function vCollege() {
    const sch = Store.get("schedules");
    const rows = E.WEEK.slice(0, 6).map((d) => { const r = sch.days[d] || {};
      return `<tr><td><b>${d}</b></td><td><input type="time" id="c_s_${d}" value="${esc(r.start || "")}" ${r.holiday ? "disabled" : ""}></td><td><input type="time" id="c_e_${d}" value="${esc(r.end || "")}" ${r.holiday ? "disabled" : ""}></td>
      <td><label class="inline"><input type="checkbox" id="c_h_${d}" data-act="holidaytoggle" data-day="${d}" ${r.holiday ? "checked" : ""}> No college</label></td></tr>`; }).join("");
    const ovs = (sch.overrides || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const kindLabel = { holiday: "Holiday / no college", cancelled: "Lecture cancelled (earlier finish)", extra: "Extra lecture (later finish)" };
    const today = E.effectiveCollege(sch, E.todayStr());
    return `<section class="section">${head("09 • COLLEGE", "College schedule", "Monday to Saturday")}
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Day</th><th>College starts</th><th>College ends</th><th>Holiday</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="savesched">Save weekly schedule</button></div><div id="c_msg"></div></div>
      <div class="panel grid2" style="margin-top:16px"><div class="full"><b>One-day changes</b> <span class="note">Cancelled lecture, extra lecture or holiday for a specific date.</span></div>
        <label>Date<input type="date" id="o_date" value="${E.todayStr()}"></label>
        <label>Change<select id="o_kind"><option value="cancelled">Lecture cancelled (college ends earlier)</option><option value="extra">Extra lecture (college ends later)</option><option value="holiday">Holiday / no college</option></select></label>
        <label>New end time (not needed for holiday)<input type="time" id="o_end"></label><div class="row"><button class="btn secondary" data-act="addoverride">Add change</button></div><div id="o_msg" class="full"></div>
        <div class="full">${ovs.length ? `<div class="table-wrap"><table><tbody>${ovs.map((o) => `<tr><td>${esc(o.date)}</td><td>${esc(kindLabel[o.kind])}</td><td>${o.kind === "holiday" ? "—" : E.fmt(E.toMin(o.end))}</td><td><button class="btn small danger" data-act="deloverride" data-date="${esc(o.date)}" data-kind="${esc(o.kind)}">Remove</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="note">No one-day changes.</p>'}</div></div>
      <p class="note">Today: ${today.status === "ok" ? "college ends at <b>" + E.fmt(today.end) + "</b>. " : esc(today.note) + " "}These timings drive your reminders and recommended departure.</p></section>`;
  }
  function saveSchedule() {
    const sch = Store.get("schedules"); sch.days = {};
    for (const d of E.WEEK.slice(0, 6)) {
      sch.days[d] = $("c_h_" + d).checked ? { holiday: true } : { start: val("c_s_" + d), end: val("c_e_" + d) };
    }
    const errs = E.validateSchedule(sch);
    if (errs.length) { $("c_msg").innerHTML = banner(errs.map(esc).join("<br>"), "err"); return; }
    Store.set("schedules", sch); $("c_msg").innerHTML = banner("Schedule saved."); refreshDue();
  }
  function addOverride() {
    const o = { date: val("o_date"), kind: val("o_kind"), end: val("o_end") };
    const msg = (t) => { $("o_msg").innerHTML = banner(esc(t), "err"); };
    if (E.dayIndex(o.date) == null) return msg("Choose a valid date.");
    if (o.kind !== "holiday" && E.toMin(o.end) == null) return msg("Enter the new end time.");
    if (o.kind === "holiday") delete o.end;
    const sch = Store.get("schedules");
    if (sch.overrides.some((x) => x.date === o.date && x.kind === o.kind && x.end === o.end)) return msg("That change already exists for this date.");
    sch.overrides = sch.overrides.filter((x) => x.date !== o.date).concat(o); // one change per date
    Store.set("schedules", sch); render();
  }

  /* ---------- NOTIFICATIONS (rule-based; fire only while the app is open) ---------- */
  function planCtx() {
    const lookup = (label) => { const p = placeByLabel(label); if (!p) return null; const r = resolve(p.name); return r.ok ? r.place : null; };
    return { schedule: Store.get("schedules"), college: lookup("College"), home: lookup("Home"), data: data(), demo: demo(), pace: pace() };
  }
  const todaysReminders = () => E.buildReminders(E.todayStr(), planCtx());
  function vNotifications() {
    const r = todaysReminders(), log = Store.get("notifications"), nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    return `<section class="section">${head("10 • REMINDERS", "Notifications", "Rule-based, not AI")}
      ${banner("Reminders are calculated from your college schedule, stored timetable and estimated walking. They fire <b>only while Mr Mushakk is open in your browser</b>, and they never claim to know where a train, bus or metro is right now.")}
      <div class="panel"><div class="row"><button class="btn" data-act="enablenotif">Enable browser notifications</button><button class="btn secondary" data-act="testnotif">Send test notification</button><span class="note">Permission: ${esc(perm)}</span></div><div id="n_msg"></div></div>
      <div class="panel" style="margin-top:16px"><b>Today's reminders (${esc(E.todayStr())})</b>
        ${r.reminders.length ? r.reminders.map((x) => { const fired = log.some((l) => l.id === x.id); return `<div class="rem"><time>${E.fmt(x.atMin)}</time><div><b>${esc(x.title)}</b><br><span class="note">${esc(x.body)}</span><br><span class="badge ${fired ? "ok" : ""}">${fired ? "shown" : nowMin >= x.atMin ? "due" : "upcoming"}</span></div></div>`; }).join("")
          : `<p class="note">${esc(r.note || "No reminders: set your college schedule.")}</p>`}</div>
      <div class="panel" style="margin-top:16px"><div class="row" style="justify-content:space-between"><b>History</b><button class="btn small secondary" data-act="clearnotif">Clear</button></div>
        ${log.length ? log.slice().reverse().slice(0, 30).map((l) => `<div class="rem"><time>${esc(l.date)}<br>${E.fmt(l.atMin)}</time><div><b>${esc(l.title)}</b><br><span class="note">${esc(l.body)}</span></div></div>`).join("") : '<p class="note">No notifications yet.</p>'}</div></section>`;
  }
  function fire(rem) {
    const log = Store.get("notifications");
    if (log.some((l) => l.id === rem.id)) return;
    log.push({ id: rem.id, date: E.todayStr(), atMin: rem.atMin, title: rem.title, body: rem.body, firedAt: Date.now() });
    Store.set("notifications", log.slice(-200));
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Mr Mushakk: " + rem.title, { body: rem.body }); } catch (e) { /* some mobile browsers need a service worker */ }
    if (current() === "notifications") render();
  }
  function refreshDue(nowDate) {
    if (!Store.get("profile").remindersOn) return;
    const n = nowDate || new Date(), nowMin = n.getHours() * 60 + n.getMinutes();
    todaysReminders().reminders.forEach((r) => { if (nowMin >= r.atMin && nowMin < r.atMin + 10) fire(r); });
  }

  /* ---------- PROFILE ---------- */
  function vProfile() {
    const p = Store.get("profile"), user = Store.user(), home = placeByLabel("Home"), col = placeByLabel("College");
    return `<section class="section">${head("11 • PROFILE", "Your profile", "Minimal data")}
      <div class="panel grid2"><div class="full">${user ? `<span class="badge ok">Signed in</span> ${esc(user)} <button class="btn small secondary" data-act="logout">Sign out</button>` : '<span class="badge">Guest</span> Not signed in. Your data is kept on this device.'}</div>
      <label>Name (optional)<input id="pr_name" value="${esc(p.name)}" maxlength="60"></label>
      <label>Preferred transport<select id="pr_transport">${MODES.map((m) => `<option ${p.transport === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="inline full"><input type="checkbox" id="pr_rem" ${p.remindersOn ? "checked" : ""}> Show reminders while the app is open</label>
      <div class="full note">Home: ${home ? esc(home.name) : unavail("not set")} • College: ${col ? esc(col.name) : unavail("not set")} • <a href="#/saved">edit saved places</a> • <a href="#/college">college schedule</a></div>
      <div class="row"><button class="btn" data-act="saveprofile">Save profile</button></div><div id="pr_msg" class="full"></div></div>
      ${user ? "" : `<div class="panel" style="margin-top:16px"><b>OTP login</b><div class="grid2" style="margin-top:12px"><label>Mobile / Email<input id="identifier" placeholder="+91XXXXXXXXXX or email" autocomplete="off"></label><button class="btn" data-act="sendotp">Send OTP</button>
        <label>OTP<input id="otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP"></label><button class="btn secondary" data-act="verifyotp">Verify</button><div id="otpStatus" class="note full">OTP is the only external-service hook and is isolated in <code>otp.js</code>. It currently runs in demo mode.</div></div></div>`}</section>`;
  }

  /* ---------- SETTINGS ---------- */
  function vSettings() {
    const s = settings();
    return `<section class="section">${head("12 • SETTINGS", "Settings")}
      <div class="panel grid2">
        <label class="inline full"><input type="checkbox" id="s_demo" ${s.demo ? "checked" : ""}> Use demo sample data (placeholder timetable rows, NOT real)</label>
        <p class="note full">Off by default. The sample rows are unverified placeholders shipped with the earlier prototype. Switching this on lets you try the planner flow; results are then marked "Sample data, not real".</p>
        <label>Walking pace (metres per minute)<input id="s_pace" type="number" min="30" max="150" value="${esc(pace())}"></label><div></div>
        <div class="row"><button class="btn" data-act="savesettings">Save settings</button></div><div id="s_msg" class="full"></div></div>
      <div class="panel" style="margin-top:16px"><b>Reset my data</b><p class="note">Deletes saved places, schedule, profile, notifications and settings for the current user on this device.</p><button class="btn danger" data-act="resetdata">Reset my data</button></div>
      <div class="panel" style="margin-top:16px"><b>About this version</b><p class="note">No live tracking • No AI • No map or tracking APIs • All journeys are computed from stored timetable data, your inputs and simple rules. Walking times are estimates, not GPS navigation.</p></div></section>`;
  }

  /* ---------- events (one delegated listener; no inline handlers) ---------- */
  const A = {
    plan: () => runPlan(true),
    now: () => { $("time").value = nowHHMM(); $("date").value = E.todayStr(); },
    fnow: () => { $("f_time").value = nowHHMM(); $("f_date").value = E.todayStr(); },
    missed: (el) => { S.skips[el.dataset.key] = (S.skips[el.dataset.key] || 0) + 1; runPlan(false); },
    resetmiss: (el) => { delete S.skips[el.dataset.key]; runPlan(false); },
    find: (el) => { (S.finder[el.dataset.mode] ||= {}).skip = 0; runFinder(el.dataset.mode); },
    fmissed: (el) => { S.finder[el.dataset.mode].skip++; runFinder(el.dataset.mode); },
    fundo: (el) => { S.finder[el.dataset.mode].skip = 0; runFinder(el.dataset.mode); },
    details: (el) => { S.sel[el.dataset.type] = el.dataset.id; render(); },
    closedetail: (el) => { S.sel[el.dataset.type] = null; render(); },
    mandalplan: (el) => {
      const m = D[el.dataset.type].find((x) => x.id === el.dataset.id); if (!m) return;
      const home = placeByLabel("Home");
      S.plan = { from: S.plan.from || (home ? "Home" : ""), to: m.name, date: E.todayStr(), time: nowHHMM(), mode: S.plan.mode, autorun: !!(S.plan.from || home) };
      S.skips = {}; go("plan");
    },
    saveplace: savePlace,
    editplace: (el) => { S.editing = el.dataset.id; render(); },
    cancelplace: () => { S.editing = null; render(); },
    delplace: (el) => { if (confirm("Delete this place?")) { Store.set("saved_locations", savedPlaces().filter((p) => p.id !== el.dataset.id)); render(); } },
    holidaytoggle: (el) => { const d = el.dataset.day; $("c_s_" + d).disabled = $("c_e_" + d).disabled = el.checked; },
    savesched: saveSchedule,
    addoverride: addOverride,
    deloverride: (el) => { const s = Store.get("schedules"); s.overrides = s.overrides.filter((o) => !(o.date === el.dataset.date && o.kind === el.dataset.kind)); Store.set("schedules", s); render(); },
    enablenotif: () => { if (!("Notification" in window)) { $("n_msg").innerHTML = banner("Browser notifications are not supported here. Reminders still appear in this app.", "warn"); return; } Notification.requestPermission().then(() => render()); },
    testnotif: () => { fire({ id: "test-" + Date.now(), atMin: new Date().getHours() * 60 + new Date().getMinutes(), title: "Test", body: "Notifications are working. Reminders only fire while this app is open." }); render(); },
    clearnotif: () => { Store.set("notifications", []); render(); },
    saveprofile: () => { Store.set("profile", { name: val("pr_name"), transport: val("pr_transport"), remindersOn: $("pr_rem").checked }); $("pr_msg").innerHTML = banner("Profile saved."); },
    sendotp: () => requestOtp(), verifyotp: () => verifyOtp(),
    logout: () => { Store.logout(); render(); },
    savesettings: () => {
      const p = Number(val("s_pace"));
      if (!isFinite(p) || p < 30 || p > 150) { $("s_msg").innerHTML = banner("Walking pace must be between 30 and 150 m/min.", "err"); return; }
      Store.set("settings", { demo: $("s_demo").checked, pace: p }); $("s_msg").innerHTML = banner("Settings saved.");
    },
    resetdata: () => { if (confirm("Delete all your saved data on this device?")) { Store.resetCurrentUser(); S.plan = {}; S.finder = {}; render(); } },
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el || el.tagName === "INPUT") return;
    const fn = A[el.dataset.act]; if (fn) { ev.preventDefault(); fn(el); }
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.act === "holidaytoggle") A.holidaytoggle(el);
  });
  document.addEventListener("input", (ev) => {
    const el = ev.target; if (!el.dataset || !el.dataset.filter) return;
    const type = current(); (S.filters[type] ||= { q: "", area: "", station: "" })[el.dataset.filter] = el.value;
    const shown = filterMandals(type);
    $("m_list").innerHTML = mandalCards(type, shown); $("m_count").textContent = shown.length + " result" + (shown.length === 1 ? "" : "s");
  });
  document.addEventListener("change", (ev) => { // dropdown filters fire change, not input, in some browsers
    const el = ev.target; if (el.tagName !== "SELECT" || !el.dataset.filter) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function onLogin(id) { Store.login(id); render(); }

  window.addEventListener("hashchange", render);
  (async function init() {
    await loadAll(); render();
    setInterval(() => refreshDue(), 20000); refreshDue();
  })();

  return { onLogin };
})();
