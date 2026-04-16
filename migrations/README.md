# Migrations — Nexla Operacional

Cada arquivo `.sql` é uma migration numerada e sequencial.
Execute na ordem pelo **SQL Editor** do Supabase ou via `supabase db push`.

## Como aplicar no Supabase Dashboard

1. Acesse **SQL Editor** no painel do projeto
2. Cole o conteúdo do arquivo e clique em **Run**
3. Execute os arquivos na ordem numérica

## Como aplicar via CLI (supabase)

```bash
supabase db push
```

## Arquivos

| Arquivo | Descrição |
|---|---|
| `001_initial_schema.sql` | Tabela `profiles`, triggers e RLS |

## Convenção de nomes

```
NNN_descricao_curta.sql
```
- `NNN` — número sequencial com 3 dígitos (`001`, `002`, …)
- Nunca edite uma migration já aplicada; crie uma nova
