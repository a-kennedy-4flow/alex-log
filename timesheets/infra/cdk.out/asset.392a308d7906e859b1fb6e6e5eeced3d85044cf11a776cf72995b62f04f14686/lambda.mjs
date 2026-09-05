import{createRequire}from'module';const require=createRequire(import.meta.url);

// ../../packages/core/src/catalogue.ts
function toObjectKey(value) {
  return value === "proj" || value === "cc" ? value : "na";
}
var EMPTY_CATALOGUE = {
  locations: [],
  entities: [],
  holidays: {},
  workingWeekends: {},
  specifications: {},
  brokenSpecRanges: [],
  absenceTypes: [],
  timeValues: [0.5, 1],
  businessLines: [],
  projects: [],
  duplicateProjectRows: 0
};
var catalogue = { ...EMPTY_CATALOGUE };
var byWorkdayId = /* @__PURE__ */ new Map();
var absenceLabels = /* @__PURE__ */ new Set();
function absenceAsProject(absence) {
  return {
    costCentre: null,
    customerGroup: null,
    customer: null,
    customerId: null,
    projectNo: absence.projectNo,
    entity: null,
    businessLine: null,
    businessUnit: null,
    projectTitle: null,
    status: null,
    object: null,
    workdayId: absence.label,
    workdayTitle: absence.label,
    specification: null,
    hgbAllocation: null,
    businessLineKey: absence.businessLineKey,
    objectKey: absence.objectKey,
    specRange: absence.specRange
  };
}
function setCatalogue(data) {
  const projects = (data.projects ?? []).map((p) => ({
    ...p,
    objectKey: toObjectKey(p.objectKey)
  }));
  const absenceTypes = (data.absenceTypes ?? []).map((a) => ({
    ...a,
    objectKey: toObjectKey(a.objectKey)
  }));
  Object.assign(catalogue, EMPTY_CATALOGUE, data, { projects, absenceTypes });
  absenceLabels = new Set(absenceTypes.map((a) => a.label));
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  let duplicates = 0;
  for (const project of [...absenceTypes.map(absenceAsProject), ...projects]) {
    if (seen.has(project.workdayId)) {
      duplicates++;
      continue;
    }
    seen.add(project.workdayId);
    unique.push(project);
  }
  catalogue.projects = unique;
  catalogue.duplicateProjectRows = duplicates;
  byWorkdayId = new Map(unique.map((p) => [p.workdayId, p]));
  const counts = /* @__PURE__ */ new Map();
  for (const project of unique) {
    if (!project.businessLine) continue;
    counts.set(project.businessLine, (counts.get(project.businessLine) ?? 0) + 1);
  }
  catalogue.businessLines = (data.businessLines ?? []).map((line) => ({ ...line, count: counts.get(line.name) ?? 0 })).filter((line) => line.count > 0).sort((a, b) => b.count - a.count);
}
function findProject(workdayId) {
  if (!workdayId) return null;
  return byWorkdayId.get(workdayId) ?? null;
}
function businessLineKeyOf(project) {
  return project ? project.businessLineKey : "4flow";
}
function objectKeyOf(project) {
  return project ? project.objectKey : "na";
}
function allSpecifications() {
  return catalogue.specifications["spec_4flow_na"] ?? [];
}
function specificationsFor(workdayId) {
  const project = findProject(workdayId);
  const range = `spec_${businessLineKeyOf(project)}_${objectKeyOf(project)}`;
  const options = catalogue.specifications[range];
  if (options && options.length > 0) return { options, range, hasOwnList: true };
  return { options: allSpecifications(), range, hasOwnList: false };
}
function specificationIsRequired(workdayId) {
  if (workdayId === null) return false;
  return specificationsFor(workdayId).hasOwnList;
}

