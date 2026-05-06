# Guia de Testes — CRM PLUS

> **Ambiente**: Next.js 16 + PostgreSQL (Supabase) + IA mock  
> **Stack local**: Node.js 20+, npm, banco já provisionado no Supabase  
> **Porta padrão**: `http://localhost:3000`

---

## 1. Rodar o Sistema Localmente

### Pré-requisitos

Certifique-se que `.env.local` existe na raiz do projeto com os valores corretos:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

DATABASE_URL=postgresql://postgres.<projeto>:<senha>@db.<projeto>.supabase.co:5432/postgres
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=qualquer-string-longa-aqui-minimo-32-chars
```

As variáveis de IA (`ANTHROPIC_API_KEY`, etc.) são **opcionais** — o sistema usa IA mock por padrão e funciona sem elas.

### Iniciar o servidor

```bash
cd "CRM PLUS/crm-plus"
npm run dev
```

Aguarde a mensagem `✓ Ready in ...ms` no terminal. Acesse:

```
http://localhost:3000
```

A raiz redireciona automaticamente para `/login`.

---

## 2. Criar Empresa e Usuário Admin (Primeiro Acesso)

1. Acesse `http://localhost:3000/register`
2. Preencha:
   - **Nome da empresa**: ex. `Acme Vendas`
   - **Seu nome**: ex. `João Silva`
   - **E-mail**: ex. `joao@acme.com`
   - **Senha**: mínimo 8 caracteres
3. Clique em **Criar empresa**
4. Você será redirecionado para `/login?registered=true`
5. Faça login com o e-mail e senha cadastrados

> Isso cria automaticamente: um `Tenant` (empresa) + um `User` com role `owner` (acesso total).

### Recuperar o tenantId (necessário para webhooks)

Após o login, abra o DevTools do navegador → **Application** → **Cookies** → `next-auth.session-token`, ou execute no Supabase:

```sql
SELECT id, name, slug FROM tenants ORDER BY created_at DESC LIMIT 5;
```

Guarde o UUID do seu tenant — você vai usar nos testes de webhook.

---

## 3. Navegação pelo Sistema

Após login você cai no `/dashboard`. A barra lateral tem:

| Rota | Módulo |
|---|---|
| `/dashboard` | KPIs + Ações da IA hoje + Tarefas prioritárias |
| `/contacts` | Contatos |
| `/companies` | Empresas |
| `/products` | Produtos |
| `/pipeline` | Pipelines (Kanban) |
| `/opportunities` | Oportunidades |
| `/inbox` | Conversas / Inbox unificada |
| `/tasks` | Central de Tarefas |
| `/billing` | Faturamento |

---

## 4. Testando Cada Módulo

### 4.1 Contatos

**Interface**: `/contacts`

1. Clique em **Novo contato**
2. Preencha nome (obrigatório), e-mail, telefone, empresa, status
3. Salve e confirme que o contato aparece na lista
4. Clique no ícone de edição (lápis) → altere algum campo → salve
5. Use a busca (campo de texto) para filtrar por nome, e-mail ou telefone
6. **IA automática**: ao criar um contato, a função `classifyLead` roda em background e classifica o lead (hot/warm/cold). Veja o resultado em `/dashboard` → "Ações da IA hoje"

**O que verificar no Supabase**:
```sql
SELECT id, name, email, phone, status, external_id FROM contacts ORDER BY created_at DESC LIMIT 5;
```

---

### 4.2 Empresas

**Interface**: `/companies`

1. Clique em **Nova empresa**
2. Preencha nome (obrigatório), domínio, telefone, endereço, notas
3. Salve e confirme na lista
4. Ao criar/editar um contato, você pode associar a uma empresa pelo campo **Empresa**
5. Filtre na lista de empresas pelo campo de busca

**O que verificar no Supabase**:
```sql
SELECT id, name, domain, phone FROM companies ORDER BY created_at DESC LIMIT 5;
```

