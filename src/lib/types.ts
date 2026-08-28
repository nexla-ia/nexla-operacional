export interface Task {
  id: string
  title: string
  subtitle?: string
  fromProject?: boolean
  color?: string
  project_id?: string
}

export interface Column {
  id: string
  title: string
  tasks: Task[]
}

export interface Project {
  id: string
  nome_projeto: string
  tipo_projeto: string
  nome_cliente: string
  numero_cliente: string
  valor: string
  valor_recebido: string
  data_termino: string
  descricao: string
  client_id?: string
}

export interface Client {
  id: string
  nome: string
  email: string
  telefone: string
  cpf_cnpj: string
  tipo: 'PF' | 'PJ'
  cidade: string
  estado: string
  observacoes: string
  ativo?: boolean
}

export interface Expense {
  id: string
  descricao: string
  valor: string
  data: string
  categoria: string
  tipo: 'fixa' | 'avulsa'
  dia_vencimento?: number
  pago: boolean
}

export interface Mensalidade {
  id: string
  client_id?: string
  cliente_nome: string
  descricao: string
  valor: string
  dia_vencimento: string
  status: 'ativo' | 'inativo'
  data_inicio: string
}

export interface ProjectEntry {
  id: string
  client_id?: string
  nome_projeto: string
  descricao: string
  valor: string
  data: string
  status: 'pendente' | 'recebido'
}

export interface Proposal {
  id: string
  client_id?: string
  cliente_nome: string
  cliente_telefone: string
  titulo: string
  descricao: string
  setup_valor: string
  mensalidade_valor: string
  recorrencia: 'mensal' | 'semestral' | 'anual'
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada'
  data_envio: string
  observacoes: string
}

// ── CRM ───────────────────────────────────────────────────────────────────────

export interface CrmFunnel {
  id: string
  nome: string
  posicao: number
}

export interface CrmStage {
  id: string
  funil_id: string
  nome: string
  cor: string
  posicao: number
  alerta_dias: number | null
  tipo: 'aberto' | 'ganho' | 'perdido'
}

export interface CrmLead {
  id: string
  funil_id: string | null
  stage_id: string | null
  nome: string
  empresa: string | null
  telefone: string | null
  email: string | null
  origem: string | null
  temperatura: 'frio' | 'morno' | 'quente'
  valor: number
  valor_recorrente: number
  tags: string[]
  responsavel_id: string | null
  responsavel_nome: string | null
  observacoes: string | null
  status: 'aberto' | 'ganho' | 'perdido'
  motivo_perda: string | null
  proximo_contato: string | null
  data_ult_contato: string | null
  data_entrada_etapa: string
  data_fechamento: string | null
  client_id: string | null
  created_at: string
}

export type CrmInteractionType =
  | 'nota' | 'ligacao' | 'whatsapp' | 'email' | 'reuniao'
  | 'proposta' | 'etapa' | 'tarefa' | 'ganho' | 'perdido'

export interface CrmInteraction {
  id: string
  lead_id: string
  tipo: CrmInteractionType
  conteudo: string | null
  autor_nome: string | null
  created_at: string
}

export interface CrmTask {
  id: string
  lead_id: string
  titulo: string
  descricao: string | null
  due_date: string | null
  concluida: boolean
  concluida_em: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  created_at: string
}

export interface CrmProfile {
  id: string
  full_name: string | null
  role: 'admin' | 'operator'
}
