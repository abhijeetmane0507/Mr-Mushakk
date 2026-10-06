# Mr Mushakk

Mumbai journey planner that works from **stored timetable data + your inputs + simple rules**.

- **No live tracking** (no live train, bus or metro positions, no GPS tracking, no real-time APIs)
- **No AI** (no AI APIs, no route prediction, no chatbot)
- **No map or transport APIs.** The only external-service hook is OTP login, isolated in `otp.js`
- Every timetable is treated as **"Based on stored timetable"**, never as live data
- Missing data is shown as **"Data unavailable" / "Timetable not available" / "Fare information unavailable"**, never invented

## Run
```
npm install        # no dependencies; just creates the lockfile
npm start          # http://localhost:5173  (serves the source folder)
npm test           # 18 engine unit tests
npm run validate   # checks JS syntax, JSON data, duplicates, data-honesty rules
npm run build      # validate + copy the static site to dist/
```
`dist/` is a static site; deploy it to any static host. (Opening index.html straight from disk will not load the JSON data; use `npm start`.)

Optional browser tests (need Python + Playwright): start `node scripts/serve.js dist` then `python3 tests/e2e.py`.

## Sections
Home • Plan Journey • Local Train • BEST Bus • Metro • Ganpati Mandals • Devi Mandals • Saved Places • College Schedule • Notifications • Profile • Settings

## How it works
`engine.js` (pure logic, unit-tested): next scheduled service (the first stored service at/after your time), missed-service handling (the next stored service after the missed one), rule-based walking estimate (distance / pace), fare lookup (verified rows only), college-day rules (per-day times, holiday, cancelled/extra lecture overrides), reminders.
`store.js`: per-user tables kept in the browser: users, profile, schedules, saved_locations, notifications, settings.
`data/*.json`: read-only datasets: local-trains, buses, metro, fares, ganpati, devi.

## DATA STATUS: please read
This version ships **no verified train, bus, metro or fare data**. The old sample rows are marked `verified:false`, are hidden by default, and can be shown only via Settings → "Use demo sample data", which labels every result "Sample data, not real". Ganpati has 24 of ~150 records and Devi 2 of ~50; nothing is padded. See `data/README.md` for the row formats to add verified data.

## Reminders
Rule-based; they fire only while the app is open in the browser. They never claim to know where a vehicle is.

## Production OTP
Demo mode shows the OTP on screen (insecure, for demonstration). To connect a real provider set `window.MUSHAKK_OTP_ENDPOINT` (see `otp.js`); keep secrets server-side.

## New: Data Manager

The project now includes `data-manager.html` and a **Data Manager** link in the main navigation.

It lets you add/edit/delete:
- Local train services and intermediate stop times
- BEST bus route schedules/frequencies
- Metro schedules/frequencies
- Fares
- Ganpati mandals
- Devi mandals
- Mandal Google Maps links
- Mandal photos

For Chrome/Edge on localhost/HTTPS, use **Connect project folder** to write the JSON files directly. The manager can also copy a selected mandal photo into `data/images/`. If direct folder access is unavailable, download the changed JSON and replace the matching file manually.
