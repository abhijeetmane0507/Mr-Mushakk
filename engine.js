/*
 Mr Mushakk engine
 -----------------
 Pure rule-based logic. No network, no AI, no live tracking.
 Everything here works on stored timetable data + user input + arithmetic.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // Monday-first
  const DEFAULT_PACE_M_PER_MIN = 80; // ~4.8 km/h, a simple rule-of-thumb

  /* ---------- time helpers ---------- */
  function toMin(t) {
    if (typeof t !== "string" || !/^\d{1,2}:\d{2}$/.test(t.trim())) return null;
    const [h, m] = t.trim().split(":").map(Number);
    if (h > 47 || m > 59) return null;
    return h * 60 + m;
  }
  function fmt(min) {
    if (min == null || isNaN(min)) return "—";
    const day = Math.floor(min / 1440);
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
    const ap = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return h12 + ":" + mm + " " + ap + (day > 0 ? " (+1 day)" : "");
  }
  function fmt24(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  /** index into WEEK (Mon=0) for a YYYY-MM-DD string, or null */
  function dayIndex(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return (dt.getDay() + 6) % 7;
  }
  function todayStr(now) {
    const n = now || new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  /* ---------- applicable days ---------- */
  /** "Mon-Sun" | "Mon-Fri" | "Sat" | "Mon,Wed" | "Daily" -> array of WEEK indexes ([] = invalid) */
  function parseDays(str) {
    if (typeof str !== "string" || !str.trim()) return [];
    const s = str.trim().toLowerCase();
    if (s === "daily" || s === "all") return [0, 1, 2, 3, 4, 5, 6];
    const idx = (x) => WEEK.findIndex((w) => w.toLowerCase() === x.trim().slice(0, 3));
    const out = new Set();
    for (const part of s.split(",")) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map(idx);
        if (a < 0 || b < 0) return [];
        for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; }
      } else {
        const i = idx(part);
        if (i < 0) return [];
        out.add(i);
      }
    }
    return [...out].sort((a, b) => a - b);
  }
  function runsOn(rec, dayIdx) {
    if (dayIdx == null) return true;
    return parseDays(rec.days).includes(dayIdx);
  }

  /* ---------- station / place matching ---------- */
  const ALIASES = {
    cst: "csmt", "chhatrapati shivaji maharaj terminus": "csmt", "victoria terminus": "csmt",
    "curry road": "currey road", "bombay central": "mumbai central", "mumbai central western": "mumbai central",
  };
  function normStation(s) {
    if (typeof s !== "string") return "";
    let x = s.toLowerCase().replace(/\(.*?\)/g, " ")
      .replace(/\b(railway|station|stn|metro|local|junction)\b/g, " ")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return ALIASES[x] || x;
  }
  /** "Chinchpokli / Currey Road" -> [{key,label}, ...]; ignores "verify"/"unknown" text */
  function stationsFromText(text) {
    if (typeof text !== "string") return [];
    const seen = new Set(), out = [];
    for (const part of text.split(/[\/,;]| or /i)) {
      const label = part.trim();
      if (!label || /verify|unknown|required|n\/a/i.test(label)) continue;
      const key = normStation(label);
      if (key && !seen.has(key)) { seen.add(key); out.push({ key, label }); }
    }
    return out;
  }

  /* ---------- walking ---------- */
  /** Rule-based estimate: minutes = distance / pace (rounded up). Not GPS routing. */
  function walkMinutes(distanceM, pace) {
    const d = Number(distanceM), p = Number(pace) || DEFAULT_PACE_M_PER_MIN;
    if (!isFinite(d) || d < 0 || d > 20000 || p <= 0) return null;
    return d === 0 ? 0 : Math.max(1, Math.ceil(d / p));
  }

  /* ---------- dataset gating ---------- */
  /** Real data only, unless the user turned on clearly-labelled demo mode */
  function usable(list, demo) {
    return (Array.isArray(list) ? list : []).filter((r) => r && (r.verified === true || demo === true));
  }

  /* ---------- services ---------- */
  /**
   * Expand stored records into concrete candidate services between two stations.
   * Returns [{depMin, arrMin|null, rec, basis:'timetable'|'interval'}] sorted by depMin.
   */
  function legCandidates(records, fromKey, toKey, dayIdx) {
    const out = [];
    for (const rec of records) {
      if (!runsOn(rec, dayIdx)) continue;
      if (Array.isArray(rec.stops) && rec.stops.length > 1) {
        const keys = rec.stops.map((s) => normStation(s.station));
        const i = keys.indexOf(fromKey);
        const j = keys.indexOf(toKey, i + 1);
        if (i >= 0 && j > i) {
          const dep = toMin(rec.stops[i].time), arr = toMin(rec.stops[j].time);
          if (dep != null) out.push({ depMin: dep, arrMin: arr, rec, basis: "timetable" });
        }
        continue;
      }
      if (normStation(rec.from) !== fromKey || normStation(rec.to) !== toKey) continue;
      if (rec.departure) {
        const dep = toMin(rec.departure);
        if (dep == null) continue;
        out.push({ depMin: dep, arrMin: toMin(rec.arrival), rec, basis: "timetable" });
      } else if (rec.first && rec.last && rec.frequency_min > 0) {
        const f = toMin(rec.first), l = toMin(rec.last), step = Number(rec.frequency_min);
        if (f == null || l == null || l < f || !isFinite(step)) continue;
        const travel = Number(rec.travel_min);
        for (let t = f; t <= l; t += step)
          out.push({ depMin: t, arrMin: isFinite(travel) && travel > 0 ? t + travel : null, rec, basis: "interval" });
      }
    }
    return out.sort((a, b) => a.depMin - b.depMin);
  }
  /** Next scheduled service at or after `afterMin`. `skip` = how many to pass (missed services). */
  function nextService(cands, afterMin, skip) {
    const upcoming = cands.filter((c) => c.depMin >= afterMin);
    return upcoming[skip || 0] || null;
  }
  /** Service strictly after a missed one. */
  function afterMissed(cands, missedDepMin) {
    return cands.find((c) => c.depMin > missedDepMin) || null;
  }

  /* ---------- fares ---------- */
  function lookupFare(fares, mode, fromKey, toKey) {
    const f = usable(fares, false).find(
      (r) => r.mode === mode && normStation(r.from) === fromKey && normStation(r.to) === toKey && isFinite(Number(r.fare))
    );
    return f ? { amount: Number(f.fare), source: f.source || "" } : null;
  }

  /* ---------- location resolution ---------- */
  /**
   * Turn user text into a place with candidate stations.
   * ctx: {saved:[{label,name,station,distanceM}], mandals:[...], stations:Set<key>, pace}
   * Returns {ok, place} or {ok:false, error}
   */
  function resolveLocation(text, ctx) {
    const q = (text || "").trim();
    if (!q) return { ok: false, error: "Location is empty." };
    const ql = q.toLowerCase();
    const pace = ctx.pace;
    const saved = (ctx.saved || []).find((s) => (s.name || "").toLowerCase() === ql || (s.label || "").toLowerCase() === ql);
    if (saved) {
      const stations = stationsFromText(saved.station);
      return { ok: true, place: {
        kind: "saved", label: saved.name || saved.label, stations,
        walkMin: saved.distanceM === "" || saved.distanceM == null ? null : walkMinutes(saved.distanceM, pace),
        note: stations.length ? "" : "No nearest station saved for this place.",
      } };
    }
    const mandal = (ctx.mandals || []).find((m) => (m.name || "").toLowerCase() === ql);
    if (mandal) {
      const stations = stationsFromText(mandal.nearest);
      return { ok: true, place: {
        kind: "mandal", label: mandal.name, stations, walkMin: null,
        note: stations.length ? "Walking distance from station is not stored for mandals." : "Nearest station not verified for this mandal.",
      } };
    }
    const key = normStation(q);
    if (ctx.stations && ctx.stations.has(key))
      return { ok: true, place: { kind: "station", label: q, stations: [{ key, label: q }], walkMin: 0, note: "" } };
    return { ok: false, error: "\u201C" + q + "\u201D is not a saved place, a known mandal or a station in the stored data." };
  }

  /* ---------- journey planner ---------- */
  const MODE_KEY = { "Local Train": "trains", "BEST Bus": "buses", Metro: "metro" };
  const MODE_ICON = { "Local Train": "🚆", "BEST Bus": "🚌", Metro: "🚇", Walking: "🚶" };

  /**
   * input: {origin, dest, departMin, dayIdx, mode, directWalkM, skips:{key:n}, demo, pace}
   * data:  {trains, buses, metro, fares}
   * Returns {options:[], messages:[]}
   */
  function planJourney(input, data) {
    const { origin, dest, departMin, dayIdx, mode, demo, pace } = input;
    const skips = input.skips || {};
    const options = [], messages = [];
    const modes = mode === "Any" || !mode ? ["Local Train", "Metro", "BEST Bus"] : mode === "Walking" ? [] : [mode];

    if (departMin == null) return { options, messages: ["Enter a valid departure time."] };

    if ((mode === "Walking" || mode === "Any" || !mode) && input.directWalkM !== "" && input.directWalkM != null) {
      const w = walkMinutes(input.directWalkM, pace);
      if (w == null) messages.push("Direct walking distance is invalid.");
      else options.push({
        mode: "Walking", key: "walk", icon: MODE_ICON.Walking, depMin: departMin, arrMin: departMin + w, finalArrMin: departMin + w,
        walkTo: w, walkFrom: 0, transfers: 0, basis: "estimate", verified: true, boarding: origin.label, alighting: dest.label,
        service: "Walk", fare: null, fareText: "No fare", totalMin: w,
      });
    } else if (mode === "Walking") {
      messages.push("Walking needs a distance. Enter \u201CDirect walking distance\u201D (metres) to get an estimate.");
    }

    for (const m of modes) {
      const recs = usable(data[MODE_KEY[m]], demo);
      if (!recs.length) {
        messages.push(m === "BEST Bus" ? "Timetable unavailable for this route (no verified BEST data is stored)." : "Timetable not available for " + m + " (no verified data is stored).");
        continue;
      }
      if (!origin.stations.length || !dest.stations.length) {
        messages.push("Nearest station is missing for " + (!origin.stations.length ? origin.label : dest.label) + ", so " + m + " cannot be searched.");
        continue;
      }
      let matched = false, found = false;
      const found_ = [];
      for (const so of origin.stations) for (const sd of dest.stations) {
        if (so.key === sd.key) continue;
        const cands = legCandidates(recs, so.key, sd.key, dayIdx);
        if (!cands.length) continue;
        matched = true;
        const atStation = departMin + (origin.walkMin || 0);
        const key = m + "|" + so.key + "|" + sd.key;
        const c = nextService(cands, atStation, skips[key] || 0);
        if (!c) continue;
        found = true;
        const walkFrom = dest.walkMin || 0;
        const fare = lookupFare(data.fares, m, so.key, sd.key);
        found_.push({
          mode: m, key, icon: MODE_ICON[m], boarding: so.label, alighting: sd.label, depMin: c.depMin, arrMin: c.arrMin,
          finalArrMin: c.arrMin != null ? c.arrMin + walkFrom : null,
          walkTo: origin.walkMin, walkFrom: dest.walkMin, waitMin: c.depMin - atStation, transfers: 0, basis: c.basis,
          verified: c.rec.verified === true, service: c.rec.service || c.rec.route || c.rec.line || m, line: c.rec.line || "",
          fare: fare ? fare.amount : null, fareText: fare ? "\u20B9" + fare.amount : "Fare information unavailable",
          totalMin: c.arrMin != null ? c.arrMin + walkFrom - departMin : null,
          missed: skips[key] || 0,
        });
      }
      if (!matched) messages.push("No stored " + m + " service found between " + origin.label + " and " + dest.label + ".");
      else if (!found) messages.push("No further scheduled " + m + " service today after " + fmt(departMin + (origin.walkMin || 0)) + ".");
      options.push(...found_);
    }
    options.sort((a, b) => (a.finalArrMin ?? a.depMin + 100000) - (b.finalArrMin ?? b.depMin + 100000));
    return { options: options.slice(0, 6), messages };
  }

  /* ---------- college schedule + reminders ---------- */
  function validateSchedule(sch) {
    const errors = [];
    for (const d of WEEK.slice(0, 6)) {
      const r = (sch && sch.days && sch.days[d]) || {};
      if (r.holiday) continue;
      if (!r.start && !r.end) continue;
      const s = toMin(r.start), e = toMin(r.end);
      if (s == null || e == null) errors.push(d + ": enter both start and end time.");
      else if (e <= s) errors.push(d + ": end time must be after start time.");
    }
    for (const o of (sch && sch.overrides) || []) {
      if (dayIndex(o.date) == null) errors.push("Override has an invalid date.");
      else if (o.kind !== "holiday" && toMin(o.end) == null) errors.push(o.date + ": enter a valid end time.");
    }
    return errors;
  }
  /** Effective college timing for a date: {status:'holiday'|'none'|'ok', start, end, note} */
  function effectiveCollege(sch, dateStr) {
    const di = dayIndex(dateStr);
    if (di == null) return { status: "none", note: "Invalid date." };
    const ov = ((sch && sch.overrides) || []).filter((o) => o.date === dateStr).pop();
    if (ov && ov.kind === "holiday") return { status: "holiday", note: "Marked holiday / no college." };
    const base = (sch && sch.days && sch.days[WEEK[di]]) || {};
    if (di === 6) return { status: "none", note: "No college on Sunday." };
    if (!ov && base.holiday) return { status: "holiday", note: "Holiday set for " + WEEK[di] + "." };
    const start = toMin(base.start), end = ov ? toMin(ov.end) : toMin(base.end);
    if (end == null) return { status: "none", note: "No college end time set for " + WEEK[di] + "." };
    const label = ov ? (ov.kind === "cancelled" ? "Lecture cancelled: earlier finish." : "Extra lecture: later finish.") : "";
    return { status: "ok", start, end, note: label };
  }
  /**
   * Rule-based reminders for one date.
   * ctx: {schedule, college:place, home:place, data, demo, pace}
   */
  function buildReminders(dateStr, ctx) {
    const eff = effectiveCollege(ctx.schedule, dateStr);
    if (eff.status !== "ok") return { reminders: [], note: eff.note };
    const E = eff.end;
    const list = [
      { id: dateStr + "-soon", atMin: E - 15, title: "College ending soon", body: "Your college is ending soon." },
      { id: dateStr + "-ended", atMin: E, title: "College ended", body: "College ended. Ready to plan your journey?" },
    ];
    let rec = "Recommended departure unavailable: set Home and College (with nearest stations) and add timetable data.";
    if (ctx.college && ctx.home) {
      const res = planJourney({ origin: ctx.college, dest: ctx.home, departMin: E, dayIdx: dayIndex(dateStr), mode: "Local Train", demo: ctx.demo, pace: ctx.pace }, ctx.data);
      const best = res.options[0];
      if (best) {
        const leave = Math.max(E, best.depMin - (best.walkTo || 0));
        rec = "Recommended departure: " + fmt(leave) + " for the " + fmt(best.depMin) + " " + best.mode + " from " + best.boarding + " (stored timetable + estimated walking; not live).";
      } else rec = "Recommended departure unavailable: " + (res.messages[0] || "no stored service found.");
    }
    list.push({ id: dateStr + "-depart", atMin: E, title: "Recommended departure", body: rec });
    return { reminders: list, note: eff.note };
  }

  /* ---------- dataset validation (used by tests and `npm run validate`) ---------- */
  function validateDataset(name, list) {
    const problems = [], ids = new Set();
    for (const r of list) {
      if (ids.has(r.id)) problems.push(name + ": duplicate id " + r.id);
      ids.add(r.id);
      if (["trains", "buses", "metro"].includes(name)) {
        if (r.departure && toMin(r.departure) == null) problems.push(name + " " + r.id + ": bad departure time");
        if (r.first && toMin(r.first) == null) problems.push(name + " " + r.id + ": bad first time");
        if (r.last && toMin(r.last) == null) problems.push(name + " " + r.id + ": bad last time");
        if (!parseDays(r.days).length && r.days) problems.push(name + " " + r.id + ": bad days '" + r.days + "'");
        if (r.verified === true && !r.source) problems.push(name + " " + r.id + ": verified without source");
      }
    }
    return problems;
  }

  return {
    WEEK, MODE_ICON, DEFAULT_PACE_M_PER_MIN,
    toMin, fmt, fmt24, dayIndex, todayStr, parseDays, runsOn, normStation, stationsFromText, walkMinutes,
    usable, legCandidates, nextService, afterMissed, lookupFare, resolveLocation, planJourney,
    validateSchedule, effectiveCollege, buildReminders, validateDataset,
  };
});
