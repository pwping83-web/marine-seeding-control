/**
 * 일회성 스모크: 중기예보 getMidLandFcst (node --env-file=.env 로 실행 후 삭제 가능)
 */
const k = (process.env.VITE_KMA_SERVICE_KEY || "").trim();
if (!k) {
  console.log("NO_VITE_KMA_SERVICE_KEY — .env 에 키를 넣으세요.");
  process.exit(0);
}
const now = new Date();
const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
const p = (n) => String(n).padStart(2, "0");
const base = kst.getHours() < 18 ? "0600" : "1800";
const tmFc = `${kst.getFullYear()}${p(kst.getMonth() + 1)}${p(kst.getDate())}${base}`;
const u = new URL("https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst");
u.searchParams.set("serviceKey", k);
u.searchParams.set("pageNo", "1");
u.searchParams.set("numOfRows", "3");
u.searchParams.set("dataType", "JSON");
u.searchParams.set("regId", "11H20000");
u.searchParams.set("tmFc", tmFc);
const res = await fetch(u.toString());
const j = await res.json();
const h = j?.response?.header;
console.log("HTTP", res.status, "resultCode=", h?.resultCode ?? h?.resultcode, "msg=", h?.resultMsg ?? h?.resultmsg ?? "");
