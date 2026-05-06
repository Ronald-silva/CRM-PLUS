"use client";

import { Zap, Bot, Clock, CheckCircle2, Activity, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Log = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  modelProvider: string | null;
  modelId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
};

type ActionCount = { action: string; count: number };

type Props = {
  logs: Log[];
  totalLogs: number;
  actionCounts: ActionCount[];
};

const ACTION_LABELS: Record<string, string> = {
  summarize_conversation: "Resumo de conversa",
  suggest_reply: "Sugestão de resposta",
  detect_intent: "Detecção de intenção",
  create_task: "Criação de tarefa",
  qualify_lead: "Qualificação de lead",
  analyze_opportunity: "Análise de oportunidade",
};

const RULES = [
  {
    id: "r1",
    name: "Resumo automático de conversas",
    description: "A IA resume automaticamente conversas longas para facilitar o atendimento.",
    icon: Bot,
    active: true,
  },
  {
    id: "r2",
    name: "Detecção de intenção",
    description: "Classifica automaticamente o intent do contato (compra, suporte, dúvida).",
    icon: Sparkles,
    active: true,
  },
  {
    id: "r3",
    name: "Sugestão de resposta",
    description: "Sugere respostas para o atendente com base no histórico da conversa.",
    icon: Zap,
    active: true,
  },
  {
    id: "r4",
    name: "Criação automática de tarefas",
    description: "Cria tarefas de follow-up quando uma oportunidade fica sem movimento por 3 dias.",
    icon: CheckCircle2,
    active: false,
  },
];

function formatAction(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export function AutomationsClient({ logs, totalLogs, actionCounts }: Props) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Regras de IA ativas no seu CRM — as automações agem em segundo plano e você valida os resultados.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Ações executadas</p>
            <p className="text-2xl font-bold mt-1">{totalLogs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Regras ativas</p>
            <p className="text-2xl font-bold mt-1">{RULES.filter((r) => r.active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Tipos de ação</p>
            <p className="text-2xl font-bold mt-1">{actionCounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Status da IA</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">Ativa</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Regras configuradas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Regras configuradas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {RULES.map((rule) => {
              const Icon = rule.icon;
              return (
                <div
                  key={rule.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{rule.name}</p>
                      <Badge
                        variant={rule.active ? "default" : "secondary"}
                        className="shrink-0 text-[10px] h-4 px-1.5"
                      >
                        {rule.active ? "ativa" : "pausada"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Top ações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Ações mais executadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actionCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma ação registrada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {actionCounts.map((a) => {
                  const max = actionCounts[0].count;
                  const pct = Math.round((a.count / max) * 100);
                  return (
                    <div key={a.action}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{formatAction(a.action)}</span>
                        <span className="font-medium">{a.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log de ações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico de ações da IA
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              últimas 50
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-10 text-center">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma ação de IA registrada ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                As ações aparecerão aqui conforme você usar as funcionalidades de IA do CRM.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{formatAction(log.action)}</span>
                      {log.entityType && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {log.entityType}
                        </Badge>
                      )}
                      {log.modelProvider && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {log.modelProvider}
                        </Badge>
                      )}
                    </div>
                    {log.outputSummary && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {log.outputSummary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>{timeAgo(log.createdAt)}</span>
                      {log.user && <span>por {log.user.name}</span>}
                      {log.promptTokens && (
                        <span>{(log.promptTokens + (log.completionTokens ?? 0)).toLocaleString()} tokens</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
