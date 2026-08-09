"use client";

import { BACKEND_URL } from "@/app/config";
import { Appbar } from "@/components/Appbar";
import { Input } from "@/components/Input";
import { ZapCell } from "@/components/ZapCell";
import { PrimaryButton } from "@/components/buttons/Primarybutton";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// Custom hook to fetch available triggers and actions from your backend
function useAvailableActionsAndTriggers() {
  const [availableActions, setAvailableActions] = useState<any[]>([]);
  const [availableTriggers, setAvailableTriggers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const triggerRes = await axios.get<{ availableTriggers: any[] }>(`${BACKEND_URL}/api/v1/trigger/available`);
        setAvailableTriggers(triggerRes.data?.availableTriggers ?? []);

        const actionRes = await axios.get<{ availableActions: any[] }>(`${BACKEND_URL}/api/v1/action/available`);
        setAvailableActions(actionRes.data?.availableActions ?? []);
      } catch (e) {
        console.error("Error fetching available items:", e);
      }
    };
    fetchData();
  }, []);

  return { availableActions, availableTriggers };
}

type EditableZap = {
  id: string;
  trigger: {
    triggerId: string;
    metadata: Record<string, unknown>;
    type: { name: string };
  };
  actions: {
    id: string;
    sortingOrder: number;
    metadata: Record<string, unknown>;
    type: { id: string; name: string };
  }[];
};

export default function CreateZapPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ZapEditorPage />
    </Suspense>
  );
}

function ZapEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editZapId = searchParams.get("edit");
  const { availableActions, availableTriggers } = useAvailableActionsAndTriggers();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingZap, setIsLoadingZap] = useState(Boolean(editZapId));
  
  const [selectedTrigger, setSelectedTrigger] = useState<{
    id: string;
    name: string;
  }>();

  const [selectedActions, setSelectedActions] = useState<
    {
      index: number;
      availableActionId: string;
      availableActionName: string;
      metadata: any;
    }[]
  >([]);
  
  const [selectedModalIndex, setSelectedModalIndex] = useState<null | number>(null);

  useEffect(() => {
    if (!editZapId) return;

    const loadZap = async () => {
      try {
        const response = await axios.get<{ zap: EditableZap | null }>(
          `${BACKEND_URL}/api/v1/zap/${editZapId}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } },
        );
        const zap = response.data.zap;
        if (!zap) {
          alert("Zap not found.");
          router.push("/dashboard");
          return;
        }

        setSelectedTrigger({ id: zap.trigger.triggerId, name: zap.trigger.type.name });
        setSelectedActions(
          [...zap.actions]
            .sort((a, b) => a.sortingOrder - b.sortingOrder)
            .map((action, index) => ({
              index: index + 2,
              availableActionId: action.type.id,
              availableActionName: action.type.name,
              metadata: action.metadata,
            })),
        );
      } catch (error) {
        console.error("Error loading Zap:", error);
        alert("Failed to load Zap.");
        router.push("/dashboard");
      } finally {
        setIsLoadingZap(false);
      }
    };

    loadZap();
  }, [editZapId, router]);

  const handlePublish = async () => {
    if (!selectedTrigger?.id || isPublishing || isLoadingZap) return;
    
    setIsPublishing(true);
    try {
      const request = editZapId ? axios.put : axios.post;
      await request(
        editZapId ? `${BACKEND_URL}/api/v1/zap/${editZapId}` : `${BACKEND_URL}/api/v1/zap`,
        {
          availableTriggerId: selectedTrigger.id,
          triggerMetadata: {},
          actions: selectedActions.map((a) => ({
            availableActionId: a.availableActionId,
            actionMetadata: a.metadata,
          })),
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create zap.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Appbar />
      
      {/* Top Publish Bar */}
      <div className="flex justify-end bg-white border-b p-4 sticky top-0 z-10">
        <PrimaryButton onClick={handlePublish}>
          {isPublishing ? "Saving..." : editZapId ? "Save changes" : "Publish"}
        </PrimaryButton>
      </div>

      <div className="w-full flex flex-col items-center px-4 py-12 space-y-4">
        {isLoadingZap && <div className="text-slate-600">Loading Zap...</div>}
        {/* Trigger Cell */}
        <ZapCell
          onClick={() => setSelectedModalIndex(1)}
          name={selectedTrigger?.name || "Select a Trigger"}
          index={1}
        />

        {/* Dynamic Actions List */}
        <div className="w-full max-w-2xl space-y-4">
          {selectedActions.map((action, i) => (
            // FIX: Added unique key using ID and index
            <div key={`${action.availableActionId}-${i}`} className="flex justify-center w-full">
              <ZapCell
                onClick={() => setSelectedModalIndex(action.index)}
                name={action.availableActionName || "Select an Action"}
                index={action.index}
              />
            </div>
          ))}
        </div>

        {/* Add Action Button */}
        <div className="pt-4">
          <PrimaryButton
            onClick={() => {
              setSelectedActions((a) => [
                ...a,
                {
                  index: a.length + 2,
                  availableActionId: "",
                  availableActionName: "",
                  metadata: {},
                },
              ]);
            }}
          >
            <div className="text-xl px-2">+ Add Step</div>
          </PrimaryButton>
        </div>
      </div>

      {/* Logic Modal */}
      {selectedModalIndex !== null && (
        <Modal
          availableItems={selectedModalIndex === 1 ? availableTriggers : availableActions}
          index={selectedModalIndex}
          initialMetadata={
            selectedModalIndex === 1
              ? {}
              : selectedActions[selectedModalIndex - 2]?.metadata ?? {}
          }
          onSelect={(props) => {
            if (props === null) {
              setSelectedModalIndex(null);
              return;
            }
            if (selectedModalIndex === 1) {
              setSelectedTrigger({ id: props.id, name: props.name });
            } else {
              setSelectedActions((a) => {
                const newActions = [...a];
                newActions[selectedModalIndex - 2] = {
                  index: selectedModalIndex,
                  availableActionId: props.id,
                  availableActionName: props.name,
                  metadata: props.metadata,
                };
                return newActions;
              });
            }
            setSelectedModalIndex(null);
          }}
        />
      )}
    </div>
  );
}

/** * MODAL COMPONENT 
 */
function Modal({ index, onSelect, availableItems, initialMetadata }: {
  index: number;
  onSelect: (props: null | { name: string; id: string; metadata: any }) => void;
  availableItems: { id: string; name: string; image: string }[];
  initialMetadata: Record<string, unknown>;
}) {
  const [step, setStep] = useState(0);
  const [selectedAction, setSelectedAction] = useState<{ id: string; name: string }>();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Select {index === 1 ? "Trigger" : "Action"}</h2>
          <button onClick={() => onSelect(null)} className="text-gray-500 hover:text-black text-2xl">×</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Step 1: Specific Selectors based on Action Type */}
          {step === 1 && selectedAction?.id === "email" && (
            <EmailSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "discord" && (
            <DiscordSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "slack" && (
            <SlackSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "telegram" && (
            <TelegramSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "sms" && (
            <SmsSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "google-sheets" && (
            <GoogleSheetsSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {step === 1 && selectedAction?.id === "send-sol" && (
            <SolanaSelector initialMetadata={initialMetadata} setMetadata={(m) => onSelect({ ...selectedAction, metadata: m })} />
          )}

          {/* Step 0: General Item List */}
          {step === 0 && (
            <div className="grid gap-3">
              {availableItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (index === 1) {
                      onSelect({ ...item, metadata: {} });
                    } else {
                      setStep(1);
                      setSelectedAction(item);
                    }
                  }}
                  className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:bg-slate-50 transition-all border-slate-200"
                >
                  <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-contain" />
                  <span className="font-semibold text-slate-700">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** * SELECTOR COMPONENTS 
 */
function EmailSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [email, setEmail] = useState(String(initialMetadata.email || ""));
  const [body, setBody] = useState(String(initialMetadata.body || ""));

  return (
    <div className="space-y-4">
      <Input label="To" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Body" placeholder="Hello there..." value={body} onChange={(e) => setBody(e.target.value)} />
      <PrimaryButton onClick={() => setMetadata({ email, body })}>Continue</PrimaryButton>
    </div>
  );
}

function DiscordSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [webhookUrl, setWebhookUrl] = useState(String(initialMetadata.webhookUrl || ""));

  return (
    <div className="space-y-4">
      <Input
        label="Discord Webhook URL"
        placeholder="https://discord.com/api/webhooks/..."
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
      />
      <PrimaryButton onClick={() => setMetadata({ webhookUrl })}>Continue</PrimaryButton>
    </div>
  );
}

function SlackSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [webhookUrl, setWebhookUrl] = useState(String(initialMetadata.webhookUrl || ""));

  return (
    <div className="space-y-4">
      <Input
        label="Slack Incoming Webhook URL"
        placeholder="https://hooks.slack.com/services/..."
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
      />
      <PrimaryButton onClick={() => setMetadata({ webhookUrl })}>Continue</PrimaryButton>
    </div>
  );
}

function TelegramSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [botToken, setBotToken] = useState(String(initialMetadata.botToken || ""));
  const [chatId, setChatId] = useState(String(initialMetadata.chatId || ""));

  return (
    <div className="space-y-4">
      <Input label="Telegram Bot Token" placeholder="123456:ABC..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
      <Input label="Telegram Chat ID" placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} />
      <PrimaryButton onClick={() => setMetadata({ botToken, chatId })}>Continue</PrimaryButton>
    </div>
  );
}

function SmsSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [phoneNumber, setPhoneNumber] = useState(String(initialMetadata.phoneNumber || ""));

  return (
    <div className="space-y-4">
      <Input
        label="Destination Phone Number"
        placeholder="+15551234567"
        type="tel"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
      />
      <PrimaryButton onClick={() => setMetadata({ phoneNumber })}>Continue</PrimaryButton>
    </div>
  );
}

function GoogleSheetsSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [spreadsheetId, setSpreadsheetId] = useState(String(initialMetadata.spreadsheetId || ""));
  const [sheetName, setSheetName] = useState(String(initialMetadata.sheetName || ""));

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Share this spreadsheet with the service account email configured for this deployment before publishing.
      </p>
      <Input label="Google Sheet ID" placeholder="Spreadsheet ID from its URL" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} />
      <Input label="Sheet / Tab Name" placeholder="Sheet1" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
      <PrimaryButton onClick={() => setMetadata({ spreadsheetId, sheetName })}>Continue</PrimaryButton>
    </div>
  );
}

function SolanaSelector({ initialMetadata, setMetadata }: { initialMetadata: Record<string, unknown>; setMetadata: (m: any) => void }) {
  const [address, setAddress] = useState(String(initialMetadata.address || ""));
  const [amount, setAmount] = useState(String(initialMetadata.amount || ""));

  return (
    <div className="space-y-4">
      <Input label="Solana Address" placeholder="0x..." value={address} onChange={(e) => setAddress(e.target.value)} />
      <Input label="Amount (SOL)" placeholder="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <PrimaryButton onClick={() => setMetadata({ address, amount })}>Continue</PrimaryButton>
    </div>
  );
}