---

### 4.3 Produtos

**Interface**: `/products`

1. Clique em **Novo produto**
2. Preencha: nome, descrição, preço (número com centavos), categoria, se está ativo
3. Salve e confirme na lista
4. Produtos são usados ao adicionar itens a uma oportunidade

**O que verificar no Supabase**:
```sql
SELECT id, name, price, category, active FROM products ORDER BY created_at DESC LIMIT 5;
```

---

### 4.4 Tags

**Interface**: `/tags` (ou direto no contato)

1. Acesse `/tags` → **Nova tag**
2. Defina nome e cor (picker de cor)
3. Para aplicar a um contato: abra a tela de contatos → ícone de tag → selecione as tags desejadas
4. Tags filtram a lista de contatos

**O que verificar no Supabase**:
```sql
SELECT t.name, t.color, c.name as contato
FROM tags t
LEFT JOIN contact_tags ct ON ct.tag_id = t.id
LEFT JOIN contacts c ON c.id = ct.contact_id
WHERE t.tenant_id = '<seu-tenant-id>';
```

---

### 4.5 Pipelines

**Interface**: `/pipeline`

1. Um pipeline padrão ("Pipeline Principal") é criado automaticamente no primeiro acesso
2. Para adicionar colunas/estágios: botão **+ Estágio** na barra superior
3. Para criar um pipeline adicional: botão **Novo pipeline**
4. As colunas do Kanban correspondem aos estágios — arraste oportunidades entre elas
5. Para renomear um estágio: clique no ícone de edição ao lado do nome da coluna

**O que verificar no Supabase**:
```sql
SELECT p.name as pipeline, ps.name as stage, ps.order, ps.probability
FROM pipelines p
JOIN pipeline_stages ps ON ps.pipeline_id = p.id
WHERE p.tenant_id = '<seu-tenant-id>'
ORDER BY ps.order;
```

---

### 4.6 Oportunidades

**Interface**: `/opportunities` e `/pipeline`

1. Acesse `/opportunities` → **Nova oportunidade**
2. Preencha: título (obrigatório), valor, contato, empresa, pipeline, estágio, previsão de fechamento
3. Para adicionar produtos: abra a oportunidade → aba **Produtos** → **Adicionar produto**
4. Para mover no Kanban: acesse `/pipeline` e arraste o card para outro estágio
5. Ao marcar como **Ganho**: uma receita é gerada automaticamente em `/billing`
6. **IA automática**: ao atualizar uma oportunidade, `suggestNextAction` pode criar uma tarefa em `/tasks`

**O que verificar no Supabase**:
```sql
SELECT o.title, o.value, o.status, ps.name as stage, c.name as contato
FROM opportunities o
JOIN pipeline_stages ps ON ps.id = o.stage_id
LEFT JOIN contacts c ON c.id = o.contact_id
WHERE o.tenant_id = '<seu-tenant-id>'
ORDER BY o.created_at DESC LIMIT 10;
```

---

### 4.7 Faturamento

**Interface**: `/billing`

1. Receitas aparecem aqui automaticamente quando uma oportunidade é marcada como **Ganho**
2. Para alterar o status de um pagamento: clique no ícone de edição (lápis) na linha da receita
3. Status disponíveis: `pending` (pendente), `paid` (pago), `overdue` (vencido), `cancelled` (cancelado)
4. Ao marcar como `paid`, o campo **Data de pagamento** é preenchido automaticamente
5. Filtre por período (data inicial/final) e por status no topo da tela

**O que verificar no Supabase**:
```sql
SELECT r.description, r.amount, r.status, r.due_at, r.paid_at
FROM revenues r
WHERE r.tenant_id = '<seu-tenant-id>'
ORDER BY r.created_at DESC LIMIT 10;
```

---

### 4.8 Tarefas

**Interface**: `/tasks`

