// Leave empty when this site is served by the backend. If the site is hosted elsewhere (e.g. cPanel),
// set it to your backend address, for example "https://your-service.onrender.com".
const API = "";
const ST = ["Order received", "Picked up", "In transit", "Customs clearance", "Out for delivery", "Delivered"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = d => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
let token = null, D = [], Q = [];
try { token = sessionStorage.getItem("sfx_t"); } catch (e) {}
function setToken(t) { token = t; try { t ? sessionStorage.setItem("sfx_t", t) : sessionStorage.removeItem("sfx_t"); } catch (e) {} }

async function api(path, opt = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token && path.startsWith("/api/admin/") && !path.endsWith("/login")) headers.Authorization = "Bearer " + token;
  let r;
  try { r = await fetch(API + path, { ...opt, headers }); }
  catch (e) { throw new Error("Can’t reach the server. Check your connection and try again."); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && token && !path.endsWith("/login")) { setToken(null); route(); }
  if (!r.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

$("#tf").onsubmit = async e => {
  e.preventDefault();
  const id = $("#tid").value.trim(), o = $("#tres");
  if (!id) return;
  o.textContent = "Searching…";
  try {
    const x = await api("/api/track/" + encodeURIComponent(id));
    const when = i => { const h = (x.history || []).filter(k => k.s === i).pop(); return h ? ` <small>${day(h.at)}</small>` : ""; };
    o.innerHTML = `<b>${esc(x.id)}</b> · ${esc(x.origin)} to ${esc(x.destination)}<br><small>${esc(x.service)} · Status: <b>${ST[x.status]}</b>${x.est_delivery ? "<br>Estimated delivery: " + day(x.est_delivery + "T12:00:00") : ""}</small><ul class="tl">${ST.map((t, i) => `<li class="${i <= x.status ? "on" : ""}${i == x.status ? " cur" : ""}">${t}${i <= x.status ? when(i) : ""}</li>`).join("")}</ul>`;
  } catch (err) { o.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
};

$("#qf").onsubmit = async e => {
  e.preventDefault();
  const r = $("#qr"); r.className = "ok"; r.textContent = "Sending…";
  try {
    await api("/api/quote", { method: "POST", body: JSON.stringify({ name: $("#qn").value, email: $("#qe").value, origin: $("#qa").value, destination: $("#qb").value, service: $("#qs").value, details: $("#qm").value }) });
    r.textContent = "Thank you, " + $("#qn").value + ". We’ll email your quote within one business day.";
    e.target.reset();
  } catch (err) { r.className = "err"; r.textContent = err.message; }
};

function draw() {
  $("#kp").innerHTML = `<div><b>${D.length}</b>total shipments</div><div><b>${D.filter(i => i.status > 0 && i.status < 5).length}</b>in progress</div><div><b>${D.filter(i => i.status == 5).length}</b>delivered</div><div><b>${Q.length}</b>quote requests</div>`;
  $("#tb").innerHTML = D.map(i => `<tr><td><b>${esc(i.id)}</b></td><td>${esc(i.sender)} → ${esc(i.receiver)}</td><td>${esc(i.origin)} → ${esc(i.destination)}</td><td>${esc(i.weight_kg ?? "—")} kg</td><td><select data-pay="${esc(i.id)}" aria-label="Payment for ${esc(i.id)}">${PAY.map(p => `<option${p == i.payment_status ? " selected" : ""}>${p}</option>`).join("")}</select></td><td><select data-id="${esc(i.id)}" aria-label="Status for ${esc(i.id)}">${ST.map((t, k) => `<option value="${k}"${k == i.status ? " selected" : ""}>${t}</option>`).join("")}</select></td><td style="white-space:nowrap"><button class="btn s" data-rc="${esc(i.id)}">Receipt</button> <button class="btn o s" data-del="${esc(i.id)}">Delete</button></td></tr>`).join("") || '<tr><td colspan="7">No shipments yet. Create the first one above.</td></tr>';
  $("#qb").innerHTML = Q.map(q => `<tr><td>${day(q.created_at)}</td><td>${esc(q.name)}</td><td>${esc(q.email)}</td><td>${esc(q.origin)} → ${esc(q.destination)}</td><td>${esc(q.service)}</td><td>${esc(q.details)}</td></tr>`).join("") || '<tr><td colspan="6">No quote requests yet.</td></tr>';
}
async function load() {
  try {
    [D, Q] = await Promise.all([api("/api/admin/shipments"), api("/api/admin/quotes")]);
    $("#ae").textContent = ""; draw();
  } catch (err) { $("#ae").textContent = err.message; }
}
async function act(fn) { try { await fn(); $("#ae").textContent = ""; await load(); } catch (err) { $("#ae").textContent = err.message; } }

$("#tb").onchange = e => { const t = e.target, id = t.dataset.id || t.dataset.pay; if (id) act(() => api("/api/admin/shipments/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(t.dataset.pay ? { payment_status: t.value } : { status: +t.value }) })); };
$("#tb").onclick = e => {
  const rc = e.target.dataset.rc, id = e.target.dataset.del;
  if (rc) { const x = D.find(i => i.id === rc); if (x) receipt(x); }
  else if (id && confirm("Delete shipment " + id + "?")) act(() => api("/api/admin/shipments/" + encodeURIComponent(id), { method: "DELETE" }));
};
const FIELDS = { sender: "cs", sender_phone: "csp", receiver: "cr", receiver_phone: "crp", receiver_address: "cra", origin: "co", destination: "cd", service: "cv", description: "cde", pieces: "cpc", weight_kg: "cw", est_delivery: "ce", amount: "ca", currency: "cu", payment_status: "cps", payment_method: "cpm" };
$("#cf").onsubmit = async e => {
  e.preventDefault();
  const f = e.target, s = Object.fromEntries(Object.entries(FIELDS).map(([k, id]) => [k, $("#" + id).value]));
  try {
    const r = await api("/api/admin/shipments", { method: "POST", body: JSON.stringify(s) });
    $("#cm").textContent = "Created " + r.id; f.reset(); load();
    receipt({ ...s, id: r.id, created_at: r.created_at, status: 0 });
  } catch (err) { $("#cm").textContent = ""; $("#ae").textContent = err.message; }
};
$("#lb").onclick = async () => {
  $("#le").textContent = "";
  try { const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("#pw").value }) }); setToken(r.token); $("#pw").value = ""; route(); }
  catch (err) { $("#le").textContent = err.message; }
};
$("#pw").onkeydown = e => { if (e.key === "Enter") $("#lb").click(); };
$("#out").onclick = () => { setToken(null); route(); };

const PAY = ["Pending", "Paid", "Partially paid"];
const K39 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ*", P39 = "nnnwwnwnn wnnwnnnnw nnwwnnnnw wnwwnnnnn nnnwwnnnw wnnwwnnnn nnwwwnnnn nnnwnnwnw wnnwnnwnn nnwwnnwnn wnnnnwnnw nnwnnwnnw wnwnnwnnn nnnnwwnnw wnnnwwnnn nnwnwwnnn nnnnnwwnw wnnnnwwnn nnwnnwwnn nnnnwwwnn wnnnnnnww nnwnnnnww wnwnnnnwn nnnnwnnww wnnnwnnwn nnwnwnnwn nnnnnnwww wnnnnnwwn nnwnnnwwn nnnnwnwwn wwnnnnnnw nwwnnnnnw wwwnnnnnn nwnnwnnnw wwnnwnnnn nwwnwnnnn nwnnwnwnn".split(" ");
function barcode(t) {
  let x = 0, r = "";
  for (const c of "*" + String(t).toUpperCase().replace(/[^0-9A-Z]/g, "") + "*") {
    const p = P39[K39.indexOf(c)];
    for (let i = 0; i < 9; i++) { const w = p[i] == "w" ? 3 : 1; if (i % 2 == 0) r += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w; }
    x += 1;
  }
  return `<svg viewBox="0 0 ${x} 40" class="bc" preserveAspectRatio="none" role="img" aria-label="Barcode for ${esc(t)}">${r}</svg>`;
}
function receipt(s) {
  const m = v => v || "—";
  const money = (a, c) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c || "USD" }).format(a || 0); } catch (e) { return (c || "") + " " + (a || 0); } };
  const pay = s.payment_status || "Pending", cls = pay === "Paid" ? "pd" : pay === "Pending" ? "pn" : "pp";
  $("#rcb").innerHTML = `<div class="rh"><div class="lg2"><i></i><div><h2>Steadfast Express</h2><span>Worldwide logistics</span></div></div><div class="rm"><b>SHIPPING RECEIPT</b><span>No. R-${esc(String(s.id).slice(3))}</span><span>Issued ${day(s.created_at || Date.now())}</span></div></div>
<div class="rt"><div><small>Tracking number</small><b>${esc(s.id)}</b>${barcode(s.id)}</div><div class="bd ${cls}">${esc(pay)}</div></div>
<div class="rg"><div><h4>Sender</h4><p><b>${esc(s.sender)}</b><br>${esc(m(s.sender_phone))}<br>${esc(s.origin)}</p></div><div><h4>Receiver</h4><p><b>${esc(s.receiver)}</b><br>${esc(m(s.receiver_phone))}<br>${esc(m(s.receiver_address))}<br>${esc(s.destination)}</p></div></div>
<table class="it"><thead><tr><th>Description</th><th>Pieces</th><th>Weight</th><th>Service</th></tr></thead><tbody><tr><td>${esc(m(s.description))}</td><td>${esc(s.pieces || 1)}</td><td>${esc(s.weight_kg || "—")} kg</td><td>${esc(s.service)}</td></tr></tbody></table>
<div class="ft"><div><small>Estimated delivery</small><b>${s.est_delivery ? day(s.est_delivery + "T12:00:00") : "To be confirmed"}</b><small>Payment method</small><b>${esc(m(s.payment_method))}</b></div><div class="tot"><span>Shipping charge</span><b>${money(s.amount, s.currency)}</b><span>Payment status</span><b>${esc(pay)}</b></div></div>
<p class="nt">This receipt confirms we have recorded your shipment. Keep it to track your parcel at ${esc(location.origin)} and for any claim or enquiry. Questions? Email support@steadfastexpress.com</p><p class="ty">Thank you for choosing Steadfast Express.</p>`;
  $("#rc").hidden = false;
}
$("#rp").onclick = () => window.print();
$("#rx").onclick = () => { $("#rc").hidden = true; };
addEventListener("keydown", e => { if (e.key === "Escape") $("#rc").hidden = true; });

function route() {
  const a = location.hash === "#admin";
  $("#site").hidden = a; $("#admin").hidden = !a; $("#login").hidden = !!token; $("#dash").hidden = !token;
  if (a && token) load();
  if (!a) { const t = document.getElementById(location.hash.slice(1)); t ? t.scrollIntoView() : window.scrollTo(0, 0); } else window.scrollTo(0, 0);
}
addEventListener("hashchange", route); route();
