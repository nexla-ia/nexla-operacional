export interface Task {
  id: string
  title: string
  subtitle?: string
  fromProject?: boolean
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
  data_termino: string
  descricao: string
}
