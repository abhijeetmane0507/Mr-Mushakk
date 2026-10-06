const test = require("node:test");
const assert = require("node:assert");
const E = require("../engine.js");
const trains = require("./fixtures/test-trains.json");
const real = (f) => require("../data/" + f + ".json");

const MON = E.dayIndex("2026-10-05"); // a Monday
const SUN = E.dayIndex("2026-10-04");

test("time helpers", () => {
  assert.strictEqual(E.toMin("14:05"), 845);
  assert.strictEqual(E.toMin("25:99"), null);
  assert.strictEqual(E.toMin("abc"), null);
  assert.strictEqual(E.fmt(14 * 60 + 15), "2:15 PM");
  assert.strictEqual(E.fmt(0), "12:00 AM");
  assert.strictEqual(E.dayIndex("2026-02-30"), null);
});

test("days parsing", () => {
  assert.deepStrictEqual(E.parseDays("Mon-Fri"), [0, 1, 2, 3, 4]);
  assert.deepStrictEqual(E.parseDays("Sat,Sun"), [5, 6]);
  assert.strictEqual(E.parseDays("Mon-Sun").length, 7);
  assert.deepStrictEqual(E.parseDays("garbage"), []);
});

test("SPEC: 2:05 PM -> next scheduled 2:15 PM", () => {
  const c = E.legCandidates(trains, "alpha", "omega", MON);
  const n = E.nextService(c, E.toMin("14:05"));
  assert.strictEqual(E.fmt(n.depMin), "2:15 PM");
});

test("SPEC: missed 2:15 -> next scheduled 2:32 PM", () => {
  const c = E.legCandidates(trains, "alpha", "omega", MON);
  assert.strictEqual(E.fmt(E.afterMissed(c, E.toMin("14:15")).depMin), "2:32 PM");
  assert.strictEqual(E.afterMissed(c, E.toMin("14:32")), null); // nothing after the last one
});

test("applicable days respected (Sunday-only service excluded on Monday)", () => {
  const mon = E.legCandidates(trains, "alpha", "omega", MON).map((c) => c.rec.id);
  const sun = E.legCandidates(trains, "alpha", "omega", SUN).map((c) => c.rec.id);
  assert.ok(!mon.includes("T4"));
  assert.deepStrictEqual(sun, ["T4"]);
});

test("exact-time service counts as available (>=), none after last", () => {
  const c = E.legCandidates(trains, "alpha", "omega", MON);
  assert.strictEqual(E.nextService(c, E.toMin("14:15")).depMin, E.toMin("14:15"));
  assert.strictEqual(E.nextService(c, E.toMin("23:00")), null);
});

test("walking estimate", () => {
  assert.strictEqual(E.walkMinutes(640, 80), 8);
  assert.strictEqual(E.walkMinutes(641, 80), 9);
  assert.strictEqual(E.walkMinutes(0), 0);
  assert.strictEqual(E.walkMinutes(-5), null);
  assert.strictEqual(E.walkMinutes("x"), null);
});

test("station parsing keeps multiple stations and drops 'verify' text", () => {
  assert.deepStrictEqual(E.stationsFromText("Chinchpokli / Currey Road").map((s) => s.key), ["chinchpokli", "currey road"]);
  assert.deepStrictEqual(E.stationsFromText("Verify before visit"), []);
  assert.strictEqual(E.normStation("CST"), "csmt");
});

const ctx = (extra) => Object.assign({ saved: [
  { label: "Home", name: "Home", station: "Omega", distanceM: 400 },
  { label: "College", name: "College", station: "Alpha", distanceM: 640 },
  { label: "Nowhere", name: "Nowhere", station: "", distanceM: "" },
], mandals: [{ name: "Test Mandal", nearest: "Omega" }], stations: new Set(["alpha", "omega"]), pace: 80 }, extra);
const data = { trains, buses: [], metro: [], fares: [] };
const loc = (t) => E.resolveLocation(t, ctx()).place;

