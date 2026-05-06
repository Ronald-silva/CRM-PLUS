"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, GitBranch, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Stage {
  id: string;
  name: string;
  order: number;
  probability: number;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  stages: Stage[];
}

interface Props {
  pipelines: Pipeline[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const EMPTY_PIPELINE = { name: "", description: "", isDefault: false };
const EMPTY_STAGE = { name: "", order: "", probability: "0" };

export function PipelineClient({ pipelines, canCreate, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // expanded state per pipeline
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(pipelines.map((p) => [p.id, true]))
  );

  // pipeline dialog
  const [pipelineDialog, setPipelineDialog] = useState(false);
  const [editPipeline, setEditPipeline] = useState<Pipeline | null>(null);
  const [pipelineForm, setPipelineForm] = useState(EMPTY_PIPELINE);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineError, setPipelineError] = useState("");

  // stage dialog
  const [stageDialog, setStageDialog] = useState(false);
  const [stageContext, setStageContext] = useState<{ pipelineId: string; stage: Stage | null } | null>(null);
  const [stageForm, setStageForm] = useState(EMPTY_STAGE);
  const [stageSaving, setStageSaving] = useState(false);
  const [stageError, setStageError] = useState("");

  function openCreatePipeline() {
    setEditPipeline(null);
    setPipelineForm(EMPTY_PIPELINE);
    setPipelineError("");
    setPipelineDialog(true);
  }

  function openEditPipeline(p: Pipeline) {
    setEditPipeline(p);
    setPipelineForm({ name: p.name, description: p.description ?? "", isDefault: p.isDefault });
    setPipelineError("");
    setPipelineDialog(true);
  }

  async function handleSavePipeline() {
    if (!pipelineForm.name.trim()) { setPipelineError("Nome é obrigatório."); return; }
    setPipelineSaving(true);
    setPipelineError("");
    try {
      const url = editPipeline ? `/api/pipelines/${editPipeline.id}` : "/api/pipelines";
      const method = editPipeline ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pipelineForm.name,
          description: pipelineForm.description || null,
          isDefault: pipelineForm.isDefault,
        }),
      });
      if (!res.ok) { const d = await res.json(); setPipelineError(d.error ?? "Erro."); return; }
      setPipelineDialog(false);
      startTransition(() => router.refresh());
    } finally {
      setPipelineSaving(false);
    }
  }

  async function handleDeletePipeline(id: string, name: string) {
    if (!confirm(`Excluir o pipeline "${name}"? Todas as etapas serão removidas.`)) return;
    await fetch(`/api/pipelines/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  function openCreateStage(pipelineId: string, nextOrder: number) {
    setStageContext({ pipelineId, stage: null });
    setStageForm({ name: "", order: String(nextOrder), probability: "0" });
    setStageError("");
    setStageDialog(true);
  }

  function openEditStage(pipelineId: string, stage: Stage) {
    setStageContext({ pipelineId, stage });
    setStageForm({ name: stage.name, order: String(stage.order), probability: String(stage.probability) });
    setStageError("");
    setStageDialog(true);
  }

  async function handleSaveStage() {
    if (!stageContext) return;
    if (!stageForm.name.trim()) { setStageError("Nome é obrigatório."); return; }
    const order = parseInt(stageForm.order);
    const probability = parseInt(stageForm.probability);
    if (isNaN(order) || order < 1) { setStageError("Ordem inválida."); return; }
    if (isNaN(probability) || probability < 0 || probability > 100) { setStageError("Probabilidade deve ser 0–100."); return; }

    setStageSaving(true);
    setStageError("");
    try {
      const { pipelineId, stage } = stageContext;
      const url = stage
        ? `/api/pipelines/${pipelineId}/stages/${stage.id}`
        : `/api/pipelines/${pipelineId}/stages`;
      const method = stage ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stageForm.name, order, probability }),
      });
      if (!res.ok) { const d = await res.json(); setStageError(d.error ?? "Erro."); return; }
      setStageDialog(false);
      startTransition(() => router.refresh());
    } finally {
      setStageSaving(false);
    }
  }

  async function handleDeleteStage(pipelineId: string, stageId: string, name: string) {
    if (!confirm(`Excluir a etapa "${name}"?`)) return;
    await fetch(`/api/pipelines/${pipelineId}/stages/${stageId}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipelines</h1>
          <p className="text-sm text-muted-foreground">{pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreatePipeline} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo pipeline
          </Button>
        )}
      </div>

      {/* Pipeline list */}
      <div className="space-y-3">
        {pipelines.length === 0 ? (
          <div className="rounded-md border p-10 text-center text-muted-foreground">
            Nenhum pipeline cadastrado.
          </div>
        ) : (
          pipelines.map((p) => (
            <div key={p.id} className="rounded-md border">
              {/* Pipeline header */}
              <div className="flex items-center gap-3 p-4">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                >
                  {expanded[p.id]
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </button>
                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.isDefault && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {p.stages.length} etapa{p.stages.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPipeline(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeletePipeline(p.id, p.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Stages */}
              {expanded[p.id] && (
                <div className="border-t">
                  {/* Kanban preview strip */}
                  {p.stages.length > 0 && (
                    <div className="flex gap-0 overflow-x-auto border-b bg-muted/30 px-4 py-2">
                      {p.stages.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-0 shrink-0">
                          <div className="flex flex-col items-center px-3 py-1">
                            <span className="text-xs font-medium whitespace-nowrap">{s.name}</span>
                            <span className="text-[10px] text-muted-foreground">{s.probability}%</span>
                          </div>
                          {i < p.stages.length - 1 && (
                            <span className="text-muted-foreground text-xs">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stages list */}
                  <div className="divide-y">
                    {p.stages.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        <span className="w-6 text-xs text-muted-foreground tabular-nums text-center">{s.order}</span>
                        <span className="flex-1 text-sm">{s.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                          {s.probability}%
                        </span>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditStage(p.id, s)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteStage(p.id, s.id, s.name)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canEdit && (
                    <div className="px-4 py-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-7 text-xs"
                        onClick={() => openCreateStage(p.id, p.stages.length + 1)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar etapa
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialog — Pipeline */}
      <Dialog open={pipelineDialog} onOpenChange={setPipelineDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editPipeline ? "Editar pipeline" : "Novo pipeline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={pipelineForm.name}
                onChange={(e) => setPipelineForm({ ...pipelineForm, name: e.target.value })}
                placeholder="Vendas, Pós-venda, Parcerias..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={pipelineForm.description}
                onChange={(e) => setPipelineForm({ ...pipelineForm, description: e.target.value })}
                placeholder="Descrição do pipeline..."
                className="resize-none"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={pipelineForm.isDefault}
                onChange={(e) => setPipelineForm({ ...pipelineForm, isDefault: e.target.checked })}
                className="rounded"
              />
              Pipeline padrão
            </label>
            {pipelineError && <p className="text-sm text-destructive">{pipelineError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPipelineDialog(false)}>Cancelar</Button>
              <Button onClick={handleSavePipeline} disabled={pipelineSaving}>
                {pipelineSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editPipeline ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Stage */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{stageContext?.stage ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={stageForm.name}
                onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
                placeholder="Prospecção, Proposta, Fechamento..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ordem *</Label>
                <Input
                  type="number"
                  min={1}
                  value={stageForm.order}
                  onChange={(e) => setStageForm({ ...stageForm, order: e.target.value })}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Probabilidade (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={stageForm.probability}
                  onChange={(e) => setStageForm({ ...stageForm, probability: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            {stageError && <p className="text-sm text-destructive">{stageError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStageDialog(false)}>Cancelar</Button>
              <Button onClick={handleSaveStage} disabled={stageSaving}>
                {stageSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {stageContext?.stage ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
