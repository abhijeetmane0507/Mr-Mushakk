/*
 Mr Mushakk local store
 ----------------------
 Per-user tables kept in the browser (localStorage):
 users, profile, schedules, saved_locations, notifications, settings.
 Transport/mandal/fare tables are read-only JSON files in /data.
 Nothing leaves the device.
*/
const Store = (function () {
  const NS = "mm:";
  const mem = {}; // fallback when localStorage is blocked
  function raw(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  function read(k, def) { try { const v = raw(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }

  const DEFAULTS = {
    profile: () => ({ name: "", transport: "Any", remindersOn: true }),
    schedules: () => ({ days: {}, overrides: [] }),
    saved_locations: () => [],
    notifications: () => [],
    settings: () => ({ demo: false, pace: 80 }),
  };
  function uid() { return read(NS + "session", null) || "guest"; }
  function key(table) { return NS + "u:" + uid() + ":" + table; }

  return {
    user() { return read(NS + "session", null); },
    users() { return read(NS + "users", []); },
    login(id) {
      const users = this.users();
      if (!users.includes(id)) { users.push(id); put(NS + "users", JSON.stringify(users)); }
      put(NS + "session", JSON.stringify(id));
    },
    logout() { del(NS + "session"); },
    get(table) { return read(key(table), DEFAULTS[table]()); },
    set(table, value) { put(key(table), JSON.stringify(value)); },
    resetCurrentUser() { Object.keys(DEFAULTS).forEach((t) => del(key(t))); },
  };
})();
