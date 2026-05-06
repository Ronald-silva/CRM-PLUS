import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import {
  TrendingUp, CheckSquare, DollarSign,
  Bot, ArrowRight, Clock, AlertTriangle,
  MessageSquare, Flame, CheckCircle2, Circle,
  BarChart3, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const ACTION_LABEL: Record<string, string> = {
  classify_lead:        "Classificou lead",
  suggest_next_action:  "Sugeriu próxima ação",
  detect_stalled_leads: "Detectou leads parados",
  summarize:            "Resumiu conversa",
  detect_intent:        "Detectou intenção",
  suggest_reply:        "Sugeriu resposta",
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}
function fmtDate(d: Date | string | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(d));
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId  = session.user.tenantId;
  const now       = new Date();
  const todayEnd  = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const canReadTasks   = can(session.user.role, "read", "tasks");
  const canReadBilling = can(session.user.role, "read", "billing");
  const canReadOpps    = can(session.user.role, "read", "opportunities");
  const canReadConvs   = can(session.user.role, "read", "conversations");

  // ── Core counts ──────────────────────────────────────────────────────────────
  const [
    contactsTotal,
    openOppsTotal,
    tasksToday,
    tasksTotalPending,
    openRevenues,
    overdueTasksCount,
    hotLeadsCount,
    aiLogsToday,
    highPriorityTasks,
  ] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.opportunity.count({ where: { tenantId, status: "open" } }),
    prisma.task.count({ where: { tenantId, status: "pending", dueAt: { lte: todayEnd } } }),
    prisma.task.count({ where: { tenantId, status: "pending" } }),
    prisma.revenue.count({ where: { tenantId, status: "pending" } }),
    prisma.task.count({ where: { tenantId, status: "pending", dueAt: { lt: now } } }),
    canReadOpps
      ? prisma.opportunity.count({
          where: {
            tenantId,
            status: "open",
            contact: {
              conversations: { some: { detectedIntent: { in: ["interest", "quote_request", "urgency"] } } },
            },
          },
        })
      : 0,
    prisma.aiLog.findMany({
      where:   { tenantId, createdAt: { gte: todayStart } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, outputSummary: true, createdAt: true, modelProvider: true },
    }),
    canReadTasks
      ? prisma.task.findMany({
          where:   { tenantId, status: "pending", priority: "high" },
          orderBy: { dueAt: "asc" },
          take: 5,
          select: { id: true, title: true, dueAt: true, source: true, contact: { select: { name: true } }, opportunity: { select: { title: true } } },
        })
      : [],
  ]);

  // ── Revenue aggregates ────────────────────────────────────────────────────────
  const [predictedAgg, realizedAgg] = await Promise.all([
    canReadOpps
      ? prisma.opportunity.aggregate({ where: { tenantId, status: "open" }, _sum: { value: true } })
      : null,
    canReadBilling
      ? prisma.revenue.aggregate({ where: { tenantId, status: "paid", paidAt: { gte: monthStart } }, _sum: { amount: true } })
      : null,
  ]);
  const predictedRevenue = Number(predictedAgg?._sum.value ?? 0);
  const realizedRevenue  = Number(realizedAgg?._sum.amount ?? 0);

  // ── Unanswered conversations ──────────────────────────────────────────────────
  type RawCount = { count: string };
  let unansweredCount = 0;
  if (canReadConvs) {
    try {
      const rows = await prisma.$queryRaw<RawCount[]>`
        SELECT COUNT(*)::text AS count
        FROM conversations c
        WHERE c.tenant_id = ${tenantId}::uuid
          AND c.status = 'open'
          AND (
            SELECT direction FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.sent_at DESC LIMIT 1
          ) = 'inbound'
      `;
      unansweredCount = parseInt(rows[0]?.count ?? "0", 10);
    } catch { /* DB may have no messages — keep 0 */ }
  }

  // ── Pipeline funnel ───────────────────────────────────────────────────────────
  type FunnelRow = { stage_id: string; stage_name: string; stage_order: number; opp_count: string; opp_value: string | null };
  let funnelRows: FunnelRow[] = [];
  if (canReadOpps) {
    try {
      funnelRows = await prisma.$queryRaw<FunnelRow[]>`
        SELECT
          ps.id          AS stage_id,
          ps.name        AS stage_name,
          ps.order       AS stage_order,
          COUNT(o.id)::text AS opp_count,
          SUM(o.value)::text AS opp_value
        FROM pipeline_stages ps
        INNER JOIN pipelines p ON p.id = ps.pipeline_id
        LEFT JOIN opportunities o
          ON o.stage_id = ps.id
          AND o.status = 'open'
          AND o.tenant_id = ${tenantId}::uuid
        WHERE p.tenant_id = ${tenantId}::uuid
          AND p.is_default = true
        GROUP BY ps.id, ps.name, ps.order
        ORDER BY ps.order ASC
        LIMIT 8
      `;
    } catch { /* ignore */ }
  }
  const funnelMax = Math.max(...funnelRows.map((r) => parseInt(r.opp_count, 10)), 1);

  // ── Onboarding checklist ──────────────────────────────────────────────────────
  const [hasProduct, hasPipeline, hasContact, hasConversation] = await Promise.all([
    prisma.product.count({ where: { tenantId } }).then((n) => n > 0),
    prisma.pipeline.count({ where: { tenantId, stages: { some: {} } } }).then((n) => n > 0),
    prisma.contact.count({ where: { tenantId } }).then((n) => n > 0),
    prisma.conversation.count({ where: { tenantId } }).then((n) => n > 0),
  ]);
  const checklistDone = hasProduct && hasPipeline && hasContact && hasConversation;

  // Show demo guide when tenant has demo data but no real custom pipeline name
  const isDemoTenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
    .then((t) => t?.slug === "demo-crmplus");

  // ── KPI cards ─────────────────────────────────────────────────────────────────
  const kpisTop = [
    {
      title: "Oportunidades abertas", value: openOppsTotal.toString(),
      icon: TrendingUp, href: "/opportunities", description: "em andamento",
      show: canReadOpps,
    },
    {
      title: "Receita prevista", value: fmt(predictedRevenue),
      icon: DollarSign, href: "/opportunities", description: "em oportunidades abertas",
      show: canReadOpps,
    },
    {
      title: "Receita realizada", value: fmt(realizedRevenue),
      icon: BarChart3, href: "/billing", description: "recebido este mês",
      show: canReadBilling,
    },
    {
      title: "Leads quentes", value: hotLeadsCount.toString(),
      icon: Flame, href: "/opportunities", description: "com intenção de compra detectada",
      alert: hotLeadsCount > 0, show: canReadOpps,
    },
  ];
  const kpisBottom = [
    {
      title: "Tarefas para hoje",  value: tasksToday.toString(),
      icon: CheckSquare, href: "/tasks", description: `${tasksTotalPending} pendentes no total`,
      alert: tasksToday > 0, show: canReadTasks,
    },
    {
      title: "Tarefas atrasadas", value: overdueTasksCount.toString(),
      icon: AlertTriangle, href: "/tasks?overdue=1", description: "prazo já vencido",
      alert: overdueTasksCount > 0, show: canReadTasks,
    },
    {
      title: "Cobranças pendentes", value: openRevenues.toString(),
      icon: DollarSign, href: "/billing", description: "aguardando pagamento",
      show: canReadBilling,
    },
    {
      title: "Conversas sem resposta", value: unansweredCount.toString(),
      icon: MessageSquare, href: "/inbox", description: "última mensagem do cliente",
      alert: unansweredCount > 0, show: canReadConvs,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bom dia, {session.user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">Aqui está o resumo do seu dia comercial.</p>
      </div>

      {/* ── Demo guide ───────────────────────────────────────────────────────── */}
      {isDemoTenant && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base text-amber-900">Roteiro de demonstração</CardTitle>
              <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800 border-amber-200">Demo</Badge>
            </div>
            <p className="text-sm text-amber-800/80">Siga este fluxo para mostrar o CRM do início ao fim.</p>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {[
                { step: "1", label: "Conversas",    desc: "Abra uma conversa do WhatsApp e use IA para detectar intenção",          href: "/inbox" },
                { step: "2", label: "Oportunidades",desc: "Veja o Kanban, mova um negócio de etapa e marque como ganho",            href: "/opportunities" },
                { step: "3", label: "Contatos",     desc: "Abra o perfil de um contato e veja o histórico vinculado",               href: "/contacts" },
                { step: "4", label: "Faturamento",  desc: "Veja as cobranças geradas pelas vendas ganhas",                         href: "/billing" },
                { step: "5", label: "Relatórios",   desc: "Mostre a receita por mês, produto e vendedor",                          href: "/reports" },
              ].map(({ step, label, desc, href }) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-xs mt-0.5">
                    {step}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link href={href} className="font-semibold text-amber-900 hover:underline">{label}</Link>
                    <span className="text-amber-800/70"> — {desc}</span>
                  </div>
                  <Link href={href}>
                    <ArrowRight className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* ── Onboarding checklist ─────────────────────────────────────────────── */}
      {!checklistDone && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Configure seu CRM</CardTitle>
              <Badge variant="secondary" className="ml-auto">
                {[hasProduct, hasPipeline, hasContact, hasConversation].filter(Boolean).length}/4
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Complete os passos abaixo para começar a vender.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                { done: hasPipeline,  label: "Configurar um pipeline de vendas",  href: "/pipeline" },
                { done: hasProduct,   label: "Cadastrar um produto ou serviço",   href: "/products" },
                { done: hasContact,   label: "Adicionar seu primeiro contato",    href: "/contacts" },
                { done: hasConversation, label: "Iniciar uma conversa",           href: "/inbox" },
              ].map(({ done, label, href }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  {done
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Circle       className="h-4 w-4 text-muted-foreground shrink-0" />}
                  {done
                    ? <span className="line-through text-muted-foreground">{label}</span>
                    : <Link href={href} className="text-primary hover:underline font-medium">{label} →</Link>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── KPI row 1 ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisTop.filter((k) => k.show).map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className={`h-4 w-4 ${card.alert ? "text-orange-500" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold tabular-nums ${card.alert ? "text-orange-600" : ""}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── KPI row 2 ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisBottom.filter((k) => k.show).map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className={`h-4 w-4 ${card.alert ? "text-red-500" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold tabular-nums ${card.alert ? "text-red-600" : ""}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Middle row: pipeline funnel + AI logs ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Pipeline funnel */}
        {canReadOpps && funnelRows.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">Funil de vendas</CardTitle>
              </div>
              <Link href="/opportunities">
                <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Ver tudo <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {funnelRows.map((row) => {
                const count = parseInt(row.opp_count, 10);
                const value = Number(row.opp_value ?? 0);
                const pct   = Math.round((count / funnelMax) * 100);
                return (
                  <div key={row.stage_id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[60%]">{row.stage_name}</span>
                      <div className="flex items-center gap-3 text-muted-foreground text-xs tabular-nums">
                        <span>{count} opp{count !== 1 ? "s" : ""}</span>
                        {value > 0 && <span>{fmt(value)}</span>}
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {funnelRows.every((r) => parseInt(r.opp_count, 10) === 0) && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhuma oportunidade aberta no funil.{" "}
                  <Link href="/opportunities" className="text-primary underline">Criar oportunidade</Link>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Logs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-base">Ações da IA hoje</CardTitle>
            </div>
            <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs">
              {aiLogsToday.length} registro{aiLogsToday.length !== 1 ? "s" : ""}
            </Badge>
          </CardHeader>
          <CardContent>
            {aiLogsToday.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma ação de IA registrada hoje.</p>
            ) : (
              <ul className="space-y-1.5">
                {aiLogsToday.map((log) => (
                  <li key={log.id} className="flex items-start justify-between rounded-md bg-muted/50 px-3 py-2 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ACTION_LABEL[log.action] ?? log.action}</p>
                      {log.outputSummary && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{log.outputSummary}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{fmtTime(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom row: tasks ────────────────────────────────────────────────── */}
      {canReadTasks && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-base">Tarefas prioritárias</CardTitle>
            </div>
            <Link href="/tasks?priority=high&status=pending">
              <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </CardHeader>
          <CardContent>
            {highPriorityTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Sem tarefas prioritárias pendentes. 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {(highPriorityTasks as Array<{ id: string; title: string; dueAt: Date | null; source: string | null; contact: { name: string } | null; opportunity: { title: string } | null }>).map((task) => {
                  const overdue = task.dueAt && new Date(task.dueAt) < now;
                  return (
                    <li key={task.id} className="flex items-start justify-between rounded-md bg-muted/50 px-3 py-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {task.source === "ai" && <Bot className="w-3 h-3 text-purple-600 shrink-0" />}
                          <p className="text-sm font-medium truncate">{task.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {task.opportunity?.title ?? task.contact?.name ?? "Sem vínculo"}
                        </p>
                      </div>
                      {task.dueAt && (
                        <span className={`text-xs shrink-0 mt-0.5 flex items-center gap-0.5 ${overdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                          {overdue && <Clock className="w-3 h-3" />}
                          {fmtDate(task.dueAt)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/tasks?status=pending">
              <p className="mt-3 text-xs text-primary hover:underline cursor-pointer">
                {tasksTotalPending} tarefas pendentes no total →
              </p>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
