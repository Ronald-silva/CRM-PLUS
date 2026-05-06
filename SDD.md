# SDD — Software Design Document
# CRM PLUS

**Versão:** 1.1  
**Data:** 2026-05-04  
**Status:** Aprovado para implementação

---

## Índice

0. [Princípio do Produto](#0-princípio-do-produto)
1. [Visão Geral](#1-visão-geral)
2. [Módulos do Sistema](#2-módulos-do-sistema)
3. [Entidades do Banco de Dados](#3-entidades-do-banco-de-dados)
4. [Arquitetura do Sistema](#4-arquitetura-do-sistema)
5. [Estrutura de Pastas](#5-estrutura-de-pastas)
6. [Permissões por Perfil](#6-permissões-por-perfil)
7. [Fluxos Principais](#7-fluxos-principais)
8. [Automações e Regras de IA](#8-automações-e-regras-de-ia)
9. [Fases de Construção](#9-fases-de-construção)
10. [Ordem de Implementação](#10-ordem-de-implementação)

---

## 0. Princípio do Produto

> **O CRM PLUS não é um sistema de gestão manual. É um sistema operacional comercial autônomo.**

Esta é a decisão de produto mais importante do sistema e deve guiar toda decisão de arquitetura, UX e priorização.

### O que o usuário NÃO precisa fazer

| Tarefa manual | Como o sistema resolve |
|---------------|----------------------|
| Criar leads | Criados automaticamente ao receber mensagem (WhatsApp, Instagram) |
| Mover cards no funil | IA detecta intenção e move automaticamente |
| Lembrar follow-up | IA agenda e dispara follow-up por inatividade |
| Ler todas as conversas | IA resume, classifica e alerta apenas o que importa |
| Aplicar tags | IA classifica e tageia com base no contexto |
| Criar tarefas | IA extrai compromissos das mensagens e cria tarefas |

### O papel do humano

O vendedor **valida** e **fecha**. Todo o trabalho de qualificação, organização e acompanhamento é feito pela IA.

```
[Mensagem chega] → IA age → [Vendedor vê resultado] → Vendedor valida/ajusta → Vendedor fecha
```

### Implicações diretas na arquitetura

1. **IA é camada de primeira classe** — não módulo opcional na Fase 5. A estrutura de IA (`/lib/ai/`) e `ai_logs` são criados na Fase 1.
2. **Automações ativas por padrão** — o sistema vem com automações padrão pré-configuradas por tenant, não espera o usuário configurar.
3. **Leads nascem dos canais** — a criação manual de contato é exceção. O fluxo principal é: webhook → identificar contato → criar se não existe.
4. **Pipeline se move por eventos** — arrastar card é fallback manual. O default é movimento automático por IA.
5. **A UI é de validação, não de entrada** — painéis mostram o que a IA fez e pedem confirmação, não formulários esperando preenchimento.
6. **Follow-up é proativo** — o sistema não espera o vendedor lembrar. Detecta inatividade e dispara.
7. **O dashboard mostra saúde autônoma** — gargalos identificados pela IA, não pelo gestor que revisou manualmente.

### Filtro de decisão

Toda nova feature deve passar por:
> *"Isso precisa de ação humana ou a IA pode fazer automaticamente?"*  
> → Preferir sempre o automático. O humano entra apenas para validar ou para casos de exceção.

---

## 1. Visão Geral

### 1.1 O que é o CRM PLUS

O CRM PLUS é um sistema operacional comercial autônomo, multi-empresa. Diferente de CRMs tradicionais onde o vendedor alimenta o sistema, aqui o sistema alimenta o vendedor.

**O sistema age. O vendedor valida e fecha.**

Ele integra em uma única plataforma:

- Captura automática de leads a partir de mensagens recebidas
- Qualificação e classificação automática por IA
- Pipeline de vendas com movimento autônomo
- Comunicação omnichannel (WhatsApp, Instagram, Messenger, e-mail)
- Follow-up proativo por inatividade
- Faturamento automático a partir de oportunidades ganhas
- Alertas de gargalo identificados pela IA
- Controle de acesso por perfil

### 1.2 Público-alvo

Empresas de pequeno e médio porte com times de vendas e atendimento que querem parar de gerenciar o CRM e começar a fechar negócios.

### 1.3 Princípios de Design

- **Autônomo por padrão:** a IA age sem esperar input humano; o humano intervém quando quer, não quando precisa
- **Multi-tenant:** cada empresa tem seus dados completamente isolados
- **IA de primeira classe:** a camada de IA é parte do núcleo do sistema, não plugin adicional
- **Auditável:** toda ação da IA é registrada em `ai_logs` — o usuário pode ver o porquê de cada decisão
- **API-first:** o backend expõe APIs RESTful que o frontend consome
- **Preparado para escala:** filas, webhooks e real-time projetados desde o início
- **Modular:** cada módulo pode ser desenvolvido e evoluído independentemente

### 1.4 Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| UI Components | shadcn/ui + Radix UI |
| Backend | Next.js API Routes (Route Handlers) |
| ORM | Prisma |
| Banco de Dados | PostgreSQL |
| Autenticação | NextAuth.js (Auth.js v5) |
| Real-time | Preparado para Socket.io / Supabase Realtime |
| Filas / Jobs | Preparado para BullMQ + Redis |
| IA | Camada abstrata: Claude (Anthropic) / OpenAI / Gemini |
| Validação | Zod |
| Forms | React Hook Form + Zod |
| Estado global | Zustand |
| Fetch / Cache | TanStack Query (React Query) |
| Deploy | A definir: Vercel + Railway / Supabase |

---

## 2. Módulos do Sistema

### 2.1 Auth & Multi-Tenant

Responsável pelo login, sessões, cadastro de empresa e isolamento de dados.

**Funcionalidades:**
- Login com e-mail/senha
- Sessão por JWT / cookies seguros
- Cada usuário pertence a um tenant (empresa)
- Tenant identificado via subdomínio ou campo `tenant_id` na sessão
- Super Admin tem acesso cross-tenant (console interno)
- Recuperação de senha por e-mail

### 2.2 Usuários e Equipe

Gestão de membros da equipe dentro de cada empresa.

**Funcionalidades:**
- Cadastro de usuários por perfil: super_admin, owner, manager, salesperson, attendant, financial, viewer
- Perfis com permissões distintas por módulo
- Cada usuário tem: nome, e-mail, avatar, ramal/telefone, status ativo/inativo
- Gestor redistribui leads entre vendedores
- Metas por vendedor (valor e quantidade de negócios)
- Relatórios individuais por vendedor

### 2.3 Contatos

Cadastro e gestão de pessoas físicas (leads, clientes, prospects).

**Funcionalidades:**
- Campos: nome, e-mail, telefone, WhatsApp, Instagram handle, CPF, cargo, empresa vinculada
- Origem do lead: manual, WhatsApp, Instagram, formulário, importação
- Status: lead, prospect, cliente, inativo
- Responsável (vendedor atribuído)
- Tags aplicadas
- Linha do tempo completa (histórico de toda interação)
- Score/classificação do lead
- Notas internas

### 2.4 Empresas (Contas)

Cadastro de pessoas jurídicas para gestão B2B. A empresa é o ponto de consolidação de tudo que envolve seus contatos.

**Campos do cadastro:**
- Razão social, nome fantasia, CNPJ
- E-mail, telefone, site
- Endereço completo (logradouro, número, cidade, estado, CEP, país)
- Setor/segmento (ex: Saúde, Varejo, Tecnologia)
- Responsável (vendedor atribuído)
- Tags
- Status: ativa, inativa, prospecto

**Relacionamento com Contatos:**
- Uma empresa pode ter múltiplos contatos vinculados
- Cada contato pertence a no máximo uma empresa
- Ao visualizar a empresa, exibir todos os contatos com: nome, cargo, canal preferido, último contato
- Criar novo contato diretamente da tela da empresa (empresa pré-preenchida)

**Histórico Consolidado:**
A página da empresa agrega dados de **todos os contatos vinculados** em uma única linha do tempo:
- Conversas (WhatsApp, Instagram, e-mail) de qualquer contato da empresa
- Oportunidades abertas e fechadas vinculadas à empresa
- Tarefas pendentes e concluídas relacionadas à empresa
- Atividades (calls, reuniões, notas) de qualquer contato
- Faturas emitidas para a empresa
- Tags aplicadas em qualquer contato ou na empresa

**Oportunidades vinculadas:**
- Oportunidade pode ser vinculada à empresa (B2B) ou ao contato diretamente (B2C)
- Na tela da empresa: lista de todas as oportunidades com status, valor e responsável
- KPIs da empresa: total em aberto, total ganho, total perdido, ticket médio

**Regras de negócio:**
- Se um contato recebe mensagem via WhatsApp e está vinculado a uma empresa, a atividade aparece tanto na linha do tempo do contato quanto na da empresa
- Ao buscar uma empresa pelo CNPJ, sugerir dados públicos se disponíveis (integração futura com API de CNPJ)
- Empresa inativa não aparece em sugestões de vinculação, mas mantém histórico

### 2.5 Produtos e Serviços

Catálogo de itens comercializáveis pela empresa.

**Funcionalidades:**
- Campos: nome, descrição, categoria, preço unitário, unidade de medida, status ativo/inativo
- Vinculação a oportunidades e propostas
- Filtro por categoria, status, faixa de preço
- Histórico de uso em negócios

### 2.6 Tags

Sistema de etiquetagem transversal a todos os módulos.

**Funcionalidades:**
- Criar tags com nome e cor
- Aplicar em: contatos, empresas, leads, oportunidades, conversas
- Tags aplicadas manualmente pelo usuário
- Tags aplicadas automaticamente pela IA
- Filtrar registros por tag
- Exemplos pré-definidos: lead quente, inadimplente, interessado, reclamação, VIP, orçamento enviado, retorno urgente

### 2.7 Pipelines e Kanban

Funis de atendimento e vendas em formato visual.

**Funcionalidades:**
- Múltiplos pipelines por empresa (ex: Vendas B2B, Atendimento, Pós-venda)
- Cada pipeline tem etapas customizáveis (ex: Novo → Contato feito → Proposta enviada → Negociação → Ganho/Perdido)
- Cards representam oportunidades
- Drag-and-drop manual para mover cards entre etapas
- IA move cards automaticamente quando detecta avanço ou perda de interesse
- Filtros: por vendedor, período, valor, tag
- Visualização em Kanban e em lista

### 2.8 Oportunidades (Deals)

Cada oportunidade representa uma venda em andamento. É o objeto central do ciclo comercial.

**Campos:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Nome | texto | Ex: "Plano Pro — Clínica São Lucas" |
| Valor | decimal | Valor estimado do negócio |
| Estágio | FK pipeline_stage | Etapa atual no pipeline |
| Probabilidade | % (0–100) | Chance de fechamento — ajustada pela IA |
| Responsável | FK user | Vendedor dono do deal |
| Contato | FK contact | Pessoa física envolvida |
| Empresa | FK company | Pessoa jurídica (opcional, B2B) |
| Canal de origem | enum | whatsapp, instagram, indicação, formulário, manual |
| Data de fechamento prevista | date | Previsão — sugerida e atualizada pela IA |
| Data de fechamento real | date | Preenchida ao marcar como ganha/perdida |
| Motivo da perda | texto | Obrigatório ao marcar como perdida |
| Produtos vinculados | relação | Via `opportunity_products` |
| Status | enum | open, won, lost |

**Produtos vinculados:**
- Selecionar N produtos do catálogo com quantidade e desconto
- Valor total calculado automaticamente
- Ao ganhar → transferido integralmente para a fatura

**Comportamento da IA:**

**1. Criação automática (`create-opportunity`):**
- IA monitora conversas e detecta intenção de compra explícita ou implícita
- Ao detectar: cria oportunidade no estágio inicial do pipeline, vincula ao contato, notifica o vendedor — *"IA criou uma oportunidade: [nome] — baseado em: [trecho da conversa]"*
- Threshold configurável por tenant (sensibilidade: conservador / moderado / agressivo)

**2. Atualização de estágio (`detect-stage-advance`):**
- Após cada mensagem ou atividade vinculada à oportunidade, IA reavalia o estágio
- Move o card automaticamente se confiança ≥ threshold
- Log imutável: "IA moveu de Contato Feito → Proposta Enviada — *motivo: cliente solicitou proposta formal*"
- Vendedor pode reverter manualmente a qualquer momento

**3. Previsão de fechamento (`predict-close-date`):**
- IA analisa: tempo no estágio atual, histórico de negócios similares ganhos/perdidos, cadência de respostas, probabilidade atual
- Atualiza `expected_close` e `probability` automaticamente a cada mudança de contexto
- Exibe no card do Kanban: "Previsão: 12/05 · 72% de chance"
- Se previsão ultrapassar sem evolução → gera tarefa de revisão para o vendedor

**Regras de negócio:**
- Ao marcar como **ganha** → fatura gerada automaticamente (sem clique adicional)
- Ao marcar como **perdida** → motivo obrigatório + IA aplica tag correspondente no contato
- Oportunidade sem atividade há > N dias → trigger `no_open_task` → IA cria tarefa de retorno
- Mesma empresa não pode ter duas oportunidades idênticas abertas no mesmo estágio (aviso, não bloqueio)
- Histórico completo de movimentações de estágio com timestamp e origem (manual/IA)

### 2.9 Faturamento

Controle financeiro gerado a partir de oportunidades ganhas.

**Funcionalidades:**
- Fatura gerada automaticamente quando oportunidade é marcada como ganha
- Campos da fatura: número, cliente, itens (produtos vinculados), valor total, data de vencimento, status (pendente, pago, cancelado)
- Registro de pagamento (data e valor)
- Dashboard com:
  - Faturamento previsto (oportunidades abertas × probabilidade)
  - Faturamento realizado (faturas pagas)
  - Ticket médio
  - Vendas por produto (top produtos)
  - Vendas por vendedor
  - Vendas por canal de origem

### 2.10 Conversas e Inbox

Central de comunicação omnichannel com o cliente.

**Funcionalidades:**
- Inbox unificada com todas as conversas ativas
- Canais: WhatsApp, Instagram, Messenger, e-mail, interno
- Cada conversa associada a um contato
- Status da conversa: aberta, aguardando cliente, resolvida
- Responsável pela conversa
- Histórico completo de mensagens
- Tipos de mensagem: texto, imagem, áudio, vídeo, documento
- Notas internas (visíveis apenas para a equipe)
- Linha do tempo do contato inclui todas as conversas

### 2.11 Tarefas e Follow-up

Central de ações comerciais pendentes — criadas manualmente ou pela IA, nunca esquecidas.

**Vínculos obrigatórios:**
- Toda tarefa deve estar vinculada a: um **contato** + um **vendedor responsável**
- Opcionalmente vinculada a uma **oportunidade**

**Tipos de tarefa:**
| Tipo | Ícone | Descrição |
|------|-------|-----------|
| `ligação` | 📞 | Ligar para o contato |
| `mensagem` | 💬 | Enviar mensagem (WhatsApp, e-mail, etc.) |
| `reunião` | 📅 | Agendar ou realizar reunião |
| `proposta` | 📄 | Enviar ou acompanhar proposta |
| `retorno` | 🔁 | Retornar contato que aguarda resposta |

**Campos da tarefa:**
- Título, descrição, tipo, responsável, contato, oportunidade (opcional)
- Data e hora de vencimento
- Prioridade: baixa, média, alta, urgente
- Status: pendente, em andamento, concluída, cancelada
- Origem: manual, automação, IA

**Comportamento da IA:**
- **Criação automática:** ao detectar compromisso implícito ou explícito em mensagem (`create-task-from-message`)
- **Sugestão de prazo:** ao criar tarefa sem data, IA sugere prazo baseado no contexto da conversa e do tipo
- **Cobrança de execução:** tarefa vence sem ser concluída → IA notifica o vendedor com contexto ("você prometeu ligar para João às 14h ontem")
- **Alerta de atraso:** tarefa atrasada > X horas → escala para o gerente se vendedor não agir
- **Criação de follow-up:** oportunidade parada sem tarefa pendente → IA cria tarefa de retorno automaticamente

**Dashboard de Tarefas (`/tasks`):**
- **Aba "Hoje":** todas as tarefas com vencimento no dia atual, ordenadas por hora
- **Aba "Atrasadas":** tarefas vencidas não concluídas, com destaque visual e há quanto tempo atrasaram
- **Aba "Futuras":** próximos 7 dias, agrupadas por dia
- **Filtros:** por vendedor, tipo, prioridade, contato
- **Contador no sidebar:** badge com número de tarefas atrasadas + vencendo hoje

**Regras de negócio:**
- Ao marcar tarefa como concluída → registrar na linha do tempo do contato
- Ao criar oportunidade → IA verifica se existe tarefa pendente para o contato; se não, cria uma de tipo `mensagem`
- Tarefa atrasada > 24h sem ação → tag `retorno urgente` aplicada automaticamente no contato

### 2.12 Automações

Motor de regras e ações automáticas.

**Funcionalidades:**
- Criar automações com trigger + condições + ações
- Triggers: nova mensagem, novo contato, mudança de etapa, oportunidade ganha/perdida, tarefa vencida, tag aplicada, inatividade
- Condições: filtros sobre os dados do trigger
- Ações: enviar mensagem, criar tarefa, mover etapa, aplicar tag, notificar vendedor, disparar follow-up, classificar lead
- Log de execuções por automação
- Ativar/desativar automação

### 2.13 IA

Camada de inteligência artificial para apoio ao time comercial.

**Funcionalidades:**
- Resumo de conversa
- Lead scoring (0-100)
- Sugestão de resposta contextualizada
- Detecção de avanço ou recuo no funil
- Aplicação automática de tags
- Criação automática de tarefas a partir de mensagens
- Geração de follow-up personalizado
- Camada abstrata: suporte a Claude, OpenAI, Gemini sem lock-in

### 2.14 Integrações

Conexões com plataformas externas de comunicação.

**Funcionalidades:**
- WhatsApp Business API: receber e enviar mensagens, status de entrega/leitura
- Instagram Messaging API: mensagens diretas e comentários
- Webhook handler genérico para processamento de eventos
- Identificação do contato pela origem (número de telefone, Instagram ID)
- Log de todos os webhooks recebidos
- Estrutura pronta, integração real na Fase 6

### 2.15 Relatórios e Dashboard

Visão analítica do desempenho comercial.

**Funcionalidades:**
- Dashboard geral: KPIs principais, funil de vendas, atividades do dia
- Relatório de vendedor: negócios, conversões, faturamento, atividades
- Relatório de pipeline: taxa de conversão por etapa, tempo médio em cada etapa
- Relatório de produtos: produtos mais vendidos, receita por produto
- Relatório de canais: origem dos leads, conversão por canal
- Filtros por período, vendedor, produto, canal

---

## 3. Entidades do Banco de Dados

### 3.1 Diagrama de Relacionamentos (simplificado)

```
tenants ──< users
tenants ──< contacts ──< messages
tenants ──< companies
contacts >── companies (many-to-one)
contacts ──< opportunities ──< opportunity_products >── products
opportunities ──> pipeline_stages ──> pipelines
opportunities ──< invoices ──< invoice_items >── products
contacts ──< conversations ──< messages
contacts ──< activities
contacts ──< tasks
taggables >── tags (polymorphic)
automations ──< automation_logs
```

### 3.2 Schema Completo

#### tenants
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            VARCHAR(255) NOT NULL
slug            VARCHAR(100) UNIQUE NOT NULL  -- usado na URL/subdomínio
plan            VARCHAR(50) DEFAULT 'free'    -- free, starter, pro, enterprise
status          VARCHAR(20) DEFAULT 'active'  -- active, suspended, cancelled
settings        JSONB DEFAULT '{}'            -- configurações do tenant
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### users
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
email           VARCHAR(255) NOT NULL
email_verified  TIMESTAMPTZ
password_hash   VARCHAR(255)
role            VARCHAR(50) NOT NULL          -- super_admin, owner, manager, salesperson, attendant, financial, viewer
avatar_url      TEXT
phone           VARCHAR(50)
is_active       BOOLEAN DEFAULT true
last_login_at   TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, email)
```

#### sessions (NextAuth)
```sql
id              UUID PRIMARY KEY
session_token   TEXT UNIQUE NOT NULL
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
expires         TIMESTAMPTZ NOT NULL
```

#### password_reset_tokens
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token           VARCHAR(255) UNIQUE NOT NULL
expires_at      TIMESTAMPTZ NOT NULL
used_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

#### companies
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL                         -- razão social
trade_name      VARCHAR(255)                                  -- nome fantasia
cnpj            VARCHAR(20)
email           VARCHAR(255)
phone           VARCHAR(50)
website         TEXT
industry        VARCHAR(100)                                  -- setor/segmento
address         JSONB DEFAULT '{}'                            -- { street, number, complement, city, state, zip, country }
status          VARCHAR(20) DEFAULT 'active'                  -- active, inactive, prospect
notes           TEXT
assigned_to     UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
-- KPIs calculados (atualizados via trigger ou job)
total_open      DECIMAL(12,2) DEFAULT 0                      -- soma de oportunidades abertas
total_won       DECIMAL(12,2) DEFAULT 0                      -- soma de oportunidades ganhas
total_lost      DECIMAL(12,2) DEFAULT 0                      -- soma de oportunidades perdidas
deals_count     INTEGER DEFAULT 0                             -- total de oportunidades
UNIQUE(tenant_id, cnpj)                                       -- CNPJ único por tenant
```

#### contacts
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
company_id      UUID REFERENCES companies(id)
name            VARCHAR(255) NOT NULL
email           VARCHAR(255)
phone           VARCHAR(50)
whatsapp        VARCHAR(50)
instagram_id    VARCHAR(255)                  -- Instagram user ID para matching
cpf             VARCHAR(20)
job_title       VARCHAR(100)
lead_source     VARCHAR(50)                   -- manual, whatsapp, instagram, form, import, referral
lead_status     VARCHAR(50) DEFAULT 'lead'    -- lead, prospect, client, inactive
lead_score      INTEGER DEFAULT 0             -- 0-100, calculado pela IA
assigned_to     UUID REFERENCES users(id)
notes           TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### products
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
description     TEXT
category        VARCHAR(100)
price           DECIMAL(12,2) NOT NULL DEFAULT 0
unit            VARCHAR(50) DEFAULT 'un'      -- un, hr, kg, m², etc.
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### tags
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(100) NOT NULL
color           VARCHAR(7) DEFAULT '#6366f1'  -- hex color
created_by      UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, name)
```

#### taggables (relação polimórfica)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE
taggable_type   VARCHAR(50) NOT NULL          -- contact, company, opportunity, conversation
taggable_id     UUID NOT NULL
applied_by      UUID REFERENCES users(id)     -- NULL = aplicado pela IA
applied_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tag_id, taggable_type, taggable_id)
```

#### pipelines
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
type            VARCHAR(50) DEFAULT 'sales'   -- sales, support, onboarding
description     TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### pipeline_stages
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
order_index     INTEGER NOT NULL
color           VARCHAR(7) DEFAULT '#6366f1'
is_won_stage    BOOLEAN DEFAULT false
is_lost_stage   BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### opportunities
```sql
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
pipeline_id           UUID NOT NULL REFERENCES pipelines(id)
stage_id              UUID NOT NULL REFERENCES pipeline_stages(id)
contact_id            UUID REFERENCES contacts(id)
company_id            UUID REFERENCES companies(id)
assigned_to           UUID REFERENCES users(id)
title                 VARCHAR(255) NOT NULL
value                 DECIMAL(12,2) DEFAULT 0
probability           INTEGER DEFAULT 50              -- 0-100%, ajustado pela IA
status                VARCHAR(20) DEFAULT 'open'      -- open, won, lost
source                VARCHAR(50)                     -- whatsapp, instagram, form, manual, ai
expected_close        DATE                            -- previsão — atualizada pela IA
ai_predicted_close    DATE                            -- previsão exclusiva da IA (comparar com expected_close)
ai_close_confidence   INTEGER                         -- 0-100% confiança da previsão
won_at                TIMESTAMPTZ
lost_at               TIMESTAMPTZ
lost_reason           TEXT
created_by            UUID REFERENCES users(id)       -- NULL = criada pela IA
notes                 TEXT
created_at            TIMESTAMPTZ DEFAULT now()
updated_at            TIMESTAMPTZ DEFAULT now()
```

#### opportunity_stage_history
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE
from_stage_id   UUID REFERENCES pipeline_stages(id)
to_stage_id     UUID NOT NULL REFERENCES pipeline_stages(id)
moved_by        UUID REFERENCES users(id)             -- NULL = movido pela IA
move_source     VARCHAR(20) NOT NULL                  -- manual, ai, automation
ai_reason       TEXT                                  -- justificativa da IA quando move_source = 'ai'
ai_confidence   INTEGER                               -- 0-100
moved_at        TIMESTAMPTZ DEFAULT now()
```

#### opportunity_products
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE
product_id      UUID NOT NULL REFERENCES products(id)
quantity        DECIMAL(10,3) DEFAULT 1
unit_price      DECIMAL(12,2) NOT NULL
discount        DECIMAL(5,2) DEFAULT 0        -- percentual %
total           DECIMAL(12,2) NOT NULL        -- calculado: qty * price * (1 - discount/100)
created_at      TIMESTAMPTZ DEFAULT now()
```

#### invoices
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
opportunity_id  UUID REFERENCES opportunities(id)
contact_id      UUID REFERENCES contacts(id)
company_id      UUID REFERENCES companies(id)
number          VARCHAR(50)                   -- número sequencial gerado pelo sistema
total           DECIMAL(12,2) NOT NULL
status          VARCHAR(20) DEFAULT 'pending' -- pending, paid, overdue, cancelled
due_date        DATE
paid_at         TIMESTAMPTZ
paid_amount     DECIMAL(12,2)
notes           TEXT
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### invoice_items
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE
product_id      UUID REFERENCES products(id)
description     VARCHAR(255) NOT NULL
quantity        DECIMAL(10,3) DEFAULT 1
unit_price      DECIMAL(12,2) NOT NULL
discount        DECIMAL(5,2) DEFAULT 0
total           DECIMAL(12,2) NOT NULL
```

#### conversations
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
contact_id      UUID REFERENCES contacts(id)
assigned_to     UUID REFERENCES users(id)
channel         VARCHAR(50) NOT NULL          -- whatsapp, instagram, messenger, email, internal
status          VARCHAR(20) DEFAULT 'open'    -- open, pending, resolved, closed
external_id     VARCHAR(255)                  -- ID da conversa na plataforma externa (WA, IG)
last_message_at TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### messages
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
sender_type     VARCHAR(20) NOT NULL          -- user, contact, bot, system
sender_id       UUID                          -- user_id se sender_type = user
content         TEXT
type            VARCHAR(20) DEFAULT 'text'    -- text, image, audio, video, document, note
media_url       TEXT
external_id     VARCHAR(255)                  -- ID da mensagem na plataforma externa
status          VARCHAR(20) DEFAULT 'sent'    -- sent, delivered, read, failed
is_internal     BOOLEAN DEFAULT false         -- true = nota interna
created_at      TIMESTAMPTZ DEFAULT now()
```

#### activities
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
contact_id      UUID REFERENCES contacts(id)
opportunity_id  UUID REFERENCES opportunities(id)
user_id         UUID REFERENCES users(id)
type            VARCHAR(50) NOT NULL          -- call, meeting, email, note, whatsapp, instagram
title           VARCHAR(255) NOT NULL
description     TEXT
scheduled_at    TIMESTAMPTZ
completed_at    TIMESTAMPTZ
duration_min    INTEGER                       -- duração em minutos (chamadas/reuniões)
created_at      TIMESTAMPTZ DEFAULT now()
```

#### tasks
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
contact_id      UUID NOT NULL REFERENCES contacts(id)         -- obrigatório
opportunity_id  UUID REFERENCES opportunities(id)
assigned_to     UUID NOT NULL REFERENCES users(id)            -- obrigatório
created_by      UUID REFERENCES users(id)
type            VARCHAR(50) NOT NULL DEFAULT 'mensagem'       -- ligacao, mensagem, reuniao, proposta, retorno
title           VARCHAR(255) NOT NULL
description     TEXT
due_date        TIMESTAMPTZ
priority        VARCHAR(20) DEFAULT 'medium'                  -- low, medium, high, urgent
status          VARCHAR(20) DEFAULT 'pending'                 -- pending, in_progress, done, cancelled
completed_at    TIMESTAMPTZ
source          VARCHAR(50) DEFAULT 'manual'                  -- manual, automation, ai
ai_suggested_due_date TIMESTAMPTZ                             -- prazo sugerido pela IA antes da confirmação
escalated_at    TIMESTAMPTZ                                   -- quando IA escalou para o gerente
escalated_to    UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### automations
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
description     TEXT
trigger_type    VARCHAR(100) NOT NULL         -- new_message, new_contact, stage_changed, won, lost, task_due, tag_applied, inactivity
trigger_config  JSONB DEFAULT '{}'            -- configurações específicas do trigger
conditions      JSONB DEFAULT '[]'            -- array de condições [ {field, operator, value} ]
actions         JSONB DEFAULT '[]'            -- array de ações [ {type, config} ]
is_active       BOOLEAN DEFAULT true
run_count       INTEGER DEFAULT 0
last_run_at     TIMESTAMPTZ
created_by      UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### automation_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE
triggered_at    TIMESTAMPTZ DEFAULT now()
entity_type     VARCHAR(50)                   -- contact, opportunity, conversation, message
entity_id       UUID
status          VARCHAR(20) DEFAULT 'success' -- success, failed, skipped
actions_taken   JSONB DEFAULT '[]'
error_message   TEXT
```

#### integrations
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
provider        VARCHAR(50) NOT NULL          -- whatsapp, instagram, messenger, email
config          JSONB DEFAULT '{}'            -- tokens, phone numbers, etc. (criptografado)
status          VARCHAR(20) DEFAULT 'inactive' -- inactive, active, error
connected_at    TIMESTAMPTZ
last_sync_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, provider)
```

#### webhook_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID                          -- pode ser NULL se ainda não identificado
provider        VARCHAR(50) NOT NULL
event_type      VARCHAR(100)
payload         JSONB NOT NULL
status          VARCHAR(20) DEFAULT 'received' -- received, processed, failed, ignored
processed_at    TIMESTAMPTZ
error_message   TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

#### ai_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
entity_type     VARCHAR(50)                   -- contact, conversation, opportunity
entity_id       UUID
action          VARCHAR(100) NOT NULL         -- summarize, classify, suggest_reply, detect_stage, auto_tag, create_task
model_provider  VARCHAR(50)                   -- claude, openai, gemini
model_id        VARCHAR(100)
prompt_tokens   INTEGER
completion_tokens INTEGER
input_summary   TEXT
output_summary  TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

#### user_goals (metas dos vendedores)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
period          VARCHAR(20) NOT NULL          -- monthly, quarterly, yearly
period_start    DATE NOT NULL
revenue_goal    DECIMAL(12,2)
deals_goal      INTEGER
created_at      TIMESTAMPTZ DEFAULT now()
```

---

## 4. Arquitetura do Sistema

### 4.1 Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                        BROWSER                          │
│   Next.js App Router (SSR + RSC + Client Components)    │
│   TanStack Query (cache) │ Zustand (estado global)      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                   NEXT.JS API ROUTES                     │
│   /api/* — Route Handlers (TypeScript)                  │
│   Autenticação via NextAuth.js middleware                │
│   Validação via Zod                                     │
│   Multitenancy via tenant_id na sessão                  │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼──────────────────────┐
│      PRISMA ORM      │  │      SERVIÇOS EXTERNOS         │
│   PostgreSQL DB      │  │  IA: Claude / OpenAI / Gemini  │
│   Migrations         │  │  WhatsApp Business API         │
│   Type-safe queries  │  │  Instagram Graph API           │
└─────────────────────┘  │  E-mail: SendGrid / Resend      │
                         └───────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│              CAMADAS DE SUPORTE (PREPARADAS)             │
│   Redis + BullMQ: filas para automações e jobs           │
│   Socket.io / Supabase Realtime: mensagens em tempo real │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Multitenancy

O isolamento de dados entre empresas é garantido por:

1. **tenant_id em toda tabela** — toda query inclui `WHERE tenant_id = $currentTenantId`
2. **Middleware de sessão** — o `tenant_id` é extraído da sessão NextAuth em todas as API routes
3. **Helper `db.ts`** — função utilitária `withTenant(tenantId)` que retorna o cliente Prisma pré-filtrado
4. **Row-Level Security (RLS)** — opcional no PostgreSQL, como segunda camada de proteção

### 4.3 Autenticação e Autorização

**Autenticação (NextAuth.js):**
- Provider: Credentials (e-mail/senha)
- Sessão: JWT com `{ userId, tenantId, role }`
- Middleware Next.js protege todas as rotas `/app/(dashboard)/*`
- Rotas públicas: `/login`, `/register`, `/api/webhooks/*`

**Autorização (RBAC):**
- Helper `can(user, action, resource)` — verifica se o usuário pode executar a ação
- Permissões definidas em `/lib/auth/permissions.ts`
- Verificação no servidor (API routes) e no cliente (esconder elementos de UI)

### 4.4 Camada de IA

```typescript
// /lib/ai/index.ts — interface abstrata
interface AIProvider {
  complete(prompt: string, options?: AIOptions): Promise<string>
  embed?(text: string): Promise<number[]>
}

// Implementações:
// /lib/ai/providers/claude.ts
// /lib/ai/providers/openai.ts
// /lib/ai/providers/gemini.ts

// Ações de alto nível:
// /lib/ai/actions/summarize-conversation.ts
// /lib/ai/actions/classify-lead.ts
// /lib/ai/actions/suggest-reply.ts
// /lib/ai/actions/detect-stage-advance.ts
// /lib/ai/actions/auto-tag.ts
// /lib/ai/actions/create-task-from-message.ts
// /lib/ai/actions/generate-follow-up.ts
```

O provider ativo é configurado por variável de ambiente: `AI_PROVIDER=claude|openai|gemini`.

### 4.5 Webhook Handler

```
POST /api/webhooks/whatsapp
POST /api/webhooks/instagram
POST /api/webhooks/messenger

Fluxo:
1. Receber payload → salvar em webhook_logs (status: received)
2. Verificar assinatura HMAC
3. Identificar tenant pelo número/token
4. Processar: identificar contato, criar/atualizar conversa, salvar mensagem
5. Disparar automações relevantes
6. Atualizar webhook_logs (status: processed)
```

---

## 5. Estrutura de Pastas

```
crm-plus/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── forgot-password/
│   │       └── page.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx               ← layout com sidebar + topbar
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── contacts/
│   │   │   ├── page.tsx             ← lista de contatos
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx         ← perfil do contato + linha do tempo
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── companies/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── products/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── pipeline/
│   │   │   ├── page.tsx             ← seletor de pipelines
│   │   │   └── [pipelineId]/
│   │   │       └── page.tsx         ← kanban do pipeline
│   │   ├── opportunities/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── conversations/
│   │   │   ├── page.tsx             ← inbox unificada
│   │   │   └── [id]/page.tsx        ← conversa individual
│   │   ├── tasks/
│   │   │   └── page.tsx
│   │   ├── billing/
│   │   │   ├── page.tsx             ← lista de faturas
│   │   │   └── [id]/page.tsx
│   │   ├── team/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── automations/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── reports/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── integrations/page.tsx
│   │       ├── pipeline/page.tsx
│   │       └── team/page.tsx
│   │
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/route.ts
│       ├── contacts/
│       │   ├── route.ts             ← GET (list), POST (create)
│       │   └── [id]/route.ts        ← GET, PATCH, DELETE
│       ├── companies/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── products/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── tags/
│       │   └── route.ts
│       ├── pipelines/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── stages/route.ts
│       ├── opportunities/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       ├── products/route.ts
│       │       └── won/route.ts     ← marca como ganha → gera fatura
│       ├── conversations/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── messages/route.ts
│       ├── tasks/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── billing/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── team/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── automations/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── ai/
│       │   ├── summarize/route.ts
│       │   ├── classify/route.ts
│       │   ├── suggest-reply/route.ts
│       │   └── generate-follow-up/route.ts
│       └── webhooks/
│           ├── whatsapp/route.ts
│           ├── instagram/route.ts
│           └── messenger/route.ts
│
├── components/
│   ├── ui/                          ← shadcn/ui (Button, Input, Dialog, etc.)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── PageHeader.tsx
│   ├── kanban/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   └── KanbanCard.tsx
│   ├── contacts/
│   │   ├── ContactCard.tsx
│   │   ├── ContactForm.tsx
│   │   └── ContactTimeline.tsx
│   ├── conversations/
│   │   ├── ConversationList.tsx
│   │   ├── MessageThread.tsx
│   │   └── MessageInput.tsx
│   ├── opportunities/
│   │   ├── OpportunityForm.tsx
│   │   └── ProductSelector.tsx
│   ├── billing/
│   │   └── InvoiceCard.tsx
│   ├── automations/
│   │   ├── TriggerBuilder.tsx
│   │   └── ActionBuilder.tsx
│   └── shared/
│       ├── TagBadge.tsx
│       ├── UserAvatar.tsx
│       ├── StatusBadge.tsx
│       ├── DataTable.tsx
│       └── ConfirmDialog.tsx
│
├── lib/
│   ├── auth/
│   │   ├── auth.ts                  ← NextAuth config
│   │   ├── permissions.ts           ← RBAC: can(user, action, resource)
│   │   └── middleware.ts            ← proteção de rotas
│   ├── db/
│   │   ├── client.ts                ← Prisma client singleton
│   │   └── with-tenant.ts           ← helper para queries com tenant_id
│   ├── ai/
│   │   ├── index.ts                 ← interface AIProvider + factory
│   │   ├── providers/
│   │   │   ├── claude.ts
│   │   │   ├── openai.ts
│   │   │   └── gemini.ts
│   │   └── actions/
│   │       ├── summarize-conversation.ts
│   │       ├── classify-lead.ts
│   │       ├── suggest-reply.ts
│   │       ├── detect-stage-advance.ts
│   │       ├── auto-tag.ts
│   │       ├── create-task-from-message.ts
│   │       └── generate-follow-up.ts
│   ├── integrations/
│   │   ├── whatsapp/
│   │   │   ├── client.ts
│   │   │   └── webhook-handler.ts
│   │   └── instagram/
│   │       ├── client.ts
│   │       └── webhook-handler.ts
│   ├── billing/
│   │   └── generate-invoice.ts      ← lógica de geração automática
│   ├── automations/
│   │   ├── engine.ts                ← avaliador de triggers/condições/ações
│   │   └── action-handlers.ts       ← implementação de cada ação
│   └── utils/
│       ├── format.ts                ← formatação de moeda, data, telefone
│       ├── validations.ts           ← schemas Zod reutilizáveis
│       └── cn.ts                    ← clsx + tailwind-merge
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── types/
│   ├── index.ts                     ← re-exports
│   ├── auth.ts
│   ├── contacts.ts
│   ├── opportunities.ts
│   └── ...
│
├── hooks/
│   ├── use-contacts.ts              ← TanStack Query hooks
│   ├── use-pipeline.ts
│   ├── use-conversations.ts
│   └── use-permissions.ts
│
├── store/
│   └── ui.ts                        ← Zustand: sidebar open/close, modals
│
├── middleware.ts                     ← proteção de rotas Next.js
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 6. Permissões por Perfil

### 6.1 Perfis Disponíveis

| Código | Nome | Descrição |
|--------|------|-----------|
| `super_admin` | Super Admin | Acesso total a todos os tenants (console interno) |
| `owner` | Dono da Empresa | Acesso total ao seu tenant |
| `manager` | Gerente | Acesso amplo, gerencia a equipe |
| `salesperson` | Vendedor | Acesso aos seus próprios leads/negócios |
| `attendant` | Atendente | Foco em conversas e tarefas |
| `financial` | Financeiro | Acesso ao faturamento e relatórios financeiros |
| `viewer` | Visualizador | Acesso somente leitura |

### 6.2 Matriz de Permissões

| Módulo | super_admin | owner | manager | salesperson | attendant | financial | viewer |
|--------|:-----------:|:-----:|:-------:|:-----------:|:---------:|:---------:|:------:|
| **Contatos** | CRUD | CRUD | CRUD | CRUD (próprios) | Read+Note | Read | Read |
| **Empresas** | CRUD | CRUD | CRUD | CRUD | Read | Read | Read |
| **Produtos** | CRUD | CRUD | CRUD | Read | Read | Read | Read |
| **Tags** | CRUD | CRUD | CRUD | Create+Apply | Apply | — | Read |
| **Pipelines** | CRUD | CRUD | CRUD | Read | — | — | Read |
| **Oportunidades** | CRUD | CRUD | CRUD | CRUD (próprias) | Read | Read | Read |
| **Faturamento** | CRUD | CRUD | Read | — | — | CRUD | Read |
| **Conversas** | CRUD | CRUD | CRUD | CRUD (próprias) | CRUD | — | Read |
| **Tarefas** | CRUD | CRUD | CRUD | CRUD (próprias) | CRUD (próprias) | — | Read |
| **Equipe** | CRUD | CRUD | Read | — | — | — | — |
| **Automações** | CRUD | CRUD | CRUD | — | — | — | — |
| **Relatórios** | Todos | Todos | Equipe | Próprios | Próprios | Financeiro | — |
| **Configurações** | Tudo | Tudo | Parcial | — | — | — | — |
| **Integrações** | CRUD | CRUD | Read | — | — | — | — |

### 6.3 Regras Especiais

- **Salesperson:** só vê contatos, oportunidades e conversas atribuídos a si, a menos que o gestor redistribua
- **Manager:** pode redistribuir leads/conversas entre membros da equipe
- **Financial:** acessa faturamento e pode marcar faturas como pagas, mas não vê conversas ou oportunidades detalhadas
- **Attendant:** focado em conversas e tarefas, não tem acesso ao funil de vendas
- **Owner:** pode transferir ownership para outro usuário; não pode ser excluído pelo manager

---

## 7. Fluxos Principais

### 7.1 Fluxo: Lead → Venda → Faturamento

```
[Entrada do Lead]
   │
   ├─ Manual (formulário no CRM)
   ├─ WhatsApp (webhook → identifica número → cria contato)
   ├─ Instagram (webhook → identifica instagram_id → cria contato)
   └─ Importação CSV

   ↓
[Contato criado com lead_status = 'lead']
   │
   ├─ IA classifica: lead_score, tags automáticas
   └─ Responsável atribuído (regra de distribuição ou manual)

   ↓
[Oportunidade criada no Pipeline]
   │
   └─ Stage inicial: "Novo Lead"
   
   ↓
[Progresso no Funil]
   │
   ├─ Manual: vendedor arrasta card no Kanban
   └─ IA: detecta avanço/recuo → move card automaticamente

   ↓
[Oportunidade marcada como GANHA]
   │
   POST /api/opportunities/[id]/won
   │
   ├─ Muda status → 'won', salva won_at
   ├─ Move card para stage is_won_stage = true
   └─ DISPARA: generate-invoice(opportunityId)
          │
          ├─ Copia produtos da oportunidade → invoice_items
          ├─ Calcula total
          ├─ Cria invoice com status 'pending'
          └─ Registra atividade no contato

   ↓
[Fatura gerada] → aparece no módulo de Faturamento
   │
   └─ Financeiro marca como pago → realizado no dashboard
```

### 7.2 Fluxo: Mensagem Recebida (WhatsApp/Instagram)

```
[Webhook recebido]
POST /api/webhooks/whatsapp

   ↓
[Verificar assinatura HMAC]
   │
   └─ Falhou → 401 + log

   ↓
[Salvar em webhook_logs (status: received)]

   ↓
[Identificar tenant]
   │
   └─ Pelo número de telefone da linha WhatsApp (integrations.config.phone_number)

   ↓
[Identificar contato]
   │
   ├─ Busca por contacts.whatsapp = sender_phone
   └─ Não encontrado → cria novo contato (lead_source: 'whatsapp')

   ↓
[Abrir ou encontrar conversa ativa]
   │
   └─ Busca conversation por contact_id + channel + status != 'closed'

   ↓
[Salvar mensagem]
   │
   └─ messages.external_id = message.id da plataforma

   ↓
[Atualizar conversation.last_message_at]

   ↓
[Disparar automações com trigger = 'new_message']
   │
   ├─ Avaliar condições
   └─ Executar ações (responder, criar tarefa, aplicar tag, etc.)

   ↓
[Atualizar webhook_logs (status: processed)]

   ↓
[Notificar vendedor responsável via real-time (preparado)]
```

### 7.3 Fluxo: Automação com IA

```
[Trigger: nova mensagem de contato]

   ↓
[Motor de automação avalia todas as automações ativas do tenant]
   │
   └─ Filtra por trigger_type = 'new_message'

   ↓
[Para cada automação correspondente]
   │
   ├─ Avalia conditions (ex: "canal = whatsapp AND lead_score < 30")
   └─ Executa actions em ordem:

      ├─ classify_lead → chama /lib/ai/actions/classify-lead.ts
      │     └─ Atualiza contacts.lead_score, aplica tags
      │
      ├─ suggest_reply → chama /lib/ai/actions/suggest-reply.ts
      │     └─ Salva sugestão para exibir ao vendedor
      │
      ├─ create_task → chama /lib/ai/actions/create-task-from-message.ts
      │     └─ Cria task vinculada ao contato
      │
      └─ move_stage → chama /lib/ai/actions/detect-stage-advance.ts
            └─ Se detectou avanço → move opportunity para próxima etapa

   ↓
[Salvar em automation_logs]
[Salvar em ai_logs]
```

### 7.4 Fluxo: Redistribuição de Leads

```
[Gestor (manager/owner) acessa módulo de Equipe]

   ↓
[Seleciona vendedor de origem]
   ↓
[Lista contatos/oportunidades atribuídos]
   ↓
[Seleciona registros e novo responsável]
   ↓
PATCH /api/contacts/[id] { assigned_to: newUserId }
PATCH /api/opportunities/[id] { assigned_to: newUserId }
   ↓
[Registra atividade: "Lead redistribuído de X para Y por Gestor"]
   ↓
[Notifica novo responsável]
```

---

## 8. Automações e Regras de IA

### 8.1 Triggers Disponíveis

| Trigger | Quando dispara | Config disponível |
|---------|---------------|-------------------|
| `new_message` | Nova mensagem recebida | canal, palavras-chave |
| `new_contact` | Novo contato criado | origem, canal |
| `stage_changed` | Card movido de etapa | pipeline, etapa de origem, etapa destino |
| `opportunity_won` | Oportunidade marcada como ganha | pipeline |
| `opportunity_lost` | Oportunidade marcada como perdida | motivo |
| `task_due` | Tarefa vence | horas antes do vencimento |
| `task_overdue` | Tarefa atrasada sem conclusão | horas/dias após vencimento |
| `task_escalated` | Tarefa escalada pela IA para gerente | — |
| `tag_applied` | Tag aplicada ao contato | qual tag |
| `inactivity` | Sem resposta do contato | horas/dias sem resposta |
| `no_open_task` | Oportunidade aberta sem tarefa pendente | dias sem tarefa |
| `lead_score_changed` | Score do lead muda | faixa de score |
| `buy_intent_detected` | IA detectou intenção de compra em mensagem | sensibilidade: conservador/moderado/agressivo |
| `close_date_overdue` | Data de fechamento prevista passou sem evolução | — |
| `stage_stalled` | Card parado no mesmo estágio por X dias | pipeline, estágio, dias |

### 8.2 Condições Disponíveis

```
Campo           Operadores              Exemplos de valor
──────────────────────────────────────────────────────────
canal           = / !=                  whatsapp, instagram
lead_score      > / < / >= / <=         0–100
lead_status     = / !=                  lead, prospect, client
tag             contains / not_contains lead quente, VIP
pipeline        = / !=                  ID do pipeline
stage           = / !=                  ID da etapa
assigned_to     = / !=                  ID do vendedor
contact.city    = / !=                  texto
message.content contains               palavra-chave
```

### 8.3 Ações Disponíveis

| Ação | Descrição | Parâmetros |
|------|-----------|------------|
| `send_message` | Enviar mensagem ao contato | canal, mensagem (template) |
| `send_internal_note` | Adicionar nota interna na conversa | texto |
| `create_task` | Criar tarefa vinculada ao contato | título, descrição, responsável, prazo |
| `move_stage` | Mover oportunidade para outra etapa | pipeline_id, stage_id |
| `apply_tag` | Aplicar tag ao contato | tag_id |
| `remove_tag` | Remover tag do contato | tag_id |
| `assign_to` | Atribuir contato/oportunidade a vendedor | user_id (ou regra: round-robin) |
| `notify_user` | Notificar vendedor/atendente | user_id, mensagem |
| `update_lead_score` | Ajustar score do lead | valor ou ±incremento |
| `classify_with_ai` | Classificar lead com IA | — |
| `suggest_reply_with_ai` | Gerar sugestão de resposta com IA | — |
| `generate_follow_up` | Gerar e agendar follow-up com IA | dias, canal |
| `create_task` | Criar tarefa vinculada ao contato/oportunidade | tipo, título, responsável, prazo (ou `ai_suggest`) |
| `suggest_task_due_date` | IA sugere prazo para tarefa criada sem data | — |
| `escalate_task` | Escalar tarefa atrasada para gerente | user_id do gerente, motivo |
| `enforce_task_followup` | Job de cobrança: notificar + escalar + taggear | threshold em horas |
| `create_opportunity` | IA cria oportunidade automaticamente ao detectar intenção | pipeline_id, stage_id inicial |
| `update_opportunity_stage` | IA move estágio da oportunidade | pipeline_id, stage_id destino |
| `predict_close_date` | IA recalcula previsão e probabilidade de fechamento | — |

### 8.4 Camada de IA — Especificações

#### create-opportunity
- **Input:** histórico da conversa + contato + pipelines disponíveis do tenant
- **Output:** `{ shouldCreate: boolean, title: string, value?: number, pipeline_id: string, stage_id: string, confidence: number, trigger_excerpt: string } | null`
- **Uso:** chamada após cada nova mensagem relevante de um contato sem oportunidade aberta; cria automaticamente se `confidence ≥ threshold_tenant`; notifica vendedor com trecho que motivou a criação

#### predict-close-date
- **Input:** oportunidade atual (estágio, probabilidade, valor, tempo no estágio) + histórico de `opportunity_stage_history` + negócios similares ganhos/perdidos do mesmo tenant
- **Output:** `{ predicted_date: string, confidence: number, probability_adjusted: number, reasoning: string }`
- **Uso:** chamada ao mover estágio, ao receber nova mensagem na conversa do contato, e em job diário; atualiza `ai_predicted_close`, `ai_close_confidence` e `probability`; se previsão ultrapassar sem evolução → cria tarefa de revisão

#### summarize-conversation
- **Input:** array de mensagens da conversa
- **Output:** resumo em 2–4 frases + pontos de atenção
- **Uso:** exibido no topo da conversa para o vendedor ao abrir

#### classify-lead
- **Input:** histórico de mensagens + dados do contato + dados da empresa
- **Output:** `{ score: 0-100, classification: 'hot'|'warm'|'cold', tags: string[], justification: string }`
- **Uso:** atualiza `contacts.lead_score`, aplica tags automáticas

#### suggest-reply
- **Input:** histórico recente da conversa (últimas 10 mensagens) + perfil do produto/empresa
- **Output:** 1–3 sugestões de resposta com tom adequado
- **Uso:** exibido como sugestão no campo de resposta (aceitar/rejeitar)

#### detect-stage-advance
- **Input:** histórico de conversa + etapa atual + etapas do pipeline
- **Output:** `{ shouldAdvance: boolean, targetStage?: string, confidence: number, reason: string }`
- **Uso:** mover card automaticamente se confiança > threshold configurável

#### auto-tag
- **Input:** mensagem ou histórico recente
- **Output:** `{ tags: string[] }` — apenas tags existentes no tenant
- **Uso:** aplicar tags em `taggables` com `applied_by = NULL` (indicando IA)

#### create-task-from-message
- **Input:** mensagem onde há compromisso implícito ou explícito
- **Output:** `{ title: string, type: 'ligacao'|'mensagem'|'reuniao'|'proposta'|'retorno', description: string, due_date?: string, priority: string } | null`
- **Uso:** criar task automaticamente quando detectar promessa/compromisso; salva `source = 'ai'`

#### suggest-task-due-date
- **Input:** tipo da tarefa + contexto da conversa + histórico de tarefas concluídas do vendedor (tempo médio por tipo)
- **Output:** `{ suggested_date: string, confidence: number, reasoning: string }`
- **Uso:** ao criar tarefa sem data → preencher `ai_suggested_due_date` e exibir como sugestão ao vendedor (aceitar/ajustar)

#### enforce-task-followup
- **Input:** lista de tarefas atrasadas do tenant + dados do contato e oportunidade vinculados
- **Output:** array de ações: `{ task_id, action: 'notify_assignee'|'escalate_to_manager'|'apply_tag', payload }`
- **Uso:** job recorrente (a cada 30 min via BullMQ) — cobra execução, escala para gerente após threshold, aplica tag `retorno urgente`

#### generate-follow-up
- **Input:** histórico de conversa + produto de interesse + tempo de inatividade
- **Output:** mensagem de follow-up personalizada pronta para envio + tipo de tarefa recomendado
- **Uso:** automação de follow-up por inatividade; cria tarefa do tipo `retorno` com a mensagem gerada como descrição

### 8.5 Configuração do Provider de IA

```env
AI_PROVIDER=claude          # claude | openai | gemini
AI_MODEL=claude-sonnet-4-6  # modelo específico
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_AI_API_KEY=...
```

---

## 9. Fases de Construção

> **Nota sobre IA nas fases:** Com base no princípio do produto (Seção 0), a camada de IA **não** fica para a Fase 5. A estrutura de IA é criada na Fase 1. As primeiras ações de IA (classificar lead, auto-tag) entram na Fase 2. A IA é incrementalmente expandida em cada fase subsequente.

### FASE 0 — SDD ✅
Documento técnico completo (este arquivo).

---

### FASE 1 — Fundação

**Objetivo:** Projeto funcionando com auth, multitenancy, layout base e estrutura de IA pronta para uso.

**Entregas:**
- [ ] Projeto Next.js 14 criado com TypeScript, Tailwind, ESLint
- [ ] shadcn/ui instalado e configurado
- [ ] Prisma configurado com PostgreSQL
- [ ] Schema inicial: `tenants`, `users`, `sessions`, `password_reset_tokens`, `ai_logs`
- [ ] NextAuth.js configurado (credentials provider)
- [ ] Middleware de proteção de rotas
- [ ] Multitenancy: `tenant_id` na sessão, helper `withTenant`
- [ ] RBAC: `permissions.ts` com `can()` helper
- [ ] **`/lib/ai/` criado:** interface `AIProvider`, factory, provider Claude (ativo), providers OpenAI/Gemini (stub)
- [ ] Layout base: sidebar, topbar, área de conteúdo
- [ ] Dashboard com placeholder de KPIs e seção "Ações da IA hoje"
- [ ] Página de login e registro de empresa
- [ ] Variáveis de ambiente documentadas (`.env.example`)

**IA nesta fase:** estrutura criada, zero chamadas reais ainda.  
**Dependências:** Nenhuma (início do projeto)

---

### FASE 2 — CRM Base + IA de Qualificação

**Objetivo:** Cadastrar e gerenciar contatos, empresas, produtos, tags, equipe e pipeline. IA entra classificando leads e aplicando tags.

**Entregas:**
- [ ] Schema: `contacts`, `companies`, `products`, `tags`, `taggables`, `pipelines`, `pipeline_stages`
- [ ] CRUD completo: contatos, empresas, produtos, tags, equipe
- [ ] Configuração de pipelines e etapas
- [ ] Visualização Kanban (drag-and-drop manual como fallback)
- [ ] Filtros e busca em todas as listagens
- [ ] Importação de contatos via CSV
- [ ] **IA: `classify-lead`** — ao criar contato, IA atribui `lead_score` e tags automaticamente
- [ ] **IA: `auto-tag`** — ao salvar contato com dados preenchidos, IA sugere tags relevantes
- [ ] Tags padrão pré-criadas por tenant no registro (lead quente, VIP, inadimplente, etc.)
- [ ] Automações padrão pré-configuradas: "novo lead → classificar com IA"

**IA nesta fase:** classify-lead, auto-tag.  
**Dependências:** FASE 1

---

### FASE 3 — Comercial, Faturamento + IA de Pipeline

**Objetivo:** Gestão de oportunidades com faturamento automático. IA começa a mover o pipeline.

**Entregas:**
- [ ] Schema: `opportunities`, `opportunity_products`, `invoices`, `invoice_items`
- [ ] CRUD de oportunidades com produtos vinculados
- [ ] Marcar como ganha → fatura gerada automaticamente (sem clique adicional)
- [ ] Marcar como perdida com motivo
- [ ] Módulo de faturamento: listagem, status, registrar pagamento
- [ ] Dashboard comercial: faturamento previsto/realizado, ticket médio, por produto/vendedor/canal
- [ ] Linha do tempo do contato com atividades
- [ ] **IA: `detect-stage-advance`** — após cada interação, IA avalia se oportunidade deve avançar ou recuar
- [ ] Movimento automático de card quando IA detecta avanço com confiança ≥ threshold
- [ ] Log visível ao vendedor: "IA moveu este card para Proposta Enviada — motivo: cliente pediu orçamento"

**IA nesta fase:** detect-stage-advance.  
**Dependências:** FASE 2

---

### FASE 4 — Conversas, Inbox + IA de Atendimento

**Objetivo:** Central de comunicação com histórico completo. IA resume, sugere resposta e cria tarefas automaticamente.

**Entregas:**
- [ ] Schema: `conversations`, `messages`, `activities`, `tasks`
- [ ] Inbox unificada com lista de conversas ativas
- [ ] Thread de mensagens com notas internas
- [ ] Status da conversa (aberta/aguardando/resolvida) — **IA altera status automaticamente**
- [ ] Atribuição automática de responsável por regra (round-robin ou por origem)
- [ ] Linha do tempo completa do contato
- [ ] CRUD de tarefas
- [ ] Endpoints de webhook estruturados (sem integração real)
- [ ] **IA: `summarize-conversation`** — resumo exibido ao vendedor ao abrir qualquer conversa
- [ ] **IA: `suggest-reply`** — 1–3 sugestões de resposta no campo de mensagem; vendedor aceita/rejeita/edita
- [ ] **IA: `create-task-from-message`** — IA detecta compromisso na mensagem e cria tarefa automaticamente
- [ ] Notificação ao vendedor quando IA criar tarefa: "IA criou uma tarefa para você — [título]"

**IA nesta fase:** summarize-conversation, suggest-reply, create-task-from-message.  
**Dependências:** FASE 2

---

### FASE 5 — Motor de Automações + IA de Follow-up e Alertas

**Objetivo:** Orquestrar tudo que as fases anteriores construíram. Follow-up autônomo e detecção de gargalos.

**Entregas:**
- [ ] Schema: `automations`, `automation_logs`
- [ ] Motor de automações: trigger → condições → ações
- [ ] Builder de automações na interface (para customização pelo usuário)
- [ ] Automações padrão ativas por tenant: classificar lead, mover pipeline, criar follow-up
- [ ] **IA: `generate-follow-up`** — por inatividade, IA gera mensagem personalizada e agenda envio
- [ ] Follow-up automático: sem resposta em X dias → IA dispara follow-up + cria tarefa
- [ ] **IA: detecção de gargalo** — identifica leads parados há muitos dias e alerta o gestor
- [ ] Dashboard de IA: "o que a IA fez hoje" — cards movidos, tarefas criadas, follow-ups enviados, leads classificados
- [ ] Log de execuções de automação + log de ações de IA (auditável pelo usuário)

**IA nesta fase:** generate-follow-up, detecção de gargalo, orquestração geral.  
**Dependências:** FASE 3 + FASE 4

---

### FASE 6 — Integrações Reais

**Objetivo:** Conectar WhatsApp Business API e Instagram Messaging API.

**Entregas:**
- [ ] Schema: `integrations`, `webhook_logs`
- [ ] WhatsApp Business API: receber mensagens via webhook
- [ ] WhatsApp Business API: enviar mensagens
- [ ] WhatsApp: status de entrega e leitura
- [ ] Instagram Messaging API: receber mensagens diretas
- [ ] Instagram: enviar mensagens
- [ ] Identificação automática de contato por telefone/Instagram ID
- [ ] Configuração de integração na interface (Settings > Integrações)
- [ ] Tratamento de edge cases: mensagens de grupo WA, menções IG, etc.
- [ ] Fila de processamento de webhooks (BullMQ + Redis)

**Dependências:** FASE 4 + FASE 5

---

## 10. Ordem de Implementação

### Dentro de cada fase, a ordem correta é:

#### FASE 1 (Fundação + Estrutura de IA)
1. `create-next-app` com TypeScript
2. Instalar Tailwind + shadcn/ui
3. Configurar Prisma + variáveis de ambiente
4. Escrever schema inicial: `tenants`, `users`, `sessions`, `password_reset_tokens`, `ai_logs`
5. Rodar migration inicial
6. Configurar NextAuth (CredentialsProvider)
7. Escrever middleware de proteção de rotas
8. Criar helper `withTenant` e `can()`
9. **Criar `/lib/ai/`:** interface `AIProvider`, factory `getAIProvider()`, provider Claude**
10. Criar layout base (sidebar + topbar)
11. Criar página de login funcional
12. Criar página de registro de empresa + usuário owner
13. Dashboard com seção "Ações da IA hoje" (vazia por ora)

#### FASE 2 (CRM Base + IA de Qualificação)
1. Schema: companies, contacts, products, tags, taggables, pipelines, pipeline_stages + migration
2. APIs: companies, contacts, products, tags, team, pipelines + stages (CRUD)
3. UI: listagens e formulários de cada entidade
4. UI: Kanban (drag-and-drop manual como fallback)
5. UI: Tags no contato e empresa
6. Importação CSV de contatos
7. **IA: implementar `classify-lead.ts`**
8. **Hook: ao criar/atualizar contato → chamar `classify-lead` → salvar `lead_score` + tags**
9. **IA: implementar `auto-tag.ts`**
10. **Criar automação padrão por tenant: "novo contato → classify-lead"**
11. Exibir `lead_score` e tags aplicadas pela IA no card do contato

#### FASE 3 (Comercial + IA de Pipeline)
1. Schema: opportunities, opportunity_products, invoices, invoice_items + migration
2. API: oportunidades CRUD + produtos vinculados
3. API: `POST /api/opportunities/[id]/won` → `generate-invoice.ts` (sem clique adicional)
4. API: marcar como perdida
5. API: faturamento CRUD + registrar pagamento
6. UI: formulário de oportunidade com produto selector
7. UI: Kanban com cards de oportunidades
8. UI: módulo de faturamento
9. UI: dashboard comercial com KPIs
10. **IA: implementar `detect-stage-advance.ts`**
11. **Hook: após salvar mensagem/atividade ligada a oportunidade → rodar `detect-stage-advance`**
12. **Movimento automático de card + log visível: "IA moveu: [motivo]"**

#### FASE 4 (Conversas + IA de Atendimento)
1. Schema: conversations, messages, activities, tasks + migration
2. API: conversations CRUD + messages CRUD (com notas internas)
3. API: activities + tasks CRUD
4. API: webhook endpoints (estrutura, sem integração real)
5. UI: inbox unificada + thread de mensagens
6. UI: linha do tempo completa do contato
7. UI: módulo de tarefas
8. **IA: implementar `summarize-conversation.ts`**
9. **UI: exibir resumo da IA no topo de cada conversa ao abrir**
10. **IA: implementar `suggest-reply.ts`**
11. **UI: chip de sugestão de resposta no campo de mensagem (aceitar/rejeitar/editar)**
12. **IA: implementar `create-task-from-message.ts`**
13. **Hook: após salvar mensagem do contato → rodar `create-task-from-message` → criar task se detectado**
14. Notificação inline ao vendedor: "IA criou uma tarefa: [título]"

#### FASE 5 (Motor de Automações + IA Proativa)
1. Schema: automations, automation_logs + migration
2. Motor de automações: `engine.ts` (trigger → avaliar condições → executar ações)
3. `action-handlers.ts` (implementar cada ação do motor)
4. API: automations CRUD
5. UI: builder de automações
6. Seed de automações padrão para novos tenants
7. **IA: implementar `generate-follow-up.ts`**
8. **Automação padrão: "inatividade > 3 dias → gerar follow-up → agendar envio"**
9. **IA: implementar detecção de gargalo (leads parados > threshold)**
10. **Dashboard: seção "Ações da IA hoje" com dados reais**
11. Página de logs de automação e IA (auditável)

#### FASE 6 (Integrações Reais)
1. Schema: integrations, webhook_logs + migration
2. WhatsApp: verificação de webhook (GET) + handler completo (POST)
3. WhatsApp: envio de mensagens + status de entrega/leitura
4. Instagram: verificação + handler + envio
5. UI: configuração de integrações (Settings > Integrações)
6. Identificação automática de contato por telefone/Instagram ID ao receber webhook
7. Fila BullMQ + Redis para processamento assíncrono de webhooks
8. Tratamento de edge cases (mensagens de grupo WA, reações, etc.)
9. Testes end-to-end com webhooks reais

---

## Apêndice A — Variáveis de Ambiente

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/crmplus

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# IA
AI_PROVIDER=claude
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# WhatsApp Business API (Fase 6)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Instagram (Fase 6)
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_APP_SECRET=
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=

# Redis + BullMQ (Fase 6)
REDIS_URL=redis://localhost:6379

# E-mail (opcional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@seudominio.com
```

---

## Apêndice B — Convenções de Código

- **Nomenclatura:** camelCase para variáveis/funções, PascalCase para componentes e tipos, UPPER_SNAKE_CASE para constantes e env vars
- **API Routes:** sempre retornar `{ data, error, meta }` como envelope padrão
- **Erros:** usar `NextResponse.json({ error: 'Mensagem' }, { status: 4xx })` com mensagens em português
- **Queries Prisma:** sempre incluir `tenant_id` como filtro; usar `select` explícito para evitar vazamento de campos sensíveis
- **Validação:** Zod no servidor (API Route) e no cliente (React Hook Form + Zod resolver)
- **Datas:** armazenar sempre em UTC; exibir convertido para timezone do tenant
- **Moeda:** armazenar em centavos (integer) ou DECIMAL(12,2); exibir formatado em BRL
- **IDs:** UUID v4 gerado pelo PostgreSQL (`gen_random_uuid()`)

---

*Fim do SDD v1.0 — CRM PLUS*
