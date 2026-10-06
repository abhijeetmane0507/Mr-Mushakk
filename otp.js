/*
 Mr Mushakk OTP adapter
 ----------------------
 OTP is the ONLY external-service hook in this project, and it is isolated here.
 The transport planner never touches this file.

 DEMO MODE (default): the code is generated in the browser and shown on screen so the
 login flow can be demonstrated. This is NOT secure and must not be used in production.

 PRODUCTION: set  window.MUSHAKK_OTP_ENDPOINT = "https://your-server/otp"  before this file loads.
 The adapter then calls
    POST {endpoint}/request  {identifier}          -> {ok:true}
    POST {endpoint}/verify   {identifier, code}    -> {ok:true}
 Provider secrets must live on that server, never in frontend JavaScript.
*/
let demoOtp = null, demoOtpFor = null, demoOtpExpires = 0, otpBusy = false;

function otpStatus(msg, bad) {
  const el = document.getElementById("otpStatus");
  if (el) { el.textContent = msg; el.className = "note" + (bad ? " warning" : ""); }
}
function validIdentifier(id) {
  return /^\+?\d[\d\s-]{8,14}$/.test(id) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
}
async function otpCall(path, body) {
  const r = await fetch(window.MUSHAKK_OTP_ENDPOINT + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("OTP server returned " + r.status);
  return r.json();
}
async function requestOtp() {
  const el = document.getElementById("identifier");
  const id = el ? el.value.trim() : "";
  if (!id) return otpStatus("Enter mobile number or email first.", true);
  if (!validIdentifier(id)) return otpStatus("Enter a valid mobile number (e.g. +91XXXXXXXXXX) or email address.", true);
  if (otpBusy) return;
  otpBusy = true;
  try {
    if (window.MUSHAKK_OTP_ENDPOINT) {
      const res = await otpCall("/request", { identifier: id });
      if (!res.ok) throw new Error("rejected");
      otpStatus("OTP sent. Enter it below.");
    } else {
      demoOtp = String(Math.floor(100000 + Math.random() * 900000));
      demoOtpFor = id; demoOtpExpires = Date.now() + 5 * 60 * 1000;
      otpStatus("DEMO MODE (not secure): your OTP is " + demoOtp + ". Connect a real provider in otp.js for production.");
    }
  } catch (e) { otpStatus("Could not send OTP. Please try again.", true); }
  otpBusy = false;
}
async function verifyOtp() {
  const id = (document.getElementById("identifier")?.value || "").trim();
  const code = (document.getElementById("otp")?.value || "").trim();
  if (!/^\d{6}$/.test(code)) return otpStatus("Enter the 6-digit OTP.", true);
  let ok = false;
  try {
    if (window.MUSHAKK_OTP_ENDPOINT) ok = !!(await otpCall("/verify", { identifier: id, code })).ok;
    else ok = demoOtp && id === demoOtpFor && Date.now() < demoOtpExpires && code === demoOtp;
  } catch (e) { return otpStatus("Could not verify OTP. Please try again.", true); }
  if (!ok) return otpStatus(demoOtp && Date.now() >= demoOtpExpires ? "OTP expired. Request a new one." : "Invalid OTP.", true);
  demoOtp = null;
  if (typeof Mushakk !== "undefined") Mushakk.onLogin(id);
}
