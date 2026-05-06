"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  GitBranch,
  TrendingUp,
  MessageSquare,
  CheckSquare,
  Receipt,
  Zap,
  BarChart3,
  Settings,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/companies", label: "Empresas", icon: Building2 },
  { href: "/products", label: "Produtos", icon: Package },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/opportunities", label: "Oportunidades", icon: TrendingUp },
  { href: "/inbox", label: "Conversas", icon: MessageSquare, badge: true },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare, badge: true },
  { href: "/billing", label: "Faturamento", icon: Receipt },
  { href: "/automations", label: "Automações", icon: Zap },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Bot className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold tracking-tight">CRM PLUS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                      0
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* AI Status */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">IA ativa</span>
        </div>
      </div>
    </aside>
  );
}
