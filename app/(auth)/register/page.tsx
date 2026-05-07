"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const email    = fd.get("email") as string;
    const password = fd.get("password") as string;
    const body = {
      companyName: fd.get("companyName"),
      name:        fd.get("name"),
      email,
      password,
    };

    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }

      if (!res.ok) {
        setError((data.error as string) ?? `Erro ao criar conta (${res.status}). Tente novamente.`);
        setLoading(false);
        return;
      }

      // Auto-login after successful registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.push("/login?registered=true");
      }
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">CRM PLUS</h1>
          <p className="text-sm text-muted-foreground">Crie sua conta e empresa</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Criar empresa</CardTitle>
            <CardDescription>Você será o administrador da conta</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Nome da empresa</Label>
                <Input id="companyName" name="companyName" placeholder="Minha Empresa Ltda" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" name="name" placeholder="João Silva" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" placeholder="voce@empresa.com" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" placeholder="Mínimo 8 caracteres" required autoComplete="new-password" />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar empresa
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <a href="/login" className="font-medium text-primary hover:underline">
                Entrar
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
