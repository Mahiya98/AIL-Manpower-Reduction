// ===== CONFIG =====
const SHEET_ID = "1fx3FFlAPbF-_nbHEjUtEDrWW8LIwyygfYBZTwSVEVJw";
const GID = "58409945";
const SHIFT_BASELINE = 480;

const COLS = {
  section: "Section",
  shift: "Shift",
  employee: "Employee Name",
  enroll: "Employee Enroll",
  role: "Role",
  taskMin: "Actual Time/ Shift",
  phaseRemarks: "Phase Remarks"
};

// ✅ DYNAMIC — auto-populated from Google Sheet
let SECTIONS = ["All"];
const SHIFTS = ["All", "A", "B", "C", "G"];

// ✅ Base colors (new sections get auto-assigned colors)
const SECTION_COLORS = {
  "Production SMS":     "bg-blue-100 text-blue-700",
  "Production Rolling": "bg-cyan-100 text-cyan-700",
  "Scrap Management":   "bg-orange-100 text-orange-700",
  "Distribution":       "bg-purple-100 text-purple-700",
  "Inventory":          "bg-green-100 text-green-700",
  "Quality":            "bg-pink-100 text-pink-700",
  "HR-Admin":           "bg-yellow-100 text-yellow-700",
  "Sustainability":     "bg-teal-100 text-teal-700",
  "Civil":              "bg-stone-100 text-stone-700"
};

// ✅ Auto-assign colors to any future new section
const COLOR_POOL = [
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-lime-100 text-lime-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700"
];
let _colorIdx = 0;
function ensureSectionColor(name) {
  if (!name) return;
  if (!SECTION_COLORS[name]) {
    SECTION_COLORS[name] = COLOR_POOL[_colorIdx % COLOR_POOL.length];
    _colorIdx++;
  }
}

let RAW = [];
let state = {
  section: "All",
  shift: "All",
  phase: "All",
  roleSort: "fte",
  roleSearch: "",
  empSearch: ""
};
let chartFTE, chartLoad;

const norm = v => (v === null || v === undefined) ? "" : String(v).trim();

// =============================================================================
// UNIQUE-EMPLOYEE HELPERS
// =============================================================================
const enrollOf = r => norm(r[COLS.enroll]).replace(/[,\s]/g, "");

function uniqEmpCount(rows) {
  const s = new Set();
  for (const r of rows) {
    const id = enrollOf(r);
    if (id) s.add(id);
  }
  return s.size;
}

function uniqEmpWhere(rows, predicate) {
  const s = new Set();
  for (const r of rows) {
    if (!predicate(r)) continue;
    const id = enrollOf(r);
    if (id) s.add(id);
  }
  return s.size;
}

// ===== STATUS =====
function setStatus(msg, isError = false) {
  const el = document.getElementById("lastUpdated");
  if (!el) return;
  el.textContent = msg;
  el.className = "text-right text-xs " + (isError ? "text-red-600 font-semibold" : "text-slate-500");
}

