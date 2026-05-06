"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Loader2, TrendingUp, Trophy, XCircle, Package, LayoutList, Kanban } from "lucide-react";
import { KanbanBoard } from "./kanban-board";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OppStatus = "open" | "won" | "lost";

interface Stage {
  id: string;
  name: string;
  order: number;
  probability: number;
}

interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: Stage[];
}

interface OppProduct {
  id: string;
  quantity: number;
  unitPrice: unknown;
  totalPrice: unknown;
  productId: string;
  product: { id: string; name: string; category: string | null };
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
  products: OppProduct[];
}

interface CatalogProduct {
  id: string;
  name: string;
  price: unknown;
  category: string | null;
}

interface Props {
  opportunities: Opportunity[];
  total: number;
  page: number;
  search: string;
  statusFilter: string;
  pipelineFilter: string;
  pipelines: Pipeline[];
  contacts: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  users: { id: string; name: string }[];
  allProducts: CatalogProduct[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_LABELS: Record<OppStatus, string> = { open: "Aberta", won: "Ganha", lost: "Perdida" };
const STATUS_VARIANTS: Record<OppStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  won: "default",
  lost: "destructive",
};
const STATUS_ICONS: Record<OppStatus, React.ReactNode> = {
  open: <TrendingUp className="h-3 w-3" />,
  won: <Trophy className="h-3 w-3" />,
  lost: <XCircle className="h-3 w-3" />,
};

function formatCurrency(value: unknown) {
  const n = Number(value);
  if (isNaN(n) || value === null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

const EMPTY_FORM = {
  title: "",
  pipelineId: "",
  stageId: "",
  contactId: "",
  companyId: "",
  assignedUserId: "",
  value: "",
  status: "open" as OppStatus,
  expectedCloseAt: "",
  notes: "",
};

export function OpportunitiesClient({
  opportunities, total, page, search, statusFilter, pipelineFilter,
  pipelines, contacts, companies, users, allProducts,
  canCreate, canEdit, canDelete,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"table" | "kanban">("kanban");
  const [q, setQ] = useState(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // product management dialog state
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productDialogOpp, setProductDialogOpp] = useState<Opportunity | null>(null);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addUnitPrice, setAddUnitPrice] = useState("");
  const [productSaving, setProductSaving] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editUnitPrice, setEditUnitPrice] = useState("");

  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const selectedPipelineStages = pipelines.find((p) => p.id === form.pipelineId)?.stages ?? [];

  function buildParams(overrides: Record<string, string> = {}) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusFilter) p.set("status", statusFilter);
    if (pipelineFilter) p.set("pipelineId", pipelineFilter);
    Object.entries(overrides).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return p.toString();
  }

