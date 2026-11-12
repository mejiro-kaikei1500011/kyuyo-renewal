const fs = require("fs");
const path = require("path");
const root = require("path").join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let html = read("index.html");
const css = read("style.css");
const scripts = ["data/rates.js", "js/calc.js"];
const seed = `<script>
(function(){
  if (localStorage.getItem("kyuyo-renewal-v1")) return;
  var ym = new Date().getFullYear() + "-" + String(new Date().getMonth()+1).padStart(2,"0");
  var db = { employees: [{ id:"sample1", name:"山田 太郎（サンプル）", company:"サンプル株式会社", insured:true, emp:"general", age40:false, deps:1, pref:"tokyo", customHealthRate:"", email:"" }],
    records: { sample1: {} } };
  db.records.sample1[ym + "|salary"] = { kind:"salary", basic:"300000", overtime:"10000", commute:"12000", absence:"", days:"", hours:"",
    allowances:[{name:"役職手当",amount:"20000",taxable:true},{name:"資格手当",amount:"",taxable:true},{name:"家族手当",amount:"",taxable:true},{name:"住宅手当",amount:"",taxable:true},{name:"皆勤手当",amount:"",taxable:true}],
    deductions:[{name:"社宅家賃",amount:"30000"}], residentOverride:"", refMonthly:"" };
  localStorage.setItem("kyuyo-renewal-v1", JSON.stringify(db));
})();
</script>`;
// 既存の <script src> と <link rel=stylesheet> を置き換える
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);
for (const s of scripts) {
  const re = new RegExp(`<script[^>]*src="${s.replace(/[/.]/g, "\\$&")}"[^>]*></script>`);
  if (!re.test(html)) throw new Error("script tag not found: " + s);
  html = html.replace(re, () => `<script>\n${read(s)}\n</script>`);
}
const appTag = /<script[^>]*src="js\/app\.js"[^>]*><\/script>/;
if (!appTag.test(html)) throw new Error("app.js tag not found");
html = html.replace(appTag, () => `${seed}\n<script>\n${read("js/app.js")}\n</script>`);
fs.mkdirSync(path.join(root, "dist/preview"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/preview/index.html"), html);
console.log("built", html.length, "bytes");
