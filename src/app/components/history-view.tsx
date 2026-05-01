import { useMemo, useState } from "react";
import {
  Download,
  Search,
  FileSpreadsheet,
  Calendar,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { DropPoint } from "./seagrass-map";

export function HistoryView({ drops }: { drops: DropPoint[] }) {
  const [start, setStart] = useState("2026-04-01");
  const [end, setEnd] = useState("2026-05-01");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Success" | "Pending" | "Failed">("All");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drops
      .slice()
      .reverse()
      .filter((d) => {
        if (statusFilter !== "All" && d.status !== statusFilter) return false;
        if (!q) return true;
        return (
          d.id.toLowerCase().includes(q) ||
          d.status.toLowerCase().includes(q) ||
          d.time.toLowerCase().includes(q)
        );
      });
  }, [drops, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const reset = () => {
    setStart("2026-04-01");
    setEnd("2026-05-01");
    setQuery("");
    setStatusFilter("All");
    setPage(1);
  };

  const exportExcel = () => {
    const header = "ID\tDate\tTime (UTC)\tLatitude\tLongitude\tZone\tVessel\tStatus\n";
    const body = rows
      .map(
        (d) =>
          `${d.id}\t2026-05-01\t${d.time}\t${d.lat.toFixed(5)}\t${d.lng.toFixed(
            5
          )}\tA-04\tRV Poseidon\t${d.status}`
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seagrass-drops-${start}_to_${end}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[#0B2545]" style={{ fontSize: 22, fontWeight: 600 }}>
              Data History &amp; Export
            </h1>
            <p className="text-slate-500 mt-1" style={{ fontSize: 13 }}>
              Comprehensive record of all seed-block drops. Use filters to compile reporting periods.
            </p>
          </div>
          <Button
            onClick={exportExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 px-5 shadow-md"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export to Excel
            <span className="ml-1 px-1.5 py-0.5 rounded bg-white/20 tabular-nums" style={{ fontSize: 11 }}>
              {rows.length}
            </span>
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-8 pt-5 grid grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: rows.length, color: "text-[#0B2545]" },
          {
            label: "Success",
            value: rows.filter((r) => r.status === "Success").length,
            color: "text-emerald-600",
          },
          {
            label: "Pending",
            value: rows.filter((r) => r.status === "Pending").length,
            color: "text-amber-600",
          },
          {
            label: "Failed",
            value: rows.filter((r) => r.status === "Failed").length,
            color: "text-red-600",
          },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-slate-500" style={{ fontSize: 11, letterSpacing: 1 }}>
              {c.label.toUpperCase()}
            </div>
            <div className={`tabular-nums ${c.color}`} style={{ fontSize: 24, fontWeight: 600 }}>
              {c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Filter card */}
      <div className="px-8 py-5">
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 text-slate-700">
            <Filter className="w-4 h-4" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filters</span>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-slate-600 flex items-center gap-1.5" style={{ fontSize: 12 }}>
                <Calendar className="w-3.5 h-3.5" /> Start Date
              </label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-44 h-10" />
            </div>
            <div className="text-slate-400 pb-2.5">→</div>
            <div className="space-y-1.5">
              <label className="text-slate-600 flex items-center gap-1.5" style={{ fontSize: 12 }}>
                <Calendar className="w-3.5 h-3.5" /> End Date
              </label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-44 h-10" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-600" style={{ fontSize: 12 }}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-10 px-3 rounded-md border border-slate-200 bg-white text-slate-700"
                style={{ fontSize: 13 }}
              >
                <option>All</option>
                <option>Success</option>
                <option>Pending</option>
                <option>Failed</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <label className="text-slate-600 flex items-center gap-1.5" style={{ fontSize: 12 }}>
                <Search className="w-3.5 h-3.5" /> Search
              </label>
              <Input
                placeholder="Search by ID, status, time…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={reset}
              className="h-10 gap-2 border-slate-200 text-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-600" style={{ fontSize: 12 }}>
              <tr>
                <th className="text-left px-4 py-3" style={{ fontWeight: 600 }}>ID</th>
                <th className="text-left px-4 py-3" style={{ fontWeight: 600 }}>Date / Time</th>
                <th className="text-right px-4 py-3" style={{ fontWeight: 600 }}>Latitude</th>
                <th className="text-right px-4 py-3" style={{ fontWeight: 600 }}>Longitude</th>
                <th className="text-left px-4 py-3" style={{ fontWeight: 600 }}>Zone</th>
                <th className="text-left px-4 py-3" style={{ fontWeight: 600 }}>Vessel</th>
                <th className="text-left px-4 py-3" style={{ fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: 13 }}>
              {pageRows.map((d, i) => (
                <tr
                  key={d.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  }`}
                >
                  <td className="px-4 py-3 text-[#0B2545] tabular-nums" style={{ fontWeight: 500 }}>
                    #{d.id}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">
                    2026-05-01 · {d.time}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums text-right">
                    {d.lat.toFixed(5)}° N
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums text-right">
                    {d.lng.toFixed(5)}° E
                  </td>
                  <td className="px-4 py-3 text-slate-600">A-04</td>
                  <td className="px-4 py-3 text-slate-600">RV Poseidon</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
                        d.status === "Success"
                          ? "bg-emerald-100 text-emerald-700"
                          : d.status === "Pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                      style={{ fontSize: 11, fontWeight: 500 }}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          d.status === "Success"
                            ? "bg-emerald-500"
                            : d.status === "Pending"
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                      />
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageRows.length === 0 && (
            <div className="text-center text-slate-400 py-12" style={{ fontSize: 13 }}>
              No records match the current filter.
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="text-slate-500 tabular-nums" style={{ fontSize: 12 }}>
              Showing {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, rows.length)} of {rows.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-slate-700 tabular-nums" style={{ fontSize: 12 }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
