const assert = require("assert");
const R = require("../data/rates.js");
const C = require("../js/calc.js");

// 等級表
assert.strictEqual(C.gradeStd(R.healthGrades, 300000), 300000);
assert.strictEqual(C.gradeStd(R.healthGrades, 58000), 58000);
assert.strictEqual(C.gradeStd(R.healthGrades, 5000000), 1210000);
assert.strictEqual(C.gradeStd(R.pensionGrades, 50000), 88000);
assert.strictEqual(C.gradeStd(R.pensionGrades, 900000), 650000);

// 月額30万円・40歳以上・一般の事業・社会保険加入
const r = C.compute({ insured: true, emp: "general", age40: true, deps: 0, pref: "tokyo" },
  { ym: "2026-11", kind: "salary", basic: "３００，０００" }, R);
assert.strictEqual(r.gross, 300000);
assert.strictEqual(r.healthOnly, 14775);
assert.strictEqual(r.child, 345);
assert.strictEqual(r.health, 15120);
assert.strictEqual(r.care, 2430);
assert.strictEqual(r.pension, 27450);
assert.strictEqual(r.employment, 1500);
assert.strictEqual(r.socialTotal, 46500);
assert.ok(r.incomeTax >= 0);
assert.strictEqual(r.net, r.gross - r.socialTotal - r.incomeTax);

// 未加入（雇用保険のみ・建設）
const u = C.compute({ insured: false, emp: "construction", age40: false, deps: 0 },
  { kind: "salary", basic: 200000, overtime: 50000, commute: 10000, absence: 0 }, R);
assert.strictEqual(u.health, 0); assert.strictEqual(u.pension, 0);
assert.strictEqual(u.employment, Math.round(260000 * 6 / 1000));

// 不就労控除は総支給から引かれる
const a = C.compute({ insured: false, emp: "none", deps: 0 }, { kind: "salary", basic: 300000, absence: 20000 }, R);
assert.strictEqual(a.gross, 280000);


// 賞与：社保は1000円未満切捨て・上限
const b = C.compute({ insured: true, emp: "general", age40: false, deps: 0 }, { kind: "bonus", basic: 1234567 }, R);
assert.strictEqual(b.hStd, 1234000);
assert.strictEqual(b.pStd, 1234000 > 1500000 ? 1500000 : 1234000);

// 標準報酬月額の手動指定（簡易計算）：空欄は等級表、指定があればその額
{
  const base = { insured: true, emp: "general", age40: false, deps: 0, pref: "tokyo" };
  const rec = { ym: "2026-11", kind: "salary", basic: 300000 };
  const auto = C.compute(base, rec, R);
  const manual = C.compute({ ...base, hStdOverride: "200000", pStdOverride: "240000" }, rec, R);
  assert.strictEqual(auto.hStd, 300000);
  assert.strictEqual(manual.hStd, 200000);
  assert.strictEqual(manual.pStd, 240000);
  // 健康保険料（折半）＋子ども・子育て支援金（折半）。2026-11 は支援金の対象月
  assert.strictEqual(manual.health, Math.round(200000 * R.health.byPrefecture.tokyo / 100 / 2) + Math.round(200000 * R.health.childSupportPercent / 100 / 2));
}

// 標準報酬月額の履歴：適用開始年月の前は自動、以後は履歴の指定を使う
{
  const emp = { insured: true, emp: "general", age40: false, deps: 0, pref: "tokyo",
    stdHistory: [{ from: "2026-04", hStd: 200000, pStd: 200000 }, { from: "2026-10", hStd: "", pStd: "" }] };
  const at = (ym) => C.compute(emp, { ym, kind: "salary", basic: 300000 }, R).hStd;
  assert.strictEqual(at("2026-03"), 300000, "履歴より前は自動");
  assert.strictEqual(at("2026-04"), 200000, "開始月から指定");
  assert.strictEqual(at("2026-09"), 200000, "次の履歴まで指定が続く");
  assert.strictEqual(at("2026-10"), 300000, "空欄の履歴は自動に戻る");
}

// 給与記録の月ごとの指定は、社員の履歴より優先される（空欄なら履歴のまま）
{
  const emp = { insured: true, emp: "general", age40: false, deps: 0, pref: "tokyo",
    stdHistory: [{ from: "2026-04", hStd: 200000, pStd: 200000 }] };
  const monthly = (hStd) => C.compute(emp, { ym: "2026-11", kind: "salary", basic: 300000, hStd }, R).hStd;
  assert.strictEqual(monthly(""), 200000, "空欄は履歴");
  assert.strictEqual(monthly("260000"), 260000, "この月の指定が優先");
}

console.log("calc tests passed");
console.log(JSON.stringify(r, null, 1));