test("SCENARIO A: college ends 2 PM -> walk 8 min -> next train -> arrival + walk from station", () => {
  const r = E.planJourney({ origin: loc("College"), dest: loc("Home"), departMin: E.toMin("14:00"), dayIdx: MON, mode: "Local Train", pace: 80 }, data);
  const o = r.options[0];
  assert.strictEqual(o.walkTo, 8);
  assert.strictEqual(E.fmt(o.depMin), "2:15 PM"); // leaves 2:00 + 8 min walk = 2:08 at station -> 2:15
  assert.strictEqual(o.waitMin, 7);
  assert.strictEqual(E.fmt(o.arrMin), "2:55 PM");
  assert.strictEqual(E.fmt(o.finalArrMin), "3:00 PM"); // +5 min walk (400 m)
  assert.strictEqual(o.totalMin, 60);
  assert.strictEqual(o.fareText, "Fare information unavailable");
  assert.strictEqual(o.transfers, 0);
});

test("SCENARIO B: mandal as destination", () => {
  const r = E.planJourney({ origin: loc("College"), dest: loc("Test Mandal"), departMin: E.toMin("14:00"), dayIdx: MON, mode: "Any", pace: 80 }, data);
  assert.ok(r.options.length >= 1);
  assert.ok(r.messages.some((m) => /Timetable not available for Metro/.test(m)));
  assert.ok(r.messages.some((m) => /Timetable unavailable for this route/.test(m)));
});

test("SCENARIO C: missed service via skips", () => {
  const base = { origin: loc("College"), dest: loc("Home"), departMin: E.toMin("14:00"), dayIdx: MON, mode: "Local Train", pace: 80 };
  const first = E.planJourney(base, data).options[0];
  const second = E.planJourney(Object.assign({}, base, { skips: { [first.key]: 1 } }), data).options[0];
  assert.strictEqual(E.fmt(second.depMin), "2:32 PM");
});

test("errors: invalid location, empty, no station, no timetable, no next service", () => {
  assert.strictEqual(E.resolveLocation("", ctx()).ok, false);
  assert.strictEqual(E.resolveLocation("Atlantis", ctx()).ok, false);
  const nw = loc("Nowhere");
  const r1 = E.planJourney({ origin: nw, dest: loc("Home"), departMin: 800, dayIdx: MON, mode: "Local Train", pace: 80 }, data);
  assert.ok(/Nearest station is missing/.test(r1.messages[0]));
  const r2 = E.planJourney({ origin: loc("College"), dest: loc("Home"), departMin: 800, dayIdx: MON, mode: "Local Train", pace: 80 }, { trains: [], buses: [], metro: [], fares: [] });
  assert.ok(/Timetable not available/.test(r2.messages[0]));
  const r3 = E.planJourney({ origin: loc("College"), dest: loc("Home"), departMin: E.toMin("23:00"), dayIdx: MON, mode: "Local Train", pace: 80 }, data);
  assert.ok(/No further scheduled/.test(r3.messages[0]));
  const r4 = E.planJourney({ origin: loc("College"), dest: loc("Home"), departMin: null, dayIdx: MON, mode: "Any" }, data);
  assert.ok(/valid departure time/.test(r4.messages[0]));
});

test("DATA HONESTY: shipped placeholder data is hidden unless demo mode", () => {
  const t = real("local-trains");
  assert.ok(t.length > 0 && t.every((r) => r.verified === false));
  assert.strictEqual(E.usable(t, false).length, 0);
  assert.strictEqual(E.usable(t, true).length, t.length);
  assert.strictEqual(E.usable(real("buses"), false).length, 0);
  assert.strictEqual(E.usable(real("metro"), false).length, 0);
});

