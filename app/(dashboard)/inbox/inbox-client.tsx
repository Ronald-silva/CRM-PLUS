"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare, Plus, Send, Loader2, Bot,
  Mail, User, CheckCheck, Smartphone, Camera,
  AtSign, ChevronDown, Sparkles, FileText,
  Target, RefreshCw, Check, X, AlertTriangle,
  TrendingUp, HelpCircle, ThumbsDown, Clock,
  ShoppingCart, Flame, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvMessage = {
  id: string; content: string; direction: string;
  senderType: string; sentAt: string;
};

type ConvSummary = {
  id: string; channel: string; status: string; subject: string | null;
  lastMessageAt: string | null; createdAt: string;
  detectedIntent: string | null; summaryText: string | null;
  contact:      { id: string; name: string; email: string | null } | null;
  assignedUser: { id: string; name: string } | null;
  messages:     { content: string; direction: string; sentAt: string }[];
};

type ActiveConv = Omit<ConvSummary, "messages"> & { messages: ConvMessage[] };
type Contact    = { id: string; name: string; email: string | null };

type AiSummary = { summary: string; keyPoints: string[]; messageCount: number } | null;
type AiIntent  = { intent: string; confidence: number; details: string; taskCreated: boolean } | null;
type AiReply   = { suggestion: string; tone: string; confidence: number } | null;

type Props = {
  conversations:      ConvSummary[];
  contacts:           Contact[];
  statusCounts:       Record<string, number>;
  activeConversation: ActiveConv | null;
  currentUserId:      string;
  canCreate:          boolean;
  canUpdate:          boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp:  <Smartphone  className="w-3.5 h-3.5 text-green-600" />,
  instagram: <Camera      className="w-3.5 h-3.5 text-pink-600"  />,
  email:     <AtSign      className="w-3.5 h-3.5 text-blue-600"  />,
  manual:    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />,
};
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "E-mail", manual: "Manual",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-green-100 text-green-700", pending: "bg-yellow-100 text-yellow-700",
  resolved: "bg-slate-100 text-slate-500",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta", pending: "Pendente", resolved: "Resolvida",
};

