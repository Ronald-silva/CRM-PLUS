import Link from "next/link";
import {
  Bot,
  MessageSquare,
  TrendingUp,
  Zap,
  Receipt,
  CheckSquare,
  ArrowRight,
  Sparkles,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Bot className="w-5 h-5" />,
    title: "IA que age por você",
    desc: "A IA detecta intenções, sugere respostas e cria tarefas automaticamente. Você valida, não opera.",
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "Conversas centralizadas",
    desc: "WhatsApp, Instagram e e-mail em um único lugar. Nunca perca um lead por falta de resposta.",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Kanban de oportunidades",
    desc: "Visualize seu funil de vendas, arraste negócios entre etapas e feche mais rápido.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Automações inteligentes",
    desc: "Fluxos que disparam quando um lead chega, responde ou para de responder.",
  },
  {
    icon: <Receipt className="w-5 h-5" />,
    title: "Faturamento integrado",
    desc: "Gere cobranças, controle recebimentos e veja a receita realizada em tempo real.",
  },
  {
    icon: <CheckSquare className="w-5 h-5" />,
    title: "Tarefas e follow-ups",
    desc: "A IA cria lembretes automáticos para o time não deixar nenhum cliente sem resposta.",
  },
];

const STEPS = [
  { n: "1", label: "Lead entra via WhatsApp" },
  { n: "2", label: "IA identifica intenção e cria oportunidade" },
  { n: "3", label: "Vendedor recebe tarefa e fecha negócio" },
  { n: "4", label: "Faturamento gerado automaticamente" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="border-b sticky top-0 z-20 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">CRM PLUS</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Testar grátis
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 gap-6">
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          IA de 1ª classe — não um add-on
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight max-w-3xl leading-tight">
          O CRM que{" "}
          <span className="text-primary">age</span>
          {" "}antes do seu time precisar
        </h1>

        <p className="text-lg text-muted-foreground max-w-xl">
          Do primeiro contato ao faturamento, a IA cuida do operacional.
          Seu time foca em fechar negócios.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            Testar grátis agora
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login?demo=1"
            className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-base font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Users className="w-4 h-4" />
            Ver conta demo
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Sem cartão de crédito · Começa em minutos
        </p>
      </section>

      {/* Flow */}
      <section className="border-y bg-muted/30 py-14 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            Fluxo completo em 4 passos
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col items-center text-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {s.n}
                </div>
                <p className="text-sm font-medium leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-3">
            Tudo que seu time precisa
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            Sem módulos extras. Sem integrações complicadas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border bg-card p-5 space-y-2 hover:shadow-sm transition-shadow"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {f.icon}
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-3">Pronto para automatizar suas vendas?</h2>
        <p className="text-primary-foreground/80 mb-8 max-w-md mx-auto">
          Crie sua conta em menos de 2 minutos e veja a IA funcionando hoje mesmo.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-lg bg-background text-foreground px-8 py-3 font-semibold text-base hover:bg-background/90 transition-colors"
        >
          Criar conta grátis
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 px-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CRM PLUS · Sistema operacional comercial com IA
      </footer>
    </div>
  );
}
