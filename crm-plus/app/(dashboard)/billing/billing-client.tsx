"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle, Loader2, DollarSign, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Revenue = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  description: string | null;
  paidAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  opportunity: { id: string; title: string } | null;
  contact: { id: string; name: string; email: string | null } | null;
  company: { id: string; name: string } | null;
};

type Props = {
  revenues: Revenue[];
  total: number;
  page: number;
  limit: number;
  canUpdate: boolean;
};

const STATUS_LABEL: Record<Revenue["status"], string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<Revenue["status"], "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  paid: "default",
  cancelled: "destructive",
};

const STATUS_ICON: Record<Revenue["status"], React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  paid: <CheckCircle2 className="w-3 h-3" />,
  cancelled: <XCircle className="w-3 h-3" />,
};

function fmt(amount: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

function fmtDate(date: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}

export function BillingClient({ revenues, total, page, limit, canUpdate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
  const [editStatus, setEditStatus] = useState<Revenue["status"]>("pending");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const pages = Math.ceil(total / limit);
  const totalAmount = revenues.reduce((sum, r) => sum + r.amount, 0);
  const paidAmount = revenues.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.amount, 0);

  function pushParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete("page");
    startTransition(() => router.push(`?${p.toString()}`));
  }

  function openEdit(rev: Revenue) {
    setEditingRevenue(rev);
    setEditStatus(rev.status);
    setEditPaidAt(rev.paidAt ? new Date(rev.paidAt).toISOString().slice(0, 16) : "");
    setEditDueAt(rev.dueAt ? new Date(rev.dueAt).toISOString().slice(0, 16) : "");
    setEditDescription(rev.description ?? "");
    setError("");
  }

  async function handleSave() {
    if (!editingRevenue) return;
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/revenues/${editingRevenue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          paidAt: editPaidAt ? new Date(editPaidAt).toISOString() : null,
          dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
          description: editDescription || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao salvar."); return; }
      setEditingRevenue(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Erro de rede.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Faturamento</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total (página)</p>
          <p className="text-xl font-bold mt-1">{fmt(totalAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Pago (página)</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(paidAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Registros</p>
          <p className="text-xl font-bold mt-1">{total}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Página</p>
          <p className="text-xl font-bold mt-1">{page} / {pages || 1}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <Select
            value={searchParams.get("status") ?? "all"}
            onValueChange={(v) => pushParam("status", !v || v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            placeholder="De"
            className="w-36"
            defaultValue={searchParams.get("dateFrom") ?? ""}
            onChange={(e) => pushParam("dateFrom", e.target.value)}
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            placeholder="Até"
            className="w-36"
            defaultValue={searchParams.get("dateTo") ?? ""}
            onChange={(e) => pushParam("dateTo", e.target.value)}
          />
        </div>

        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oportunidade</TableHead>
              <TableHead>Contato / Empresa</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pago em</TableHead>
              <TableHead>Criado em</TableHead>
              {canUpdate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canUpdate ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  Nenhum faturamento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              revenues.map((rev) => (
                <TableRow key={rev.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {rev.opportunity?.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rev.contact?.name ?? rev.company?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {rev.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(rev.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[rev.status]} className="flex items-center gap-1 w-fit">
                      {STATUS_ICON[rev.status]}
                      {STATUS_LABEL[rev.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(rev.paidAt)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(rev.createdAt)}</TableCell>
                  {canUpdate && (
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(rev)}>
                        Editar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => pushParam("page", String(page - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => pushParam("page", String(page + 1))}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingRevenue} onOpenChange={(open) => { if (!open) setEditingRevenue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Faturamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editingRevenue && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{editingRevenue.opportunity?.title}</span>
                {" · "}{fmt(editingRevenue.amount)}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Revenue["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Data de pagamento</label>
              <Input
                type="datetime-local"
                value={editPaidAt}
                onChange={(e) => setEditPaidAt(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Data de vencimento</label>
              <Input
                type="datetime-local"
                value={editDueAt}
                onChange={(e) => setEditDueAt(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Descrição</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrição opcional"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingRevenue(null)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