test("fares: only verified rows with numeric fare are used", () => {
  const f = [{ mode: "Local Train", from: "Alpha", to: "Omega", fare: 10, verified: true, source: "test" },
             { mode: "Metro", from: "Alpha", to: "Omega", fare: 20, verified: false }];
  assert.strictEqual(E.lookupFare(f, "Local Train", "alpha", "omega").amount, 10);
  assert.strictEqual(E.lookupFare(f, "Metro", "alpha", "omega"), null);
});

test("frequency (interval) records and stops-based records", () => {
  const bus = [{ id: "B", route: "R", from: "Alpha", to: "Omega", first: "06:00", last: "07:00", frequency_min: 20, days: "Daily", verified: true, source: "t" }];
  const c = E.legCandidates(bus, "alpha", "omega", MON);
  assert.deepStrictEqual(c.map((x) => E.fmt24(x.depMin)), ["06:00", "06:20", "06:40", "07:00"]);
  assert.ok(c.every((x) => x.basis === "interval" && x.arrMin === null));
  const stops = [{ id: "S", line: "L", from: "A", to: "C", days: "Daily", verified: true, source: "t",
    stops: [{ station: "A", time: "10:00" }, { station: "B", time: "10:10" }, { station: "C", time: "10:20" }] }];
  const s = E.legCandidates(stops, "b", "c", MON);
  assert.strictEqual(E.fmt(s[0].depMin), "10:10 AM");
  assert.strictEqual(E.fmt(s[0].arrMin), "10:20 AM");
  assert.strictEqual(E.legCandidates(stops, "c", "b", MON).length, 0); // wrong direction
});

test("college schedule: validation, overrides, holidays", () => {
  const sch = { days: { Mon: { start: "09:00", end: "14:00" }, Tue: { start: "09:00", end: "13:00" }, Wed: { holiday: true }, Thu: { start: "10:00", end: "09:00" } }, overrides: [] };
  assert.ok(E.validateSchedule(sch).some((e) => /^Thu/.test(e)));
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-05").end, 14 * 60);      // Mon
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-06").end, 13 * 60);      // Tue differs
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-07").status, "holiday"); // Wed
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-04").status, "none");    // Sun
  sch.overrides = [{ date: "2026-10-05", kind: "cancelled", end: "12:00" }, { date: "2026-10-06", kind: "extra", end: "16:00" }, { date: "2026-10-08", kind: "holiday" }];
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-05").end, 12 * 60);
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-06").end, 16 * 60);
  assert.strictEqual(E.effectiveCollege(sch, "2026-10-08").status, "holiday");
});

test("SPEC reminders: ends 2 PM -> 1:45 soon, 2:00 ended, recommended departure", () => {
  const sch = { days: { Mon: { start: "09:00", end: "14:00" } }, overrides: [] };
  const r = E.buildReminders("2026-10-05", { schedule: sch, college: loc("College"), home: loc("Home"), data, pace: 80 });
  assert.deepStrictEqual(r.reminders.map((x) => E.fmt(x.atMin)), ["1:45 PM", "2:00 PM", "2:00 PM"]);
  assert.strictEqual(r.reminders[0].body, "Your college is ending soon.");
  assert.strictEqual(r.reminders[1].body, "College ended. Ready to plan your journey?");
  assert.match(r.reminders[2].body, /Recommended departure: 2:07 PM for the 2:15 PM Local Train/); // 2:15 - 8 min walk
  assert.match(r.reminders[2].body, /not live/);
  const none = E.buildReminders("2026-10-05", { schedule: sch, college: null, home: null, data, pace: 80 });
  assert.match(none.reminders[2].body, /unavailable/);
  assert.strictEqual(E.buildReminders("2026-10-04", { schedule: sch, data }).reminders.length, 0);
});

test("shipped datasets validate (ids unique, times valid)", () => {
  for (const [n, f] of [["trains", "local-trains"], ["buses", "buses"], ["metro", "metro"]])
    assert.deepStrictEqual(E.validateDataset(n, real(f)), []);
});
