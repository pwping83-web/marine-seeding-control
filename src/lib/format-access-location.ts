/**
 * ipwho.is 등에서 오는 영문 행정구역을
 * "대구 수성구", "경기 성남시" 형식의 한 줄 한국어 라벨로 만듭니다.
 */

const KR_REGION_EN_TO_KO: Record<string, string> = {
  Seoul: "서울",
  Busan: "부산",
  Daegu: "대구",
  Incheon: "인천",
  Gwangju: "광주",
  Daejeon: "대전",
  Ulsan: "울산",
  Sejong: "세종",
  "Sejong-si": "세종",
  Gangwon: "강원",
  "Gangwon-do": "강원",
  Gyeonggi: "경기",
  "Gyeonggi-do": "경기",
  "North Chungcheong": "충북",
  "Chungcheongbuk-do": "충북",
  "South Chungcheong": "충남",
  "Chungcheongnam-do": "충남",
  "North Jeolla": "전북",
  "Jeollabuk-do": "전북",
  "South Jeolla": "전남",
  "Jeollanam-do": "전남",
  "North Gyeongsang": "경북",
  "Gyeongsangbuk-do": "경북",
  "South Gyeongsang": "경남",
  "Gyeongsangnam-do": "경남",
  Jeju: "제주",
  "Jeju-do": "제주",
};

/** ipwho `region_code` 등 숫자 코드 → 한글 (행정안전부 시·도 코드 계열) */
const KR_REGION_CODE_TO_KO: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
};

/** 영문 시·군·구·읍면 단위 (ipwho city 필드) */
const KR_CITY_EN_TO_KO: Record<string, string> = {
  // 광역시 구 (일부)
  "Jung-gu": "중구",
  "Dong-gu": "동구",
  "Seo-gu": "서구",
  "Nam-gu": "남구",
  "Buk-gu": "북구",
  "Suseong-gu": "수성구",
  "Dalseo-gu": "달서구",
  "Dalseong-gun": "달성군",
  "Yuseong-gu": "유성구",
  "Daedeok-gu": "대덕구",
  "Gangnam-gu": "강남구",
  "Gangbuk-gu": "강북구",
  "Gangdong-gu": "강동구",
  "Gangseo-gu": "강서구",
  "Gwanak-gu": "관악구",
  "Gwangjin-gu": "광진구",
  "Guro-gu": "구로구",
  "Geumcheon-gu": "금천구",
  "Nowon-gu": "노원구",
  "Dobong-gu": "도봉구",
  "Dongdaemun-gu": "동대문구",
  "Dongjak-gu": "동작구",
  "Mapo-gu": "마포구",
  "Seodaemun-gu": "서대문구",
  "Seocho-gu": "서초구",
  "Seongdong-gu": "성동구",
  "Seongbuk-gu": "성북구",
  "Songpa-gu": "송파구",
  "Yangcheon-gu": "양천구",
  "Yeongdeungpo-gu": "영등포구",
  "Yongsan-gu": "용산구",
  "Eunpyeong-gu": "은평구",
  "Jongno-gu": "종로구",
  "Jungnang-gu": "중랑구",
  "Haeundae-gu": "해운대구",
  "Saha-gu": "사하구",
  "Sasang-gu": "사상구",
  "Yeongdo-gu": "영도구",
  "Busanjin-gu": "부산진구",
  "Geumjeong-gu": "금정구",
  "Gijang-gun": "기장군",
  "Yeonsu-gu": "연수구",
  "Michuhol-gu": "미추홀구",
  "Bupyeong-gu": "부평구",
  "Gyeyang-gu": "계양구",
  "Gwangsan-gu": "광산구",
  // 시·군 (일부)
  "Seongnam-si": "성남시",
  "Suwon-si": "수원시",
  "Yongin-si": "용인시",
  "Goyang-si": "고양시",
  "Changwon-si": "창원시",
  "Cheonan-si": "천안시",
  "Jeonju-si": "전주시",
  "Cheongju-si": "청주시",
  "Ansan-si": "안산시",
  "Anyang-si": "안양시",
  "Bucheon-si": "부천시",
  "Hwaseong-si": "화성시",
  "Namyangju-si": "남양주시",
  "Pohang-si": "포항시",
  "Uijeongbu-si": "의정부시",
  "Gimhae-si": "김해시",
  "Pyongtaek-si": "평택시",
  "Pyeongtaek-si": "평택시",
};

