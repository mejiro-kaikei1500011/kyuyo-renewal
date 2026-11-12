(function () {
  "use strict";
  const R = window.KYUYO_RATES;
  const C = window.KyuyoCalc;
  const STORE_KEY = "kyuyo-renewal-v1";
  const $ = (id) => document.getElementById(id);

  // 都道府県（協会けんぽの支部単位）
  const PREFS = [
    ["hokkaido", "北海道"], ["aomori", "青森県"], ["iwate", "岩手県"], ["miyagi", "宮城県"], ["akita", "秋田県"],
    ["yamagata", "山形県"], ["fukushima", "福島県"], ["ibaraki", "茨城県"], ["tochigi", "栃木県"], ["gunma", "群馬県"],
    ["saitama", "埼玉県"], ["chiba", "千葉県"], ["tokyo", "東京都"], ["kanagawa", "神奈川県"], ["niigata", "新潟県"],
    ["toyama", "富山県"], ["ishikawa", "石川県"], ["fukui", "福井県"], ["yamanashi", "山梨県"], ["nagano", "長野県"],
    ["gifu", "岐阜県"], ["shizuoka", "静岡県"], ["aichi", "愛知県"], ["mie", "三重県"], ["shiga", "滋賀県"],
    ["kyoto", "京都府"], ["osaka", "大阪府"], ["hyogo", "兵庫県"], ["nara", "奈良県"], ["wakayama", "和歌山県"],
    ["tottori", "鳥取県"], ["shimane", "島根県"], ["okayama", "岡山県"], ["hiroshima", "広島県"], ["yamaguchi", "山口県"],
    ["tokushima", "徳島県"], ["kagawa", "香川県"], ["ehime", "愛媛県"], ["kochi", "高知県"], ["fukuoka", "福岡県"],
    ["saga", "佐賀県"], ["nagasaki", "長崎県"], ["kumamoto", "熊本県"], ["oita", "大分県"], ["miyazaki", "宮崎県"],
    ["kagoshima", "鹿児島県"], ["okinawa", "沖縄県"]
  ];
  const PREF_LABEL = Object.fromEntries(PREFS);
  PREF_LABEL.other = "その他";

  // 手当・その他控除の固定行
  const FIXED_ALLOW = ["役職手当", "資格手当"];
  const FIXED_DED = ["社宅家賃"];

  // ---------- データ保存（ブラウザ内 localStorage） ----------
  // db = { employees: [{id,name,company,insured,emp,age40,deps,pref,customHealthRate,email}], records: { [empId]: { ["YYYY-MM|kind"]: rec } } }
  function sanitize(d) {
    d.employees.forEach((e) => { if (!e.pref) e.pref = "tokyo"; });
    return d;
  }
  function loadDb() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && Array.isArray(d.employees) && d.records) return sanitize(d);
    } catch (e) { /* 壊れていたら空から */ }
    return { employees: [], records: {} };
  }
  let db = loadDb();
  // 保存できたかを返す（失敗を画面に知らせるため）
  function saveDb() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }
  function setEmpMsg(msg, isError) {
    const p = $("empMsg");
    p.textContent = msg;
    p.classList.toggle("error", !!isError);
  }
  function uid() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------- 表示用ユーティリティ ----------
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString("ja-JP");
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function ymLabel(ym) { const [y, m] = ym.split("-"); return `${y}年${Number(m)}月`; }
  function prevYm(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  function currentEmp() { return db.employees.find((e) => e.id === $("paySelect").value); }
  function recKey(ym, kind) { return `${ym}|${kind}`; }
  function val(id) { const el = $(id); return el ? el.value : ""; }
  function setVal(id, v) { const el = $(id); if (el) el.value = v == null ? "" : v; }

  // ---------- 社員セレクト・都道府県 ----------
  function fillEmployeeSelects() {
    const opts = db.employees.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}${e.company ? "（" + esc(e.company) + "）" : ""}</option>`).join("");
    const empty = '<option value="">（社員を登録してください）</option>';
    $("paySelect").innerHTML = opts || empty;
    $("ledgerEmp").innerHTML = opts || empty;
  }
  function fillStaticSelects() {
    $("empPref").innerHTML = PREFS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("") + '<option value="other">その他（手入力）</option>';
    const deps = [];
    for (let i = 0; i <= 7; i++) deps.push(`<option value="${i}">${i}人</option>`);
    $("empDeps").innerHTML = deps.join("");
  }

  // ---------- 手当・その他控除の入力行 ----------
  // fixed: true なら名称は固定（削除ボタンなし）
  function addRow(containerId, data, withTaxable, fixed) {
    const d = data || { name: "", amount: "", taxable: withTaxable };
    const wrap = document.createElement("div");
    wrap.className = "dyn-row" + (withTaxable ? "" : " no-taxable");
    if (fixed) { wrap.dataset.fixed = "1"; wrap.dataset.name = d.name; }
    const namePart = fixed
      ? `<span class="dyn-fixed-name">${esc(d.name)}</span>`
      : `<input type="text" class="dyn-name" placeholder="${withTaxable ? "手当名" : "控除名"}" value="${esc(d.name)}">`;
    wrap.innerHTML = `
      ${namePart}
      <input type="text" inputmode="numeric" class="dyn-amount" placeholder="0" value="${esc(d.amount)}">
      ${withTaxable ? `<select class="dyn-taxable"><option value="taxable">課税</option><option value="nontaxable">非課税</option></select>` : ""}
      ${fixed ? "" : `<button type="button" class="dyn-del" aria-label="削除">✕</button>`}`;
    if (withTaxable) wrap.querySelector(".dyn-taxable").value = d.taxable ? "taxable" : "nontaxable";
    $(containerId).appendChild(wrap);
  }
  function readRows(containerId, withTaxable) {
    return Array.from($(containerId).querySelectorAll(".dyn-row")).map((row) => {
      const fixed = row.dataset.fixed === "1";
      return {
        name: fixed ? row.dataset.name : row.querySelector(".dyn-name").value,
        amount: row.querySelector(".dyn-amount").value,
        taxable: withTaxable ? row.querySelector(".dyn-taxable").value === "taxable" : false
      };
    });
  }
  function setAllowRows(rows, isBonus) {
    $("allowRows").innerHTML = "";
    if (isBonus) return;
    const saved = rows || [];
    FIXED_ALLOW.forEach((name) => {
      const found = saved.find((r) => r.name === name) || { name, amount: "", taxable: true };
      addRow("allowRows", { name, amount: found.amount, taxable: found.taxable }, true, true);
    });
    // 金額が空の行（固定から外した手当の空欄など）は表示しない。金額が入っている行は残す
    saved.filter((r) => !FIXED_ALLOW.includes(r.name) && String(r.amount ?? "").trim() !== "")
      .forEach((r) => addRow("allowRows", r, true, false));
  }
  function setDedRows(rows) {
    $("dedRows").innerHTML = "";
    const saved = rows || [];
    FIXED_DED.forEach((name) => {
      const found = saved.find((r) => r.name === name) || { name, amount: "", taxable: false };
      addRow("dedRows", { name, amount: found.amount, taxable: false }, false, true);
    });
    saved.filter((r) => !FIXED_DED.includes(r.name)).forEach((r) => addRow("dedRows", r, false, false));
  }
  function hasAnyValue(rec) {
    return ["basic", "overtime", "commute", "absence", "days", "hours", "hourly", "refMonthly", "hStd", "pStd"]
      .some((k) => String(rec[k] || "").trim() !== "")
      || rec.allowances.some((r) => String(r.amount).trim() !== "" || (!FIXED_ALLOW.includes(r.name) && r.name.trim() !== ""))
      || rec.deductions.some((r) => String(r.amount).trim() !== "" || (!FIXED_DED.includes(r.name) && r.name.trim() !== ""));
  }

  // ---------- 入力の読み取り・反映 ----------
  // 明細の枠（payslip 内）にある入力も含めて、現在の入力をひとつの記録にする
  function readRecFromForm() {
    const kind = val("payKind");
    return {
      ym: val("payYm"),
      kind,
      basic: kind === "bonus" ? val("bonusAmount") : val("basic"),
      overtime: val("overtime"),
      commute: val("commute"),
      absence: val("absence"),
      days: val("days"),
      hours: val("hours"),
      hourly: kind === "bonus" ? "" : val("hourly"),
      allowances: kind === "bonus" ? [] : readRows("allowRows", true),
      deductions: readRows("dedRows", false),
      refMonthly: val("refMonthly"),
      hStd: kind === "bonus" ? "" : val("recHStd"),
      pStd: kind === "bonus" ? "" : val("recPStd")
    };
  }
  // 記録の値を入力欄（左の欄）へ反映する。明細の枠は buildFrame が作る
  function fillLeftForm(rec) {
    const isBonus = val("payKind") === "bonus";
    setVal("basic", isBonus ? "" : rec.basic);
    setVal("bonusAmount", isBonus ? rec.basic : "");
    setVal("overtime", rec.overtime);
    setVal("commute", rec.commute);
    setVal("absence", rec.absence);
    setVal("days", rec.days);
    setVal("hours", rec.hours);
    setVal("hourly", rec.hourly);
    const emp = currentEmp();
    $("hourlyFields").classList.toggle("hidden", isBonus || !emp || emp.workType !== "part");
    setVal("refMonthly", rec.refMonthly);
    setVal("recHStd", rec.hStd || "");
    setVal("recPStd", rec.pStd || "");
    setAllowRows(rec.allowances, isBonus);
    setDedRows(rec.deductions);
    $("salaryFields").classList.toggle("hidden", isBonus);
    $("bonusFields").classList.toggle("hidden", !isBonus);
  }
  const EMPTY_REC = { basic: "", overtime: "", commute: "", absence: "", days: "", hours: "", hourly: "", refMonthly: "", allowances: [], deductions: [] };

  // 同じ社員の直前の給与記録（賞与は引き継がない）
  function latestPriorRecord(empId, ym, kind) {
    if (kind !== "salary") return null;
    const recs = db.records[empId] || {};
    let best = null;
    let bestYm = "";
    for (const key of Object.keys(recs)) {
      const [y, k] = key.split("|");
      if (k !== "salary" || !y || y >= ym) continue;
      if (y > bestYm) { bestYm = y; best = recs[key]; }
    }
    return best ? { rec: best, ym: bestYm } : null;
  }

  function loadCurrentRecord() {
    const emp = currentEmp();
    const ym = val("payYm");
    const kind = val("payKind");
    const stored = emp && ym ? (db.records[emp.id] || {})[recKey(ym, kind)] : null;
    let rec;
    let carried = null;
    if (stored) {
      rec = Object.assign({}, EMPTY_REC, stored);
    } else {
      // 未入力の月は直前の月の入力を引き継ぐ（社会保険料は料率の改定月だけ変わる）
      // 日数・時間は引き継がない
      const prior = emp && ym && latestPriorRecord(emp.id, ym, kind);
      rec = Object.assign({}, EMPTY_REC, prior ? Object.assign({}, prior.rec, { days: "", hours: "" }) : {});
      carried = prior ? prior.ym : null;
    }
    fillLeftForm(rec);
    refresh(Object.assign({}, rec, { ym, kind }));
    setShareMsg(carried ? `${ymLabel(carried)}の入力を引き継いでいます。変更があれば修正してください。` : "");
  }

  // 入力の変更：明細の枠の中で入力した場合は数字だけ更新し、左の欄の変更は枠を作り直す
  function onPayInput(ev) {
    const emp = currentEmp();
    const ym = val("payYm");
    if (!emp || !ym) { refresh(readRecFromForm()); return; }
    const rec = readRecFromForm();
    db.records[emp.id] = db.records[emp.id] || {};
    const key = recKey(ym, rec.kind);
    if (hasAnyValue(rec)) db.records[emp.id][key] = rec;
    else delete db.records[emp.id][key];
    saveDb();
    refresh(rec, false);
  }
  function onSelectChange() {
    loadCurrentRecord();
  }
  function onRowsClick(ev) {
    const btn = ev.target.closest(".dyn-del");
    if (!btn) return;
    btn.closest(".dyn-row").remove();
    onPayInput(null);
  }

  // ---------- 給与明細（枠の作成・数字の更新） ----------
  function refresh(rec) {
    updateRatesInfo();
    const emp = currentEmp();
    const ym = val("payYm");
    const kind = val("payKind");
    if (!emp || !ym) {
      $("payslip").innerHTML = '<p class="hint">社員タブで社員を登録し、対象年月を選んでください。</p>';
      $("breakdown").innerHTML = "";
      return;
    }
    const full = Object.assign({}, EMPTY_REC, rec, { ym, kind });
    const res = C.compute(emp, full, R);
    buildFrame(emp, ym, kind, full, res);
    updateValues(res);
    $("breakdown").innerHTML = breakdownHtml(emp, res);
  }

  function spanHtml(k) { return `<span data-k="${k}">0</span>`; }

  function gridHtml(side, items) {
    const cols = 5;
    const chunks = [];
    for (let i = 0; i < items.length; i += cols) {
      const chunk = items.slice(i, i + cols);
      while (chunk.length < cols) chunk.push({ label: "", html: "" });
      chunks.push(chunk);
    }
    const span = chunks.length * 2;
    return chunks.map((chunk, idx) => {
      const sideCell = idx === 0 ? `<td rowspan="${span}" class="side">${side}</td>` : "";
      const labels = chunk.map((it) => `<td class="lbl ${it.strong ? "strong" : ""}">${esc(it.label)}</td>`).join("");
      const values = chunk.map((it) => `<td class="val ${it.strong ? "strong" : ""}">${it.html}</td>`).join("");
      return `<tr>${sideCell}${labels}</tr><tr>${values}</tr>`;
    }).join("");
  }

  // 明細の枠を作る。基本給などは入力欄、計算結果は data-k で後から数字だけ更新する
  function buildFrame(emp, ym, kind, rec, res) {
    const isBonus = kind === "bonus";
    const pay = [];
    if (isBonus) {
      pay.push({ label: "賞与額", html: spanHtml("basic") });
    } else {
      pay.push({ label: "基本給", html: spanHtml("basic") });
      pay.push({ label: "時間外手当", html: spanHtml("overtime") });
      pay.push({ label: "通勤手当(非)", html: spanHtml("commute") });
      pay.push({ label: "不就労控除", html: spanHtml("absence") });
      res.allowances.forEach((a, i) => pay.push({ label: `${a.name || "手当"}${a.taxable ? "" : "(非)"}`, html: spanHtml("allow" + i) }));
    }
    pay.push({ label: "総支給額", html: spanHtml("gross"), strong: true });

    const ded = [
      { label: "健康保険", html: spanHtml("health") },
      { label: "介護保険", html: spanHtml("care") },
      { label: "厚生年金", html: spanHtml("pension") },
      { label: "雇用保険", html: spanHtml("employment") },
      { label: "社会保険計", html: spanHtml("socialTotal"), strong: true },
      { label: "所得税", html: spanHtml("incomeTax") }
    ];
    res.deductions.forEach((d, i) => ded.push({ label: d.name || "その他控除", html: spanHtml("ded" + i) }));
    ded.push({ label: "控除計", html: spanHtml("deductionTotal"), strong: true });

    $("payslip").innerHTML = `
<div class="title-row">
  <span class="ym">${ymLabel(ym)}</span>
  <span class="ttl">${isBonus ? "賞与明細書" : "給料明細書"}</span>
  <span></span>
</div>
<div class="who"><span>${esc(emp.company)}</span><span>${esc(emp.name)} 様</span></div>
<table class="slip">
  <colgroup><col style="width:28px"><col><col><col><col><col></colgroup>
  ${gridHtml("支給", pay)}
  ${gridHtml("控除", ded)}
  <tr>
    <td colspan="5" class="net-lbl">差引支給額</td>
    <td class="net-val" data-k="net">0円</td>
  </tr>
</table>
<p class="note">${isBonus ? "※賞与の所得税は参考月給を含む年額の税額差による概算です。" : "※所得税は月額表（甲欄・乙欄）による源泉徴収税額です。"} 社会保険料・雇用保険料は労働者負担分です。${isBonus ? "" : "（非）は非課税の手当です。"}</p>`;
  }

  // 計算結果を枠の数字へ反映する
  function updateValues(res) {
    const set = (k, v) => { const el = document.querySelector(`[data-k="${k}"]`); if (el) el.textContent = fmt(v); };
    set("basic", res.basic);
    set("overtime", res.overtime);
    set("commute", res.commute);
    set("absence", res.absence);
    set("gross", res.gross);
    set("health", res.health);
    set("care", res.care);
    set("pension", res.pension);
    set("employment", res.employment);
    set("socialTotal", res.socialTotal);
    set("incomeTax", res.incomeTax);
    set("deductionTotal", res.deductionTotal);
    res.allowances.forEach((a, i) => set("allow" + i, a.amount));
    res.deductions.forEach((d, i) => set("ded" + i, d.amount));
    const net = document.querySelector('[data-k="net"]');
    if (net) net.textContent = fmt(res.net) + "円";
  }

  function breakdownHtml(emp, r) {
    const rows = [];
    if (r.kind === "bonus") {
      rows.push(["標準賞与額（健康保険）", fmt(r.hStd) + "円"]);
      rows.push(["標準賞与額（厚生年金）", fmt(r.pStd) + "円"]);
    } else {
      rows.push(["雇用保険", esc(r.empLabel)]);
      rows.push(["標準報酬月額（健康保険）", emp.insured ? fmt(r.hStd) + "円" : "未加入"]);
      rows.push(["標準報酬月額（厚生年金）", emp.insured ? fmt(r.pStd) + "円" : "未加入"]);
      const src = { prefecture: "都道府県単位", custom: "手入力", fallback: "全国平均（未確認のため仮）" }[r.healthRate.source];
      rows.push(["健康保険料率", `${r.healthRate.ratePercent}%（${src}）`]);
      rows.push(["健康保険（子ども・子育て支援金を含む）", `${fmt(r.health)}円（支援金 ${fmt(r.child)}円${r.childApplied ? "" : "・この支払月は対象外"}）`]);
      rows.push(["課税対象額（月）", fmt(r.taxableGross) + "円"]);
      if (r.commuteTaxable > 0) rows.push(["通勤手当の非課税限度超過分（課税）", fmt(r.commuteTaxable) + "円"]);
    }
    rows.push(["料率の確認日", `${esc(r.ratesAsOf)}（適用開始 ${esc(R.effectiveFrom)}）`]);
    return `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
  }

  function updateRatesInfo() {
    $("ratesInfo").textContent = `${R.effectiveFrom}適用・${R.asOf}確認`;
  }

  // 前月の入力をコピー（手当・控除・金額を引き継ぐ。日数・時間は引き継がない）
  function copyPrevMonth() {
    const emp = currentEmp();
    const ym = val("payYm");
    if (!emp || !ym) return;
    if (val("payKind") === "bonus") { setShareMsg("前月コピーは給与で使ってください。"); return; }
    const prev = (db.records[emp.id] || {})[recKey(prevYm(ym), "salary")];
    if (!prev) { setShareMsg(`${ymLabel(prevYm(ym))}の入力がありません。`); return; }
    const rec = Object.assign({}, EMPTY_REC, prev, { days: "", hours: "", kind: "salary", ym });
    db.records[emp.id] = db.records[emp.id] || {};
    db.records[emp.id][recKey(ym, "salary")] = rec;
    saveDb();
    loadCurrentRecord();
    setShareMsg(`${ymLabel(prevYm(ym))}の入力をコピーしました。`);
  }

  // ---------- テキストで表示 ----------
  function slipText(emp, ym, kind, r) {
    const isBonus = kind === "bonus";
    const lines = [];
    lines.push(`${ymLabel(ym)} ${isBonus ? "賞与明細書" : "給料明細書"}`);
    lines.push(`${emp.company || ""} ${emp.name} 様`.trim());
    lines.push("");
    if (isBonus) lines.push(`賞与額：${fmt(r.basic)}円`);
    else {
      lines.push(`基本給：${fmt(r.basic)}円`);
      if (r.overtime) lines.push(`時間外手当：${fmt(r.overtime)}円`);
      if (r.commute) lines.push(`通勤手当(非)：${fmt(r.commute)}円`);
      r.allowances.forEach((a) => lines.push(`${a.name || "手当"}${a.taxable ? "" : "(非)"}：${fmt(a.amount)}円`));
      if (r.absence) lines.push(`不就労控除：-${fmt(r.absence)}円`);
    }
    lines.push(`総支給額：${fmt(r.gross)}円`);
    lines.push("");
    lines.push(`健康保険：${fmt(r.health)}円（子ども・子育て支援金を含む）`);
    lines.push(`介護保険：${fmt(r.care)}円`);
    lines.push(`厚生年金：${fmt(r.pension)}円`);
    lines.push(`雇用保険：${fmt(r.employment)}円`);
    lines.push(`所得税：${fmt(r.incomeTax)}円`);
    r.deductions.forEach((d) => lines.push(`${d.name || "その他控除"}：${fmt(d.amount)}円`));
    lines.push(`控除計：${fmt(r.deductionTotal)}円`);
    lines.push("");
    lines.push(`差引支給額：${fmt(r.net)}円`);
    lines.push("");
    lines.push("※所得税・社会保険料は概算です。");
    return lines.join("\n");
  }
  function currentSlip() {
    const emp = currentEmp();
    const ym = val("payYm");
    if (!emp || !ym) { setShareMsg("社員と対象年月を選んでください。"); return null; }
    const kind = val("payKind");
    const r = C.compute(emp, Object.assign({}, EMPTY_REC, readRecFromForm(), { ym, kind }), R);
    return { emp, ym, kind, r, subject: `${ymLabel(ym)} ${kind === "bonus" ? "賞与明細" : "給与明細"}（${emp.name}）`, body: slipText(emp, ym, kind, r) };
  }
  function setShareMsg(msg) { $("shareMsg").textContent = msg; }
  // 明細の本文を画面に表示し、コピーできるようにする（送信機能は持たない）
  function showSharePanel(text) {
    $("shareText").value = text;
    $("sharePanel").classList.remove("hidden");
    const panel = $("sharePanel");
    if (panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function copyShareText() {
    const ta = $("shareText");
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(() => setShareMsg("本文をコピーしました。"), () => setShareMsg("コピーできませんでした。本文を選択して手動でコピーしてください。"));
      return;
    }
    setShareMsg(ok ? "本文をコピーしました。" : "コピーできませんでした。本文を選択して手動でコピーしてください。");
  }
  function showSlipText() {
    const s = currentSlip();
    if (!s) return;
    const to = s.emp.email || "";
    showSharePanel(`宛先: ${to || "（社員の登録にメールアドレスがありません）"}\n件名: ${s.subject}\n\n${s.body}`);
    setShareMsg("本文を表示しました。「本文をコピー」で貼り付けて送ってください。");
  }

  // ---------- 社員 ----------
  function updateRateHint() {
    const p = val("empPref");
    const table = R.health.byPrefecture || {};
    const known = table[p] !== null && table[p] !== undefined && p !== "other";
    $("empRateHint").textContent = known
      ? `${PREF_LABEL[p]}の協会けんぽ料率（${table[p]}%・令和8年3月分から）を使います。`
      : "この都道府県の料率は表にないため、全国平均（9.90%）で計算します。";
  }
  function renderEmpList() {
    if (!db.employees.length) {
      $("empList").innerHTML = '<tr><td colspan="5" class="hint">まだ社員が登録されていません。</td></tr>';
      return;
    }
    $("empList").innerHTML = db.employees.map((e) => `
<tr>
  <td>${esc(e.name)}${e.workType === "part" ? "（アルバイト）" : ""}</td>
  <td>${esc(e.company)}</td>
  <td>${e.insured ? "加入・" + esc(PREF_LABEL[e.pref] || "東京都") : "未加入"}</td>
  <td>${esc(C.EMP_LABEL[e.emp] || "未加入")}</td>
  <td>
    <button type="button" data-edit="${esc(e.id)}">編集</button>
    <button type="button" data-del="${esc(e.id)}">削除</button>
  </td>
</tr>`).join("");
  }
  function resetEmpForm() {
    setVal("empId", "");
    $("empFormTitle").textContent = "社員を追加";
    setVal("empName", "");
    setVal("empCompany", "");
    setVal("empType", "employee");
    $("empInsured").checked = true;
    setVal("empEmp", "none");
    $("empAge40").checked = false;
    setVal("empDeps", "0");
    setVal("empWithholding", "kou");
    setVal("empPref", "tokyo");
    setVal("empEmail", "");
    setVal("stdFrom", "");
    updateRateHint();
    renderStdList(null);
  }
  function onEmpSubmit(ev) {
    ev.preventDefault();
    const id = val("empId") || uid();
    const emp = {
      id,
      name: val("empName").trim(),
      company: val("empCompany").trim(),
      workType: val("empType") === "part" ? "part" : "employee",
      insured: $("empInsured").checked,
      emp: val("empEmp"),
      age40: $("empAge40").checked,
      deps: Number(val("empDeps")) || 0,
      withholdingCol: val("empWithholding") === "otsu" ? "otsu" : "kou",
      pref: val("empPref"),
      customHealthRate: (db.employees.find((x) => x.id === id) || {}).customHealthRate || "",
      email: val("empEmail").trim(),
      stdHistory: (db.employees.find((x) => x.id === id) || {}).stdHistory || []
    };
    const idx = db.employees.findIndex((e) => e.id === id);
    if (idx >= 0) db.employees[idx] = emp; else db.employees.push(emp);
    db.records[id] = db.records[id] || {};
    const saved = saveDb();
    fillEmployeeSelects();
    renderEmpList();
    resetEmpForm();
    loadCurrentRecord();
    if (saved) setEmpMsg(`「${emp.name}」を保存しました。社員一覧に表示されています。`, false);
    else setEmpMsg("保存できませんでした。ブラウザの保存領域（localStorage）が使えない設定の可能性があります。この画面を閉じると消えます。", true);
  }
  function onEmpListClick(ev) {
    const edit = ev.target.getAttribute("data-edit");
    const del = ev.target.getAttribute("data-del");
    if (edit) {
      const e = db.employees.find((x) => x.id === edit);
      if (!e) return;
      setVal("empId", e.id);
      $("empFormTitle").textContent = "社員を編集";
      setVal("empName", e.name);
      setVal("empCompany", e.company);
      setVal("empType", e.workType === "part" ? "part" : "employee");
      $("empInsured").checked = !!e.insured;
      setVal("empEmp", e.emp);
      $("empAge40").checked = !!e.age40;
      setVal("empDeps", String(e.deps || 0));
      setVal("empWithholding", e.withholdingCol === "otsu" ? "otsu" : "kou");
      setVal("empPref", e.pref || "tokyo");
      setVal("empEmail", e.email || "");
      updateRateHint();
      renderStdList(e);
    }
    if (del) {
      const e = db.employees.find((x) => x.id === del);
      if (!e || !confirm(`「${e.name}」と、その社員の入力データをすべて削除します。よろしいですか？`)) return;
      db.employees = db.employees.filter((x) => x.id !== del);
      delete db.records[del];
      saveDb();
      fillEmployeeSelects();
      renderEmpList();
      loadCurrentRecord();
    }
  }

  // ---------- 振込一覧 ----------
  function renderTransfer() {
    const ym = val("transferYm");
    if (!ym) { $("transferOut").innerHTML = '<p class="hint">対象年月を選んでください。</p>'; return; }
    let rows = "";
    let total = 0;
    let count = 0;
    for (const e of db.employees) {
      const recs = db.records[e.id] || {};
      for (const kind of ["salary", "bonus"]) {
        const rec = recs[recKey(ym, kind)];
        if (!rec) continue;
        const r = C.compute(e, Object.assign({}, EMPTY_REC, rec, { ym, kind }), R);
        total += r.net; count++;
        rows += `<tr><td class="l">${esc(e.name)}</td><td class="l">${esc(e.company)}</td><td class="l">${kind === "bonus" ? "賞与" : "給与"}</td><td>${fmt(r.net)}</td></tr>`;
      }
    }
    if (!rows) { $("transferOut").innerHTML = `<div class="card"><p class="hint">${ymLabel(ym)}の入力データがありません。</p></div>`; return; }
    $("transferOut").innerHTML = `
<h3>${ymLabel(ym)} 振込一覧</h3>
<table class="transfer-table">
  <thead><tr><th>氏名</th><th>会社名</th><th>区分</th><th>振込額（差引支給額・円）</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td class="l" colspan="3">合計（${count}件）</td><td>${fmt(total)}</td></tr></tfoot>
</table>
<p class="note">※差引支給額の概算です。振込先の金融機関・口座はこの一覧には含みません。</p>`;
  }

  // ---------- 賃金台帳・源泉徴収票（参考） ----------
  const LEDGER_COLS = [
    ["days", "日数"], ["hours", "時間"], ["basic", "基本給"], ["overtime", "時間外"], ["commute", "通勤(非)"],
    ["absence", "不就労控除"], ["allowTotal", "手当計"], ["gross", "総支給額"],
    ["health", "健康保険"], ["care", "介護保険"], ["pension", "厚生年金"], ["employment", "雇用保険"], ["socialTotal", "社会保険計"],
    ["incomeTax", "所得税"], ["otherDeductTotal", "その他控除"], ["deductionTotal", "控除計"], ["net", "差引支給額"]
  ];
  // 年の記録（給与・賞与）を、計算結果つきで並べる
  function yearItems(emp, year) {
    const recs = db.records[emp.id] || {};
    const items = [];
    for (const key of Object.keys(recs)) {
      const [ym, kind] = key.split("|");
      if (!ym || !ym.startsWith(year + "-")) continue;
      const rec = Object.assign({}, EMPTY_REC, recs[key], { ym, kind });
      items.push({ ym, kind, rec, r: C.compute(emp, rec, R) });
    }
    items.sort((a, b) => (a.ym === b.ym ? (a.kind === "salary" ? -1 : 1) : a.ym < b.ym ? -1 : 1));
    return items;
  }
  function renderLedger() {
    const emp = db.employees.find((e) => e.id === val("ledgerEmp"));
    const year = String(Number(val("ledgerYear")) || new Date().getFullYear());
    if (!emp) { $("ledgerOut").innerHTML = '<p class="hint">社員を登録してください。</p>'; return; }
    const items = yearItems(emp, year);
    const sum = {};
    LEDGER_COLS.forEach(([c]) => (sum[c] = 0));
    const rows = items.map(({ ym, kind, rec, r }) => {
      const v = { days: C.num(rec.days), hours: C.num(rec.hours), basic: r.basic, overtime: r.overtime, commute: r.commute,
        absence: r.absence, allowTotal: r.allowTotal, gross: r.gross, health: r.health, care: r.care, pension: r.pension,
        employment: r.employment, socialTotal: r.socialTotal, incomeTax: r.incomeTax,
        otherDeductTotal: r.otherDeductTotal, deductionTotal: r.deductionTotal, net: r.net };
      LEDGER_COLS.forEach(([c]) => (sum[c] += v[c]));
      const label = kind === "bonus" ? `${Number(ym.slice(5))}月 賞与` : `${Number(ym.slice(5))}月`;
      return `<tr><td class="l">${label}</td>${LEDGER_COLS.map(([c]) => `<td>${fmt(v[c])}</td>`).join("")}</tr>`;
    }).join("");

    $("ledgerOut").innerHTML = `
<h3>賃金台帳（${esc(year)}年）</h3>
<p>氏名：${esc(emp.name)}　会社名：${esc(emp.company)}　雇用保険：${esc(C.EMP_LABEL[emp.emp] || "未加入")}　社会保険：${emp.insured ? "加入" : "未加入"}</p>
<div style="overflow-x:auto">
<table class="ledger-table">
  <thead><tr><th>月</th>${LEDGER_COLS.map(([, h]) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows || `<tr><td colspan="${LEDGER_COLS.length + 1}" class="l">${esc(year)}年の入力データがありません。</td></tr>`}</tbody>
  <tfoot><tr><td class="l">合計</td>${LEDGER_COLS.map(([c]) => `<td>${fmt(sum[c])}</td>`).join("")}</tr></tfoot>
</table>
</div>
<p class="note">※所得税・社会保険料は概算です。賞与は「賞与」と表示しています。</p>`;
  }

  // 源泉徴収票（参考）：年間の記録から概算の項目を並べる。正式な様式・年末調整の結果とは一致しない
  function renderGensen() {
    const emp = db.employees.find((e) => e.id === val("ledgerEmp"));
    const year = String(Number(val("ledgerYear")) || new Date().getFullYear());
    if (!emp) { $("gensenOut").innerHTML = '<p class="hint">社員を登録してください。</p>'; return; }
    const items = yearItems(emp, year);
    if (!items.length) { $("gensenOut").innerHTML = `<div class="card"><p class="hint">${esc(year)}年の入力データがありません。</p></div>`; return; }
    let pay = 0, social = 0, socialTax = 0, tax = 0;
    items.forEach(({ r }) => {
      pay += r.gross;
      social += r.socialTotal;
      socialTax += r.socialForTax;
      tax += r.incomeTax;
    });
    const salaryDed = C.salaryDeduction(pay, R.incomeTax.salaryDeductionMinimum);
    const afterDed = Math.max(0, pay - salaryDed);
    const dep = Math.max(0, Math.min(7, Number(emp.deps) || 0));
    const basic = R.incomeTax.basicDeduction;
    const depDed = dep * R.incomeTax.dependentDeduction;
    $("gensenOut").innerHTML = `
<h3>源泉徴収票（参考・概算）　${esc(year)}年分</h3>
<p>氏名：${esc(emp.name)}　勤務先：${esc(emp.company)}</p>
<table class="transfer-table">
  <tbody>
    <tr><td class="l">支払金額（給与・賞与の総支給合計）</td><td>${fmt(pay)}</td></tr>
    <tr><td class="l">給与所得控除後の金額（概算）</td><td>${fmt(afterDed)}</td></tr>
    <tr><td class="l">社会保険料等の金額（健康・介護・厚生年金・雇用保険）</td><td>${fmt(social)}</td></tr>
    <tr><td class="l">社会保険料控除の対象額（健康・介護・厚生年金）</td><td>${fmt(socialTax)}</td></tr>
    <tr><td class="l">基礎控除（概算）</td><td>${fmt(basic)}</td></tr>
    <tr><td class="l">扶養控除（一般の扶養親族・概算）</td><td>${fmt(depDed)}</td></tr>
    <tr><td class="l">源泉徴収税額（所得税の合計・概算）</td><td>${fmt(tax)}</td></tr>
  </tbody>
</table>
<p class="note">※参考用の概算です。正式な源泉徴収票の様式ではなく、年末調整の結果とは一致しません。手当の課税区分・扶養の条件などは反映しきれていません。</p>`;
  }

  // ---------- データの書き出し・読込 ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kyuyo-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || !Array.isArray(d.employees) || typeof d.records !== "object") throw new Error("形式が違います");
        if (!confirm("現在のデータを読込データで置き換えます。よろしいですか？")) return;
        db = sanitize(d);
        saveDb();
        initAll();
      } catch (e) {
        alert("読込に失敗しました：" + e.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- 簡易計算（社員登録・保存なし） ----------
  function quickEmp() {
    return {
      insured: $("qInsured").checked,
      emp: val("qEmp"),
      age40: $("qAge40").checked,
      deps: Number(val("qDeps")) || 0,
      pref: val("qPref"),
      customHealthRate: "",
      withholdingCol: val("qWithholding") === "otsu" ? "otsu" : "kou",
      hStdOverride: val("qHStd"),
      pStdOverride: val("qPStd")
    };
  }
  function quickRec() {
    return {
      ym: val("qYm"),
      kind: "salary",
      basic: val("qBasic"),
      overtime: val("qOvertime"),
      commute: val("qCommute"),
      absence: val("qAbsence"),
      allowances: [
        { name: "課税の手当", amount: val("qTaxAllow"), taxable: true },
        { name: "非課税の手当", amount: val("qNonTaxAllow"), taxable: false }
      ],
      deductions: [{ name: "その他控除", amount: val("qDed") }],
      refMonthly: ""
    };
  }
  function updateQuickRate() {
    const p = val("qPref");
    const table = R.health.byPrefecture || {};
    const known = table[p] !== null && table[p] !== undefined && p !== "other";
    $("qRateHint").textContent = known
      ? `${PREF_LABEL[p]}の協会けんぽ料率（${table[p]}%・令和8年3月分から）を使います。`
      : "この都道府県の料率は表にないため、全国平均（9.90%）で計算します。";
  }
  function renderQuick() {
    const emp = quickEmp();
    const r = C.compute(emp, quickRec(), R);
    const row = (a, b, strong) => `<tr${strong ? ' class="strong"' : ""}><td>${a}</td><td class="num">${b}</td></tr>`;
    $("quickOut").innerHTML = `
      <h2>計算結果（保存されません）</h2>
      <table class="slip-sum">
        ${row("総支給額", fmt(r.gross) + "円")}
        ${row("課税対象額", fmt(r.taxableGross) + "円")}
        ${row("社会保険料（健康・介護・厚生年金）", fmt(r.health + r.care + r.pension) + "円")}
        ${row("雇用保険料", fmt(r.employment) + "円")}
        ${row("所得税（源泉徴収）", fmt(r.incomeTax) + "円")}
        ${row("その他控除", fmt(r.otherDeductTotal) + "円")}
        ${row("控除計", fmt(r.deductionTotal) + "円")}
        ${row("差引支給額（手取り）", fmt(r.net) + "円", true)}
      </table>
      ${breakdownHtml(emp, r)}
      <p class="note">※簡易計算の結果です。社会保険料・所得税は概算で、年末調整や各種控除は含みません。</p>`;
  }
  function initQuick() {
    $("qPref").innerHTML = PREFS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("") + '<option value="other">その他（手入力）</option>';
    const deps = [];
    for (let i = 0; i <= 7; i++) deps.push(`<option value="${i}">${i}人</option>`);
    $("qDeps").innerHTML = deps.join("");
    // 標準報酬月額の手動指定（空欄は等級表で自動決定）
    const stdOptions = stdOptionsHtml;
    $("qHStd").innerHTML = stdOptions(R.healthGrades);
    $("qPStd").innerHTML = stdOptions(R.pensionGrades);
    setVal("qPref", "tokyo");
    const now = new Date();
    setVal("qYm", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    updateQuickRate();
    renderQuick();
    const onQuick = (ev) => {
      if (ev.target.id === "qPref") updateQuickRate();
      renderQuick();
    };
    $("quickForm").addEventListener("input", onQuick);
    $("quickForm").addEventListener("change", onQuick);
    $("quickForm").addEventListener("submit", (ev) => { ev.preventDefault(); renderQuick(); });
  }

  // ---------- 標準報酬月額の履歴（社員画面） ----------
  function stdOptionsHtml(list) {
    return '<option value="">自動（給与額から決定）</option>' + list.map(([, std]) => `<option value="${std}">${fmt(std)}円</option>`).join("");
  }
  function renderStdList(emp) {
    const list = (emp && emp.stdHistory) || [];
    $("stdList").innerHTML = list.length
      ? list.slice().sort((a, b) => (a.from < b.from ? -1 : 1)).map((h) => `<li>${esc(ymLabel(h.from))}〜：健康保険 ${h.hStd ? fmt(h.hStd) + "円" : "自動"} ／ 厚生年金 ${h.pStd ? fmt(h.pStd) + "円" : "自動"} <button type="button" data-std-del="${esc(h.from)}">削除</button></li>`).join("")
      : '<li class="hint">履歴はありません（すべて等級表で自動決定）</li>';
    $("stdHint").textContent = emp ? "" : "社員を保存してから、履歴を追加できます。";
  }
  function currentStdEmp() { return db.employees.find((e) => e.id === val("empId")) || null; }
  function onStdAdd() {
    const emp = currentStdEmp();
    const from = val("stdFrom");
    if (!emp) { $("stdHint").textContent = "社員を保存してから、履歴を追加できます。"; return; }
    if (!from) { $("stdHint").textContent = "適用開始年月を選んでください。"; return; }
    emp.stdHistory = (emp.stdHistory || []).filter((h) => h.from !== from)
      .concat({ from, hStd: Number(val("stdH")) || "", pStd: Number(val("stdP")) || "" });
    saveDb();
    renderStdList(emp);
    setVal("stdFrom", "");
    loadCurrentRecord();
  }
  function onStdListClick(ev) {
    const from = ev.target.getAttribute("data-std-del");
    if (!from) return;
    const emp = currentStdEmp();
    if (!emp) return;
    emp.stdHistory = (emp.stdHistory || []).filter((h) => h.from !== from);
    saveDb();
    renderStdList(emp);
    loadCurrentRecord();
  }

  // ---------- 画面切替・初期化 ----------
  function showTab(id) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== id));
  }
  function initAll() {
    fillEmployeeSelects();
    renderEmpList();
    loadCurrentRecord();
    renderTransfer();
    renderLedger();
  }

  // 印刷対象を body の属性で指定し、CSS（style.css の @media print）で対象だけ出す
  function printTarget(name, render) {
    render();
    document.body.dataset.print = name;
    window.print();
  }

  function init() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    fillStaticSelects();
    initQuick();
    $("stdH").innerHTML = stdOptionsHtml(R.healthGrades);
    $("recHStd").innerHTML = stdOptionsHtml(R.healthGrades);
    $("recPStd").innerHTML = stdOptionsHtml(R.pensionGrades);
    $("stdP").innerHTML = stdOptionsHtml(R.pensionGrades);
    renderStdList(null);
    $("stdAddBtn").addEventListener("click", onStdAdd);
    $("stdList").addEventListener("click", onStdListClick);
    setVal("payYm", ym);
    setVal("transferYm", ym);
    setVal("ledgerYear", String(now.getFullYear()));

    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

    // 入力欄は左の入力フォームと明細の枠の2か所にある（枠は form の外なので両方に付ける）
    const onAnyInput = (ev) => {
      if (ev.target.id === "paySelect" || ev.target.id === "payYm" || ev.target.id === "payKind") { onSelectChange(); return; }
      if (ev.target.id === "hourly" || ev.target.id === "hours") {
        // アルバイトは時給×労働時間数で基本給を自動計算する
        const h = Number(String(val("hourly")).replace(/,/g, "")) || 0;
        const hr = Number(String(val("hours")).replace(/,/g, "")) || 0;
        if (h > 0 && hr > 0) setVal("basic", Math.round(h * hr));
      }
      onPayInput(ev);
    };
    ["input", "change"].forEach((type) => $("payForm").addEventListener(type, onAnyInput));
    $("allowRows").addEventListener("click", onRowsClick);
    $("dedRows").addEventListener("click", onRowsClick);
    $("addAllowBtn").addEventListener("click", () => { addRow("allowRows", null, true, false); onPayInput(null); });
    $("addDedBtn").addEventListener("click", () => { addRow("dedRows", null, false, false); onPayInput(null); });

    $("copyPrevBtn").addEventListener("click", copyPrevMonth);
    $("clearPayBtn").addEventListener("click", () => {
      const emp = currentEmp();
      if (!emp) return;
      delete db.records[emp.id][recKey(val("payYm"), val("payKind"))];
      saveDb();
      loadCurrentRecord();
    });
    $("printPayBtn").addEventListener("click", () => printTarget("pay", () => refresh(readRecFromForm())));
    $("textPayBtn").addEventListener("click", showSlipText);
    $("copyShareBtn").addEventListener("click", copyShareText);

    $("empForm").addEventListener("submit", onEmpSubmit);
    $("empResetBtn").addEventListener("click", resetEmpForm);
    $("empList").addEventListener("click", onEmpListClick);
    $("empPref").addEventListener("change", updateRateHint);
    // 区分を変えたとき、社会保険の初期値を合わせる（アルバイトは未加入が既定。必要なら手で変更できる）
    $("empType").addEventListener("change", () => {
      $("empInsured").checked = val("empType") !== "part";
    });

    $("transferYm").addEventListener("change", renderTransfer);
    $("printTransferBtn").addEventListener("click", () => printTarget("transfer", renderTransfer));
    $("ledgerEmp").addEventListener("change", () => { renderLedger(); renderGensen(); });
    $("ledgerYear").addEventListener("change", () => { renderLedger(); renderGensen(); });
    $("printLedgerBtn").addEventListener("click", () => printTarget("ledger", renderLedger));
    $("printGensenBtn").addEventListener("click", () => printTarget("gensen", renderGensen));

    $("exportBtn").addEventListener("click", exportData);
    $("importFile").addEventListener("change", (ev) => { if (ev.target.files[0]) importData(ev.target.files[0]); });

    window.addEventListener("afterprint", () => { delete document.body.dataset.print; });

    resetEmpForm();
    initAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
