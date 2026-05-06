"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
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

type ProductStatus = "active" | "inactive";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: unknown; // Decimal serialized as string from Prisma
  category: string | null;
  status: ProductStatus;
  createdAt: Date;
}

interface Props {
  products: Product[];
  total: number;
  page: number;
  search: string;
  statusFilter: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

const STATUS_VARIANTS: Record<ProductStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  inactive: "outline",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  category: "",
  status: "active" as ProductStatus,
};

function formatPrice(value: unknown): string {
  const num = Number(value);
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductsClient({
  products,
  total,
  page,
  search,
  statusFilter,
  canCreate,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function buildParams(overrides: Record<string, string> = {}) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusFilter) p.set("status", statusFilter);
    Object.entries(overrides).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return p.toString();
  }

  function applySearch(value: string) {
    const p = new URLSearchParams();
    if (value) p.set("q", value);
    if (statusFilter) p.set("status", statusFilter);
    startTransition(() => router.push(`/products?${p}`));
  }

  function applyStatus(value: string) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (value && value !== "all") p.set("status", value);
    startTransition(() => router.push(`/products?${p}`));
  }

  function openCreate() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(Number(p.price)),
      category: p.category ?? "",
      status: p.status,
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Nome é obrigatório."); return; }
    const price = parseFloat(form.price.replace(",", "."));
    if (isNaN(price) || price < 0) { setError("Preço inválido."); return; }

    setSaving(true);
    setError("");
    try {
      const url = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
      const method = editProduct ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          price,
          category: form.category || null,
          status: form.status,
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir "${name}"?`)) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const limit = 20;
  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">{total} produto{total !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo produto
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome, categoria..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch(q)}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => applyStatus(v ?? "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  {search || statusFilter ? "Nenhum produto encontrado." : "Nenhum produto cadastrado ainda."}
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                  <TableCell className="font-medium tabular-nums">{formatPrice(p.price)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[p.status]}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(p.id, p.name)}
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
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => router.push(`/products?${buildParams({ page: String(page - 1) })}`)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || isPending}
              onClick={() => router.push(`/products?${buildParams({ page: String(page + 1) })}`)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Dialog — criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Consultoria mensal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço *</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                <Input
                  className="pl-8"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Serviços, Licenças, Hardware..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrição do produto ou serviço..."
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProductStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editProduct ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
