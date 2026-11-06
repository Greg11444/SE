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
    o.innerHTML = `<b>${esc(x.id)}</b> · ${esc(x.origin)} to ${esc(x.destination)}<br><small>${esc(x.service)} · Status: <b>${ST[x.status]}</b></small><ul class="tl">${ST.map((t, i) => `<li class="${i <= x.status ? "on" : ""}${i == x.status ? " cur" : ""}">${t}${i <= x.status ? when(i) : ""}</li>`).join("")}</ul>`;
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
  $("#tb").innerHTML = D.map(i => `<tr><td><b>${esc(i.id)}</b></td><td>${esc(i.sender)} → ${esc(i.receiver)}</td><td>${esc(i.origin)} → ${esc(i.destination)}</td><td>${esc(i.service)}</td><td><select data-id="${esc(i.id)}" aria-label="Status for ${esc(i.id)}">${ST.map((t, k) => `<option value="${k}"${k == i.status ? " selected" : ""}>${t}</option>`).join("")}</select></td><td><button class="btn s" data-rc="${esc(i.id)}">Receipt</button> <button class="btn o s" data-del="${esc(i.id)}">Delete</button></td></tr>`).join("") || '<tr><td colspan="6">No shipments yet. Create the first one above.</td></tr>';
  $("#qb").innerHTML = Q.map(q => `<tr><td>${day(q.created_at)}</td><td>${esc(q.name)}</td><td>${esc(q.email)}</td><td>${esc(q.origin)} → ${esc(q.destination)}</td><td>${esc(q.service)}</td><td>${esc(q.details)}</td></tr>`).join("") || '<tr><td colspan="6">No quote requests yet.</td></tr>';
}
async function load() {
  try {
    [D, Q] = await Promise.all([api("/api/admin/shipments"), api("/api/admin/quotes")]);
    $("#ae").textContent = ""; draw();
  } catch (err) { $("#ae").textContent = err.message; }
}
async function act(fn) { try { await fn(); $("#ae").textContent = ""; await load(); } catch (err) { $("#ae").textContent = err.message; } }

$("#tb").onchange = e => { const id = e.target.dataset.id; if (id) act(() => api("/api/admin/shipments/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ status: +e.target.value }) })); };
$("#tb").onclick = e => {
  const rc = e.target.dataset.rc, id = e.target.dataset.del;
  if (rc) { const x = D.find(i => i.id === rc); if (x) receipt(x); }
  else if (id && confirm("Delete shipment " + id + "?")) act(() => api("/api/admin/shipments/" + encodeURIComponent(id), { method: "DELETE" }));
};
$("#cf").onsubmit = async e => {
  e.preventDefault();
  const f = e.target, s = { sender: $("#cs").value, receiver: $("#cr").value, origin: $("#co").value, destination: $("#cd").value, service: $("#cv").value };
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

function receipt(s) {
  const row = (k, v) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`;
  $("#rcb").innerHTML = `<div class="rh"><div><h2>Steadfast Express</h2><div>Shipping receipt</div></div><div style="text-align:right"><small>Date issued</small><br><b>${day(s.created_at || Date.now())}</b></div></div>
<div class="rt"><small>Tracking number</small><b>${esc(s.id)}</b></div>
<table>${row("Sender", s.sender)}${row("Receiver", s.receiver)}${row("From", s.origin)}${row("To", s.destination)}${row("Service", s.service)}${row("Status", ST[s.status || 0])}</table>
<p>Track your shipment at ${esc(location.origin)} with the tracking number above. Questions? Email support@steadfastexpress.com</p><p class="ty">Thank you for choosing Steadfast Express.</p>`;
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
