// Leitura de planilha (CSV, TSV ou conteúdo colado do Excel/Sheets) e
// adivinhação das colunas. Sem dependência de React — dá para testar sozinho.

export type CampoPlanilha = 'ignorar' | 'nome' | 'empresa' | 'telefone' | 'email' | 'origem'
  | 'responsavel' | 'valor' | 'tags' | 'instagram' | 'observacoes'

export const CAMPOS_PLANILHA: { key: CampoPlanilha; label: string }[] = [
  { key: 'ignorar',     label: '— ignorar coluna —' },
  { key: 'nome',        label: 'Nome do lead' },
  { key: 'empresa',     label: 'Empresa / clínica' },
  { key: 'telefone',    label: 'Telefone / WhatsApp' },
  { key: 'email',       label: 'E-mail' },
  { key: 'origem',      label: 'Origem' },
  { key: 'responsavel', label: 'Responsável / SDR' },
  { key: 'valor',       label: 'Valor do negócio' },
  { key: 'tags',        label: 'Tags / segmento' },
  { key: 'instagram',   label: 'Instagram' },
  { key: 'observacoes', label: 'Observações' },
]

/** Sinônimos de cabeçalho — é o que faz o mapeamento sair pronto na maioria das planilhas. */
const SINONIMOS: Record<Exclude<CampoPlanilha, 'ignorar'>, string[]> = {
  nome:        ['nome do lead', 'nome lead', 'nome', 'lead', 'contato', 'cliente', 'paciente'],
  empresa:     ['empresa', 'clinica', 'estabelecimento', 'negocio', 'razao social', 'consultorio', 'local'],
  telefone:    ['telefone', 'whatsapp', 'whats', 'celular', 'fone', 'numero', 'tel'],
  email:       ['email', 'e mail', 'mail'],
  origem:      ['origem', 'fonte', 'canal', 'como chegou', 'captacao'],
  responsavel: ['responsavel', 'sdr', 'vendedor', 'consultor', 'owner'],
  valor:       ['valor', 'ticket', 'preco', 'proposta', 'orcamento', 'mensalidade'],
  tags:        ['tags', 'etiquetas', 'segmento', 'nicho', 'especialidade', 'categoria'],
  instagram:   ['instagram', 'insta', 'perfil', 'arroba', 'ig'],
  observacoes: ['observacoes', 'obs', 'notas', 'anotacoes', 'descricao', 'comentarios', 'proxima acao'],
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Para qual campo do CRM esse cabeçalho aponta (ignora campos já usados). */
export function adivinharCampo(cabecalho: string, jaUsados: Set<CampoPlanilha>): CampoPlanilha {
  const h = normalizarTexto(cabecalho)
  if (!h) return 'ignorar'
  const pares = Object.entries(SINONIMOS) as [Exclude<CampoPlanilha, 'ignorar'>, string[]][]
  // exato primeiro, depois "começa com", só então "contém" — evita que "nome"
  // roube a coluna "nome da empresa".
  for (const teste of [
    (h: string, k: string) => h === k,
    (h: string, k: string) => h.startsWith(k + ' '),
    (h: string, k: string) => h.includes(k),
  ]) {
    for (const [campo, chaves] of pares) {
      if (jaUsados.has(campo)) continue
      if (chaves.some(k => teste(h, k))) return campo
    }
  }
  return 'ignorar'
}

export function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? ''
  const contagem: [string, number][] = [[';', 0], [',', 0], ['\t', 0]]
  let aspas = false
  for (const c of primeira) {
    if (c === '"') aspas = !aspas
    else if (!aspas) {
      const alvo = contagem.find(x => x[0] === c)
      if (alvo) alvo[1]++
    }
  }
  contagem.sort((a, b) => b[1] - a[1])
  return contagem[0][1] > 0 ? contagem[0][0] : ','
}

/** Quebra o conteúdo em linhas × colunas, respeitando aspas e quebras dentro delas. */
export function lerTabela(texto: string): string[][] {
  const sep = detectarSeparador(texto)
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else aspas = false
      } else campo += c
      continue
    }
    if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }

  const limpas = linhas.map(l => l.map(c => c.trim())).filter(l => l.some(c => c !== ''))
  if (limpas.length === 0) return []
  const colunas = Math.max(...limpas.map(l => l.length))
  return limpas.map(l => [...l, ...Array(colunas - l.length).fill('')])
}

/** "R$ 1.500,00" → 1500 ; "1,500.00" → 1500 */
export function valorParaNumero(v: string): number {
  const limpo = v.replace(/[^\d,.-]/g, '')
  if (!limpo) return 0
  const temVirgula = limpo.includes(',')
  const temPonto   = limpo.includes('.')
  let normalizado = limpo
  if (temVirgula && temPonto) {
    // o último separador manda: 1.500,00 (BR) ou 1,500.00 (US)
    normalizado = limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(/,/g, '')
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.')
  } else if (temPonto && /\.\d{3}(\D|$)/.test(limpo)) {
    normalizado = limpo.replace(/\./g, '')   // 1.500 = mil e quinhentos
  }
  const n = parseFloat(normalizado)
  return isNaN(n) ? 0 : n
}

/** Telefone comparável entre planilha e base (ignora DDI, máscara e o 9 extra). */
export function chaveTelefone(v?: string | null): string {
  const d = (v || '').replace(/\D/g, '')
  return d.length > 8 ? d.slice(-8) : d
}
