/**
 * Groq AI — 기상 데이터 자연어 분석 리포트
 *
 * 사용 모델: llama-3.3-70b-versatile (무료 플랜, 빠른 추론)
 * API 문서 : https://console.groq.com/docs/openai
 *
 * 브라우저에서 직접 호출 (Vite VITE_GROQ_API_KEY 사용).
 * CORS 허용: Groq API는 브라우저 직접 호출을 지원합니다.
 */

import type { EmergencyAssessment } from "./kma-weather";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const MODEL     = "llama-3.3-70b-versatile";

export function isGroqConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GROQ_API_KEY?.trim());
}

// ─── 기상 자연어 분석 리포트 ──────────────────────────────────────────────────

export interface GroqWeatherReport {
  /** AI 생성 한 줄 요약 (관제탑 표시용) */
  summary: string;
  /** 상세 설명 (선택 노출) */
  detail: string;
  /** AI 권고 행동 */
  action: string;
}

export async function analyzeWeatherWithGroq(params: {
  windSpeed: number;
  waveHeight: number;
  temp: number;
  pop: number;        // 강수확률 %
  visibility: number; // 시정 km
  assessment: EmergencyAssessment;
  minutesToDanger: number | null; // null = 위험 없음
  /** 관제 화면과 동일한 ‘지금’ 데이터 출처 안내(예보·상황보고 등) */
  nowcastContext?: string;
}): Promise<GroqWeatherReport | null> {
  const key = import.meta.env.VITE_GROQ_API_KEY?.trim();
  if (!key) return null;

  const { windSpeed, waveHeight, temp, pop, visibility, assessment, minutesToDanger, nowcastContext } = params;

  const dangerText = minutesToDanger !== null
    ? `약 ${Math.floor(minutesToDanger / 60)}시간 ${minutesToDanger % 60}분 후 위험 기상 도달 예상`
    : "향후 8시간 이내 위험 기상 없음";

  const prompt = `
당신은 해양 안전 전문가 AI입니다. 아래 기상 데이터를 분석하여 선박 관제탑이 즉시 조치할 수 있도록 짧고 명확한 한국어 리포트를 작성하세요.

[현재 기상 데이터]
- 풍속: ${windSpeed.toFixed(1)} m/s
- 파고: ${waveHeight.toFixed(1)} m
- 기온: ${temp.toFixed(1)}°C
- 강수확률: ${pop}%
- 시정: ${visibility.toFixed(1)} km
- AI 판정 레벨: ${assessment.level}
- 위험 도달 예측: ${dangerText}
${assessment.triggers.length > 0 ? `- 트리거 조건: ${assessment.triggers.join(", ")}` : ""}
${nowcastContext?.trim() ? `\n[지금 구간 데이터 출처]\n${nowcastContext.trim()}` : ""}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"summary":"한 줄 핵심 요약(20자 이내)","detail":"2~3문장 상세 분석","action":"관제탑 권고 행동 1문장"}
`.trim();

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 256,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.warn("[groq] API 오류", res.status, await res.text());
      return null;
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };

    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<GroqWeatherReport>;

    return {
      summary: parsed.summary ?? "AI 분석 완료",
      detail:  parsed.detail  ?? "",
      action:  parsed.action  ?? "",
    };
  } catch (e) {
    console.warn("[groq] 분석 실패", e);
    return null;
  }
}
