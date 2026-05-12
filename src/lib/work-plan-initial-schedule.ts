import type { WorkEntry } from "@/app/work-plan-types";

/** 작업 계획·예약 시연용 기본 일정 — DB 시드·로컬 초기화·전체 초기화에서 공통 사용 */
export const INITIAL_WORK_SCHEDULE: WorkEntry[] = [
  { id: "w01", date: "2026-04-21", zone: "제2구역 A", targetSeeds: 850, vessel: "제3해양살포함", status: "completed", actual: 862 },
  { id: "w02", date: "2026-04-24", zone: "제3구역 B", targetSeeds: 920, vessel: "제3해양살포함", status: "completed", actual: 905 },
  { id: "w03", date: "2026-04-28", zone: "제3구역 C", targetSeeds: 780, vessel: "제3해양살포함", status: "completed", actual: 791 },
  { id: "w04", date: "2026-04-30", zone: "제1구역 B", targetSeeds: 860, vessel: "제3해양살포함", status: "completed", actual: 848 },
  { id: "w05", date: "2026-05-01", zone: "제3구역 B", targetSeeds: 900, vessel: "제3해양살포함", status: "completed", actual: 918 },
  { id: "w06", date: "2026-05-07", zone: "제2구역 B", targetSeeds: 850, vessel: "제3해양살포함", status: "weather-hold", note: "풍속 19 kt 초과 — 익일 재예약" },
  { id: "w07", date: "2026-05-08", zone: "제2구역 B", targetSeeds: 850, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w08", date: "2026-05-12", zone: "제1구역 A", targetSeeds: 960, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w09", date: "2026-05-15", zone: "제3구역 A", targetSeeds: 800, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w10", date: "2026-05-20", zone: "제2구역 C", targetSeeds: 880, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w11", date: "2026-05-22", zone: "제3구역 B", targetSeeds: 920, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w12", date: "2026-05-27", zone: "제1구역 B", targetSeeds: 750, vessel: "제3해양살포함", status: "scheduled" },
  { id: "w13", date: "2026-05-29", zone: "제2구역 A", targetSeeds: 900, vessel: "제3해양살포함", status: "scheduled" },
];
