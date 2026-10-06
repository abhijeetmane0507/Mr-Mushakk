import json, re, sys
from playwright.sync_api import sync_playwright
import os
URL=os.environ.get("MM_URL","http://localhost:5199/")
FIX=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"fixtures","test-trains.json")).read()
results=[]; 
def check(name, cond, extra=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name+(("  -> "+str(extra)) if (extra and not cond) else ""))

def new_ctx(b, fixture=False, viewport=None):
    ctx=b.new_context(viewport=viewport or {"width":1280,"height":900}, timezone_id="Asia/Kolkata")
    errs=[]
    p=ctx.new_page()
    p.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    p.on("pageerror", lambda e: errs.append("PAGEERROR "+str(e)))
    if fixture:
        p.route("**/data/local-trains.json", lambda r: r.fulfill(status=200, content_type="application/json", body=FIX))
    return ctx,p,errs
def txt(p, sel="#view"): return p.inner_text(sel)
def low(p, sel="#view"): return p.inner_text(sel).lower()

with sync_playwright() as pw:
    b=pw.chromium.launch()

    # ---------- A: honest empty state with real shipped data ----------
    ctx,p,errs=new_ctx(b)
    p.goto(URL+"#/home"); p.wait_for_selector(".stat")
    t=txt(p)
    check("home: 12 nav sections", p.locator("#nav a").count()==12)
    check("home: honest status (0 verified, placeholders hidden)", "65 placeholder rows hidden" in t and "No verified train" in t)
    check("home: mandal counts honest (24 / 150, 2 / 50)", "24 / 150" in t and "2 / 50" in t)
    # save Home/College using real flow
    p.goto(URL+"#/saved"); p.wait_for_selector("#p_label")
    p.select_option("#p_label","Home"); p.fill("#p_station","Bhandup"); p.fill("#p_dist","640"); p.click("[data-act=saveplace]")
    p.wait_for_selector("table td:has-text('Home')")
    p.select_option("#p_label","College"); p.fill("#p_station","CSMT"); p.fill("#p_dist","400"); p.click("[data-act=saveplace]")
    check("saved: Home + College saved with walk estimates", "8 min (estimated)" in txt(p) and "5 min (estimated)" in txt(p), txt(p)[:300])
    # validation
    p.select_option("#p_label","Favourite"); p.fill("#p_name",""); p.click("[data-act=saveplace]")
    check("saved: favourite needs a name", "Give this favourite place a name" in txt(p))
    p.fill("#p_name","Home"); p.click("[data-act=saveplace]")
    check("saved: duplicate name rejected", "already exists" in txt(p))
    p.fill("#p_name","Gym"); p.fill("#p_dist","-5"); p.click("[data-act=saveplace]")
    check("saved: bad distance rejected", "between 0 and 20000" in txt(p))
    # planner with no verified data
    p.goto(URL+"#/plan"); p.wait_for_selector("#from")
    p.fill("#from","College"); p.fill("#to","Home"); p.fill("#date","2026-10-05"); p.fill("#time","14:00"); p.select_option("#mode","Local Train"); p.click("[data-act=plan]")
    p.wait_for_selector("#result .panel")
    r=txt(p,"#result")
    check("plan: no verified data -> 'Timetable not available', 'No route found'", "No route found" in r and "Timetable not available for Local Train" in r, r)
    p.select_option("#mode","BEST Bus"); p.click("[data-act=plan]")
    check("plan: bus -> 'Timetable unavailable for this route'", "Timetable unavailable for this route" in txt(p,"#result"))
    # error handling
    p.fill("#from",""); p.click("[data-act=plan]")
    check("plan: empty From rejected", "Enter both From and To" in txt(p,"#result"))
    p.fill("#from","Atlantis"); p.fill("#to","Home"); p.click("[data-act=plan]")
    check("plan: invalid location message", "not a saved place" in txt(p,"#result"))
    p.fill("#from","Home"); p.fill("#to","Home"); p.click("[data-act=plan]")
    check("plan: same place rejected", "same place" in txt(p,"#result"))
    p.fill("#from","College"); p.fill("#to","Home"); p.fill("#time",""); p.click("[data-act=plan]")
    check("plan: invalid time rejected", "valid departure time" in txt(p,"#result"))
    p.fill("#time","14:00"); p.select_option("#mode","Walking"); p.click("[data-act=plan]")
    check("plan: walking without distance asks for it", "needs a distance" in txt(p,"#result"))
    p.fill("#walkm","800"); p.click("[data-act=plan]")
    check("walking: 800 m -> 10 min estimate, labelled", "10 min walk (estimated)" in txt(p,"#result") and "not GPS" not in "x" , txt(p,"#result")[:300])
    # bus/metro/local pages
    for v,needle in (("local","Timetable not available"),("bus","Timetable unavailable for this route"),("metro","Timetable not available")):
        p.goto(URL+"#/"+v); p.wait_for_selector("#f_from"); 
        check(f"{v}: unavailable shown, no sample/fake rows", needle in txt(p) and "sample" not in low(p) and "placeholder" not in low(p), txt(p)[:400])
    p.goto(URL+"#/local"); p.wait_for_selector("#f_from"); p.fill("#f_from","Bhandup"); p.fill("#f_to","CSMT"); p.click("[data-act=find]")
    check("local finder: no data -> clear message", "No verified Local Train data" in txt(p,"#finderOut"))
    # mandals
    p.goto(URL+"#/ganpati"); p.wait_for_selector(".card")
    check("ganpati: 24 cards", p.locator(".card").count()==24)
    p.fill("#m_q","lalbaug"); check("ganpati: search filters", 1 <= p.locator(".card").count() < 24)
    p.fill("#m_q","zzzzzz"); check("ganpati: empty search -> friendly message", "No mandal matches" in txt(p,"#m_list"))
    p.fill("#m_q",""); p.select_option("#m_area","Lalbaug"); check("ganpati: area filter", 0 < p.locator(".card").count() < 24)
    p.select_option("#m_area",""); p.select_option("#m_station","Charni Road"); check("ganpati: station filter", 0 < p.locator(".card").count() < 24)
    p.goto(URL+"#/devi"); p.wait_for_selector(".card"); check("devi: 2 real cards, banner says 48 not added", p.locator(".card").count()==2 and "remaining 48" in txt(p))
    check("no console errors (scenario A block)", not errs, errs)
    ctx.close()

    # ---------- B/C/A with synthetic fixture (test only) ----------
    ctx,p,errs=new_ctx(b, fixture=True)
    p.goto(URL+"#/profile"); p.wait_for_selector("#identifier")
    p.fill("#identifier","12"); p.click("[data-act=sendotp]")
    check("otp: invalid identifier rejected", "valid mobile number" in txt(p,"#otpStatus"))
    p.fill("#identifier","+919876543210"); p.click("[data-act=sendotp]")
    st=txt(p,"#otpStatus"); code=re.search(r"OTP is (\d{6})", st)
    check("otp: demo code generated and labelled DEMO MODE", code and "DEMO MODE" in st, st)
    p.fill("#otp","000000" if code.group(1)!="000000" else "111111"); p.click("[data-act=verifyotp]")
    check("otp: wrong code rejected", "Invalid OTP" in txt(p,"#otpStatus"))
    p.fill("#otp",code.group(1)); p.click("[data-act=verifyotp]")
    p.wait_for_selector("text=Signed in")
    check("otp: login success", "+919876543210" in txt(p))
    p.fill("#pr_name","Test User"); p.select_option("#pr_transport","Local Train"); p.click("[data-act=saveprofile]")
    check("profile: saved", "Profile saved" in txt(p))
    p.goto(URL+"#/saved"); p.wait_for_selector("#p_label")
    p.select_option("#p_label","Home"); p.fill("#p_station","Omega"); p.fill("#p_dist","400"); p.click("[data-act=saveplace]")
    p.wait_for_selector("table td:has-text('Home')")
    p.select_option("#p_label","College"); p.fill("#p_station","Alpha"); p.fill("#p_dist","640"); p.click("[data-act=saveplace]")
    p.click("[data-act=editplace] >> nth=0"); check("saved: edit loads form", p.input_value("#p_station") in ("Omega","Alpha"))
    p.click("[data-act=cancelplace]")
    # college schedule
    p.goto(URL+"#/college"); p.wait_for_selector("#c_s_Mon")
    for d in ["Mon","Tue","Thu","Fri","Sat"]:
        p.fill(f"#c_s_{d}","09:00"); p.fill(f"#c_e_{d}","14:00")
    p.check("#c_h_Wed")
    check("college: holiday disables times", p.is_disabled("#c_s_Wed"))
    p.fill("#c_s_Thu","15:00"); p.click("[data-act=savesched]")
    check("college: invalid schedule (end<=start) rejected", "Thu: end time must be after start time" in txt(p,"#c_msg"))
    p.fill("#c_s_Thu","09:00"); p.fill("#c_e_Tue","13:00"); p.click("[data-act=savesched]")
    check("college: different Tue timing saved", "Schedule saved" in txt(p,"#c_msg"))
    p.fill("#o_date","2026-10-05"); p.select_option("#o_kind","extra"); p.fill("#o_end","16:00"); p.click("[data-act=addoverride]")
    check("college: extra lecture override listed", "Extra lecture" in txt(p) and "4:00 PM" in txt(p))
    p.click("[data-act=deloverride]"); check("college: override removed", "No one-day changes" in txt(p))
    # SCENARIO A
    p.goto(URL+"#/plan"); p.wait_for_selector("#from")
    p.fill("#from","College"); p.fill("#to","Home"); p.fill("#date","2026-10-05"); p.fill("#time","14:00"); p.select_option("#mode","Local Train"); p.click("[data-act=plan]")
    p.wait_for_selector("#result dl")
    r=txt(p,"#result")
    check("SCENARIO A: next scheduled 2:15 PM", "2:15 PM" in r, r)
    check("SCENARIO A: walk 8 min est, arrival 2:55 PM, final 3:00 PM, total 60", "8 min" in r and "2:55 PM" in r and "3:00 PM" in r and "60 min" in r, r)
    rl=r.lower()
    check("SCENARIO A: labelled stored timetable + not live + fare unavailable + 0 transfers + estimated walking", "stored timetable" in rl and "not live" in rl and "fare information unavailable" in rl and re.search(r"transfers\s+0 ", rl) and "(estimated)" in rl, r)
    # SCENARIO C
    p.click("[data-act=missed]"); r=txt(p,"#result")
    check("SCENARIO C: missed -> next scheduled 2:32 PM", "2:32 PM" in r and "1 earlier service skipped" in r, r)
    p.click("[data-act=missed]"); r=txt(p,"#result")
    check("SCENARIO C: missed last -> no further service message", "No further scheduled Local Train service" in r, r)
    # Sunday-only filter
    p.fill("#date","2026-10-04"); p.fill("#time","14:00"); p.click("[data-act=plan]"); r=txt(p,"#result")
    check("days: Sunday shows the Sunday-only service (2:20 PM) not weekday ones", "2:20 PM" in r and "2:32 PM" not in r, r)
    # local finder + missed
    p.goto(URL+"#/local"); p.wait_for_selector("#f_from")
    p.fill("#f_from","Alpha"); p.fill("#f_to","Omega"); p.fill("#f_date","2026-10-05"); p.fill("#f_time","14:05"); p.click("[data-act=find]")
    r=txt(p,"#finderOut"); check("SPEC finder: 14:05 -> Next scheduled service 2:15 PM", "Next scheduled service" in r and "2:15 PM" in r, r)
    p.click("[data-act=fmissed]"); r=txt(p,"#finderOut"); check("SPEC finder: missed -> 2:32 PM", "2:32 PM" in r.split("Later")[0] if "Later" in r else "2:32 PM" in r, r)
    # SCENARIO B
    p.goto(URL+"#/ganpati"); p.wait_for_selector(".card")
    p.fill("#m_q","Lalbaugcha"); p.click("[data-act=details]")
    d=txt(p); check("mandal details: Metro/BEST/coordinates marked unavailable, no invented data", d.count("Data unavailable")>=3, d[:400])
    p.click(".detail [data-act=mandalplan]"); p.wait_for_selector("#result .panel")
    check("SCENARIO B: Plan Journey opens planner with mandal as To, From kept, result shown", p.input_value("#to")=="Lalbaugcha Raja" and p.input_value("#from") in ("Home","College") and p.url.endswith("#/plan"))
    r=txt(p,"#result"); check("SCENARIO B: honest result (no stored link to Chinchpokli) not crash", ("No route found" in r or "Suggested" in r) and True, r[:300])
    check("SCENARIO B: result explains data gap instead of inventing a route", "No stored Local Train service found" in r or "No route found" in r, r)
    # reminders with mocked clock
    p.clock.install(time="2026-10-05T13:40:00+05:30")
    p.goto(URL+"#/notifications"); p.wait_for_selector("text=Today's reminders")
    r=txt(p); check("reminders: today's list built (1:45 PM, 2:00 PM, recommended departure)", "1:45 PM" in r and "2:00 PM" in r and "Recommended departure: 2:07 PM for the 2:15 PM Local Train" in r and "not live" in r, r[:600])
    p.clock.run_for(25*60*1000)  # to 14:05
    r=txt(p); check("reminders: fired at the right times (history populated)", "Your college is ending soon." in r and "College ended. Ready to plan your journey?" in r, r[-500:])
    p.click("[data-act=clearnotif]"); check("reminders: history cleared", "No notifications yet" in txt(p))
    # settings
    p.goto(URL+"#/settings"); p.fill("#s_pace","500"); p.click("[data-act=savesettings]")
    check("settings: pace validated", "between 30 and 150" in txt(p))
    p.fill("#s_pace","60"); p.click("[data-act=savesettings]"); check("settings: pace saved", "Settings saved" in txt(p))
    p.goto(URL+"#/profile"); p.click("[data-act=logout]"); check("logout works", "guest" in low(p) and "send otp" in low(p))
    check("no console errors (fixture block)", not errs, errs)
    ctx.close()

    # ---------- demo toggle with real shipped placeholders ----------
    ctx,p,errs=new_ctx(b)
    p.goto(URL+"#/settings"); p.wait_for_selector("#s_demo"); p.check("#s_demo"); p.click("[data-act=savesettings]")
    p.goto(URL+"#/local"); p.wait_for_selector("#f_from")
    check("demo: banner + Sample badge shown", "demo sample data is on" in low(p) and "sample" in low(p))
    p.fill("#f_from","Bhandup"); p.fill("#f_to","CSMT"); p.fill("#f_date","2026-10-05"); p.fill("#f_time","06:05"); p.click("[data-act=find]")
    r=txt(p,"#finderOut"); check("demo: next sample service 6:15 AM, arrival 'not stored' (never invented)", "6:15 AM" in r and "not stored" in r.lower() and "sample" in r.lower(), r)
    check("no console errors (demo block)", not errs, errs)
    ctx.close()

    # ---------- responsive: no horizontal overflow, mobile + desktop ----------
    for name,vp in (("mobile",{"width":375,"height":740}),("desktop",{"width":1440,"height":900})):
        ctx,p,errs=new_ctx(b, fixture=True, viewport=vp)
        bad=[]
        for v in ["home","plan","local","bus","metro","ganpati","devi","saved","college","notifications","profile","settings"]:
            p.goto(URL+"#/"+v); p.wait_for_selector("#view section, #view .section"); p.wait_for_timeout(120)
            w=p.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
            if w[0]>w[1]+1: bad.append((v,w))
        check(f"responsive {name}: no horizontal overflow on any of 12 views", not bad, bad)
        check(f"responsive {name}: no console errors", not errs, errs)
        if name=="mobile": p.goto(URL+"#/home"); p.screenshot(path="mobile_home.png")
        if name=="desktop":
            p.goto(URL+"#/plan"); p.screenshot(path="desktop_plan.png")
        ctx.close()
    b.close()
fails=[n for n,ok in results if not ok]
print(f"\n{len(results)-len(fails)}/{len(results)} passed"); print("FAILED:",fails) if fails else None
sys.exit(1 if fails else 0)
