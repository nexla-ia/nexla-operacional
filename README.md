# Nexla Operacional

Plataforma interna de gestão operacional da Nexla. Centraliza projetos, clientes, financeiro, kanban e gestão de tokens de IA.

## Stack

- **React 18** + **TypeScript** — interface
- **Vite 5** — bundler
- **Tailwind CSS 3** — estilização
- **Supabase** — banco de dados (PostgreSQL), autenticação e realtime
- **React Router v7** — roteamento
- **Lucide React** — ícones

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard** | Visão geral financeira — saldo, entradas, despesas, projetos |
| **Projetos** | Cadastro e gestão de projetos por cliente |
| **Kanban** | Board de tarefas com drag-and-drop manual |
| **Clientes** | Cadastro de PF/PJ com dados completos |
| **Usuários** | Gestão de usuários com perfis admin/operador |
| **Despesas** | Controle de despesas fixas e avulsas |
| **Mensalidades** | Recorrências mensais por cliente |
| **Entradas de Projetos** | Registro de recebimentos por projeto |
| **Cobranças** | Acompanhamento de cobranças pendentes |
| **Calendário** | Eventos e agenda da equipe |
| **Erros N8N** | Monitor de erros de automações N8N com badge e alerta sonoro |
| **Conversor de Moeda** | Conversão USD ↔ BRL via AwesomeAPI para custo de tokens de IA |

## Roles

- `admin` — acesso completo a todos os módulos
- `operator` — acesso restrito a projetos, kanban, clientes e cobranças

## Setup

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)

### Instalação

```bash
npm install
```

### Variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### Banco de dados

Execute as migrations na ordem em **Supabase → SQL Editor**:

```
migrations/001_initial_schema.sql
migrations/002_projects.sql
...
migrations/024_app_settings_bid.sql
```

### Desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173).

### Build

```bash
npm run build
```

## Estrutura

```
src/
├── components/
│   ├── cadastros/       # Clientes, Usuários, Despesas, Mensalidades, etc.
│   ├── DashboardHome    # Visão geral financeira
│   ├── KanbanBoard      # Board de tarefas
│   ├── Projects         # Gestão de projetos
│   ├── Cobranca         # Cobranças
│   ├── ErrosN8n         # Monitor de erros N8N
│   └── Configuracoes    # Conversor de moeda / configurações do sistema
├── pages/
│   ├── Dashboard.tsx    # Shell principal com sidebar
│   └── LoginPage.tsx    # Autenticação
└── lib/
    ├── supabase.ts      # Cliente Supabase
    ├── auth.ts          # Funções de autenticação
    ├── types.ts         # Interfaces TypeScript
    └── utils.ts         # Formatação de datas e valores BRL
```
