"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CRM PLUS] Erro global:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-muted/40 p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          </div>
          <h1 className="text-xl font-bold">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro inesperado. Nossa equipe já foi notificada.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">Código: {error.digest}</p>
          )}
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              Ir para o início
            </Button>
            <Button onClick={reset}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
