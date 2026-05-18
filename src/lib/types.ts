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
