"use client";

import { BACKEND_URL } from "@/app/config";
import { Appbar } from "@/components/Appbar";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Execution = {
  id: string;
  actionOrder: number;
  status: "PROCESSING" | "COMPLETED";
  createdAt: string;
  completedAt: string | null;
  solanaSignature: string | null;
};

type Run = {
  id: string;
  createdAt: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED";
  executions: Execution[];
};

type RunsResponse = {
  runs: Run[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const formatDate = (value: string) => new Date(value).toLocaleString();

export default function ZapRunsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    const loadRuns = async () => {
      setLoading(true);
      try {
        const response = await axios.get<RunsResponse>(
          `${BACKEND_URL}/api/v1/zap/${params.id}/runs?page=${page}&limit=20`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } },
        );
        setRuns(response.data.runs);
        setTotalPages(response.data.pagination.totalPages);
      } catch (error: any) {
        console.error("Error loading Zap runs:", error);
        if (error.response?.status === 403) router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    loadRuns();
  }, [page, params.id, router]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Appbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Run history</h1>
            <p className="mt-1 text-sm text-slate-600">Execution history for this Zap.</p>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
            onClick={() => router.push("/dashboard")}
          >
            Back to dashboard
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-600">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="rounded-lg border bg-white py-12 text-center text-slate-600">
            No runs yet.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const expanded = expandedRunId === run.id;
              return (
                <section key={run.id} className="overflow-hidden rounded-lg border bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
                    onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    aria-expanded={expanded}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{formatDate(run.createdAt)}</p>
                      <p className="mt-1 text-xs font-mono text-slate-500">{run.id}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t bg-slate-50 p-4">
                      <h2 className="mb-3 text-sm font-semibold text-slate-700">Action executions</h2>
                      {run.executions.length === 0 ? (
                        <p className="text-sm text-slate-600">No action has started yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {run.executions.map((execution) => (
                            <div key={execution.id} className="rounded border bg-white p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">Action {execution.actionOrder + 1}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(execution.status)}`}>
                                  {execution.status}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-slate-600">Started: {formatDate(execution.createdAt)}</p>
                              {execution.completedAt && (
                                <p className="mt-1 text-xs text-slate-600">Completed: {formatDate(execution.completedAt)}</p>
                              )}
                              {execution.solanaSignature && (
                                <p className="mt-1 break-all text-xs text-slate-600">Transaction: {execution.solanaSignature}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              Previous
            </button>
            <span className="py-2 text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button type="button" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)} className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function statusClass(status: Run["status"] | Execution["status"]) {
  if (status === "COMPLETED") return "bg-green-100 text-green-800";
  if (status === "PROCESSING") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}
