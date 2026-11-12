/*
 * 給与計算ロジック（DOMに依存しない純粋関数）
 * 料率は引数 R（data/rates.js の KYUYO_RATES）から受け取るので、改定時にコードを触る必要はありません。
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.KyuyoCalc = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const EMP_LABEL = {
    none: "未加入",
    general: "一般の事業",
    agri: "農林水産・清酒製造",
    construction: "建設の事業"
  };

  // 全角数字・カンマ・空白を取り除いて数値化する
  function num(v) {
    if (v === undefined || v === null) return 0;
    const s = String(v)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[,，\s円]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function floorTo(x, unit) {
    return Math.floor(x / unit) * unit;
  }

  // 等級表から標準報酬月額を引く。table は [上限(null可), 標準報酬月額] の配列
  function gradeStd(table, value) {
    for (const [upper, std] of table) {
      if (upper === null || value <= upper) return std;
    }
    return table[table.length - 1][1];
  }

  // 手当・控除の行を整形する（名称と金額。金額0の行は除外）
  function cleanRows(rows) {
    return (rows || [])
      .map((x) => ({ name: String(x.name || "").trim(), amount: num(x.amount), taxable: !!x.taxable }))
      .filter((x) => x.amount !== 0);
  }
  function sumRows(rows) {
    return rows.reduce((s, x) => s + x.amount, 0);
  }

  // 給与所得控除（概算。最低保障額は R から渡す）
  function salaryDeduction(annual, minimum) {
    let d;
    if (annual <= 1800000) d = annual <= 1625000 ? 650000 : annual * 0.4 - 100000;
    else if (annual <= 3600000) d = annual * 0.3 + 80000;
    else if (annual <= 6600000) d = annual * 0.2 + 440000;
    else if (annual <= 8500000) d = annual * 0.1 + 1100000;
    else d = 1950000;
    return Math.max(d, minimum);
  }

  // 所得税（年額・復興特別所得税込み）
  function incomeTaxAnnual(annualGross, annualSocial, deps, R) {
    const c = R.incomeTax;
    const taxable = floorTo(
      Math.max(0, annualGross - salaryDeduction(annualGross, c.salaryDeductionMinimum) - annualSocial - c.basicDeduction - deps * c.dependentDeduction),
      1000
    );
    if (taxable <= 0) return 0;
    for (const [upper, rate, fixed] of c.brackets) {
      if (upper === null || taxable <= upper) {
        const base = taxable * rate / 100 - fixed;
        return Math.floor(base * (1 + c.reconstructionPercent / 100));
      }
    }
    return 0;
  }

  // 月額表による源泉所得税（甲欄・乙欄）。x は「社会保険料等控除後の給与等の金額」
  // 表の固定点（exact）はそのまま使い、固定点の間は表の計算式（base の税額 + 超過額×率）で求める
  function monthlyWithholding(x, emp, deps, R) {
    const W = R.withholdingMonthly;
    const col = emp.withholdingCol === "otsu" ? "otsu" : "kou";
    deps = Math.max(0, Math.min(7, Math.floor(Number(deps) || 0)));
    if (x < W.lowLimit) {
      return col === "otsu" ? Math.floor(Math.max(0, x) * W.lowOtsuRatePercent / 100) : 0;
    }
    const pick = (e) => (col === "otsu" ? e.otsu : e.kou[deps]);
    const exact = W.exact[x];
    if (exact && pick(exact) !== null && pick(exact) !== undefined) return pick(exact);
    if (x <= 740000) {
      let lo = 0, hi = W.bands.length - 1, idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (W.bands[mid][0] <= x) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      const row = W.bands[idx];
      return col === "otsu" ? row[9] : row[1 + deps];
    }
    const formulas = col === "otsu" ? W.formulaOtsu : W.formulaKou;
    const f = formulas.find((g) => x > g.from && (g.to === null || x < g.to));
    if (!f) return 0;
    const baseTax = pick(W.exact[f.base]);
    return baseTax + Math.floor((x - f.base) * f.ratePercent / 100 + 1e-9);
  }

  // 健康保険料率の決定：都道府県の料率 → 社員の手入力 → 全国平均（後者ほど注意表示）
  function healthRateFor(emp, R) {
    const table = R.health.byPrefecture || {};
    const pref = emp.pref;
    if (pref && table[pref] !== undefined && table[pref] !== null) {
      return { ratePercent: table[pref], source: "prefecture" };
    }
    const custom = num(emp.customHealthRate);
    if (custom > 0) return { ratePercent: custom, source: "custom" };
    return { ratePercent: R.health.nationalAverage, source: "fallback" };
  }

  // 子ども・子育て支援金は支払月が childSupportFrom 以降のときだけ天引きする
  function childSupportApplies(ym, R) {
    if (!ym) return false;
    return ym >= R.health.childSupportFrom;
  }

  function socialAmounts(hStd, pStd, emp, R, withChild) {
    const half = 2;
    const rate = healthRateFor(emp, R);
    const healthOnly = Math.round(hStd * rate.ratePercent / 100 / half);
    const child = withChild ? Math.round(hStd * R.health.childSupportPercent / 100 / half) : 0;
    const care = emp.age40 ? Math.round(hStd * R.care.ratePercent / 100 / half) : 0;
    const pension = Math.round(pStd * R.pension.ratePercent / 100 / half);
    return { hStd, pStd, health: healthOnly + child, healthOnly, child, care, pension, healthRate: rate };
  }

  // 賞与の社会保険料（標準賞与額＝1000円未満切捨て、上限あり）
  function socialBonus(gross, emp, R, withChild) {
    const hStd = Math.min(floorTo(gross, 1000), R.bonusCap.healthPerPayment);
    const pStd = Math.min(floorTo(gross, 1000), R.bonusCap.pensionPerPayment);
    return socialAmounts(hStd, pStd, emp, R, withChild);
  }

  function socialMonthly(gross, emp, R, withChild) {
    return socialAmounts(gradeStd(R.healthGrades, gross), gradeStd(R.pensionGrades, gross), emp, R, withChild);
  }

  // 1件分の給与・賞与を計算する
  // emp : { insured, emp, age40, deps, pref, customHealthRate }
  // rec : { ym:'YYYY-MM', kind:'salary'|'bonus', basic, overtime, commute, absence,
  //         allowances:[{name,amount,taxable}], deductions:[{name,amount}],
  //         refMonthly }
  function compute(emp, rec, R) {
    const isBonus = rec.kind === "bonus";
    const basic = num(rec.basic);
    const overtime = isBonus ? 0 : num(rec.overtime);
    const commute = isBonus ? 0 : num(rec.commute);
    const absence = isBonus ? 0 : num(rec.absence);
    const allowances = isBonus ? [] : cleanRows(rec.allowances);
    const deductions = cleanRows(rec.deductions);
    const deps = Math.max(0, Math.min(7, num(emp.deps)));
    const withChild = childSupportApplies(rec.ym, R);

    const allowTotal = sumRows(allowances);
    const allowTaxable = sumRows(allowances.filter((x) => x.taxable));

    // 通勤手当は非課税限度額を超えた分だけ課税対象
    const commuteLimit = R.commuteNontaxableLimit || 0;
    const commuteTaxable = Math.max(0, commute - commuteLimit);

    // 総支給額（社会保険・雇用保険の対象。通勤手当は全額含む）
    const gross = isBonus ? basic : basic + overtime + commute + allowTotal - absence;
    // 課税対象額（所得税の対象）
    const taxableGross = isBonus ? basic : basic + overtime + allowTaxable + commuteTaxable - absence;

    let soc;
    if (emp.insured) soc = isBonus ? socialBonus(gross, emp, R, withChild) : socialMonthly(gross, emp, R, withChild);
    else soc = { hStd: 0, pStd: 0, health: 0, healthOnly: 0, child: 0, care: 0, pension: 0, healthRate: healthRateFor(emp, R) };
    const employment = Math.round(gross * (R.employmentPermille[emp.emp] || 0) / 1000);

    // 所得税の社会保険料控除の対象：健康保険・介護保険・厚生年金・雇用保険（国税庁の税額表の注記どおり）
    const socialForTax = soc.health + soc.care + soc.pension + employment;
    const socialTotal = soc.health + soc.care + soc.pension + employment;

    let incomeTax = 0;
    if (!isBonus) {
      // 給与の源泉所得税は月額表（甲欄・乙欄）で求める
      incomeTax = monthlyWithholding(taxableGross - socialForTax, emp, deps, R);
    } else {
      // 賞与の所得税：参考月給を含む年額の税額差（概算）
      const refMonthly = num(rec.refMonthly);
      const refSoc = emp.insured ? socialMonthly(refMonthly, emp, R, withChild) : { health: 0, care: 0, pension: 0 };
      const refEmployment = Math.round(refMonthly * (R.employmentPermille[emp.emp] || 0) / 1000);
      const refSocialTax = refSoc.health + refSoc.care + refSoc.pension + refEmployment;
      const baseAnnual = refMonthly * 12;
      const withBonus = incomeTaxAnnual(baseAnnual + taxableGross, refSocialTax * 12 + socialForTax, deps, R);
      const without = incomeTaxAnnual(baseAnnual, refSocialTax * 12, deps, R);
      incomeTax = Math.max(0, withBonus - without);
    }

    const otherDeductTotal = sumRows(deductions);
    const deductionTotal = socialTotal + incomeTax + otherDeductTotal;
    const net = gross - deductionTotal;

    return {
      kind: isBonus ? "bonus" : "salary",
      ym: rec.ym || "",
      basic, overtime, commute, absence,
      allowances, allowTotal, allowTaxable,
      commuteTaxable, commuteLimit,
      deductions, otherDeductTotal,
      gross, taxableGross,
      hStd: soc.hStd, pStd: soc.pStd,
      healthRate: soc.healthRate,
      childApplied: withChild,
      health: soc.health, healthOnly: soc.healthOnly, child: soc.child,
      care: soc.care, pension: soc.pension, employment,
      socialForTax, socialTotal, incomeTax,
      deductionTotal, net,
      empLabel: EMP_LABEL[emp.emp] || EMP_LABEL.none,
      ratesAsOf: R.asOf
    };
  }

  return {
    EMP_LABEL, num, gradeStd, healthRateFor, childSupportApplies,
    salaryDeduction, incomeTaxAnnual, monthlyWithholding, compute
  };
});
