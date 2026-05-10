/** 브라우저에만 보관되는 금일 작업 보조용 현장 메모 (서버 전송 없음) */

const KEY = "marine-work-ai-user-note-v1";
const MAX_LEN = 4000;

export function loadWorkAiUserNote(): string {
  try {
    if (typeof localStorage === "undefined") return "";
    const v = localStorage.getItem(KEY);
    return typeof v === "string" ? v.slice(0, MAX_LEN) : "";
  } catch {
    return "";
  }
}

export function saveWorkAiUserNote(text: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const t = text.trim().slice(0, MAX_LEN);
    if (t.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* private mode 등 */
  }
}
