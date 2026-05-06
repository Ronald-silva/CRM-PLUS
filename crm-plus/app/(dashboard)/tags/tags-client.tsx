"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
  _count: { contacts: number };
}

interface Props {
  tags: Tag[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#64748b", "#0d9488",
];

const EMPTY_FORM = { name: "", color: "#3b82f6" };

function TagBadge({ name, color }: { name: string; color: string | null }) {
  const bg = color ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {name}
    </span>
  );
}

export function TagsClient({ tags, canCreate, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditTag(null);
    setForm(EMPTY_FORM);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(t: Tag) {
    setEditTag(t);
    setForm({ name: t.name, color: t.color ?? "#64748b" });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Nome é obrigatório."); return; }
    setSaving(true);
    setError("");
    try {
      const url = editTag ? `/api/tags/${editTag.id}` : "/api/tags";
      const method = editTag ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
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
    if (!confirm(`Excluir a tag "${name}"? Ela será removida de todos os contatos.`)) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">{tags.length} tag{tags.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nova tag
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Contatos vinculados</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                  Nenhuma tag cadastrada ainda.
                </TableCell>
              </TableRow>
            ) : (
              tags.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <TagBadge name={t.name} color={t.color} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {t._count.contacts} contato{t._count.contacts !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(t.id, t.name)}
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTag ? "Editar tag" : "Nova tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: cliente vip, urgente..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-7 w-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "white" : "transparent",
                      boxShadow: form.color === c ? `0 0 0 2px ${c}` : "none",
                    }}
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <TagIcon className="h-4 w-4 text-muted-foreground" />
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: form.color }}
                >
                  {form.name || "Prévia"}
                </span>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editTag ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
