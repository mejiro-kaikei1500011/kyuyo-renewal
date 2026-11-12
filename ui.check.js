// 使い方: npm i -D jsdom の後、node tests/ui.check.js（先に node build/bundle.js で dist/preview を作る）
const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "..", "dist", "preview", "index.html"), "utf8");
const errors = [];
const dom = new JSDOM(html, { url: "https://example.com/", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.console.error = (...a) => errors.push(a.join(" "));
w.addEventListener("error", (e) => errors.push(String(e.message)));
w.confirm = () => true;
w.alert = () => {};
w.open = () => null;
[...w.document.querySelectorAll("script")].forEach((s) => { try { w.eval(s.textContent); } catch (e) { errors.push("eval: " + e.message); } });
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
const $ = (id) => w.document.getElementById(id);
const ok = (name, cond) => console.log((cond ? "PASS " : "FAIL ") + name);

// 1. 初期表示
ok("prefecture options = 47 + other", $("empPref").options.length === 48);
ok("payslip has no input boxes (results only)", w.document.querySelectorAll("#payslip input").length === 0);
ok("payslip net shown", /円$/.test(w.document.querySelector('[data-k="net"]').textContent));
ok("net for sample = 256,484 (seed, 月額表・扶養1)", w.document.querySelector('[data-k="net"]').textContent === "256,484円");

// 2. 明細の入力欄を直接変更 → 数字だけ更新（枠は作り直さない）
const slipBefore = $("basic");
slipBefore.value = "400000";
slipBefore.dispatchEvent(new w.Event("input", { bubbles: true }));
ok("inline input keeps same element", $("basic") === slipBefore);
ok("inline input updates net", w.document.querySelector('[data-k="net"]').textContent !== "283,090円");
const saved = JSON.parse(w.localStorage.getItem("kyuyo-renewal-v1"));
const ym = $("payYm").value;
ok("inline input saved basic 400000", saved.records.sample1[ym + "|salary"].basic === "400000");

// 3. 左の欄の日数変更 → 保存されて枠が更新される
$("days").value = "20";
$("days").dispatchEvent(new w.Event("input", { bubbles: true }));
ok("days saved", JSON.parse(w.localStorage.getItem("kyuyo-renewal-v1")).records.sample1[ym + "|salary"].days === "20");

// 4. 手当追加・削除
const before = $("allowRows").querySelectorAll(".dyn-row").length;
$("addAllowBtn").click();
ok("add allowance row", $("allowRows").querySelectorAll(".dyn-row").length === before + 1);
$("allowRows").querySelectorAll(".dyn-row")[before].querySelector(".dyn-del").click();
ok("delete allowance row", $("allowRows").querySelectorAll(".dyn-row").length === before);

// 5. 前月コピー（UI経由で前月を入力 → 当月へ戻って「前月コピー」）
const prevYmStr = (() => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();
const setYm = (v) => { $("payYm").value = v; $("payYm").dispatchEvent(new w.Event("change", { bubbles: true })); };
setYm(prevYmStr);
$("basic").value = "250000"; $("basic").dispatchEvent(new w.Event("input", { bubbles: true }));
$("days").value = "22"; $("days").dispatchEvent(new w.Event("input", { bubbles: true }));
setYm(ym);
$("clearPayBtn").click();
$("copyPrevBtn").click();
const copied = JSON.parse(w.localStorage.getItem("kyuyo-renewal-v1")).records.sample1[ym + "|salary"];
ok("copy prev: basic copied", copied && copied.basic === "250000");
ok("copy prev: days not copied", copied && copied.days === "");

// 6. 源泉徴収票（参考）
$("ledgerEmp").value = "sample1";
$("ledgerEmp").dispatchEvent(new w.Event("change", { bubbles: true }));
$("printGensenBtn").click && 0;
const gensenText = $("gensenOut").textContent;
ok("gensen rendered", gensenText.includes("源泉徴収票（参考・概算）"));
ok("gensen has tax row", gensenText.includes("源泉徴収税額"));

// 7. 賃金台帳と振込一覧
ok("ledger rendered", $("ledgerOut").textContent.includes("賃金台帳"));
$("transferYm").value = ym;
$("transferYm").dispatchEvent(new w.Event("change", { bubbles: true }));
ok("transfer lists sample", $("transferOut").textContent.includes("山田 太郎"));

// 8. メール・LINE（画面遷移はスタブ）
$("mailPayBtn").click();
ok("mail share message set", $("shareMsg").textContent.includes("メール"));
$("linePayBtn").click();
ok("line share message set", $("shareMsg").textContent.includes("LINE"));

// 9. 賞与切替
$("payKind").value = "bonus";
$("payKind").dispatchEvent(new w.Event("change", { bubbles: true }));
ok("bonus shows 賞与額 input", !!$("bonusAmount"));
ok("bonus hides allowance rows", $("allowRows").children.length === 0);

// 10. 社員の登録
$("empName").value = "テスト 花子";
$("empPref").value = "kanagawa";
$("empPref").dispatchEvent(new w.Event("change", { bubbles: true }));
ok("kanagawa hides custom rate (known)", $("empCustomRateLabel").classList.contains("hidden"));
$("empForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
ok("employee added", JSON.parse(w.localStorage.getItem("kyuyo-renewal-v1")).employees.length === 2);

console.log("errors:", errors.length ? errors : "none");

// 11. 未入力の月は直前の月を引き継ぐ（新しい月を開く）
{
  const d = JSON.parse(w.localStorage.getItem("kyuyo-renewal-v1"));
  $("payKind").value = "salary";
  $("payKind").dispatchEvent(new w.Event("change", { bubbles: true }));
  const cur = $("payYm").value;
  const [yy, mm] = cur.split("-").map(Number);
  const nextY = mm === 12 ? yy + 1 : yy;
  const nextM = mm === 12 ? 1 : mm + 1;
  const nextYm = `${nextY}-${String(nextM).padStart(2, "0")}`;
  $("payYm").value = nextYm;
  $("payYm").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("next month carries prior basic", $("basic") && $("basic").value === "250000");
  ok("next month does not carry days", $("days").value === "");
  ok("next month shows carry message", $("shareMsg").textContent.includes("引き継いで"));
  $("payYm").value = cur;
  $("payYm").dispatchEvent(new w.Event("change", { bubbles: true }));
}
// 簡易計算：社員を登録せず計算でき、保存されないこと
{
  const before = w.localStorage.getItem("kyuyo-renewal-v1");
  $("qBasic").value = "300000";
  $("qBasic").dispatchEvent(new w.Event("input", { bubbles: true }));
  const out = $("quickOut").textContent;
  ok("quick calc shows net", out.includes("差引支給額") && /差引支給額（手取り）\s*[0-9,]+円/.test(out));
  ok("quick calc does not save", w.localStorage.getItem("kyuyo-renewal-v1") === before);
  $("qBasic").value = "";
  $("qBasic").dispatchEvent(new w.Event("input", { bubbles: true }));
}
console.log("errors (final):", errors.length ? errors : "none");
