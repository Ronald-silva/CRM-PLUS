"use client";

import { useState, useRef } from "react";
import { TrendingUp, Trophy, XCircle, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OppStatus = "open" | "won" | "lost";

interface Stage {
  id: string;
  name: string;
  order: number;
  probability: number;
}

interface Opportunity {
  id: string;
  title: string;
  value: unknown;
  status: OppStatus;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  contact: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  stage: { id: string; name: string; probability: number };
  assignedUser: { id: string; name: string } | null;
  products: { id: string }[];
}

interface KanbanBoardProps {
  opportunities: Opportunity[];
  stages: Stage[];
  canEdit: boolean;
  canCreate: boolean;
  onMoveStage:  (oppId: string, newStageId: string) => Promise<void>;
  onQuickWon:   (oppId: string) => Promise<void>;
  onQuickLost:  (oppId: string) => Promise<void>;
  onOpenCreate: (stageId: string) => void;
  onOpenEdit:   (oppId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: unknown) {
  const n = Number(v);
  if (isNaN(n) || v === null) return null;
  if (n === 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtDate(d: Date | null | string) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({
  opp, canEdit, isDragging,
  onDragStart, onDragEnd,
  onWon, onLost, onEdit,
}: {
  opp: Opportunity;
  canEdit: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd:   (e: React.DragEvent) => void;
  onWon:  () => void;
  onLost: () => void;
  onEdit: () => void;
}) {
  const isOverdue = opp.expectedCloseAt && new Date(opp.expectedCloseAt) < new Date();
  const value     = fmtCurrency(opp.value);
  const closeDate = fmtDate(opp.expectedCloseAt);

  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group bg-background rounded-lg border p-3 shadow-sm select-none",
        canEdit && "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        isDragging && "opacity-40 scale-95"
      )}
    >
      {/* Drag handle + title */}
      <div className="flex items-start gap-1.5">
        {canEdit && (
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-muted-foreground/70 transition-colors" />
        )}
        <p
          className="text-sm font-medium leading-snug flex-1 cursor-pointer hover:text-primary"
          onClick={onEdit}
        >
          {opp.title}
        </p>
      </div>

      {/* Contact / company */}
      {(opp.contact || opp.company) && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {opp.contact?.name ?? opp.company?.name}
        </p>
      )}

      {/* Value + close date */}
      <div className="flex items-center justify-between mt-2 gap-2">
        {value && (
          <span className="text-xs font-semibold text-foreground tabular-nums">{value}</span>
        )}
        {closeDate && (
          <span className={cn("text-[10px] ml-auto", isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
            {closeDate}
          </span>
        )}
      </div>

      {/* Quick actions */}
      {canEdit && (
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost"
            className="h-6 px-1.5 text-[10px] text-green-700 hover:bg-green-50"
            onClick={(e) => { e.stopPropagation(); onWon(); }}
            title="Marcar como ganha">
            <Trophy className="w-3 h-3 mr-0.5" />Ganhou
          </Button>
          <Button size="sm" variant="ghost"
            className="h-6 px-1.5 text-[10px] text-red-600 hover:bg-red-50"
            onClick={(e) => { e.stopPropagation(); onLost(); }}
            title="Marcar como perdida">
            <XCircle className="w-3 h-3 mr-0.5" />Perdeu
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  stage, cards, canEdit, canCreate,
  draggingId,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onWon, onLost, onEdit, onCreateHere,
}: {
  stage: Stage;
  cards: Opportunity[];
  canEdit: boolean;
  canCreate: boolean;
  draggingId: string | null;
  onDragStart: (oppId: string) => void;
  onDragEnd:   () => void;
  onDragOver:  (e: React.DragEvent) => void;
  onDrop:      (stageId: string) => void;
  onWon:       (oppId: string) => void;
  onLost:      (oppId: string) => void;
  onEdit:      (oppId: string) => void;
  onCreateHere:(stageId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const totalValue = cards.reduce((s, o) => s + Number(o.value ?? 0), 0);

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{stage.name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
            {cards.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {totalValue > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </span>
          )}
          {canCreate && (
            <Button size="icon" variant="ghost" className="h-5 w-5"
              onClick={() => onCreateHere(stage.id)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "flex-1 min-h-[120px] rounded-lg p-2 space-y-2 transition-colors",
          dragOver ? "bg-primary/10 border-2 border-dashed border-primary/40" : "bg-muted/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); onDragOver(e); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(stage.id); }}
      >
        {cards.map((opp) => (
          <KanbanCard
            key={opp.id}
            opp={opp}
            canEdit={canEdit}
            isDragging={draggingId === opp.id}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(opp.id); }}
            onDragEnd={onDragEnd}
            onWon={() => onWon(opp.id)}
            onLost={() => onLost(opp.id)}
            onEdit={() => onEdit(opp.id)}
          />
        ))}
        {cards.length === 0 && !draggingId && (
          <p className="text-xs text-muted-foreground/60 text-center py-4">Sem oportunidades</p>
        )}
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

export function KanbanBoard({
  opportunities, stages, canEdit, canCreate,
  onMoveStage, onQuickWon, onQuickLost, onOpenCreate, onOpenEdit,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDrop(targetStageId: string) {
    if (!draggingId) return;
    const opp = opportunities.find((o) => o.id === draggingId);
    if (!opp || opp.stage.id === targetStageId) { setDraggingId(null); return; }
    onMoveStage(draggingId, targetStageId).then(() => setDraggingId(null));
  }

  // Group open opportunities by stage
  const openOpps = opportunities.filter((o) => o.status === "open");
  const byStage  = Object.fromEntries(stages.map((s) => [s.id, [] as Opportunity[]]));
  openOpps.forEach((o) => {
    if (byStage[o.stage.id]) byStage[o.stage.id].push(o);
    else byStage[stages[0]?.id ?? ""] = [...(byStage[stages[0]?.id ?? ""] ?? []), o];
  });

  const totalOpen  = openOpps.length;
  const totalValue = openOpps.reduce((s, o) => s + Number(o.value ?? 0), 0);

  // Won/lost summary
  const wonCount  = opportunities.filter((o) => o.status === "won").length;
  const lostCount = opportunities.filter((o) => o.status === "lost").length;

  return (
    <div className="space-y-3">
      {/* Board stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          {totalOpen} aberta{totalOpen !== 1 ? "s" : ""}
          {totalValue > 0 && ` · ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`}
        </span>
        {wonCount > 0 && (
          <span className="flex items-center gap-1 text-green-700">
            <Trophy className="w-3.5 h-3.5" />{wonCount} ganha{wonCount !== 1 ? "s" : ""}
          </span>
        )}
        {lostCount > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="w-3.5 h-3.5" />{lostCount} perdida{lostCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            cards={byStage[stage.id] ?? []}
            canEdit={canEdit}
            canCreate={canCreate}
            draggingId={draggingId}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onWon={onQuickWon}
            onLost={onQuickLost}
            onEdit={onOpenEdit}
            onCreateHere={onOpenCreate}
          />
        ))}
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center w-full">
            Nenhuma etapa configurada.{" "}
            <a href="/pipeline" className="underline text-primary">Configurar pipeline</a>
          </p>
        )}
      </div>
    </div>
  );
}