1. Acesse `/tasks` → **Nova tarefa** para criar manualmente
2. Tarefas criadas pela IA têm o ícone de robô roxo e badge `IA`
3. Filtros disponíveis: status (todas / pendente / concluída / cancelada) e prioridade (todas / alta / média / baixa)
4. Ações inline:
   - **✓** verde → marcar como concluída
   - **✎** lápis → editar título, descrição, prioridade, prazo
   - **✗** vermelho → cancelar tarefa
5. Tarefas com prazo vencido aparecem em vermelho com ícone de alerta
6. Para forçar a IA a detectar leads parados: `GET http://localhost:3000/api/ai/stalled` (requer login)

**O que verificar no Supabase**:
```sql
SELECT title, status, priority, source, due_at
FROM tasks
WHERE tenant_id = '<seu-tenant-id>'
ORDER BY created_at DESC LIMIT 10;
```

---

### 4.9 Inbox (Conversas)

**Interface**: `/inbox`

1. **Criar conversa manual**: clique no ícone `+` no canto superior esquerdo da lista
2. Selecione um contato, canal (manual/whatsapp/instagram/email) e assunto opcional
3. No centro, escreva uma mensagem no campo inferior e pressione **Enter** (Shift+Enter = nova linha)
4. Para simular mensagens: use os webhooks (seção 4.11 e 4.12) — elas aparecem automaticamente na inbox
5. **Alterar status**: clique no dropdown de status no cabeçalho da conversa (aberto / pendente / resolvido)

**Filtros da lista**:
- Abas de status: Todos / Abertos / Pendentes / Resolvidos
- Dropdown de canal: Todos / WhatsApp / Instagram / Email / Manual

---

### 4.10 IA na Conversa

**Interface**: `/inbox` → abrir qualquer conversa → botão **Bot** no cabeçalho

O painel de IA aparece à direita com três seções:

#### Resumo
1. Clique em **Gerar resumo**
2. Aguarde o spinner (a IA analisa as últimas mensagens)
3. Aparece: texto resumido + lista de pontos-chave detectados
4. Para atualizar: clique no ícone de atualização (↺)

**O que verificar no Supabase**:
```sql
SELECT summary_text FROM conversations WHERE id = '<conv-id>';
SELECT output_summary FROM ai_logs WHERE entity_id = '<conv-id>' AND action = 'summarize_conversation' ORDER BY created_at DESC LIMIT 1;
```

#### Intenção
1. Clique em **Detectar intenção**
2. A IA classifica a conversa em: Interesse, Dúvida, Reclamação, Pedido de orçamento, Urgência, Perda de interesse, Neutro
3. Se for uma intenção relevante (não neutra), uma tarefa é criada automaticamente em `/tasks`
4. O badge "Tarefa criada" aparece no painel quando isso acontece

**O que verificar no Supabase**:
```sql
SELECT detected_intent FROM conversations WHERE id = '<conv-id>';
SELECT title, priority, source FROM tasks WHERE description LIKE '%<conv-id>%';
```

#### Sugestão de resposta
1. Clique em **Sugerir resposta**
2. Aparece: texto da sugestão + tom (profissional/amigável/empático) + % de confiança
3. Clique em **Usar** para copiar a sugestão para o campo de texto
4. Clique em **Ignorar** para descartar
5. Clique em **Tentar novamente** para gerar outra sugestão

---

### 4.11 Webhook Simulado — WhatsApp

**Endpoint**: `POST http://localhost:3000/api/webhooks/whatsapp?tenantId=<UUID>`

