"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Loader2, Tag as TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type ContactStatus = "lead" | "customer" | "inactive";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ContactStatus;
  createdAt: Date;
  tags: Tag[];
}

interface Props {
  contacts: Contact[];
  allTags: Tag[];
  total: number;
  page: number;
  search: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  customer: "Cliente",
  inactive: "Inativo",
};

const STATUS_VARIANTS: Record<ContactStatus, "default" | "secondary" | "outline"> = {
  lead: "default",
  customer: "secondary",
  inactive: "outline",
};

const EMPTY_FORM = { name: "", email: "", phone: "", status: "lead" as ContactStatus };

export function ContactsClient({ contacts, allTags, total, page, search, canCreate, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tagContact, setTagContact] = useState<Contact | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  function applySearch(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    startTransition(() => router.push(`/contacts?${params}`));
  }

  function openCreate() {
    setEditContact(null);
    setForm(EMPTY_FORM);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(c: Contact) {
    setEditContact(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", status: c.status });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Nome é obrigatório."); return; }
    setSaving(true);
    setError("");
    try {
      const url = editContact ? `/api/contacts/${editContact.id}` : "/api/contacts";
      const method = editContact ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email || null, phone: form.phone || null }),
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
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  function openTagDialog(c: Contact) {
    setTagContact(c);
    setTagDialogOpen(true);
  }

  async function addTag(contactId: string, tagId: string) {
    await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    startTransition(() => router.refresh());
  }

  async function removeTag(contactId: string, tagId: string) {
    await fetch(`/api/contacts/${contactId}/tags/${tagId}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const limit = 20;
  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">{total} contato{total !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo contato
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch(q)}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  {search ? "Nenhum contato encontrado." : "Nenhum contato cadastrado ainda."}
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[c.status]}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: t.color ?? "#64748b" }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {c.tags.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Gerenciar tags" onClick={() => openTagDialog(c)}>
                          <TagIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id, c.name)}>
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
            <Button variant="outline" size="sm" disabled={page <= 1 || isPending}
              onClick={() => { const p = new URLSearchParams(); if (q) p.set("q", q); p.set("page", String(page - 1)); router.push(`/contacts?${p}`); }}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages || isPending}
              onClick={() => { const p = new URLSearchParams(); if (q) p.set("q", q); p.set("page", String(page + 1)); router.push(`/contacts?${p}`); }}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Dialog — criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? "Editar contato" : "Novo contato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="João Silva" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="joao@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ContactStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editContact ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — gerenciar tags do contato */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tags — {tagContact?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {allTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada. <a href="/tags" className="underline">Criar tags</a>.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => {
                  const applied = tagContact?.tags.some((ct) => ct.id === t.id) ?? false;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (!tagContact) return;
                        if (applied) removeTag(tagContact.id, t.id);
                        else addTag(tagContact.id, t.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: applied ? (t.color ?? "#64748b") : "transparent",
                        color: applied ? "white" : (t.color ?? "#64748b"),
                        border: `2px solid ${t.color ?? "#64748b"}`,
                      }}
                    >
                      {applied && <X className="h-3 w-3" />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setTagDialogOpen(false)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
