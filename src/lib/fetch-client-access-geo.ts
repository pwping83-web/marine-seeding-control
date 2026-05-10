import { formatAccessLocationForDisplay } from "@/lib/format-access-location";

export type ClientAccessGeo = {
  ip: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  /** ipwho.is 행정구역 코드 (예: 41=경기) */
  region_code: string | null;
  city: string | null;
};

/** 브라우저에서 공인 IP·대략 위치(ipwho.is) 조회 */
export async function fetchClientAccessGeo(): Promise<ClientAccessGeo> {
  let ip: string | null = null;
  let country: string | null = null;
  let countryCode: string | null = null;
  let region: string | null = null;
  let region_code: string | null = null;
  let city: string | null = null;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", {
      signal: ctl.signal,
    });
    if (!ipRes.ok) throw new Error("ipify_http");
    const ipJson = (await ipRes.json()) as { ip?: unknown };
    ip = typeof ipJson.ip === "string" && ipJson.ip.length < 80 ? ipJson.ip : null;
    if (ip) {
      try {
        const geoRes = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
          signal: ctl.signal,
        });
        if (!geoRes.ok) throw new Error("ipwho_http");
        const g = (await geoRes.json()) as {
          success?: boolean;
          country?: unknown;
          country_code?: unknown;
          region?: unknown;
          region_code?: unknown;
          city?: unknown;
        };
        if (g.success === true) {
          country = typeof g.country === "string" ? g.country : null;
          countryCode = typeof g.country_code === "string" ? g.country_code : null;
          region = typeof g.region === "string" ? g.region : null;
          region_code =
            g.region_code !== undefined && g.region_code !== null
              ? String(g.region_code)
              : null;
          city = typeof g.city === "string" ? g.city : null;
        }
      } catch {
        /* 위치 API 실패 시 IP만 */
      }
    }
  } catch {
    /* ipify 실패·타임아웃 */
  } finally {
    clearTimeout(timer);
  }

  return { ip, country, countryCode, region, region_code, city };
}

export function formatAccessTimeKorea(): string {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function geoToAccessLocationLine(
  geo: ClientAccessGeo,
  opts?: { forEmail?: boolean },
): string {
  return formatAccessLocationForDisplay({
    country: geo.country,
    countryCode: geo.countryCode,
    region: geo.region,
    region_code: geo.region_code,
    city: geo.city,
    ip: geo.ip ?? undefined,
    omitIp: opts?.forEmail === true,
  });
}
