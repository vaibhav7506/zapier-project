"use client";
import React from "react";
import { Appbar } from "@/components/Appbar";
import { DarkButton } from "@/components/buttons/Darkbutton";
import axios from "axios";
import { useEffect, useState } from "react";
import { BACKEND_URL, HOOKS_URL } from "@/app/config";
import { LinkButton } from "@/components/buttons/Linkbutton";
import { useRouter } from "next/navigation";

// --- START: CORRECTED ZAP INTERFACE ---
interface Zap {
  id: string;
  triggerId: string;
  userId: number;
  isActive: boolean;
 
  // "createdAt": string,
  actions: {
    id: string;
    zapId: string;
    actionId: string;
    sortingOrder: number; 
    type: {
      id: string;
      name: string;
      image: string;
    };
  }[];
  trigger: {
    id: string;
    zapId: string;
    triggerId: string;
    type: {
      id: string;
      name: string;
      image: string;
    };
  };
}
// --- END: CORRECTED ZAP INTERFACE ---

function useZaps() {
  const [loading, setLoading] = useState(true);
  const [zaps, setZaps] = useState<Zap[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    axios
      .get(`${BACKEND_URL}/api/v1/zap`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      })
      .then((res) => {
        setZaps((res.data as { zaps: Zap[] }).zaps);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching Zaps:", error);
        setLoading(false);
        if (error.response?.status === 403) {
          router.push("/login");
        }
      });
  }, [router]);

  const toggleZap = async (zapId: string) => {
    const token = localStorage.getItem("token");
    const previousZaps = zaps;
    const currentZap = zaps.find((zap) => zap.id === zapId);

    if (!currentZap) return;

    setZaps((current) =>
      current.map((zap) =>
        zap.id === zapId ? { ...zap, isActive: !zap.isActive } : zap,
      ),
    );

    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/v1/zap/${zapId}/toggle`,
        undefined,
        { headers: { Authorization: token ? `Bearer ${token}` : "" } },
      );
      const isActive = (response.data as { zap: { isActive: boolean } }).zap.isActive;
      setZaps((current) =>
        current.map((zap) => (zap.id === zapId ? { ...zap, isActive } : zap)),
      );
    } catch (error) {
      console.error("Error toggling Zap:", error);
      setZaps(previousZaps);
    }
  };

  const deleteZap = async (zapId: string) => {
    if (!window.confirm("Delete this Zap and all of its execution history? This cannot be undone.")) {
      return;
    }

    const token = localStorage.getItem("token");
    const previousZaps = zaps;
    setZaps((current) => current.filter((zap) => zap.id !== zapId));

    try {
      await axios.delete(`${BACKEND_URL}/api/v1/zap/${zapId}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
    } catch (error) {
      console.error("Error deleting Zap:", error);
      setZaps(previousZaps);
      alert("Failed to delete Zap.");
    }
  };

  return {
    loading,
    zaps,
    toggleZap,
    deleteZap,
  };
}

export default function DashboardPage() {
  const { loading, zaps, toggleZap, deleteZap } = useZaps();
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <Appbar />
      <div className="flex justify-center pt-4 sm:pt-8 px-4 sm:px-6">
        <div className="max-w-screen-lg w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4">
            <h1 className="text-xl sm:text-2xl font-bold">My Zaps</h1>
            <DarkButton onClick={() => router.push("/zap/create")}>
              Create
            </DarkButton>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">Loading...</div>
      ) : (
        <div className="flex justify-center overflow-x-auto">
          {" "}
          <ZapTable zaps={zaps} onToggle={toggleZap} onDelete={deleteZap} />{" "}
        </div>
      )}
    </div>
  );
}