function normalizeRegionKey(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function regionToKo(region: string | null | undefined): string | null {
  if (!region) return null;
  const k = normalizeRegionKey(region);
  if (/^\d+$/.test(k)) {
    return KR_REGION_CODE_TO_KO[k] ?? null;
  }
  return KR_REGION_EN_TO_KO[k] ?? KR_REGION_EN_TO_KO[k.replace(/ Province$/i, "")] ?? null;
}

function regionCodeToKo(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  return KR_REGION_CODE_TO_KO[c] ?? null;
}

function isKoreanPostalOnly(s: string): boolean {
  return /^\d{5}$/.test(s.trim());
}

function cityToKo(city: string | null | undefined): string | null {
  if (!city) return null;
  const k = normalizeRegionKey(city);
  return KR_CITY_EN_TO_KO[k] ?? null;
}

function isKorea(country: string | null | undefined, countryCode: string | null | undefined): boolean {
  const c = (countryCode ?? "").toUpperCase();
  if (c === "KR") return true;
  const n = (country ?? "").toLowerCase();
  return n.includes("korea") || n === "republic of korea" || n === "south korea";
}

/**
 * 접속 위치 한 줄 (한국은 "대구 수성구" 스타일, 그 외는 영문 지명 + IP)
 * @param params.omitIp true면 메일 등 사람이 읽는 문구에서 IP 괄호 제거
 */
export function formatAccessLocationForDisplay(params: {
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  /** ipwho.is `region_code` (예: "41" 경기) */
  region_code?: string | null;
  city?: string | null;
  ip?: string | null;
  omitIp?: boolean;
}): string {
  const { country, countryCode, region, region_code, city, ip, omitIp } = params;
  const ipPart = !omitIp && ip ? `(IP: ${ip})` : "";

  if (isKorea(country, countryCode)) {
    const enR = region?.trim() ?? "";
    const rawCity = city?.trim() ?? "";
    /** 우편번호·숫자만 오는 city(오분류)는 지명으로 쓰지 않음 */
    const enC =
      !rawCity || isKoreanPostalOnly(rawCity) || /^\d+$/.test(rawCity) ? "" : rawCity;

    if (enR && enC && enR.toLowerCase() === enC.toLowerCase()) {
      const one =
        regionToKo(region) ?? regionCodeToKo(region_code) ?? cityToKo(city) ?? enR;
      return ipPart ? `${one} ${ipPart}`.trim() : one;
    }

    const koR =
      (regionToKo(region) ?? regionCodeToKo(region_code) ?? (enR && !/^\d+$/.test(enR) ? enR : "")) || "";
    const koC = cityToKo(city) ?? (enC || "");

    if (koR && koC && koR === koC) {
      return ipPart ? `${koR} ${ipPart}`.trim() : koR;
    }
    if (koR && koC) {
      const line = `${koR} ${koC}`.trim();
      return ipPart ? `${line} ${ipPart}`.trim() : line;
    }
    if (koR) {
      return ipPart ? `${koR} ${ipPart}`.trim() : koR;
    }
    if (koC) {
      return ipPart ? `${koC} ${ipPart}`.trim() : koC;
    }
    return ip ? `위치 미확인 ${ipPart}`.trim() : "위치 미확인";
  }

  const placeParts = [city, region, country].filter(Boolean) as string[];
  if (placeParts.length > 0) {
    const base = placeParts.join(", ");
    return ipPart ? `${base} ${ipPart}`.trim() : base;
  }
  return ip ? `위치 미확인 ${ipPart}`.trim() : "위치 미확인";
}
