import { signIn } from "@/lib/auth/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { seedDemo } from "@/lib/demo/seed";
import { Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; demo?: string; registered?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;
  const isDemo = params.demo === "1";
  const registered = params.registered === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">CRM PLUS</h1>
          <p className="text-sm text-muted-foreground">Sistema operacional comercial com IA</p>
        </div>

        {/* Registered success */}
        {registered && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Conta criada com sucesso! Entre com seu e-mail e senha.
          </div>
        )}

        {/* Demo banner */}
        {isDemo && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              Conta demonstração
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use as credenciais abaixo para explorar o sistema com dados reais de exemplo.
            </p>
            <form
              action={async () => {
                "use server";
                // Ensure demo user exists before signing in
                try { await seedDemo(); } catch { /* user may already exist */ }
                try {
                  await signIn("credentials", {
                    email:      "demo@crmplus.com.br",
                    password:   "demo1234",
                    redirectTo: "/dashboard",
                  });
                } catch (err) {
                  if (err instanceof AuthError) redirect("/login?error=DemoUnavailable");
                  throw err;
                }
              }}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>demo@crmplus.com.br</span>
                <span className="font-mono tracking-wider">demo1234</span>
              </div>
              <Button type="submit" variant="outline" className="w-full text-sm border-primary/40 text-primary hover:bg-primary/10">
                Entrar com conta demo
              </Button>
            </form>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Entrar</CardTitle>
            <CardDescription>Acesse sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                "use server";
                try {
                  await signIn("credentials", {
                    email:    formData.get("email"),
                    password: formData.get("password"),
                    redirectTo: callbackUrl,
                  });
                } catch (err) {
                  if (err instanceof AuthError) {
                    redirect(`/login?error=InvalidCredentials&callbackUrl=${callbackUrl}`);
                  }
                  throw err;
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error === "DemoUnavailable"
                    ? "Conta demo indisponível no momento. Tente novamente."
                    : "E-mail ou senha incorretos."}
                </p>
              )}

              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>

            <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
              <div>
                Não tem conta?{" "}
                <a href="/register" className="font-medium text-primary hover:underline">
                  Criar empresa
                </a>
              </div>
              {!isDemo && (
                <div>
                  <a href="/login?demo=1" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                    Ver conta demonstração
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
