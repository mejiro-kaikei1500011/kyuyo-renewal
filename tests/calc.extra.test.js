const assert = require("assert");
const R = require("../data/rates.js");
const C = require("../js/calc.js");
const emp = { insured: false, emp: "none", age40: false, deps: 0 };

// 課税手当は課税対象に入り、非課税手当は入らない
const a = C.compute(emp, { kind: "salary", basic: 200000, allowances: [
  { name: "役職手当", amount: "30,000", taxable: true },
  { name: "非課税の手当", amount: 5000, taxable: false }
] }, R);
assert.strictEqual(a.allowTotal, 35000);
assert.strictEqual(a.gross, 235000);
assert.strictEqual(a.taxableGross, 230000);

// 通勤手当：150,000円を超えた分だけ課税対象
const c1 = C.compute(emp, { kind: "salary", basic: 200000, commute: 170000 }, R);
assert.strictEqual(c1.commuteTaxable, 20000);
assert.strictEqual(c1.gross, 370000);
assert.strictEqual(c1.taxableGross, 220000);
const c2 = C.compute(emp, { kind: "salary", basic: 200000, commute: 100000 }, R);
assert.strictEqual(c2.commuteTaxable, 0);
assert.strictEqual(c2.taxableGross, 200000);

// その他控除は差引に引かれ、社会保険料控除には入らない
const d = C.compute({ insured: true, emp: "general", age40: false, deps: 0 },
  { kind: "salary", basic: 300000, deductions: [{ name: "社内積立", amount: 10000 }] }, R);
assert.strictEqual(d.otherDeductTotal, 10000);
assert.strictEqual(d.deductionTotal, d.socialTotal + d.incomeTax + 10000);
assert.strictEqual(d.net, d.gross - d.deductionTotal);

// 空の手当・控除行は無視される
const e = C.compute(emp, { kind: "salary", basic: 100000, allowances: [{ name: "", amount: "" }], deductions: [] }, R);
assert.strictEqual(e.allowTotal, 0);
assert.strictEqual(e.gross, 100000);

console.log("extra calc tests passed");

// 健康保険料率：都道府県 → 手入力 → 全国平均
const tokyo = { insured: true, emp: "general", pref: "tokyo", deps: 0 };
assert.strictEqual(C.healthRateFor(tokyo, R).ratePercent, 9.85);
assert.strictEqual(C.healthRateFor({ ...tokyo, pref: "saitama" }, R).ratePercent, 9.67);
const kn = C.healthRateFor({ ...tokyo, pref: "kanagawa" }, R);
assert.strictEqual(kn.source, "prefecture");
assert.strictEqual(kn.ratePercent, 9.92);
const cu = C.healthRateFor({ ...tokyo, pref: "niigata", customHealthRate: "9.80" }, R);
assert.strictEqual(cu.source, "custom");
assert.strictEqual(cu.ratePercent, 9.8);
console.log("rate selection tests passed");

// 子ども・子育て支援金：支払月が 2026-05 以降のみ天引き
const base = { insured: true, emp: "general", age40: false, deps: 0, pref: "tokyo" };
const apr = C.compute(base, { ym: "2026-04", kind: "salary", basic: 300000 }, R);
const may = C.compute(base, { ym: "2026-05", kind: "salary", basic: 300000 }, R);
assert.strictEqual(apr.child, 0);
assert.strictEqual(may.child, 345);
assert.strictEqual(may.childApplied, true);
assert.strictEqual(apr.childApplied, false);
// 全都道府県の表が47件あり、東京は 9.85
assert.strictEqual(Object.keys(R.health.byPrefecture).length, 47);
assert.strictEqual(R.health.byPrefecture.tokyo, 9.85);
console.log("child support tests passed");