const INTENT_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  complaint:       { label: "Reclamação",        color: "bg-red-100 text-red-700 border-red-200",        icon: <ThumbsDown className="w-3 h-3" />     },
  urgency:         { label: "Urgência",           color: "bg-orange-100 text-orange-700 border-orange-200",icon: <Flame className="w-3 h-3" />          },
  quote_request:   { label: "Pedido de orçamento",color: "bg-blue-100 text-blue-700 border-blue-200",    icon: <ShoppingCart className="w-3 h-3" />   },
  losing_interest: { label: "Perda de interesse", color: "bg-slate-100 text-slate-600 border-slate-200", icon: <X className="w-3 h-3" />              },
  interest:        { label: "Interesse de compra",color: "bg-green-100 text-green-700 border-green-200", icon: <TrendingUp className="w-3 h-3" />     },
  doubt:           { label: "Dúvida",             color: "bg-yellow-100 text-yellow-700 border-yellow-200",icon: <HelpCircle className="w-3 h-3" />   },
  neutral:         { label: "Neutro",             color: "bg-slate-100 text-slate-500 border-slate-200", icon: <MessageSquare className="w-3 h-3" />  },
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InboxClient({
  conversations: initialConvs, contacts, statusCounts,
  activeConversation: initialActive, currentUserId, canCreate, canUpdate,
}: Props) {
  const router = useRouter();
  const sp     = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [conversations, setConversations] = useState<ConvSummary[]>(initialConvs);
  const [active,        setActive]        = useState<ActiveConv | null>(initialActive);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);

  // Message input
  const [msgContent, setMsgContent] = useState("");
  const [sending,    setSending]    = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI panel
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSummary,   setAiSummary]   = useState<AiSummary>(null);
  const [aiIntent,    setAiIntent]    = useState<AiIntent>(null);
  const [aiReply,     setAiReply]     = useState<AiReply>(null);
  const [loadingSumm, setLoadingSumm] = useState(false);
  const [loadingInt,  setLoadingInt]  = useState(false);
  const [loadingReply,setLoadingReply]= useState(false);
  const [replyUsed,   setReplyUsed]   = useState<"used" | "ignored" | null>(null);

  // New conversation dialog
  const [showNew,      setShowNew]      = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newChannel,   setNewChannel]   = useState("manual");
  const [newSubject,   setNewSubject]   = useState("");
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState("");

  const statusFilter  = sp.get("status")  ?? "";
  const channelFilter = sp.get("channel") ?? "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length]);

  // Reset AI state when switching conversations; pre-fill from server data
  useEffect(() => {
    setAiReply(null); setReplyUsed(null);
    // Pre-populate intent from server if available
    if (active?.detectedIntent && active.detectedIntent !== "neutral") {
      setAiIntent({ intent: active.detectedIntent, confidence: 0, details: "", taskCreated: false });
    } else {
      setAiIntent(null);
    }
    // Pre-populate summary from server if available
    if (active?.summaryText) {
      setAiSummary({ summary: active.summaryText, keyPoints: [], messageCount: 0 });
    } else {
      setAiSummary(null);
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function pushParam(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete("convId");
    startTransition(() => router.push(`?${p.toString()}`));
  }

  async function selectConversation(conv: ConvSummary) {
    setLoadingMsgs(true);
    try {
      const res  = await fetch(`/api/conversations/${conv.id}`);
      const json = await res.json();
      setActive(json.data);
      const p = new URLSearchParams(sp.toString());
      p.set("convId", conv.id);
      router.replace(`?${p.toString()}`, { scroll: false });
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function sendMessage() {
    if (!active || !msgContent.trim()) return;
    setSending(true);
    try {
      const res  = await fetch(`/api/conversations/${active.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgContent.trim(), direction: "outbound" }),
      });
      const json = await res.json();
      if (!res.ok) return;
      const newMsg: ConvMessage = json.data;
      setActive((prev) => prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev);
      setMsgContent("");
      setConversations((prev) => prev.map((c) => c.id === active.id
        ? { ...c, lastMessageAt: newMsg.sentAt, messages: [{ content: newMsg.content, direction: newMsg.direction, sentAt: newMsg.sentAt }] }
        : c
      ));
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(status: string) {
    if (!active || !canUpdate) return;
    const res = await fetch(`/api/conversations/${active.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setActive((prev) => prev ? { ...prev, status } : prev);
      setConversations((prev) => prev.map((c) => c.id === active.id ? { ...c, status } : c));
    }
  }

  // ── AI actions ────────────────────────────────────────────────────────────

  async function callSummarize() {
    if (!active) return;
    setLoadingSumm(true);
    try {
      const res  = await fetch(`/api/conversations/${active.id}/summarize`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setAiSummary(json.data);
    } finally {
      setLoadingSumm(false);
    }
  }

  async function callDetectIntent() {
    if (!active) return;
    setLoadingInt(true);
    try {
      const res  = await fetch(`/api/conversations/${active.id}/detect-intent`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setAiIntent(json.data);
    } finally {
      setLoadingInt(false);
    }
  }

  async function callSuggestReply() {
    if (!active) return;
    setLoadingReply(true); setAiReply(null); setReplyUsed(null);
    try {
      const res  = await fetch(`/api/conversations/${active.id}/suggest-reply`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setAiReply(json.data);
    } finally {
      setLoadingReply(false);
    }
  }

  function useReply() {
    if (!aiReply) return;
    setMsgContent(aiReply.suggestion);
    setReplyUsed("used");
    setAiReply(null);
  }

  async function handleCreate() {
    setCreating(true); setCreateError("");
    const res  = await fetch("/api/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: newContactId || null, channel: newChannel, subject: newSubject || null }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(json.error ?? "Erro ao criar."); return; }
    setShowNew(false); setNewContactId(""); setNewChannel("manual"); setNewSubject("");
    setConversations((prev) => [json.data, ...prev]);
    setActive({ ...json.data, messages: [] });
  }

  const openCount     = statusCounts["open"]     ?? 0;
  const pendingCount  = statusCounts["pending"]  ?? 0;
  const resolvedCount = statusCounts["resolved"] ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex -m-6 h-[calc(100vh-56px)] overflow-hidden">

      {/* ── LEFT: Conversation list ─────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            <span className="font-semibold text-sm">Inbox</span>
            {openCount > 0 && (
              <Badge className="h-4 min-w-4 px-1 text-[10px] bg-primary">{openCount}</Badge>
            )}
          </div>
          {canCreate && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowNew(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 px-3 py-2 border-b">
          {[
            { key: "",         label: "Todas",     count: openCount + pendingCount + resolvedCount },
            { key: "open",     label: "Abertas",   count: openCount     },
            { key: "pending",  label: "Pendentes", count: pendingCount  },
            { key: "resolved", label: "Resolv.",   count: resolvedCount },
          ].map((tab) => (
            <button key={tab.key} onClick={() => pushParam("status", tab.key)}
              className={cn("flex-1 text-xs px-1 py-1 rounded transition-colors",
                statusFilter === tab.key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}>
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        {/* Channel filter */}
        <div className="px-3 py-2 border-b">
          <Select value={channelFilter || "all"} onValueChange={(v) => pushParam("channel", !v || v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Nenhuma conversa.</p>
          ) : (
            conversations.map((conv) => {
              const lastMsg     = conv.messages[0];
              const isActive    = active?.id === conv.id;
              const needsReply  = conv.status === "open" && lastMsg?.direction === "inbound";
              const intentMeta  = conv.detectedIntent && conv.detectedIntent !== "neutral"
                ? INTENT_META[conv.detectedIntent] : null;
              return (
                <button key={conv.id} onClick={() => selectConversation(conv)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                    isActive && "bg-muted",
                    needsReply && !isActive && "border-l-2 border-l-orange-400"
                  )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {CHANNEL_ICON[conv.channel]}
                      <span className="font-medium text-sm truncate">
                        {conv.contact?.name ?? conv.subject ?? "Sem contato"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {needsReply && (
                        <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" title="Aguarda resposta" />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {fmtTime(conv.lastMessageAt ?? conv.createdAt)}
                      </span>
                    </div>
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                      {lastMsg.direction === "outbound" && <CheckCheck className="w-3 h-3 shrink-0" />}
                      {lastMsg.content}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[10px] rounded-full px-1.5 py-0.5", STATUS_COLOR[conv.status])}>
                      {STATUS_LABEL[conv.status]}
                    </span>
                    {intentMeta && (
                      <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 border flex items-center gap-0.5", intentMeta.color)}>
                        {intentMeta.icon}{intentMeta.label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
          {isPending && <div className="text-center py-2"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>}
        </div>
      </aside>

      {/* ── CENTER: Chat ────────────────────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden min-w-0">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm">Selecione uma conversa</p>
              {canCreate && (
                <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Nova conversa
                </Button>
              )}
            </div>
          </div>
        ) : loadingMsgs ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Chat column */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {active.contact?.name ?? active.subject ?? "Conversa sem contato"}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        {CHANNEL_ICON[active.channel]}
                        {CHANNEL_LABEL[active.channel]}
                      </span>
                    </div>
                    {active.contact?.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />{active.contact.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-xs rounded-full px-2 py-0.5", STATUS_COLOR[active.status])}>
                    {STATUS_LABEL[active.status]}
                  </span>
                  {canUpdate && (
                    <Select value={active.status} onValueChange={(v) => { if (v) updateStatus(v); }}>
                      <SelectTrigger className="h-7 w-7 p-0 border-0 shadow-none [&>svg]:hidden">
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="open">Marcar como aberta</SelectItem>
                        <SelectItem value="pending">Marcar como pendente</SelectItem>
                        <SelectItem value="resolved">Marcar como resolvida</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {/* AI panel toggle */}
                  <Button size="icon" variant={showAiPanel ? "default" : "ghost"}
                    className="h-7 w-7" title="Painel de IA"
                    onClick={() => setShowAiPanel((v) => !v)}>
                    <Bot className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* ── Inline AI info strip ────────────────────────────────── */}
              {(aiIntent || aiSummary) && (
                <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-purple-50/60 text-xs overflow-hidden">
                  {aiIntent && (() => {
                    const meta = INTENT_META[aiIntent.intent] ?? INTENT_META["neutral"];
                    return (
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium shrink-0", meta.color)}>
                        {meta.icon}{meta.label}
                        {aiIntent.confidence > 0 && <span className="opacity-70 ml-0.5">{aiIntent.confidence}%</span>}
                      </span>
                    );
                  })()}
                  {aiSummary?.summary && (
                    <span className="text-muted-foreground truncate">{aiSummary.summary}</span>
                  )}
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto shrink-0 text-purple-600"
                    title="Abrir painel IA" onClick={() => setShowAiPanel(true)}>
                    <Bot className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
                {active.messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">
                    Nenhuma mensagem ainda. Escreva a primeira.
                  </p>
                )}
                {active.messages.map((msg) => {
                  const isOut = msg.direction === "outbound";
                  const isBot = msg.senderType === "bot";
                  return (
                    <div key={msg.id} className={cn("flex gap-2", isOut ? "justify-end" : "justify-start")}>
                      {!isOut && (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          {isBot
                            ? <Bot className="w-3.5 h-3.5 text-purple-600" />
                            : <User className="w-3.5 h-3.5 text-slate-500" />}
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                        isOut
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-background border rounded-tl-sm"
                      )}>
                        <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={cn("text-[10px] mt-1 text-right",
                          isOut ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {fmtMsgTime(msg.sentAt)}{isBot && " · IA"}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply suggestion banner */}
              {aiReply && replyUsed === null && (
                <div className="px-4 py-2 border-t bg-purple-50 border-purple-100">
                  <div className="flex items-start gap-2">
                    <Bot className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-purple-700 mb-1">
                        Sugestão da IA ({aiReply.confidence}% — tom {aiReply.tone})
                      </p>
                      <p className="text-xs text-purple-800 line-clamp-2">{aiReply.suggestion}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                        onClick={useReply}>
                        <Check className="w-3 h-3 mr-1" /> Usar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setAiReply(null); setReplyUsed("ignored"); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Message input */}
              <div className="px-4 py-3 border-t bg-background shrink-0">
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={msgContent}
                    onChange={(e) => setMsgContent(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                    }}
                  />
                  <Button size="icon" disabled={!msgContent.trim() || sending}
                    onClick={sendMessage} className="h-11 w-11 shrink-0">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* ── RIGHT: AI Panel ─────────────────────────────────────────── */}
            {showAiPanel && (
              <aside className="w-64 flex-shrink-0 border-l flex flex-col bg-background overflow-y-auto">
                <div className="px-3 py-3 border-b flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold">Assistente IA</span>
                </div>

                <div className="flex-1 p-3 space-y-4">
                  {/* ── Resumo ──────────────────────────────────────────── */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-purple-500" /> Resumo
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        disabled={loadingSumm} onClick={callSummarize}>
                        {loadingSumm
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                      </Button>
                    </div>

                    {aiSummary ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {aiSummary.summary}
                        </p>
                        {aiSummary.keyPoints.length > 0 && (
                          <ul className="space-y-1">
                            {aiSummary.keyPoints.map((pt, i) => (
                              <li key={i} className="text-xs flex items-start gap-1.5 text-foreground">
                                <span className="text-purple-500 mt-0.5">•</span>{pt}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-[10px] text-muted-foreground">{aiSummary.messageCount} mensagens analisadas</p>
                      </div>
                    ) : (
                      <button onClick={callSummarize} disabled={loadingSumm}
                        className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-3 hover:border-purple-400 hover:text-purple-600 transition-colors">
                        {loadingSumm ? "Resumindo..." : "Clique para resumir"}
                      </button>
                    )}
                  </section>

                  <hr />

                  {/* ── Intenção ─────────────────────────────────────────── */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-purple-500" /> Intenção
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        disabled={loadingInt} onClick={callDetectIntent}>
                        {loadingInt
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                      </Button>
                    </div>

                    {aiIntent ? (
                      <div className="space-y-2">
                        {(() => {
                          const meta = INTENT_META[aiIntent.intent] ?? INTENT_META["neutral"];
                          return (
                            <span className={cn("inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 font-medium", meta.color)}>
                              {meta.icon}{meta.label}
                            </span>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground">{aiIntent.confidence}% de confiança</p>
                        {aiIntent.taskCreated && (
                          <p className="text-xs text-green-700 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Tarefa criada automaticamente
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{aiIntent.details}</p>
                      </div>
                    ) : (
                      <button onClick={callDetectIntent} disabled={loadingInt}
                        className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-3 hover:border-purple-400 hover:text-purple-600 transition-colors">
                        {loadingInt ? "Detectando..." : "Detectar intenção"}
                      </button>
                    )}
                  </section>

                  <hr />

                  {/* ── Sugerir resposta ────────────────────────────────── */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Sugestão de resposta
                      </span>
                    </div>

                    {replyUsed === "used" && (
                      <p className="text-xs text-green-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Sugestão aplicada ao campo de texto
                      </p>
                    )}
                    {replyUsed === "ignored" && (
                      <p className="text-xs text-muted-foreground">Sugestão ignorada.</p>
                    )}

                    {replyUsed === null && !aiReply && (
                      <Button size="sm" variant="outline" className="w-full text-xs h-8"
                        disabled={loadingReply} onClick={callSuggestReply}>
                        {loadingReply
                          ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Gerando...</>
                          : <><Sparkles className="w-3 h-3 mr-1.5" /> Sugerir resposta</>}
                      </Button>
                    )}

                    {aiReply && replyUsed === null && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-2.5 space-y-2">
                        <p className="text-xs leading-relaxed text-purple-900">{aiReply.suggestion}</p>
                        <div className="flex gap-1.5">
                          <Button size="sm" className="flex-1 h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={useReply}>
                            <Check className="w-3 h-3 mr-1" /> Usar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={callSuggestReply} disabled={loadingReply}>
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setAiReply(null); setReplyUsed("ignored"); }}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* ── Dica ──────────────────────────────────────────── */}
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      <Bot className="w-3 h-3 inline mr-1 text-purple-500" />
                      As ações da IA são registradas em <strong>ai_logs</strong> e tarefas são criadas automaticamente conforme a intenção detectada.
                    </p>
                  </div>
                </div>
              </aside>
            )}
          </>
        )}
      </main>

      {/* ── New Conversation Dialog ───────────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={(o) => { if (!o) setShowNew(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Conversa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Contato</label>
              <Select value={newContactId || "none"} onValueChange={(v) => setNewContactId(v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger><SelectValue placeholder="Selecionar contato (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem contato</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Canal</label>
              <Select value={newChannel} onValueChange={(v) => setNewChannel(v ?? "manual")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (simulado)</SelectItem>
                  <SelectItem value="instagram">Instagram (simulado)</SelectItem>
                  <SelectItem value="email">E-mail (simulado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Assunto</label>
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Opcional" />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowNew(false)} disabled={creating}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
