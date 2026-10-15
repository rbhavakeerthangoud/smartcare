"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isEmergency?: boolean;
}

interface PatientCareAssistantProps {
  planName?: string;
  tasksCount?: number;
}

const DEFAULT_SUGGESTIONS = [
  "What medications do I have scheduled for today?",
  "When is my next clinical appointment?",
  "What are the instructions for my surgical wound care?",
  "How should I record my blood pressure measurement?",
];

let messageIdSequence = 0;
function generateMessageId(prefix: string): string {
  messageIdSequence += 1;
  return `${prefix}-${messageIdSequence}`;
}

function formatCurrentTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function PatientCareAssistant({
  planName,
}: PatientCareAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hello! I am your SmartCare AI Assistant. I can answer questions about your clinician-approved plan${
        planName ? ` ("${planName}")` : ""
      }, explain your scheduled care tasks, and check your progress. How can I help you today?`,
      timestamp: "Today",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfiguredInfo, setUnconfiguredInfo] = useState<{
    code: string;
    requiredEnv: string[];
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  async function handleSendMessage(textToSend?: string) {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    setError(null);
    setUnconfiguredInfo(null);

    const userMessage: AssistantMessage = {
      id: generateMessageId("usr"),
      role: "user",
      content: query,
      timestamp: formatCurrentTimestamp(),
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      if (!token) {
        throw new Error("Authentication required: Please sign in to consult your care assistant.");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch("/api/patient/assistant", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: query,
          history: nextHistory.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 503 && data.code === "AI_PROVIDER_NOT_CONFIGURED") {
          setUnconfiguredInfo({
            code: data.code,
            requiredEnv: data.requiredEnv || ["GEMINI_API_KEY", "OPENAI_API_KEY"],
          });
          throw new Error(data.error || "AI Care Assistant is not yet configured on this server.");
        }
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }

      const assistantMessage: AssistantMessage = {
        id: generateMessageId("ast"),
        role: "assistant",
        content: data.response,
        timestamp: formatCurrentTimestamp(),
        isEmergency: data.isEmergency,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete your request.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSendMessage();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    void handleSendMessage(suggestion);
  }

  function handleRetry() {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      void handleSendMessage(lastUserMsg.content);
    }
  }

  return (
    <div
      className="flex flex-col rounded-2xl border border-white/10 bg-[#140612]/95 shadow-xl backdrop-blur-md"
      style={{ minHeight: "520px" }}
      aria-label="SmartCare AI Care Assistant"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#601D49] to-[#BD5579] text-white shadow-md shadow-[#601D49]/40">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 1 0 10 10H12V2Z" />
              <path d="M12 12 2.1 12.5" />
              <path d="m16 8 4-4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-white">AI Care Assistant</h2>
              <span className="rounded-full bg-[#601D49]/60 px-2 py-0.5 text-[0.65rem] font-semibold text-[#FFEBB8] border border-[#EA9D9D]/30">
                Grounded
              </span>
            </div>
            <p className="text-[0.7rem] text-[#EA9D9D]">
              {planName ? `Aligned with: ${planName}` : "Grounded in Clinician Instructions"}
            </p>
          </div>
        </div>

      </div>

      {/* Safety Notice Banner */}
      <div className="bg-[#601D49]/30 border-b border-[#EA9D9D]/20 px-4 py-2 text-[0.72rem] text-[#FFEBB8] flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-[#EA9D9D]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span className="leading-tight">
          Informational companion only. For emergencies or severe distress, call <strong>911</strong> or your local emergency department immediately.
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="flex-1 space-y-4 overflow-y-auto p-4 text-xs sm:p-5"
        role="log"
        aria-live="polite"
        style={{ maxHeight: "380px" }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-[#601D49] to-[#852765] text-[#FFEBB8] shadow-md shadow-[#601D49]/30"
                  : msg.isEmergency
                  ? "border border-rose-500/50 bg-rose-950/60 text-rose-100 shadow-lg shadow-rose-950/40"
                  : "border border-white/10 bg-[#1f0b1c]/80 text-slate-100 shadow-md shadow-black/20"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <div
                className={`mt-1.5 text-[0.65rem] ${
                  msg.role === "user" ? "text-[#FFEBB8]/70 text-right" : "text-slate-400"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1f0b1c]/80 px-4 py-3 text-slate-300">
              <span className="flex h-2 w-2 rounded-full bg-[#BD5579] animate-ping" />
              <span className="text-xs text-slate-300">Consulting your care plan…</span>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-rose-300">Unable to complete response</p>
                <p className="mt-1 text-slate-300">{error}</p>
                {unconfiguredInfo && (
                  <div className="mt-2 rounded-lg bg-black/40 p-2 text-[0.7rem] font-mono text-[#FFEBB8]">
                    Server requirement: Set <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> in <code>.env.local</code>.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="shrink-0 rounded-lg border border-rose-400/30 bg-rose-500/20 px-3 py-1 text-[0.7rem] font-semibold text-rose-100 hover:bg-rose-500/30 transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Questions */}
      {messages.length <= 3 && !loading && (
        <div className="border-t border-white/5 bg-black/20 px-4 py-2.5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#EA9D9D]">
            Suggested Care Questions:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DEFAULT_SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="rounded-lg border border-white/10 bg-[#240e21] px-2.5 py-1 text-[0.7rem] text-[#FFEBB8] hover:border-[#BD5579] hover:bg-[#32132d] transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="border-t border-white/10 p-3 bg-[#180a15]/90 rounded-b-2xl">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your care plan, medications, or tasks… (Press Enter to send)"
              aria-label="Care plan question input"
              className="w-full resize-none rounded-xl border border-white/10 bg-[#0c040b] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-[#BD5579] focus:outline-none focus:ring-1 focus:ring-[#BD5579]"
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send question"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#601D49] to-[#BD5579] text-white shadow-md shadow-[#601D49]/30 transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