// ===== FETCH =====
async function fetchData() {
  setStatus("⏳ Loading data from Google Sheets…");
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&t=${Date.now()}`;
  try {
    const res = await fetch(gvizUrl);
    const txt = await res.text();
    const startIdx = txt.indexOf("{");
    const endIdx   = txt.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) throw new Error("Sheet is NOT publicly shared. Share → Anyone with link → Viewer.");

    const json = JSON.parse(txt.substring(startIdx, endIdx + 1));
    if (json.status === "error") throw new Error("Google API: " + (json.errors?.[0]?.detailed_message || "unknown"));
    if (!json.table?.cols) throw new Error("Sheet returned no table. Check GID: " + GID);

    const headers = json.table.cols.map(c => norm(c.label) || norm(c.id));
    RAW = json.table.rows
      .map(r => {
        const obj = {};
        r.c.forEach((cell, i) => { obj[headers[i]] = cell ? (cell.v ?? cell.f ?? "") : ""; });
        return obj;
      })
      .filter(r => norm(r[COLS.employee]) || norm(r[COLS.role]));

    if (RAW.length === 0) {
      const missing = Object.values(COLS).filter(v => !headers.includes(v));
      throw new Error(missing.length
        ? "Missing columns: " + missing.join(", ") + " · Found: " + headers.join(", ")
        : "Sheet loaded but 0 rows found.");
    }

    // ===== ✅ AUTO-GENERATE SECTIONS FROM SHEET =====
    const dynamicSections = [...new Set(
      RAW.map(r => norm(r[COLS.section])).filter(Boolean)
    )].sort();
    SECTIONS = ["All", ...dynamicSections];
    dynamicSections.forEach(s => ensureSectionColor(s));

    // If currently selected section disappeared from sheet, reset to All
    if (state.section !== "All" && !SECTIONS.includes(state.section)) {
      state.section = "All";
    }

    const totalEmp = uniqEmpCount(RAW);
    setStatus(`✅ Last updated ${new Date().toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})} · ${RAW.length} task rows · ${totalEmp} unique employees · ${dynamicSections.length} sections`);

    buildFilters();
    render();
  } catch (e) {
    console.error(e);
    setStatus("⚠️ " + e.message, true);
    buildFilters();
  }
}

// ===== FILTERS =====
function applyFilters() {
  return RAW.filter(r => {
    if (state.section !== "All" && norm(r[COLS.section])      !== state.section) return false;
    if (state.shift   !== "All" && norm(r[COLS.shift])        !== state.shift)   return false;
    if (state.phase   !== "All" && norm(r[COLS.phaseRemarks]) !== state.phase)   return false;
    return true;
  });
}

function buildFilters() {
  // ----- SECTION -----
  const sec = document.getElementById("sectionFilters");
  if (sec) {
    sec.innerHTML = SECTIONS.map(s => {
      const count = uniqEmpWhere(RAW, r =>
        (s === "All" || norm(r[COLS.section]) === s) &&
        (state.shift === "All" || norm(r[COLS.shift])        === state.shift) &&
        (state.phase === "All" || norm(r[COLS.phaseRemarks]) === state.phase)
      );
      return `<button data-sec="${s}" class="px-4 py-1 rounded-full text-sm border ${state.section===s?'bg-slate-800 text-white':'bg-white'}">${s} <span class="opacity-70">(${count})</span></button>`;
    }).join("");
    sec.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.section = b.dataset.sec; buildFilters(); render();
    });
  }

  // ----- SHIFT -----
  const shf = document.getElementById("shiftFilters");
  if (shf) {
    shf.innerHTML = SHIFTS.map(s => {
      const count = uniqEmpWhere(RAW, r =>
        (state.section === "All" || norm(r[COLS.section]) === state.section) &&
        (s === "All" || norm(r[COLS.shift]) === s) &&
        (state.phase === "All" || norm(r[COLS.phaseRemarks]) === state.phase)
      );
      return `<button data-shf="${s}" class="px-4 py-1 rounded-full text-sm border ${state.shift===s?'bg-purple-600 text-white':'bg-white'}">${s} <span class="opacity-70">(${count})</span></button>`;
    }).join("");
    shf.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.shift = b.dataset.shf; buildFilters(); render();
    });
  }

  // ----- PHASE REMARKS -----
  const ph = document.getElementById("phaseFilters");
  if (ph) {
    const uniquePhases = [...new Set(RAW.map(r => norm(r[COLS.phaseRemarks])).filter(Boolean))].sort();
    const phases = ["All", ...uniquePhases];
    ph.innerHTML = phases.map(p => {
      const count = uniqEmpWhere(RAW, r =>
        (state.section === "All" || norm(r[COLS.section]) === state.section) &&
        (state.shift   === "All" || norm(r[COLS.shift])   === state.shift) &&
        (p === "All" || norm(r[COLS.phaseRemarks]) === p)
      );
      return `<button data-phase="${p}" class="px-4 py-1 rounded-full text-sm border ${state.phase===p?'bg-emerald-600 text-white':'bg-white'}">${p} <span class="opacity-70">(${count})</span></button>`;
    }).join("");
    ph.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.phase = b.dataset.phase; buildFilters(); render();
    });
  }
}

// ===== UI HELPERS =====
function workloadColor(pct) { return pct > 100 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500"; }
function loadBar(pct) {
  const cap = Math.min(pct, 220);
  return `<div class="flex items-center gap-2">
    <div class="flex-1 bg-slate-200 rounded h-1.5">
      <div class="${workloadColor(pct)} h-1.5 rounded" style="width:${(cap/220)*100}%"></div>
    </div>
    <span class="text-xs ${pct>100?'text-red-600':pct<60?'text-green-600':'text-amber-600'} font-mono">${Math.round(pct)}%</span>
  </div>`;
}

// ===== KPI CARDS =====
function renderKPIs(data) {
  const total = uniqEmpCount(data);
  const roles = new Set(data.map(r => norm(r[COLS.role])).filter(Boolean)).size;
  const totalMin = data.reduce((s, r) => s + (Number(r[COLS.taskMin]) || 0), 0);
  const requiredFTE = totalMin / SHIFT_BASELINE;

  const roleMap = {};
  data.forEach(r => {
    const k = norm(r[COLS.section]) + "|" + norm(r[COLS.role]);
    if (!roleMap[k]) roleMap[k] = {
      section: norm(r[COLS.section]),
      role: norm(r[COLS.role]),
      enrolls: new Set(),
      min: 0,
      phases: new Set()
    };
    const id = enrollOf(r);
    if (id) roleMap[k].enrolls.add(id);
    roleMap[k].min += Number(r[COLS.taskMin]) || 0;
    const ph = norm(r[COLS.phaseRemarks]);
    if (ph) roleMap[k].phases.add(ph);
  });
  const roles_ = Object.values(roleMap).map(x => {
    const hc = x.enrolls.size;
    const fte = x.min / SHIFT_BASELINE;
    return {
      section: x.section,
      role: x.role,
      hc,
      min: x.min,
      fte,
      load: hc ? (fte / hc) * 100 : 0,
      phases: [...x.phases]
    };
  });

  const overloaded = roles_.filter(r => r.load > 100).length;
  const under      = roles_.filter(r => r.load < 60).length;

  const sectionAvg = sec => {
    const rs = roles_.filter(r => r.section === sec);
    if (!rs.length) return null;
    return rs.reduce((s, r) => s + r.load, 0) / rs.length;
  };
  const avgAll = roles_.length ? roles_.reduce((s, r) => s + r.load, 0) / roles_.length : 0;

  const card = (label, val, sub, color = "text-slate-800", badge = "") => `
    <div class="bg-white p-3 rounded-xl border shadow-sm">
      <p class="text-[10px] text-slate-500 uppercase tracking-wide">${label}</p>
      <p class="text-2xl font-bold ${color} my-1">${val}</p>
      <p class="text-[11px] text-slate-500">${sub}</p>
      ${badge}
    </div>`;
  const tag = (txt, cls) => `<span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] ${cls}">${txt}</span>`;
  const fmt = v => v === null ? "—" : v.toFixed(1) + "%";

  // ✅ Build base KPI cards
  const baseCards = [
    card("Total Employees", total, "Unique Employee Enroll (col F)"),
    card("Unique Roles", roles, "Distinct role names", "text-slate-800", tag("All shifts", "bg-blue-50 text-blue-700")),
    card("Required FTE", requiredFTE.toFixed(1), "480 min standard shift", "text-slate-800", tag(`${avgAll.toFixed(1)}% avg load`, "bg-amber-50 text-amber-700")),
    card("Overloaded Roles", overloaded, "Workload > 100%", "text-red-600", tag("Action needed", "bg-red-50 text-red-700")),
    card("Underutilised Roles", under, "Workload < 60%", "text-blue-600", tag("Review capacity", "bg-blue-50 text-blue-700"))
  ];

  // ✅ DYNAMIC — auto-generate Avg Load card for EACH section in sheet
  const dynamicSections = SECTIONS.filter(s => s !== "All");
  const sectionCards = dynamicSections.map(sec => {
    const avg = sectionAvg(sec);
    const colorClass = SECTION_COLORS[sec] || "bg-slate-50 text-slate-700";
    return card(
      `${sec} Avg Load`,
      fmt(avg),
      `${sec} section`,
      "text-slate-800",
      tag("Live", colorClass)
    );
  });

  document.getElementById("kpiCards").innerHTML = [...baseCards, ...sectionCards].join("");

  return { roles_ };
}