#### Payload de uma mensagem de texto

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": { "name": "Maria Santos" },
                "wa_id": "5511999998888"
              }
            ],
            "messages": [
              {
                "from": "5511999998888",
                "id": "wamid.teste001",
                "timestamp": "1715000000",
                "type": "text",
                "text": {
                  "body": "Olá! Preciso de um orçamento para 50 usuários."
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

#### Testando com curl

```bash
# Substitua SEU_TENANT_ID pelo UUID do seu tenant
TENANT_ID="SEU_TENANT_ID"

curl -X POST "http://localhost:3000/api/webhooks/whatsapp?tenantId=$TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_ID",
      "changes": [{
        "field": "messages",
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "PHONE_ID" },
          "contacts": [{ "profile": { "name": "Maria Santos" }, "wa_id": "5511999998888" }],
          "messages": [{
            "from": "5511999998888",
            "id": "wamid.teste001",
            "timestamp": "1715000000",
            "type": "text",
            "text": { "body": "Olá! Preciso de um orçamento para 50 usuários." }
          }]
        }
      }]
    }]
  }'
```

#### Testando com Postman

- **Método**: POST  
- **URL**: `http://localhost:3000/api/webhooks/whatsapp?tenantId=SEU_TENANT_ID`  
- **Headers**: `Content-Type: application/json`  
- **Body**: JSON acima (aba raw → JSON)

#### O que deve acontecer

1. Resposta `200` com `{ "processed": 1, "results": [...] }`
2. Contato "Maria Santos" com telefone `+5511999998888` criado em `/contacts`
3. Conversa WhatsApp criada em `/inbox`
4. Mensagem "Preciso de um orçamento" aparece na conversa
5. IA roda em background: resumo + intenção (`quote_request`) + tarefa criada em `/tasks`

#### Segunda mensagem (mesmo número — reutiliza conversa)

```bash
curl -X POST "http://localhost:3000/api/webhooks/whatsapp?tenantId=$TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_ID",
      "changes": [{
        "field": "messages",
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "PHONE_ID" },
          "contacts": [{ "profile": { "name": "Maria Santos" }, "wa_id": "5511999998888" }],
          "messages": [{
            "from": "5511999998888",
            "id": "wamid.teste002",
            "timestamp": "1715003600",
            "type": "text",
            "text": { "body": "Vocês têm desconto para pagamento anual?" }
          }]
        }
      }]
    }]
  }'
```

Deve aparecer na **mesma conversa** (sem criar nova) e atualizar `lastMessageAt`.

---

### 4.12 Webhook Simulado — Instagram

**Endpoint**: `POST http://localhost:3000/api/webhooks/instagram?tenantId=<UUID>`

#### Payload de uma mensagem

```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "IG_BUSINESS_ACCOUNT_ID",
      "messaging": [
        {
          "sender":    { "id": "IG_USER_PSID_123456" },
          "recipient": { "id": "IG_BUSINESS_ACCOUNT_ID" },
          "timestamp": 1715000000,
          "message": {
            "mid":  "mid.aGlnaGxpZ2h0",
            "text": "Vi seus produtos no feed! Quanto custa o plano básico?"
          }
        }
      ]
    }
  ]
}
```

#### Testando com curl

```bash
TENANT_ID="SEU_TENANT_ID"

curl -X POST "http://localhost:3000/api/webhooks/instagram?tenantId=$TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "IG_BUSINESS_ID",
      "messaging": [{
        "sender":    { "id": "IG_USER_PSID_123456" },
        "recipient": { "id": "IG_BUSINESS_ID" },
        "timestamp": 1715000000,
        "message": {
          "mid":  "mid.aGlnaGxpZ2h0",
          "text": "Vi seus produtos no feed! Quanto custa o plano básico?"
        }
      }]
    }]
  }'
```

#### O que deve acontecer

1. Resposta `200` com `{ "processed": 1, "results": [...] }`
2. Contato "IG 123456" criado em `/contacts` com `externalId = "IG_USER_PSID_123456"`
3. Conversa Instagram criada em `/inbox` com canal `instagram`
4. IA detecta intenção `quote_request` → tarefa criada em `/tasks`

---

### 4.13 Verificação de Webhook (GET)

Os endpoints também respondem ao desafio de verificação do Meta:

```bash
# WhatsApp
curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=CHALLENGE_TEST"
# Resposta esperada: CHALLENGE_TEST

# Instagram
curl "http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=CHALLENGE_TEST"
# Resposta esperada: CHALLENGE_TEST
```

---

## 5. O Que Verificar no Supabase Após os Testes

### Visão geral rápida

```sql
-- Todas as entidades do seu tenant
SELECT 'contacts'      as tabela, count(*) FROM contacts      WHERE tenant_id = '<id>'
UNION ALL
SELECT 'companies',    count(*) FROM companies    WHERE tenant_id = '<id>'
UNION ALL
SELECT 'products',     count(*) FROM products     WHERE tenant_id = '<id>'
UNION ALL
SELECT 'tags',         count(*) FROM tags          WHERE tenant_id = '<id>'
UNION ALL
SELECT 'opportunities',count(*) FROM opportunities WHERE tenant_id = '<id>'
UNION ALL
SELECT 'revenues',     count(*) FROM revenues      WHERE tenant_id = '<id>'
UNION ALL
SELECT 'tasks',        count(*) FROM tasks         WHERE tenant_id = '<id>'
UNION ALL
SELECT 'conversations',count(*) FROM conversations WHERE tenant_id = '<id>'
UNION ALL
SELECT 'messages',     count(*) FROM messages      WHERE tenant_id = '<id>';
```

### Ações da IA (ai_logs)

```sql
-- Últimas 20 ações da IA
SELECT action, entity_type, output_summary, created_at
FROM ai_logs
WHERE tenant_id = '<id>'
ORDER BY created_at DESC
LIMIT 20;

-- Verificar webhook recebido
SELECT action, input_summary, output_summary, created_at
FROM ai_logs
WHERE action = 'webhook_received'
ORDER BY created_at DESC
LIMIT 5;
```

### Tarefas criadas pela IA

```sql
SELECT title, priority, status, source, due_at, created_at
FROM tasks
WHERE tenant_id = '<id>' AND source = 'ai'
ORDER BY created_at DESC
LIMIT 10;
```

### Contatos criados por webhook

```sql
-- WhatsApp (tem phone no formato +55...)
SELECT name, phone, status, created_at FROM contacts
WHERE tenant_id = '<id>' AND phone LIKE '+55%'
ORDER BY created_at DESC LIMIT 5;

-- Instagram (tem external_id)
SELECT name, external_id, status, created_at FROM contacts
WHERE tenant_id = '<id>' AND external_id IS NOT NULL
ORDER BY created_at DESC LIMIT 5;
```

### Intenção detectada nas conversas

```sql
SELECT c.subject, c.channel, c.detected_intent, c.summary_text, c.last_message_at
FROM conversations c
WHERE c.tenant_id = '<id>'
ORDER BY c.created_at DESC LIMIT 10;
```

---

## 6. Erros Comuns e Como Corrigir

### `NEXTAUTH_SECRET` ausente ou curto

**Sintoma**: página de login em loop ou erro 500  
**Solução**: garanta que `.env.local` tem `NEXTAUTH_SECRET` com pelo menos 32 caracteres aleatórios

```bash
# Gerar um secret seguro (PowerShell)
[System.Web.Security.Membership]::GeneratePassword(40, 0)
# ou copie qualquer string longa: "minha-chave-super-secreta-crm-plus-2026"
```

---

### `DATABASE_URL` inválida / conexão recusada

**Sintoma**: erro `Can't reach database server` ou página em branco  
**Solução**: verifique se a URL no `.env.local` aponta para seu projeto Supabase correto e se o banco está ativo no painel do Supabase

---

### Webhook retorna `400 tenantId query param required`

**Sintoma**: `{"error":"tenantId query param required (simulation mode)"}`  
**Solução**: adicione `?tenantId=<UUID>` à URL. Copie o UUID do Supabase:

```sql
SELECT id FROM tenants LIMIT 1;
```

---

### Webhook retorna `400 Invalid WhatsApp payload`

**Sintoma**: `{"error":"Invalid WhatsApp payload."}`  
**Causa**: estrutura do JSON incorreta — falta algum campo obrigatório  
**Campos obrigatórios**:
- `object` deve ser exatamente `"whatsapp_business_account"`
- `entry[].changes[].value.messaging_product` deve ser `"whatsapp"`
- `entry[].changes[].field` deve ser `"messages"`
- `messages[].type` deve ser `"text"`

Para Instagram: `object` deve ser exatamente `"instagram"`.

---

### Contato duplicado após webhook

**Sintoma**: dois contatos com o mesmo telefone  
**Causa**: o número foi enviado com formatação diferente (ex: `55 11 99999-8888` vs `5511999998888`)  
**Solução**: o webhook normaliza automaticamente removendo não-dígitos. Certifique-se de passar apenas dígitos no campo `from`/`wa_id`.

---

### Inbox vazia após webhook

**Sintoma**: webhook retornou sucesso mas a conversa não aparece na inbox  
**Causa**: você pode estar logado com um usuário de tenant diferente  
**Verificação**:

```sql
SELECT id, tenant_id, channel, subject FROM conversations ORDER BY created_at DESC LIMIT 5;
```

Compare o `tenant_id` da conversa com o UUID do seu tenant logado.

---

### IA não gerou tarefas após webhook

**Sintoma**: webhook OK, conversa criada, mas `/tasks` está vazia  
**Causa**: a IA roda de forma assíncrona (fire-and-forget). Aguarde 1–2 segundos e recarregue `/tasks`.  
**Verificação adicional**:

```sql
SELECT action, output_summary, created_at FROM ai_logs
WHERE action IN ('detect_intent', 'summarize_conversation', 'webhook_received')
ORDER BY created_at DESC LIMIT 10;
```

Se `webhook_received` aparece mas `detect_intent` não, veja os logs do servidor Next.js no terminal para erros silenciosos.

---

### Módulos que ainda não têm tela própria

Os seguintes itens do menu não possuem interface implementada ainda:

| Item do menu | Status |
|---|---|
| `/automations` | Placeholder — em desenvolvimento |
| `/reports` | Placeholder — em desenvolvimento |
| `/settings` | Placeholder — em desenvolvimento |

Clicando neles o sistema pode mostrar uma página em branco ou redirecionar para o dashboard — isso é esperado.

---

## 7. Sequência de Teste Recomendada (Fluxo Completo)

Para validar todo o sistema de uma vez, siga esta ordem:

```
1. /register         → criar empresa "Acme Vendas" + usuário admin
2. /login            → entrar com as credenciais criadas
3. /companies        → criar empresa "Empresa Teste Ltda"
4. /products         → criar produto "Plano Pro" por R$ 297,00/mês
5. /contacts         → criar contato "Carlos Mendes" associado à empresa
6. /pipeline         → verificar pipeline padrão criado + adicionar estágio "Proposta"
7. /opportunities    → criar oportunidade "Carlos - Plano Pro" com valor R$ 297
                       → adicionar produto "Plano Pro"
                       → mover para estágio "Proposta" no Kanban
8. /billing          → verificar que NÃO há receita ainda (oportunidade aberta)
9. /opportunities    → marcar oportunidade como "Ganho"
10. /billing         → confirmar que receita apareceu automaticamente
11. Webhook WA       → curl com número novo → verificar /contacts + /inbox + /tasks
12. /inbox           → abrir conversa criada pelo webhook
                       → clicar no botão Bot → Gerar resumo
                       → Detectar intenção
                       → Sugerir resposta → Usar
                       → Enviar mensagem manual
13. /tasks           → verificar tarefas criadas pela IA
14. /dashboard       → verificar KPIs atualizados + "Ações da IA hoje"
```

---

*Última atualização: 2026-05-05 | CRM PLUS v0.1.0*
