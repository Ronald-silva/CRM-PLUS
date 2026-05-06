"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CRM PLUS] Erro no dashboard:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Não foi possível carregar esta página</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ocorreu um erro ao carregar o conteúdo. Tente atualizar a página ou volte ao início.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono pt-1">Código: {error.digest}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => window.location.href = "/dashboard"}>
          <Home className="h-4 w-4 mr-1.5" />
          Início
        </Button>
        <Button size="sm" onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