// ../../packages/core/src/calendar.ts
var FIRST_GRID_ROW = 5;
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function isoDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}
function isoWeek(date) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
}
function isoWeekday(date) {
  const day = (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).getUTCDay();
  return day === 0 ? 7 : day;
}
function buildMonth(year, month, location, data = catalogue) {
  const locationHolidays = new Set(location ? data.holidays[location] ?? [] : []);
  const workingWeekends = new Set(location ? data.workingWeekends[location] ?? [] : []);
  const out = [];
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = isoDate(year, month, day);
    const weekday = isoWeekday(date);
    const isHoliday = locationHolidays.has(date);
    const workingWeekend = workingWeekends.has(date);
    const isWeekend = weekday > 5 && !workingWeekend;
    out.push({
      date,
      dayOfMonth: day,
      week: isoWeek(date),
      weekday,
      nonWorking: isHoliday || isWeekend,
      holidayName: isHoliday ? date : null,
      workingWeekend
    });
  }
  return out;
}
function trackerRow(dayOfMonth, half) {
  return FIRST_GRID_ROW + (dayOfMonth - 1) * 2 + half;
}
function weeksOf(days) {
  const seen = [];
  for (const day of days) if (!seen.includes(day.week)) seen.push(day.week);
  return seen;
}
function targetDays(workingDays, workPercent, monthOverride) {
  if (monthOverride !== null) return monthOverride;
  if (workPercent === null) return workingDays;
  return Math.round(workingDays * (workPercent / 100) * 2) / 2;
}

