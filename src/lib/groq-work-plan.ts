/**
 * Groq — 금일 작업 시간·작업량·범위 보조 요약 (선택).
 */

import { isGroqConfigured } from "./groq-weather";
import type { WorkRecommendationLocal, SafetyTri } from "./work-recommendation";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const MODEL = "llama-3.3-70b-versatile";

export interface WorkPlanGroqBrief {
  /** 추천 시간대 보조 한 줄 */
  timeHint: string;
  /** 작업량 보조 한 줄 */
  workloadHint: string;
  /** 작업 범위 보조 한 줄 */
  scopeHint: string;
  /** 주의 한 줄 */
  caution: string;
  /** 종자 해저 안착·과제형 50% 참고선 보조 한 줄 */
  attachmentHint: string;
  /** 항속·휴항 등 행동 보조 한 줄 */
  operationHint: string;
}

export async function analyzeWorkPlanBriefWithGroq(params: {
  safetyLevel: SafetyTri;
  windMps: number;
  waveM: number;
  temp: number;
  local: WorkRecommendationLocal;
  /** 관제자가 적은 현장·상황 메모(있으면 보조 문구에 반영) */
  userNote?: string;
  /** 풍속·파고 등 ‘지금’ 수치의 출처(예보·상황보고) — AI가 문맥에 맞게 언급 */
  nowcastContext?: string;
}): Promise<WorkPlanGroqBrief | null> {
  if (!isGroqConfigured()) return null;
  const key = import.meta.env.VITE_GROQ_API_KEY?.trim();
  if (!key) return null;

  const { safetyLevel, windMps, waveM, temp, local, userNote, nowcastContext } = params;
  const note = (userNote ?? "").trim();
  const noteBlock =
    note.length > 0
      ? `

[관제자·현장 메모(사용자 입력, 참고만)]
${note.slice(0, 2000)}`
      : "";

  const prompt = `
당신은 해양 종자 살포 현장의 관제 보조 역할입니다. 아래는 이미 시스템이 계산한 참고안(법적 판단 아님)입니다. 이를 바탕으로 관공서·선장이 읽기 쉬운 짧은 한국어로만 JSON으로 답하세요. 과장·법적 단정 금지. "권고", "검토" 표현 사용.
관제자·현장 메모가 있으면 그 내용을 시간·작업량·범위·주의 문구에 자연스럽게 녹이되, 메모와 예보가 충돌하면 예보·안전레벨을 우선하세요.
「살포 성공(통신)」과「해저 안착·이후 수확」은 다른 개념임을 존중하고, 국가 R&D·실증에서 자주 쓰는 사후 평가 참고선(안착 또는 수확 50% 전후)을 언급할 때는 추정치임을 분명히 하세요.

[시스템 참고안]
- 추천 시간: ${local.recommendedTime}
- 작업량: ${local.workload}
- 범위: ${local.scope}
- 안착·과제 참고(시스템 추정): ${local.attachmentOutlook.slice(0, 420)}
- 현장 행동(시스템): ${local.attachmentOperationCue.slice(0, 280)}

[현재 수치]
- 안전레벨: ${safetyLevel}
- 풍속 ${windMps.toFixed(1)} m/s, 파고 ${waveM.toFixed(1)} m, 기온 ${temp.toFixed(0)}°C${noteBlock}
${nowcastContext?.trim() ? `\n[지금 구간 데이터 출처]\n${nowcastContext.trim()}` : ""}

다음 JSON만 출력 (다른 텍스트 없이):
{"timeHint":"40자 이내","workloadHint":"40자 이내","scopeHint":"40자 이내","caution":"32자 이내","attachmentHint":"40자 이내","operationHint":"40자 이내"}
`.trim();

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        max_tokens: 280,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.warn("[groq-work-plan] API 오류", res.status);
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<WorkPlanGroqBrief>;
    return {
      timeHint: parsed.timeHint?.trim() || "",
      workloadHint: parsed.workloadHint?.trim() || "",
      scopeHint: parsed.scopeHint?.trim() || "",
      caution: parsed.caution?.trim() || "",
      attachmentHint: parsed.attachmentHint?.trim() || "",
      operationHint: parsed.operationHint?.trim() || "",
    };
  } catch (e) {
    console.warn("[groq-work-plan] 분석 실패", e);
    return null;
  }
}
