"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, XCircle, Clock, Bot, User,
  Pencil, Trash2, Loader2, CheckSquare, AlertTriangle,
  ChevronRight, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "done" | "cancelled";
  priority: "low" | "medium" | "high";
  source: string | null;
  dueAt: string | null;
  createdAt: string;
  contact:     { id: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
  assignedUser:{ id: string; name: string } | null;
};

type Props = {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  statusCounts: Record<string, number>;
  canUpdate: boolean;
  canDelete: boolean;
  canCreate: boolean;
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  high: "Alta", medium: "Média", low: "Baixa",
};
const PRIORITY_COLOR: Record<Task["priority"], string> = {
  high:   "text-red-600 bg-red-50 border-red-200",
  medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
  low:    "text-slate-600 bg-slate-50 border-slate-200",
};
const STATUS_ICON: Record<Task["status"], React.ReactNode> = {
  pending:   <Clock className="w-3.5 h-3.5" />,
  done:      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />,
  cancelled: <XCircle className="w-3.5 h-3.5 text-slate-400" />,
};
const STATUS_LABEL: Record<Task["status"], string> = {
  pending: "Pendente", done: "Concluída", cancelled: "Cancelada",
};

function isOverdue(dueAt: string | null, status: Task["status"]) {
  if (!dueAt || status !== "pending") return false;
  return new Date(dueAt) < new Date();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function TasksClient({
  tasks, total, page, limit, statusCounts,
  canUpdate, canDelete, canCreate,
}: Props) {
  const router = useRouter();
  const sp     = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Edit dialog state
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle]     = useState("");
  const [editDesc,  setEditDesc]      = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("medium");
  const [editDueAt, setEditDueAt]     = useState("");
  const [isSaving, setIsSaving]       = useState(false);
  const [dialogError, setDialogError] = useState("");

  // Create dialog state
  const [showCreate, setShowCreate]     = useState(false);
  const [newTitle,   setNewTitle]       = useState("");
  const [newDesc,    setNewDesc]        = useState("");
  const [newPriority,setNewPriority]    = useState<Task["priority"]>("medium");
  const [newDueAt,   setNewDueAt]       = useState("");
  const [isCreating, setIsCreating]     = useState(false);
  const [createError,setCreateError]    = useState("");

  const pages = Math.ceil(total / limit);

  function pushParam(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete("page");
    startTransition(() => router.push(`?${p.toString()}`));
  }

  async function patchTask(id: string, body: object) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function markDone(id: string) {
    await patchTask(id, { status: "done" });
    startTransition(() => router.refresh());
  }

  async function markCancelled(id: string) {
    await patchTask(id, { status: "cancelled" });
    startTransition(() => router.refresh());
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description ?? "");
    setEditPriority(task.priority);
    setEditDueAt(task.dueAt ? task.dueAt.slice(0, 16) : "");
    setDialogError("");
  }

  async function handleSave() {
    if (!editTask) return;
    setIsSaving(true); setDialogError("");
    const res = await patchTask(editTask.id, {
      title: editTitle,
      description: editDesc || null,
      priority: editPriority,
      dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
    });
    const json = await res.json();
    setIsSaving(false);
    if (!res.ok) { setDialogError(json.error ?? "Erro ao salvar."); return; }
    setEditTask(null);
    startTransition(() => router.refresh());
  }

  async function handleCreate() {
    if (!newTitle.trim()) { setCreateError("Título obrigatório."); return; }
    setIsCreating(true); setCreateError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc || null,
        priority: newPriority,
        dueAt: newDueAt ? new Date(newDueAt).toISOString() : null,
        source: "manual",
      }),
    });
    const json = await res.json();
    setIsCreating(false);
    if (!res.ok) { setCreateError(json.error ?? "Erro ao criar."); return; }
    setShowCreate(false);
    setNewTitle(""); setNewDesc(""); setNewDueAt(""); setNewPriority("medium");
    startTransition(() => router.refresh());
  }

  const pending   = statusCounts["pending"]   ?? 0;
  const done      = statusCounts["done"]       ?? 0;
  const cancelled = statusCounts["cancelled"]  ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Central de Tarefas</h1>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova Tarefa
          </Button>
        )}
      </div>

      {/* Status summary pills */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => pushParam("status", "")}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
        >
          <span className="font-medium">Todas</span>
          <span className="text-muted-foreground">{pending + done + cancelled}</span>
        </button>
        <button
          onClick={() => pushParam("status", "pending")}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
        >
          <Clock className="w-3.5 h-3.5 text-yellow-600" />
          <span>Pendentes</span>
          <span className="font-bold text-yellow-700">{pending}</span>
        </button>
        <button
          onClick={() => pushParam("status", "done")}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          <span>Concluídas</span>
          <span className="font-bold text-green-700">{done}</span>
        </button>
        <button
          onClick={() => pushParam("status", "cancelled")}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
        >
          <XCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Canceladas</span>
          <span className="font-bold text-slate-500">{cancelled}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select
          value={sp.get("priority") ?? "all"}
          onValueChange={(v) => pushParam("priority", !v || v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sp.get("source") ?? "all"}
          onValueChange={(v) => pushParam("source", !v || v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="ai">IA</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>

        {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Tarefa</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              {(canUpdate || canDelete) && <TableHead className="w-32" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhuma tarefa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const overdue = isOverdue(task.dueAt, task.status);
                return (
                  <TableRow key={task.id} className={task.status !== "pending" ? "opacity-60" : ""}>
                    {/* Status icon */}
                    <TableCell>{STATUS_ICON[task.status]}</TableCell>

                    {/* Title + description */}
                    <TableCell className="max-w-[260px]">
                      <p className={`font-medium text-sm truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                      )}
                    </TableCell>

                    {/* Contact / Opportunity */}
                    <TableCell className="text-sm">
                      {task.opportunity ? (
                        <span className="flex items-center gap-1 text-blue-700">
                          <ChevronRight className="w-3 h-3" />
                          <span className="truncate max-w-[120px]">{task.opportunity.title}</span>
                        </span>
                      ) : task.contact ? (
                        <span className="text-muted-foreground truncate max-w-[120px] block">
                          {task.contact.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Priority */}
                    <TableCell>
                      <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${PRIORITY_COLOR[task.priority]}`}>
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                    </TableCell>

                    {/* Due date */}
                    <TableCell>
                      <span className={`text-sm ${overdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                        {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {fmtDate(task.dueAt)}
                      </span>
                    </TableCell>

                    {/* Source badge */}
                    <TableCell>
                      {task.source === "ai" ? (
                        <Badge variant="secondary" className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200">
                          <Bot className="w-3 h-3" /> IA
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <User className="w-3 h-3" /> Manual
                        </Badge>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{STATUS_LABEL[task.status]}</span>
                    </TableCell>

                    {/* Actions */}
                    {(canUpdate || canDelete) && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {canUpdate && task.status === "pending" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Concluir"
                                onClick={() => markDone(task.id)}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="Editar"
                                onClick={() => openEdit(task)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Cancelar"
                                onClick={() => markCancelled(task.id)}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {canDelete && task.status !== "pending" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Deletar"
                              onClick={() => deleteTask(task.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => pushParam("page", String(page - 1))}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => pushParam("page", String(page + 1))}>
            Próxima
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={(o) => { if (!o) setEditTask(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Título</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prioridade</label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority((v ?? "medium") as Task["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prazo</label>
              <Input type="datetime-local" value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)} />
            </div>
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditTask(null)} disabled={isSaving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Título *</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Descreva a tarefa..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prioridade</label>
              <Select value={newPriority} onValueChange={(v) => setNewPriority((v ?? "medium") as Task["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prazo</label>
              <Input type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isCreating}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
