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
  phaseRemarks: "Phase Remarks"   // Column M
};

const SECTIONS = ["All", "Production SMS", "Production Rolling", "Scrap Management", "Distribution", "Inventory", "Quality"];
const SHIFTS = ["All", "A", "B", "C", "G"];

const SECTION_COLORS = {
  "Production SMS":     "bg-blue-100 text-blue-700",
  "Production Rolling": "bg-cyan-100 text-cyan-700",
  "Scrap Management":   "bg-orange-100 text-orange-700",
  "Distribution":       "bg-purple-100 text-purple-700",
  "Inventory":          "bg-green-100 text-green-700",
  "Quality":            "bg-pink-100 text-pink-700"
};

let RAW = [];
let state = {
  section: "All",
  shift: "All",
  phase: "",            // 🆕 No "All" — will be set to first available phase after load
  roleSort: "fte",
  roleSearch: "",
  empSearch: ""
};
let chartFTE, chartLoad;

const norm = v => (v === null || v === undefined) ? "" : String(v).trim();

// ===== STATUS BANNER =====
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
    console.log("=== GVIZ raw response (first 300 chars) ===");
    console.log(txt.substring(0, 300));

    const startIdx = txt.indexOf("{");
    const endIdx   = txt.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("Sheet is NOT publicly shared. Google returned an HTML page instead of data. Fix: Share → Anyone with link → Viewer.");
    }

    const json = JSON.parse(txt.substring(startIdx, endIdx + 1));

    if (json.status === "error") {
      const msg = (json.errors && json.errors[0] && json.errors[0].detailed_message) || "Unknown sheet error";
      throw new Error("Google API error: " + msg);
    }
    if (!json.table || !json.table.cols) {
      throw new Error("Sheet returned no table. Check the GID is correct (current: " + GID + ").");
    }

    const headers = json.table.cols.map(c => norm(c.label) || norm(c.id));
    console.log("=== Detected headers ===", headers);

    RAW = json.table.rows
      .map(r => {
        const obj = {};
        r.c.forEach((cell, i) => {
          obj[headers[i]] = cell ? (cell.v ?? cell.f ?? "") : "";
        });
        return obj;
      })
      .filter(r => norm(r[COLS.employee]) || norm(r[COLS.role]));

    console.log("=== Loaded rows ===", RAW.length);
    console.log("=== Sample row ===", RAW[0]);

    if (RAW.length === 0) {
      const missing = Object.entries(COLS).filter(([k, v]) => !headers.includes(v)).map(([k, v]) => `"${v}"`);
      if (missing.length) {
        throw new Error("Column header mismatch. Missing in your sheet: " + missing.join(", ") +
          ". Found in sheet: " + headers.join(", "));
      }
      throw new Error("Sheet loaded but 0 employee rows found. Check the data and GID.");
    }

    if (!headers.includes(COLS.phaseRemarks)) {
      console.warn("⚠️ 'Phase Remarks' column not found in sheet. Phase filter will be empty.");
    }

    // 🆕 Auto-select first phase if none selected yet (since we removed "All")
    const uniquePhases = [...new Set(
      RAW.map(r => norm(r[COLS.phaseRemarks])).filter(Boolean)
    )].sort();
    if (!state.phase || !uniquePhases.includes(state.phase)) {
      state.phase = uniquePhases[0] || "";
    }

    setStatus("✅ Last updated: " + new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) + " · " + RAW.length + " rows");

    buildFilters();
    render();
  } catch (e) {
    console.error("Fetch error:", e);
    setStatus("⚠️ " + e.message, true);
    buildFilters();
  }
}

// ===== FILTERS =====
function applyFilters() {
  return RAW.filter(r => {
    if (state.section !== "All" && norm(r[COLS.section]) !== state.section) return false;
    if (state.shift   !== "All" && norm(r[COLS.shift])   !== state.shift)   return false;
    // 🆕 Phase always required (no "All" option)
    if (state.phase && norm(r[COLS.phaseRemarks]) !== state.phase) return false;
    return true;
  });
}

function buildFilters() {
  // ----- SECTION -----
  const sec = document.getElementById("sectionFilters");
  if (sec) {
    sec.innerHTML = SECTIONS.map(s => `
      <button data-sec="${s}" class="px-4 py-1 rounded-full text-sm border ${state.section===s?'bg-slate-800 text-white':'bg-white'}">${s}</button>
    `).join("");
    sec.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.section = b.dataset.sec; buildFilters(); render();
    });
  }

  // ----- SHIFT -----
  const shf = document.getElementById("shiftFilters");
  if (shf) {
    shf.innerHTML = SHIFTS.map(s => {
      const count = s === "All"
        ? RAW.filter(r => state.section === "All" || norm(r[COLS.section]) === state.section).length
        : RAW.filter(r => (state.section === "All" || norm(r[COLS.section]) === state.section) && norm(r[COLS.shift]) === s).length;
      return `<button data-shf="${s}" class="px-4 py-1 rounded-full text-sm border ${state.shift===s?'bg-purple-600 text-white':'bg-white'}">${s} <span class="opacity-70">(${count})</span></button>`;
    }).join("");
    shf.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.shift = b.dataset.shf; buildFilters(); render();
    });
  }

  // ----- 🆕 PHASE REMARKS (NO "All" option) -----
  const ph = document.getElementById("phaseFilters");
  if (ph) {
    const uniquePhases = [...new Set(
      RAW.map(r => norm(r[COLS.phaseRemarks])).filter(Boolean)
    )].sort();

    if (uniquePhases.length === 0) {
      ph.innerHTML = `<span class="text-xs text-slate-400 italic">No phase data available</span>`;
      return;
    }

    ph.innerHTML = uniquePhases.map(p => {
      const count = RAW.filter(r =>
        (state.section === "All" || norm(r[COLS.section]) === state.section) &&
        (state.shift   === "All" || norm(r[COLS.shift])   === state.shift) &&
        norm(r[COLS.phaseRemarks]) === p
      ).length;
      return `<button data-phase="${p}" class="px-4 py-1 rounded-full text-sm border ${state.phase===p?'bg-emerald-600 text-white':'bg-white'}">${p} <span class="opacity-70">(${count})</span></button>`;
    }).join("");

    ph.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.phase = b.dataset.phase; buildFilters(); render();
    });
  }
}

// ===== UI HELPERS =====
function workloadColor(pct) {
  if (pct > 100) return "bg-red-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-green-500";
}
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
  const total = data.length;
  const roles =