  function applyFilter(key: string, value: string) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (key !== "status" && statusFilter) p.set("status", statusFilter);
    if (key !== "pipelineId" && pipelineFilter) p.set("pipelineId", pipelineFilter);
    if (value && value !== "all") p.set(key, value);
    startTransition(() => router.push(`/opportunities?${p}`));
  }

  function openCreate(stageId?: string) {
    setEditOpp(null);
    const firstPipeline = defaultPipeline;
    setForm({
      ...EMPTY_FORM,
      pipelineId: firstPipeline?.id ?? "",
      stageId: stageId ?? firstPipeline?.stages[0]?.id ?? "",
    });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(o: Opportunity) {
    setEditOpp(o);
    const pipeline = pipelines.find((p) => p.stages.some((s) => s.id === o.stage.id));
    setForm({
      title: o.title,
      pipelineId: pipeline?.id ?? "",
      stageId: o.stage.id,
      contactId: o.contact?.id ?? "",
      companyId: o.company?.id ?? "",
      assignedUserId: o.assignedUser?.id ?? "",
      value: o.value !== null && o.value !== undefined ? String(Number(o.value)) : "",
      status: o.status,
      expectedCloseAt: o.expectedCloseAt
        ? new Date(o.expectedCloseAt).toISOString().split("T")[0]
        : "",
      notes: "",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError("Título é obrigatório."); return; }
    if (!form.pipelineId) { setError("Selecione um pipeline."); return; }
    if (!form.stageId) { setError("Selecione uma etapa."); return; }

    const value = form.value ? parseFloat(form.value.replace(",", ".")) : null;
    if (form.value && (isNaN(value!) || value! < 0)) { setError("Valor inválido."); return; }

    setSaving(true);
    setError("");
    try {
      const url = editOpp ? `/api/opportunities/${editOpp.id}` : "/api/opportunities";
      const method = editOpp ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          pipelineId: form.pipelineId,
          stageId: form.stageId,
          contactId: form.contactId || null,
          companyId: form.companyId || null,
          assignedUserId: form.assignedUserId || null,
          value: value ?? null,
          status: form.status,
          expectedCloseAt: form.expectedCloseAt
            ? new Date(form.expectedCloseAt).toISOString()
            : null,
          notes: null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Erro ao salvar.");
        return;
      }
      setDialogOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Excluir "${title}"?`)) return;
    await fetch(`/api/opportunities/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  async function quickStatus(id: string, status: OppStatus) {
    await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    startTransition(() => router.refresh());
  }

  async function moveStage(oppId: string, stageId: string) {
    await fetch(`/api/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    startTransition(() => router.refresh());
  }

  function openProductDialog(o: Opportunity) {
    setProductDialogOpp(o);
    setAddProductId("");
    setAddQty("1");
    setAddUnitPrice("");
    setEditItemId(null);
    setProductDialogOpen(true);
  }

  function startEditItem(item: OppProduct) {
    setEditItemId(item.id);
    setEditQty(String(item.quantity));
    setEditUnitPrice(String(Number(item.unitPrice)));
  }

  async function handleAddProduct() {
    if (!productDialogOpp || !addProductId) return;
    const qty = parseInt(addQty);
    if (isNaN(qty) || qty < 1) return;
    setProductSaving(true);
    try {
      const body: Record<string, unknown> = { productId: addProductId, quantity: qty };
      if (addUnitPrice) body.unitPrice = parseFloat(addUnitPrice.replace(",", "."));
      await fetch(`/api/opportunities/${productDialogOpp.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setAddProductId("");
      setAddQty("1");
      setAddUnitPrice("");
      startTransition(() => router.refresh());
    } finally {
      setProductSaving(false);
    }
  }

  async function handleUpdateItem(oppId: string, productId: string) {
    const qty = parseInt(editQty);
    if (isNaN(qty) || qty < 1) return;
    setProductSaving(true);
    try {
      const body: Record<string, unknown> = { quantity: qty };
      if (editUnitPrice) body.unitPrice = parseFloat(editUnitPrice.replace(",", "."));
      await fetch(`/api/opportunities/${oppId}/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditItemId(null);
      startTransition(() => router.refresh());
    } finally {
      setProductSaving(false);
    }
  }

  async function handleRemoveProduct(oppId: string, productId: string, name: string) {
    if (!confirm(`Remover "${name}" desta oportunidade?`)) return;
    await fetch(`/api/opportunities/${oppId}/products/${productId}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const limit = 50;
  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">{total} oportunidade{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Kanban className="w-3.5 h-3.5" />Kanban
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutList className="w-3.5 h-3.5" />Lista
            </button>
          </div>
          {canCreate && (
            <Button onClick={() => openCreate()} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova oportunidade
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por título..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilter("q", q)}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => applyFilter("status", v ?? "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abertas</SelectItem>
            <SelectItem value="won">Ganhas</SelectItem>
            <SelectItem value="lost">Perdidas</SelectItem>
          </SelectContent>
        </Select>
        {pipelines.length > 1 && (
          <Select value={pipelineFilter || "all"} onValueChange={(v) => applyFilter("pipelineId", v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funis</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Kanban view ────────────────────────────────────────────────── */}
      {view === "kanban" && (
        <KanbanBoard
          opportunities={opportunities}
          stages={defaultPipeline?.stages ?? []}
          canEdit={canEdit}
          canCreate={canCreate}
          onMoveStage={moveStage}
          onQuickWon={(id) => quickStatus(id, "won")}
          onQuickLost={(id) => quickStatus(id, "lost")}
          onOpenCreate={(stageId) => openCreate(stageId)}
          onOpenEdit={(id) => { const o = opportunities.find((x) => x.id === id); if (o) openEdit(o); }}
        />
      )}

      {/* ── Table view ──────────────────────────────────────────────────── */}
      {view === "table" && <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Contato / Empresa</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Fechamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Nenhuma oportunidade encontrada.
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex flex-col gap-0.5">
                      {o.contact && <span>{o.contact.name}</span>}
                      {o.company && <span className="text-xs">{o.company.name}</span>}
                      {!o.contact && !o.company && <span>—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{o.stage.name}</span>
                      <span className="text-xs text-muted-foreground">{o.stage.probability}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{formatCurrency(o.value)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(o.expectedCloseAt)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[o.status]} className="gap-1">
                      {STATUS_ICONS[o.status]}
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 relative"
                        title="Gerenciar produtos"
                        onClick={() => openProductDialog(o)}
                      >
                        <Package className="h-3.5 w-3.5" />
                        {o.products.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                            {o.products.length}
                          </span>
                        )}
                      </Button>
                      {canEdit && o.status === "open" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700"
                            title="Marcar como ganha"
                            onClick={() => quickStatus(o.id, "won")}
                          >
                            <Trophy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Marcar como perdida"
                            onClick={() => quickStatus(o.id, "lost")}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(o.id, o.title)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>}

      {/* Pagination (table view only) */}
      {view === "table" && pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isPending}
              onClick={() => router.push(`/opportunities?${buildParams({ page: String(page - 1) })}`)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages || isPending}
              onClick={() => router.push(`/opportunities?${buildParams({ page: String(page + 1) })}`)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editOpp ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Proposta para Acme Ltda" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pipeline *</Label>
                <Select
                  value={form.pipelineId}
                  onValueChange={(v) => {
                    const pl = pipelines.find((p) => p.id === v);
                    setForm({ ...form, pipelineId: v ?? "", stageId: pl?.stages[0]?.id ?? "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa *</Label>
                <Select value={form.stageId} onValueChange={(v) => setForm({ ...form, stageId: v ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {selectedPipelineStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.probability}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contato</Label>
                <Select value={form.contactId || "none"} onValueChange={(v) => setForm({ ...form, contactId: v === "none" ? "" : (v ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Select value={form.companyId || "none"} onValueChange={(v) => setForm({ ...form, companyId: v === "none" ? "" : (v ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Previsão de fechamento</Label>
                <Input type="date" value={form.expectedCloseAt} onChange={(e) => setForm({ ...form, expectedCloseAt: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.assignedUserId || "none"} onValueChange={(v) => setForm({ ...form, assignedUserId: v === "none" ? "" : (v ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: (v ?? "open") as OppStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberta</SelectItem>
                    <SelectItem value="won">Ganha</SelectItem>
                    <SelectItem value="lost">Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações sobre a oportunidade..." className="resize-none" rows={2} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editOpp ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — produtos da oportunidade */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Produtos — {productDialogOpp?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Existing items */}
            {productDialogOpp && productDialogOpp.products.length > 0 && (
              <div className="rounded-md border divide-y">
                {productDialogOpp.products.map((item) => (
                  <div key={item.id} className="px-3 py-2">
                    {editItemId === item.id ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium truncate">{item.product.name}</span>
                        <Input
                          className="w-16 h-7 text-sm"
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          placeholder="Qtd"
                        />
                        <Input
                          className="w-24 h-7 text-sm"
                          value={editUnitPrice}
                          onChange={(e) => setEditUnitPrice(e.target.value)}
                          placeholder="Preço unit."
                        />
                        <Button size="sm" className="h-7 px-2" disabled={productSaving}
                          onClick={() => handleUpdateItem(productDialogOpp.id, item.productId)}>
                          {productSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditItemId(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity}× {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditItem(item)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveProduct(productDialogOpp.id, item.productId, item.product.name)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="px-3 py-2 bg-muted/30 flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(productDialogOpp.products.reduce((s, i) => s + Number(i.totalPrice), 0))}</span>
                </div>
              </div>
            )}

            {productDialogOpp && productDialogOpp.products.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhum produto vinculado ainda.</p>
            )}

            {/* Add product */}
            {allProducts.length > 0 && canEdit && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar produto</p>
                <div className="flex gap-2">
                  <Select value={addProductId || "none"} onValueChange={(v) => {
                    const id = v === "none" ? "" : (v ?? "");
                    setAddProductId(id);
                    const p = allProducts.find((x) => x.id === id);
                    if (p) setAddUnitPrice(String(Number(p.price)));
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar produto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecionar produto...</SelectItem>
                      {allProducts
                        .filter((p) => !productDialogOpp?.products.some((i) => i.productId === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {formatCurrency(p.price)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-16"
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    placeholder="Qtd"
                  />
                  <Input
                    className="w-28"
                    value={addUnitPrice}
                    onChange={(e) => setAddUnitPrice(e.target.value)}
                    placeholder="Preço unit."
                  />
                  <Button size="sm" disabled={!addProductId || productSaving} onClick={handleAddProduct}>
                    {productSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {allProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum produto ativo cadastrado. <a href="/products" className="underline">Cadastrar produtos</a>.
              </p>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
