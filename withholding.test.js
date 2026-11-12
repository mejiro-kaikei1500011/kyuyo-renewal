// 月額表（甲欄・乙欄）の源泉所得税の検算
const assert = require("assert");
const R = require("../data/rates.js");
const C = require("../js/calc.js");

const kou = (deps) => ({ withholdingCol: "kou" });
const otsu = () => ({ withholdingCol: "otsu" });
const W = (x, deps, col) => C.monthlyWithholding(x, col === "otsu" ? otsu() : kou(), deps, R);

// 国税庁の表の値（帯・固定点）
assert.strictEqual(W(299000, 1, "kou"), 6320, "甲 299,000 扶養1");
assert.strictEqual(W(299000, 1, "otsu"), 53600, "乙 299,000");
assert.strictEqual(W(254000, 0, "kou"), 6320, "甲 254,000 扶養0");
assert.strictEqual(W(254000, 0, "otsu"), 37600, "乙 254,000");
assert.strictEqual(W(737500, 0, "kou"), 71380, "甲 737,500（帯の下端）");
assert.strictEqual(W(740000, 0, "kou"), 71680, "甲 740,000（固定点）");
assert.strictEqual(W(740000, 7, "kou"), 26410, "甲 740,000 扶養7");
assert.strictEqual(W(740000, 0, "otsu"), 259200, "乙 740,000（固定点）");
assert.strictEqual(W(790000, 0, "kou"), 81890, "甲 790,000（固定点）");
assert.strictEqual(W(960000, 0, "kou"), 121820, "甲 960,000（固定点）");
assert.strictEqual(W(1710000, 0, "kou"), 374520, "甲 1,710,000（固定点）");
assert.strictEqual(W(1710000, 0, "otsu"), 655400, "乙 1,710,000（固定点）");

// 固定点の間は式（基準の税額 + 超過額×率、円未満切捨て）
assert.strictEqual(W(800000, 0, "kou"), 81890 + Math.floor(10000 * 23.483 / 100), "甲 800,000 式");
assert.strictEqual(W(800000, 0, "kou"), 84238);

// 105,000円未満：甲は0、乙は3.063%
assert.strictEqual(W(100000, 0, "kou"), 0, "甲 10万円未満は0");
assert.strictEqual(W(100000, 0, "otsu"), 3063, "乙 10万円未満は3.063%");

// 扶養人数は0〜7に丸める（乙欄は扶養を見ない）
assert.strictEqual(W(299000, 9, "kou"), W(299000, 7, "kou"), "扶養の上限7");
assert.strictEqual(W(299000, 0, "otsu"), W(299000, 5, "otsu"), "乙欄は扶養を使わない");

// 所得税の対象額（課税額 − 社会保険料等）で月額表を引いていること
const emp = { insured: true, emp: "general", age40: true, deps: 0, pref: "tokyo", withholdingCol: "kou" };
const r = C.compute(emp, { ym: "2026-11", kind: "salary", basic: 300000 }, R);
assert.strictEqual(r.employment, 1500, "雇用保険（一般 5/1000）");
const soc = r.health + r.care + r.pension + r.employment;
assert.strictEqual(r.socialForTax, soc, "社会保険料控除に雇用保険を含む");
assert.strictEqual(r.incomeTax, C.monthlyWithholding(r.taxableGross - r.socialForTax, emp, 0, R));
assert.strictEqual(r.net, r.gross - r.socialTotal - r.incomeTax);

// 乙欄の社員は乙欄の値になる
const o = C.compute({ ...emp, withholdingCol: "otsu" }, { ym: "2026-11", kind: "salary", basic: 300000 }, R);
assert.strictEqual(o.incomeTax, C.monthlyWithholding(o.taxableGross - o.socialForTax, { withholdingCol: "otsu" }, 0, R));
assert.ok(o.incomeTax > r.incomeTax, "乙欄は甲欄より高い");

console.log("withholding tests passed");