// ===== CHARTS =====
function renderCharts(data) {
  const map = {};
  data.forEach(r => {
    const s = norm(r[COLS.section]); if (!s) return;
    if (!map[s]) map[s] = { enrolls: new Set(), min: 0 };
    const id = enrollOf(r);
    if (id) map[s].enrolls.add(id);
    map[s].min += Number(r[COLS.taskMin]) || 0;
  });
  const labels = Object.keys(map).sort();
  const fte = labels.map(l => +(map[l].min / SHIFT_BASELINE).toFixed(1));
  const hc  = labels.map(l => map[l].enrolls.size);

  if (chartFTE) chartFTE.destroy();
  chartFTE = new Chart(document.getElementById("chartFTE"), {
    type: "bar",
    data: { labels, datasets: [
      { label: "Required FTE", data: fte, backgroundColor: "#1e3a8a" },
      { label: "Headcount (unique)", data: hc, backgroundColor: "#bfdbfe" }
    ]},
    options: { responsive: true, plugins: { legend: { position: "top" } } }
  });

  const loads = labels.map(l => {
    const rows = data.filter(r => norm(r[COLS.section]) === l);
    const roleMap = {};
    rows.forEach(r => {
      const k = norm(r[COLS.role]);
      if (!roleMap[k]) roleMap[k] = { enrolls: new Set(), min: 0 };
      const id = enrollOf(r);
      if (id) roleMap[k].enrolls.add(id);
      roleMap[k].min += Number(r[COLS.taskMin]) || 0;
    });
    const arr = Object.values(roleMap).map(x => x.enrolls.size ? (x.min / SHIFT_BASELINE) / x.enrolls.size * 100 : 0);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  });

  if (chartLoad) chartLoad.destroy();
  chartLoad = new Chart(document.getElementById("chartLoad"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Avg Workload %", data: loads.map(x => +x.toFixed(1)), backgroundColor: "#d97706" }] },
    options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } } }
  });
}