// ../../packages/core/src/aggregate.ts
var AGGREGATE_SLOTS = 15;
function filledEntries(halfDays) {
  return halfDays.filter((h) => h.days !== null);
}
function aggregateByProject(halfDays) {
  const groups = /* @__PURE__ */ new Map();
  for (const entry of filledEntries(halfDays)) {
    const key = `${entry.workdayId ?? ""} ${entry.specification ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.days += entry.days ?? 0;
      continue;
    }
    const project = findProject(entry.workdayId);
    groups.set(key, {
      workdayId: entry.workdayId,
      specification: entry.specification,
      days: entry.days ?? 0,
      customer: project?.customer ?? null,
      projectTitle: project?.projectTitle ?? null,
      businessLine: project?.businessLine ?? null
    });
  }
  return [...groups.values()].sort((a, b) => b.days - a.days);
}
function absenceTotal(halfDays, label) {
  return filledEntries(halfDays).filter((h) => h.workdayId === label).reduce((sum, h) => sum + (h.days ?? 0), 0);
}
function totalDays(halfDays) {
  return filledEntries(halfDays).reduce((sum, h) => sum + (h.days ?? 0), 0);
}
function aggregateByWeek(halfDays, days) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rows = /* @__PURE__ */ new Map();
  for (const week of weeksOf(days)) {
    rows.set(week, { week, workingDays: 0, nonWorkingDays: 0, total: 0 });
  }
  for (const entry of filledEntries(halfDays)) {
    const day = byDate.get(entry.date);
    const row = day ? rows.get(day.week) : void 0;
    if (!day || !row) continue;
    const amount = entry.days ?? 0;
    if (day.nonWorking) row.nonWorkingDays += amount;
    else row.workingDays += amount;
    row.total += amount;
  }
  return [...rows.values()];
}
function dayTotals(halfDays) {
  const out = /* @__PURE__ */ new Map();
  for (const entry of filledEntries(halfDays)) {
    out.set(entry.date, (out.get(entry.date) ?? 0) + (entry.days ?? 0));
  }
  return out;
}

// ../../packages/core/src/validation.ts
var ALLOWED_DAYS = [0.5, 1];
function rowOf(entry, days) {
  const day = days.find((d) => d.date === entry.date);
  return day ? String(trackerRow(day.dayOfMonth, entry.half)) : entry.date;
}
function validate({
  halfDays,
  days,
  target,
  location,
  entity
}) {
  const issues = [];
  if (location === null || location === "") {
    issues.push({ severity: "error", code: "locationMissing" });
  }
  if (entity === null || entity === "") {
    issues.push({ severity: "warning", code: "entityMissing" });
  }
  const incomplete = halfDays.filter((h) => {
    const started = h.workdayId !== null || h.specification !== null || h.days !== null;
    if (!started) return false;
    if (h.workdayId === null || h.days === null) return true;
    return specificationIsRequired(h.workdayId) && h.specification === null;
  });
  if (incomplete.length > 0) {
    issues.push({
      severity: "error",
      code: "incompleteEntries",
      values: { count: incomplete.length },
      rows: incomplete.map((h) => rowOf(h, days))
    });
  }
  const badAmount = halfDays.filter((h) => h.days !== null && !ALLOWED_DAYS.includes(h.days));
  if (badAmount.length > 0) {
    issues.push({
      severity: "error",
      code: "invalidDayValue",
      values: { count: badAmount.length },
      rows: badAmount.map((h) => rowOf(h, days))
    });
  }
  const mismatched = [];
  const unverified = [];
  for (const entry of halfDays) {
    if (!entry.workdayId || !entry.specification) continue;
    const spec = specificationsFor(entry.workdayId);
    if (!spec.options.includes(entry.specification)) mismatched.push(entry);
    else if (!spec.hasOwnList) unverified.push(entry);
  }
  if (mismatched.length > 0) {
    issues.push({
      severity: "error",
      code: "specificationMismatch",
      values: { count: mismatched.length },
      rows: mismatched.map((h) => rowOf(h, days))
    });
  }
  if (unverified.length > 0) {
    issues.push({
      severity: "warning",
      code: "specificationUnverified",
      values: { count: unverified.length },
      rows: unverified.map((h) => rowOf(h, days))
    });
  }
  const overbooked = [...dayTotals(halfDays)].filter(([, amount]) => amount > 1);
  if (overbooked.length > 0) {
    issues.push({
      severity: "error",
      code: "dayOverbooked",
      values: { count: overbooked.length, dates: overbooked.map(([date]) => date).join(" ") }
    });
  }
  const total = totalDays(halfDays);
  const delta = Math.round((total - target) * 2) / 2;
  if (delta < 0) {
    issues.push({ severity: "warning", code: "daysMissing", values: { days: Math.abs(delta) } });
  } else if (delta > 0) {
    issues.push({ severity: "warning", code: "daysTooMany", values: { days: delta } });
  }
  const groups = aggregateByProject(halfDays).length;
  if (groups > AGGREGATE_SLOTS) {
    issues.push({
      severity: "warning",
      code: "aggregateOverflow",
      values: { count: groups, slots: AGGREGATE_SLOTS }
    });
  }
  return issues;
}
function hasErrors(issues) {
  return issues.some((i) => i.severity === "error");
}

// ../../packages/core/src/filename.ts
function regionOf(locationCode) {
  if (!locationCode) return "UNKNOWN";
  const withoutEntity = locationCode.split("_").slice(1).join("_");
  return withoutEntity.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function exportFilename({
  firstName,
  lastName,
  year,
  month,
  location
}) {
  const person = `${lastName}.${firstName}`.replace(/\s+/g, "");
  const period = `${year}_${String(month).padStart(2, "0")}`;
  return `${person}_${period}_projecttracker_${regionOf(location)}.xlsm`;
}

// ../../node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/index.mjs
import { createRequire } from "module";
var require2 = createRequire("/");
var _a;
var Worker;
var isMarkedAsUntransferable;
try {
  _a = require2("worker_threads"), Worker = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (ArrayBuffer.isView(val))
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i = 0; i < str.length; ++i)
      ar_1[i] = str.charCodeAt(i);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i = 0; i < files.length; ++i) {
    var f = files[i];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}

// ../../packages/xlsm-writer/src/xml.ts
function esc(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
var DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
var CONTENT_TYPES = `${DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
var ROOT_RELS = `${DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
var WORKBOOK_RELS = `${DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
var WORKBOOK = `${DECL}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets><sheet name="Tracker" sheetId="1" r:id="rId1"/></sheets>
<calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`;
var STYLE = {
  normal: 0,
  bold: 1,
  date: 2,
  header: 3,
  label: 4,
  nonWorking: 5,
  total: 6,
  title: 7
};
var STYLES = `${DECL}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF0B2545"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B2545"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF1E7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFCCD7E5"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function coreProps(author, createdIso) {
  return `${DECL}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>${esc(author)}</dc:creator>
<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:modified>
</cp:coreProperties>`;
}
var APP_PROPS = `${DECL}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>4flow timesheets</Application>
</Properties>`;

// ../../packages/xlsm-writer/src/sheet.ts
var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function toSerial(isoDate2) {
  return Math.round(((/* @__PURE__ */ new Date(`${isoDate2}T00:00:00Z`)).getTime() - EXCEL_EPOCH) / 864e5);
}
function columnName(index) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
function columnIndex(name) {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function rowOf2(ref) {
  return Number(ref.replace(/[^0-9]/g, ""));
}
function colOf(ref) {
  return ref.replace(/[0-9]/g, "");
}
function cellXml(cell) {
  const s = cell.style ? ` s="${cell.style}"` : "";
  if (cell.value === null || cell.value === "") return `<c r="${cell.ref}"${s}/>`;
  if (typeof cell.value === "number") return `<c r="${cell.ref}"${s}><v>${cell.value}</v></c>`;
  if (typeof cell.value === "boolean") {
    return `<c r="${cell.ref}"${s} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${cell.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.value)}</t></is></c>`;
}
function buildSheet({ cells, widths, freezeRows }) {
  const byRow = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    if (cell.value === null && cell.style === void 0) continue;
    const row = rowOf2(cell.ref);
    const list = byRow.get(row) ?? [];
    list.push(cell);
    byRow.set(row, list);
  }
  const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([row, list]) => {
    const sorted = [...list].sort((a, b) => columnIndex(colOf(a.ref)) - columnIndex(colOf(b.ref)));
    return `<row r="${row}">${sorted.map(cellXml).join("")}</row>`;
  }).join("");
  const cols = Object.entries(widths).map(([col, width]) => {
    const index = columnIndex(col);
    return `<col min="${index}" max="${index}" width="${width}" customWidth="1"/>`;
  }).join("");
  const pane = freezeRows ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : "";
  const refs = cells.filter((c) => c.value !== null).map((c) => c.ref);
  const lastRow = refs.length ? Math.max(...refs.map(rowOf2)) : 1;
  const lastCol = refs.length ? Math.max(...refs.map((r) => columnIndex(colOf(r)))) : 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${columnName(lastCol)}${lastRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ""}
<sheetData>${rows}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

// ../../packages/xlsm-writer/src/index.ts
var RECIPIENT = "software.projecttracker@4flow.com";
var AGGREGATE_SLOTS2 = 15;
var WIDTHS = {
  A: 16,
  B: 12,
  C: 8,
  E: 12,
  F: 6,
  G: 8,
  H: 6,
  I: 22,
  J: 34,
  K: 7,
  L: 26,
  M: 30
};
function put(cells, ref, value, style) {
  cells.push(style === void 0 ? { ref, value } : { ref, value, style });
}
function buildTrackerCells(request, days) {
  const cells = [];
  const { halfDays } = request;
  const workingDays = days.filter((d) => !d.nonWorking).length;
  const target = request.adjustedWorkDays ?? workingDays;
  const booked = totalDays(halfDays);
  put(cells, "A1", "location", STYLE.bold);
  put(cells, "C1", `${request.firstName} ${request.lastName}`, STYLE.title);
  put(cells, "A2", request.location);
  put(cells, "L2", request.firstName);
  put(cells, "L3", request.lastName);
  put(cells, "A4", "Year", STYLE.bold);
  put(cells, "B4", request.year);
  put(cells, "A5", "Month", STYLE.bold);
  put(cells, "B5", request.month);
  put(cells, "A6", "Days", STYLE.bold);
  put(cells, "B6", days.length);
  put(cells, "A7", "Work. Days", STYLE.bold);
  put(cells, "B7", workingDays);
  put(cells, "A8", "Adj. work Days", STYLE.bold);
  put(cells, "B8", request.adjustedWorkDays);
  const weeks = aggregateByWeek(halfDays, days);
  const booked_weeks = weeks.filter((w) => w.total > 0).map((w) => w.week);
  put(cells, "A10", "From CW", STYLE.bold);
  put(cells, "B10", booked_weeks.length ? Math.min(...booked_weeks) : null);
  put(cells, "A11", "To CW", STYLE.bold);
  put(cells, "B11", booked_weeks.length ? Math.max(...booked_weeks) : null);
  const HEADERS = [
    ["E4", "Date"],
    ["F4", "CW"],
    ["G4", "non-working days*"],
    ["H4", "day"],
    ["I4", "workday ID"],
    ["J4", "specification"],
    ["K4", "days"],
    ["L4", "location"],
    ["M4", "tasks"]
  ];
  for (const [ref, label] of HEADERS) put(cells, ref, label, STYLE.header);
  const byKey = new Map(halfDays.map((h) => [`${h.date}:${h.half}`, h]));
  for (const day of days) {
    for (const half of [0, 1]) {
      const row = trackerRow(day.dayOfMonth, half);
      const shade = day.nonWorking ? STYLE.nonWorking : void 0;
      put(cells, `E${row}`, toSerial(day.date), STYLE.date);
      put(cells, `F${row}`, day.week, shade);
      put(cells, `G${row}`, day.nonWorking ? 1 : 0, shade);
      put(cells, `H${row}`, half === 0 ? day.dayOfMonth : null, shade);
      const entry = byKey.get(`${day.date}:${half}`);
      put(cells, `I${row}`, entry?.workdayId ?? null, shade);
      put(cells, `J${row}`, entry?.specification ?? null, shade);
      put(cells, `K${row}`, entry?.days ?? null, shade);
      put(cells, `L${row}`, entry?.location ?? null, shade);
      put(cells, `M${row}`, entry?.tasks ?? null, shade);
    }
  }
  put(cells, "I70", "workday ID", STYLE.header);
  put(cells, "J70", "specification", STYLE.header);
  put(cells, "K70", "Days", STYLE.header);
  put(cells, "L70", "Customer", STYLE.header);
  put(cells, "M70", "Name of project [Business Line]", STYLE.header);
  const groups = aggregateByProject(halfDays).filter((g) => g.workdayId !== null);
  for (let i = 0; i < AGGREGATE_SLOTS2; i++) {
    const row = 71 + i;
    const group = groups[i];
    const project = group ? findProject(group.workdayId) : null;
    put(cells, `I${row}`, group?.workdayId ?? null);
    put(cells, `J${row}`, group?.specification ?? null);
    put(cells, `K${row}`, group?.days ?? 0);
    put(cells, `L${row}`, project?.customer ?? null);
    put(cells, `M${row}`, project?.workdayTitle ?? project?.projectTitle ?? null);
  }
  for (let i = AGGREGATE_SLOTS2; i < groups.length; i++) {
    const group = groups[i];
    const row = 71 + i;
    put(cells, `I${row}`, group?.workdayId ?? null);
    put(cells, `J${row}`, group?.specification ?? null);
    put(cells, `K${row}`, group?.days ?? 0);
  }
  const lastGroupRow = 71 + Math.max(AGGREGATE_SLOTS2, groups.length) - 1;
  put(cells, `I${lastGroupRow + 1}`, "Vacation or sickness:", STYLE.bold);
  put(cells, `K${lastGroupRow + 1}`, absenceTotal(halfDays, "Vacation or sickness"));
  put(cells, `I${lastGroupRow + 2}`, "Other absences:", STYLE.bold);
  put(cells, `K${lastGroupRow + 2}`, absenceTotal(halfDays, "Other absence"));
  put(cells, `L${lastGroupRow + 3}`, "Total", STYLE.bold);
  put(cells, `M${lastGroupRow + 3}`, booked, STYLE.total);
  put(cells, "H92", "CW", STYLE.header);
  put(cells, "I92", "working days", STYLE.header);
  put(cells, "J92", "non-working days*", STYLE.header);
  put(cells, "K92", "Total days", STYLE.header);
  weeks.forEach((week, i) => {
    const row = 95 + i;
    put(cells, `H${row}`, week.week);
    put(cells, `I${row}`, week.workingDays);
    put(cells, `J${row}`, week.nonWorkingDays);
    put(cells, `K${row}`, week.total);
  });
  const totalRow = 95 + weeks.length;
  put(cells, `H${totalRow}`, "Total", STYLE.bold);
  put(cells, `K${totalRow}`, booked, STYLE.total);
  put(cells, `J${totalRow + 1}`, "target", STYLE.bold);
  put(cells, `K${totalRow + 1}`, target, STYLE.total);
  put(cells, "O1", "Validation messages", STYLE.bold);
  const delta = Math.round((booked - target) * 2) / 2;
  const status = delta < 0 ? `${Math.abs(delta)} working day(s) missing` : delta > 0 ? `${delta} working day(s) too much` : "Your project tracker is completed!";
  put(cells, "O2", status);
  put(cells, "O4", `Send this file to ${RECIPIENT} if everything is correct`);
  put(cells, "M94", `Send this file to ${RECIPIENT} if everything is correct`);
  return cells;
}
function writeTracker(request) {
  const days = buildMonth(request.year, request.month, request.location);
  const target = request.adjustedWorkDays ?? days.filter((d) => !d.nonWorking).length;
  const issues = validate({ halfDays: request.halfDays, days, target });
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new ExportBlocked(errors.map((e) => e.code));
  }
  const sheet = buildSheet({
    cells: buildTrackerCells(request, days),
    widths: WIDTHS,
    freezeRows: 4
  });
  const author = `${request.firstName} ${request.lastName}`;
  const files = {
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "docProps/core.xml": strToU8(coreProps(author, request.createdIso)),
    "docProps/app.xml": strToU8(APP_PROPS),
    "xl/workbook.xml": strToU8(WORKBOOK),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet)
  };
  return {
    filename: exportFilename({
      firstName: request.firstName,
      lastName: request.lastName,
      year: request.year,
      month: request.month,
      location: request.location
    }),
    // The entry time comes from the request rather than the clock so the same
    // sheet always produces the same bytes. A zip cannot record a date before
    // 1980 so the epoch is not usable here.
    bytes: zipSync(files, { level: 6, mtime: new Date(request.createdIso) })
  };
}
var ExportBlocked = class extends Error {
  codes;
  constructor(codes) {
    super(`the timesheet holds errors: ${codes.join(" ")}`);
    this.name = "ExportBlocked";
    this.codes = codes;
  }
};

// src/repository.ts
import { gzipSync, gunzipSync } from "node:zlib";
var PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
function splitPeriod(period) {
  const [year, month] = period.split("-");
  return { year: Number(year), month: Number(month) };
}
var HISTORY_MONTHS = 6;
function expiryFor(period, now) {
  const { year, month } = splitPeriod(period);
  const expires = Date.UTC(year, month + HISTORY_MONTHS, 1);
  return Math.floor(Math.max(expires, now.getTime()) / 1e3);
}
function compress(data) {
  return gzipSync(Buffer.from(JSON.stringify(data), "utf8")).toString("base64");
}
function decompress(blob) {
  return JSON.parse(gunzipSync(Buffer.from(blob, "base64")).toString("utf8"));
}

// src/handlers.ts
var JSON_HEADERS = { "content-type": "application/json" };
var BACKOFFICE_GROUP = "backoffice";
function json(status, value) {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(value) };
}
function problem(status, message, extra = {}) {
  return json(status, { error: message, ...extra });
}
var cachedVersion = null;
async function useCatalogue(deps2) {
  const stored = await deps2.repository.getCatalogue();
  if (!stored) return null;
  if (cachedVersion !== stored.version) {
    setCatalogue(stored.data);
    cachedVersion = stored.version;
  }
  return { version: stored.version, updatedAt: stored.updatedAt };
}
function resetCatalogueCache() {
  cachedVersion = null;
}
function defaultProfile(caller) {
  return {
    email: caller.email,
    firstName: caller.firstName,
    lastName: caller.lastName,
    location: null,
    entity: null,
    businessLine: null,
    workPercent: null
  };
}
function readProfile(body, caller) {
  if (typeof body !== "object" || body === null) return "the body must be an object";
  const input = body;
  const percent = input.workPercent;
  if (percent !== null && percent !== void 0) {
    if (typeof percent !== "number" || percent < 0 || percent > 100) {
      return "workPercent must be a number between 0 and 100";
    }
  }
  return {
    // The identity fields come from the token and never from the body.
    email: caller.email,
    firstName: caller.firstName,
    lastName: caller.lastName,
    location: input.location ?? null,
    entity: input.entity ?? null,
    businessLine: input.businessLine ?? null,
    workPercent: percent ?? null
  };
}
function readHalfDays(value) {
  if (!Array.isArray(value)) return "halfDays must be an array";
  const out = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return "every half day must be an object";
    const h = raw;
    if (typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
      return "every half day needs an ISO date";
    }
    if (h.half !== 0 && h.half !== 1) return "half must be 0 or 1";
    if (h.days !== null && h.days !== void 0 && h.days !== 0.5 && h.days !== 1) {
      return "days must be 0.5 or 1 or null";
    }
    out.push({
      date: h.date,
      half: h.half,
      workdayId: h.workdayId ?? null,
      specification: h.specification ?? null,
      // A sheet saved before this field existed reads as a confirmed pick.
      specificationIsDefault: h.specificationIsDefault === true,
      days: h.days ?? null,
      location: h.location ?? null,
      tasks: h.tasks ?? null
    });
  }
  return out;
}
async function requireProfile(deps2, caller) {
  return await deps2.repository.getProfile(caller.sub) ?? defaultProfile(caller);
}
async function handle(request, deps2) {
  const { method, path } = request;
  if (method === "GET" && path === "/api/health") {
    return json(200, { ok: true });
  }
  const caller = request.caller;
  if (!caller) return problem(401, "not signed in");
  let body = null;
  if (request.body) {
    try {
      body = JSON.parse(request.body);
    } catch {
      return problem(400, "the body is not valid JSON");
    }
  }
  if (method === "GET" && path === "/api/catalogue") {
    const stored = await deps2.repository.getCatalogue();
    if (!stored) return problem(503, "no catalogue has been uploaded yet");
    await useCatalogue(deps2);
    return json(200, { version: stored.version, updatedAt: stored.updatedAt, ...stored.data });
  }
  if (method === "PUT" && path === "/api/admin/catalogue") {
    if (!caller.groups.includes(BACKOFFICE_GROUP)) {
      return problem(403, "only backoffice may replace the catalogue");
    }
    if (typeof body !== "object" || body === null) return problem(400, "the body must be an object");
    const data = body;
    if (!Array.isArray(data.projects) || data.projects.length === 0) {
      return problem(400, "the catalogue needs a project list");
    }
    const updatedAt = deps2.now().toISOString();
    await deps2.repository.putCatalogue({ version: updatedAt, updatedAt, data });
    resetCatalogueCache();
    return json(200, { version: updatedAt, updatedAt, projects: data.projects.length });
  }
  if (method === "GET" && path === "/api/me") {
    return json(200, await requireProfile(deps2, caller));
  }
  if (method === "PUT" && path === "/api/me") {
    const profile = readProfile(body, caller);
    if (typeof profile === "string") return problem(400, profile);
    await deps2.repository.putProfile(caller.sub, profile);
    return json(200, profile);
  }
  if (method === "GET" && path === "/api/timesheets") {
    return json(200, { sheets: await deps2.repository.listSheets(caller.sub) });
  }
  const sheetMatch = path.match(/^\/api\/timesheets\/([^/]+)(\/export)?$/);
  if (sheetMatch) {
    const period = sheetMatch[1];
    const isExport = sheetMatch[2] === "/export";
    if (!PERIOD.test(period)) return problem(400, "the period must read as yyyy-mm");
    if (method === "GET" && !isExport) {
      const sheet = await deps2.repository.getSheet(caller.sub, period);
      if (!sheet) return problem(404, "no sheet saved for that month");
      return json(200, sheet);
    }
    if (method === "PUT" && !isExport) {
      if (typeof body !== "object" || body === null) {
        return problem(400, "the body must be an object");
      }
      const halfDays = readHalfDays(body.halfDays);
      if (typeof halfDays === "string") return problem(400, halfDays);
      const profile = await requireProfile(deps2, caller);
      const { year, month } = splitPeriod(period);
      const override = body.adjustedWorkDays;
      if (override !== null && override !== void 0) {
        if (typeof override !== "number" || override < 0 || override > 31) {
          return problem(400, "adjustedWorkDays must be a number between 0 and 31");
        }
      }
      const sheet = {
        year,
        month,
        location: body.location ?? profile.location ?? "",
        halfDays,
        adjustedWorkDays: override ?? null,
        updatedAt: deps2.now().toISOString()
      };
      await deps2.repository.putSheet(caller.sub, period, sheet);
      return json(200, sheet);
    }
    if (method === "POST" && isExport) {
      if (!await useCatalogue(deps2)) return problem(503, "no catalogue has been uploaded yet");
      const sheet = await deps2.repository.getSheet(caller.sub, period);
      if (!sheet) return problem(404, "no sheet saved for that month");
      const profile = await requireProfile(deps2, caller);
      const location = sheet.location || profile.location;
      if (!location) return problem(400, "set your location before exporting");
      const workingDays = buildMonth(sheet.year, sheet.month, location).filter(
        (d) => !d.nonWorking
      ).length;
      const effective = targetDays(workingDays, profile.workPercent, sheet.adjustedWorkDays);
      try {
        const result = writeTracker({
          firstName: profile.firstName,
          lastName: profile.lastName,
          location,
          year: sheet.year,
          month: sheet.month,
          // Tracker cell B8. Null leaves it empty which means a full month.
          adjustedWorkDays: effective === workingDays ? null : effective,
          halfDays: sheet.halfDays,
          createdIso: deps2.now().toISOString()
        });
        return {
          status: 200,
          headers: {
            "content-type": "application/vnd.ms-excel.sheet.macroEnabled.12",
            "content-disposition": `attachment; filename="${result.filename}"`
          },
          body: Buffer.from(result.bytes).toString("base64"),
          isBase64: true
        };
      } catch (error) {
        if (error instanceof ExportBlocked) {
          return problem(422, "the timesheet holds errors", { codes: error.codes });
        }
        throw error;
      }
    }
  }
  const checkMatch = path.match(/^\/api\/timesheets\/([^/]+)\/check$/);
  if (method === "POST" && checkMatch) {
    const period = checkMatch[1];
    if (!PERIOD.test(period)) return problem(400, "the period must read as yyyy-mm");
    if (!await useCatalogue(deps2)) return problem(503, "no catalogue has been uploaded yet");
    if (typeof body !== "object" || body === null) return problem(400, "the body must be an object");
    const halfDays = readHalfDays(body.halfDays);
    if (typeof halfDays === "string") return problem(400, halfDays);
    const profile = await requireProfile(deps2, caller);
    const { year, month } = splitPeriod(period);
    const location = body.location ?? profile.location;
    const days = buildMonth(year, month, location ?? null);
    const override = body.adjustedWorkDays ?? null;
    const target = targetDays(
      days.filter((d) => !d.nonWorking).length,
      profile.workPercent,
      override
    );
    const issues = validate({
      halfDays,
      days,
      target,
      location: location ?? null,
      entity: profile.entity
    });
    return json(200, { issues, blocked: hasErrors(issues), target });
  }
  return problem(404, "no such route");
}

// src/dynamo.ts
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
var CATALOGUE_PK = "CATALOGUE";
var CATALOGUE_SK = "CURRENT";
function userPk(sub) {
  return `USER#${sub}`;
}
var DynamoRepository = class {
  constructor(table2, client = new DynamoDBClient({}), now = () => /* @__PURE__ */ new Date()) {
    this.table = table2;
    this.client = client;
    this.now = now;
  }
  async get(pk, sk) {
    const result = await this.client.send(
      new GetItemCommand({ TableName: this.table, Key: marshall({ pk, sk }) })
    );
    return result.Item ? unmarshall(result.Item) : null;
  }
  async put(item) {
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: marshall(item, { removeUndefinedValues: true })
      })
    );
  }
  async getProfile(sub) {
    const item = await this.get(userPk(sub), "PROFILE");
    return item ? item.profile : null;
  }
  async putProfile(sub, profile) {
    await this.put({ pk: userPk(sub), sk: "PROFILE", profile });
  }
  async getSheet(sub, period) {
    const item = await this.get(userPk(sub), `SHEET#${period}`);
    return item ? decompress(item.sheet) : null;
  }
  async putSheet(sub, period, sheet) {
    await this.put({
      pk: userPk(sub),
      sk: `SHEET#${period}`,
      period,
      updatedAt: sheet.updatedAt,
      // A month of half days is small but it compresses well and it keeps the
      // item shape identical to the catalogue one.
      sheet: compress(sheet),
      expiresAt: expiryFor(period, this.now())
    });
  }
  async listSheets(sub) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: marshall({ ":pk": userPk(sub), ":prefix": "SHEET#" }),
        // The period is in the sort key so the newest sheet comes first.
        ScanIndexForward: false,
        ProjectionExpression: "period, updatedAt"
      })
    );
    return (result.Items ?? []).map((item) => {
      const row = unmarshall(item);
      return { period: row.period, updatedAt: row.updatedAt };
    });
  }
  async getCatalogue() {
    const item = await this.get(CATALOGUE_PK, CATALOGUE_SK);
    if (!item) return null;
    return {
      version: item.version,
      updatedAt: item.updatedAt,
      data: decompress(item.data)
    };
  }
  async putCatalogue(entry) {
    await this.put({
      pk: CATALOGUE_PK,
      sk: CATALOGUE_SK,
      version: entry.version,
      updatedAt: entry.updatedAt,
      data: compress(entry.data)
    });
  }
};

// src/lambda.ts
var table = process.env.TABLE_NAME;
if (!table) throw new Error("TABLE_NAME is not set");
var deps = { repository: new DynamoRepository(table), now: () => /* @__PURE__ */ new Date() };
function callerOf(event) {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (typeof sub !== "string" || sub === "") return null;
  const raw = claims["cognito:groups"];
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean) : [];
  return {
    sub,
    email: String(claims.email ?? ""),
    firstName: String(claims.given_name ?? ""),
    lastName: String(claims.family_name ?? ""),
    groups
  };
}
async function main(event) {
  const response = await handle(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      body: event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString("utf8") : event.body ?? null,
      caller: callerOf(event)
    },
    deps
  );
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
    isBase64Encoded: response.isBase64 ?? false
  };
}
export {
  main
};
//# sourceMappingURL=lambda.mjs.map