function ZapTable({
  zaps,
  onToggle,
  onDelete,
}: {
  zaps: Zap[];
  onToggle: (zapId: string) => void;
  onDelete: (zapId: string) => void;
}) {
  const router = useRouter();

  return (
    <div className="p-4 sm:p-6 max-w-screen-lg w-full min-w-0">
      {/* Table header - visible on desktop */}
      <div className="hidden md:flex font-semibold border-b pb-3 text-sm text-gray-700">
        <div className="flex-1 min-w-[120px]">Integrations</div>
        <div className="flex-1 min-w-[100px]">ID</div>
        <div className="flex-1 min-w-[100px]">Created at</div>
        <div className="flex-1 min-w-[140px]">Webhook URL</div>
        <div className="w-64 text-center">Actions</div>
      </div>

      {/* Empty state */}
      {zaps.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No Zaps yet</p>
          <p className="text-sm mt-2">Create your first automation workflow</p>
        </div>
      )}

      {/* Zap rows - card view on mobile, table on desktop */}
      {zaps.map((z) => (
        <div
          key={z.id}
          className="border-b last:border-b-0 py-4 md:py-3 hover:bg-gray-50 transition-colors"
        >
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {/* Integrations */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-500 w-20 shrink-0">
                Apps:
              </span>
              <div className="flex space-x-2 items-center flex-wrap">
                <img
                  src={z.trigger.type.image}
                  className="w-10 h-10 rounded-full shrink-0 border-2 border-gray-200"
                  alt={z.trigger.type.name}
                  title={z.trigger.type.name}
                />
                {z.actions.map((x) => (
                  <img
                    key={x.id}
                    src={x.type.image}
                    className="w-10 h-10 rounded-full shrink-0 border-2 border-gray-200"
                    alt={x.type.name}
                    title={x.type.name}
                  />
                ))}
              </div>
            </div>

            {/* ID */}
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-gray-500 w-20 shrink-0">
                ID:
              </span>
              <span className="text-xs font-mono text-gray-700 break-all flex-1">
                {z.id}
              </span>
            </div>

            {/* Webhook URL */}
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-gray-500 w-20 shrink-0">
                Webhook:
              </span>
              <a
                href={`${HOOKS_URL}/hooks/catch/${z.userId}/${z.id}`}
                className="text-xs text-blue-600 hover:text-blue-800 underline break-all flex-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                {`${HOOKS_URL}/hooks/catch/${z.userId}/${z.id}`}
              </a>
            </div>

            {/* Action Button */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <ZapToggle zap={z} onToggle={onToggle} />
              <button
                type="button"
                className="text-sm text-slate-700 hover:text-slate-900"
                onClick={() => router.push(`/zap/${z.id}/runs`)}
              >
                View runs
              </button>
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => router.push(`/zap/create?edit=${z.id}`)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-red-600 hover:text-red-800"
                onClick={() => onDelete(z.id)}
              >
                Delete
              </button>
              <LinkButton onClick={() => router.push("/zap/" + z.id)}>
                View Details
              </LinkButton>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:flex md:items-center gap-4">
            {/* Integrations */}
            <div className="flex-1 min-w-[120px]">
              <div className="flex space-x-2 items-center">
                <img
                  src={z.trigger.type.image}
                  className="w-8 h-8 rounded-full shrink-0"
                  alt={z.trigger.type.name}
                  title={z.trigger.type.name}
                />
                {z.actions.map((x) => (
                  <img
                    key={x.id}
                    src={x.type.image}
                    className="w-8 h-8 rounded-full shrink-0"
                    alt={x.type.name}
                    title={x.type.name}
                  />
                ))}
              </div>
            </div>

            {/* ID */}
            <div className="flex-1 min-w-[100px]">
              <span
                className="text-xs font-mono text-gray-700 truncate block"
                title={z.id}
              >
                {z.id}
              </span>
            </div>

            {/* Created at */}
            <div className="flex-1 min-w-[100px]">
              <span className="text-sm text-gray-600">Nov 13, 2023</span>
            </div>

            {/* Webhook URL */}
            <div className="flex-1 min-w-[140px]">
              <a
                href={`${HOOKS_URL}/hooks/catch/${z.userId}/${z.id}`}
                className="text-xs text-blue-600 hover:text-blue-800 underline truncate block"
                title={`${HOOKS_URL}/hooks/catch/${z.userId}/${z.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View webhook
              </a>
            </div>

            {/* Action Button */}
            <div className="w-64 flex items-center justify-end gap-3">
              <ZapToggle zap={z} onToggle={onToggle} />
              <button
                type="button"
                className="text-sm text-slate-700 hover:text-slate-900"
                onClick={() => router.push(`/zap/${z.id}/runs`)}
              >
                Runs
              </button>
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => router.push(`/zap/create?edit=${z.id}`)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-red-600 hover:text-red-800"
                onClick={() => onDelete(z.id)}
              >
                Delete
              </button>
              <LinkButton onClick={() => router.push("/zap/" + z.id)}>
                Go
              </LinkButton>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ZapToggle({ zap, onToggle }: { zap: Zap; onToggle: (zapId: string) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={zap.isActive}
      aria-label={`Turn ${zap.isActive ? "off" : "on"} Zap ${zap.id}`}
      onClick={() => onToggle(zap.id)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        zap.isActive ? "bg-green-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          zap.isActive ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