// ===== ROLE TABLE & ALERTS =====
function renderRoleTable(roles_) {
  const q = state.roleSearch.toLowerCase();
  let rows = roles_.filter(r => !q ||
    r.role.toLowerCase().includes(q) ||
    r.section.toLowerCase().includes(q) ||
    r.phases.join(" ").toLowerCase().includes(q));

  rows.sort((a, b) => state.roleSort === "fte" ? b.fte - a.fte : b.load - a.load);

  document.getElementById("roleTable").innerHTML = rows.map(r => {
    const phaseTags = r.phases.length
      ? r.phases.map(p => `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 mr-1">${p}</span>`).join("")
      : `<span class="text-slate-400 text-xs">—</span>`;
    return `<tr class="border-t hover:bg-slate-50">
      <td class="p-2"><span class="px-2 py-0.5 rounded text-xs ${SECTION_COLORS[r.section] || 'bg-slate-100'}">${r.section}</span></td>
      <td class="p-2">${r.role}</td>
      <td class="p-2 text-center">${r.hc}</td>
      <td class="p-2 text-center font-mono">${r.fte.toFixed(2)}</td>
      <td class="p-2 w-48">${loadBar(r.load)}</td>
      <td class="p-2">${phaseTags}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="p-4 text-center text-slate-400">No roles match.</td></tr>`;

  const over = rows.filter(r => r.load > 100).sort((a, b) => b.load - a.load);
  const und  = rows.filter(r => r.load < 60).sort((a, b) => a.load - b.load);

  document.getElementById("alerts").innerHTML = [
    ...over.map(r => `<div class="flex justify-between items-center p-2 bg-red-50 rounded-lg">
        <div class="flex items-center gap-2"><span class="text-red-600">↑</span>
          <div><p class="text-sm font-medium">${r.role}</p>
          <p class="text-xs"><span class="px-1.5 py-0.5 rounded ${SECTION_COLORS[r.section]||''}">${r.section}</span> <span class="text-red-600">Overloaded</span>${r.phases.length?' · <span class="text-emerald-700">'+r.phases.join(", ")+'</span>':''}</p></div>
        </div>
        <span class="text-red-600 font-mono text-sm">${Math.round(r.load)}%</span></div>`),
    ...und.map(r => `<div class="flex justify-between items-center p-2 bg-cyan-50 rounded-lg">
        <div class="flex items-center gap-2"><span class="text-cyan-600">↓</span>
          <div><p class="text-sm font-medium">${r.role}</p>
          <p class="text-xs"><span class="px-1.5 py-0.5 rounded ${SECTION_COLORS[r.section]||''}">${r.section}</span> <span class="text-cyan-600">Underutilised</span>${r.phases.length?' · <span class="text-emerald-700">'+r.phases.join(", ")+'</span>':''}</p></div>
        </div>
        <span class="text-cyan-600 font-mono text-sm">${Math.round(r.load)}%</span></div>`)
  ].join("") || `<p class="text-xs text-slate-400">No alerts</p>`;
}

// ===== EMPLOYEE TABLE =====
function renderEmployeeTable(data) {
  const q = state.empSearch.toLowerCase();

  const byEnroll = {};
  for (const r of data) {
    const id = enrollOf(r);
    if (!id) continue;
    if (!byEnroll[id]) {
      byEnroll[id] = {
        enroll: id,
        name:    norm(r[COLS.employee]),
        section: norm(r[COLS.section]),
        shift:   norm(r[COLS.shift]),
        role:    norm(r[COLS.role]),
        phase:   norm(r[COLS.phaseRemarks]),
        min:     0
      };
    }
    byEnroll[id].min += Number(r[COLS.taskMin]) || 0;
  }
  let people = Object.values(byEnroll);

  if (q) {
    people = people.filter(p =>
      p.name.toLowerCase().includes(q)    ||
      p.role.toLowerCase().includes(q)    ||
      p.section.toLowerCase().includes(q) ||
      p.phase.toLowerCase().includes(q)   ||
      p.enroll.toLowerCase().includes(q)
    );
  }

  document.getElementById("empCount").textContent = people.length + " employees";
  people.sort((a, b) => b.min - a.min);

  document.getElementById("empTable").innerHTML = people.map(p => {
    const fte  = p.min / SHIFT_BASELINE;
    const load = fte * 100;
    return `<tr class="border-t hover:bg-slate-50">
      <td class="p-2"><span class="px-2 py-0.5 rounded text-xs ${SECTION_COLORS[p.section] || 'bg-slate-100'}">${p.section}</span></td>
      <td class="p-2 text-center"><span class="px-2 py-0.5 rounded-full text-xs bg-purple-50">${p.shift}</span></td>
      <td class="p-2 font-medium">${p.name}</td>
      <td class="p-2 text-center text-slate-500">${p.enroll}</td>
      <td class="p-2">${p.role}</td>
      <td class="p-2 text-center font-mono">${p.min}</td>
      <td class="p-2 text-center font-mono ${load>100?'text-red-600':load<60?'text-green-600':'text-amber-600'}">${fte.toFixed(2)}</td>
      <td class="p-2 w-40">${loadBar(load)}</td>
      <td class="p-2">${p.phase ? `<span class="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">${p.phase}</span>` : '<span class="text-slate-400">—</span>'}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="p-4 text-center text-slate-400">No employees match.</td></tr>`;
}

// ===== RENDER =====
function render() {
  const data = applyFilters();
  const { roles_ } = renderKPIs(data);
  renderCharts(data);
  renderRoleTable(roles_);
  renderEmployeeTable(data);
}

// ===== EVENTS =====
document.getElementById("refreshBtn").onclick = fetchData;
document.getElementById("roleSearch").oninput = e => { state.roleSearch = e.target.value; render(); };
document.getElementById("empSearch").oninput  = e => { state.empSearch  = e.target.value; render(); };
document.getElementById("sortFTE").onclick = () => {
  state.roleSort = "fte";
  document.getElementById("sortFTE").classList.add("bg-blue-50");
  document.getElementById("sortLoad").classList.remove("bg-blue-50");
  render();
};
document.getElementById("sortLoad").onclick = () => {
  state.roleSort = "load";
  document.getElementById("sortLoad").classList.add("bg-blue-50");
  document.getElementById("sortFTE").classList.remove("bg-blue-50");
  render();
};

// ===== INIT =====
buildFilters();
fetchData();
setInterval(fetchData, 5 * 60 * 1000);
