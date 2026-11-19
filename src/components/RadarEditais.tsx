import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RefreshCw, Search, Loader2, ExternalLink, Star, X, RotateCcw,
  Building2, MapPin, CalendarClock, Radar, Flame, Inbox, Banknote, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// Radar de Editais — editais com propostas abertas (PNCP). A busca é feita pelo
// próprio sistema (Edge Function nexla-radar-editais), às 07h, 12h, 15h, 18h e 23h
// ou pelo botão "Buscar agora". Rondônia e Nacional ficam separados.
// O usuário só faz a triagem (status): interessante / descartado.

interface Edital {
  id:                     string
  escopo:                 'RO' | 'NACIONAL'
  titulo:                 string | null
  objeto:                 string | null
  orgao:                  string | null
  uf:                     string | null
  municipio:              string | null
  modalidade:             string | null
  valor_estimado:         number | null
  abertura_propostas:     string | null
  encerramento_propostas: string | null
  link:                   string | null
  link_origem:            string | null
  palavras_chave:         string[]
  status:                 'novo' | 'interessante' | 'descartado'
  encontrado_em:          string
}

type Escopo = 'RO' | 'NACIONAL'

interface Execucao {
  id: number; lote: 'ro1' | 'ro2' | 'nac1' | 'nac2'; origem: 'cron' | 'botao'
  status: 'rodando' | 'ok' | 'erro'; iniciado_em: string; terminado_em: string | null
  novos: number; atualizados: number; falhas: string[]
}

const LOTES_TOTAL = 4
const HORARIOS = '07h, 12h, 15h, 18h e 23h'

// Ciclo = a busca mais recente: do último lote 'ro1' em diante
function cicloAtual(execs: Execucao[]) {
  const ro1 = execs.find(e => e.lote === 'ro1')
  if (!ro1) return null
  const lotes = execs.filter(e => e.iniciado_em >= ro1.iniciado_em)
  const agora    = Date.now()
  const recente  = (e: Execucao) => agora - new Date(e.iniciado_em).getTime() < 5 * 60_000
  const feitos   = lotes.filter(e => e.status !== 'rodando').length
  const completo = feitos >= LOTES_TOTAL
  // Entre um lote e o próximo há 1-2s sem nenhum "rodando": se o último lote
  // terminou há menos de 20s e o ciclo não está completo, o próximo está a caminho.
  const ultimaAtividade = Math.max(...lotes.map(e => new Date(e.terminado_em ?? e.iniciado_em).getTime()))
  const rodando = lotes.some(e => e.status === 'rodando' && recente(e))
    || (!completo && agora - ultimaAtividade < 20_000)
  return {
    inicio: ro1.iniciado_em, origem: ro1.origem, rodando, feitos, completo,
    novos:  lotes.reduce((s, e) => s + e.novos, 0),
    falhas: lotes.reduce((s, e) => s + (e.falhas?.length ?? 0), 0) + lotes.filter(e => e.status === 'erro').length,
  }
}
type Filtro = 'abertos' | 'interessante' | 'descartado' | 'encerrado'
type Ordem  = 'prazo' | 'valor' | 'recentes'

const CAMPOS = 'id,escopo,titulo,objeto,orgao,uf,municipio,modalidade,valor_estimado,abertura_propostas,encerramento_propostas,link,link_origem,palavras_chave,status,encontrado_em'
const DIA = 86_400_000

const ESCOPOS: { id: Escopo; label: string; ajuda: string }[] = [
  { id: 'RO',       label: 'Rondônia', ajuda: 'Todos os editais com propostas abertas no estado de Rondônia.' },
  { id: 'NACIONAL', label: 'Nacional', ajuda: 'Editais do Brasil inteiro que falam de IA, automação, chatbot e afins.' },
]

// ── Formatação ────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// "MUNICIPIO DE ARIQUEMES" -> "Municipio De Ariquemes" (só quando vem tudo em maiúsculas)
const SIGLAS = new Set(['RO', 'SP', 'RJ', 'MG', 'DF', 'PR', 'SC', 'RS', 'BA', 'PA', 'AM', 'TI', 'SUS', 'LGPD', 'IA', 'TIC', 'CNPJ', 'CPF', 'ME', 'EPP', 'SRP'])
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'a', 'o', 'as', 'os', 'com', 'por', 'no', 'na', 'nos', 'nas', 'à', 'ao', 'aos'])

function ehMaiusculo(s: string) {
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '')
  return letras.length > 8 && letras === letras.toUpperCase()
}

function nomeProprio(s: string | null) {
  if (!s) return ''
  if (!ehMaiusculo(s)) return s
  return s.toLowerCase().split(/\s+/).map((w, i) => {
    const up = w.toUpperCase()
    if (SIGLAS.has(up.replace(/[^A-Z]/g, ''))) return up
    if (i > 0 && MINUSCULAS.has(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

// Objeto: tira prefixos de sistema ("[LICITANET] -", "OBJETO") e corrige CAIXA ALTA
function limparObjeto(s: string | null) {
  if (!s) return ''
  let t = s.replace(/^\s*\[[^\]]+\]\s*[-–:]?\s*/, '').replace(/^\s*objeto\s*[:\-–]?\s*/i, '').trim()
  if (ehMaiusculo(t)) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase())
    t = t.replace(/\b(ti|tic|sus|lgpd|ia|cnpj|srp|ro|df)\b/g, m => m.toUpperCase())
  }
  return t
}

function prazo(iso: string | null, agora: number): { txt: string; cls: string; urgente: boolean } {
  if (!iso) return { txt: 'Sem data', cls: 'bg-white/[0.05] text-slate-400', urgente: false }
  const diff = new Date(iso).getTime() - agora
  if (diff < 0) return { txt: 'Encerrado', cls: 'bg-white/[0.05] text-slate-500', urgente: false }
  const dias = Math.floor(diff / DIA)
  if (dias === 0) return { txt: 'Encerra hoje', cls: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30', urgente: true }
  if (dias === 1) return { txt: 'Encerra amanhã', cls: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30', urgente: true }
  if (dias <= 3)  return { txt: `Faltam ${dias} dias`, cls: 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20', urgente: true }
  if (dias <= 7)  return { txt: `Faltam ${dias} dias`, cls: 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20', urgente: false }
  return { txt: `Faltam ${dias} dias`, cls: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20', urgente: false }
}

// PostgREST devolve no máximo 1000 linhas por chamada
async function buscarTodos(): Promise<{ data: Edital[]; error: string | null }> {
  const todos: Edital[] = []
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await supabase.from('nexla_editais').select(CAMPOS)
      .order('encerramento_propostas', { ascending: true, nullsFirst: false })
      .range(de, de + 999)
    if (error) return { data: [], error: error.message }
    todos.push(...((data ?? []) as Edital[]))
    if (!data || data.length < 1000) break
  }
  return { data: todos, error: null }
}

// ── Cartão de edital ──────────────────────────────────────────────────────────

function CartaoEdital({ e, agora, onStatus }: {
  e: Edital; agora: number; onStatus: (e: Edital, s: Edital['status']) => void
}) {
  const [aberto, setAberto] = useState(false)
  const p       = prazo(e.encerramento_propostas, agora)
  const objeto  = limparObjeto(e.objeto || e.titulo)
  const longo   = objeto.length > 220
  const valor   = e.valor_estimado != null && Number(e.valor_estimado) > 0 ? Number(e.valor_estimado) : null
  const local   = [nomeProprio(e.municipio), e.uf].filter(Boolean).join(' / ')

  return (
    <li className={`rounded-xl border bg-[#0a0c11] p-4 sm:p-5 transition-colors
      ${e.status === 'interessante' ? 'border-amber-400/30' : 'border-white/[0.06] hover:border-white/[0.12]'}
      ${e.status === 'descartado' ? 'opacity-55' : ''}`}>

      {/* Linha 1: prazo + modalidade + marcador */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${p.cls}`}>
          {p.urgente && <Flame className="w-3 h-3" />}{p.txt}
        </span>
        {e.modalidade && (
          <span className="px-2.5 py-1 rounded-full text-xs bg-white/[0.05] text-slate-300">{e.modalidade}</span>
        )}
        {e.status === 'interessante' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-400/10 text-amber-300">
            <Star className="w-3 h-3 fill-amber-300" /> Interessante
          </span>
        )}
        {e.status === 'descartado' && (
          <span className="px-2.5 py-1 rounded-full text-xs bg-white/[0.05] text-slate-400">Descartado</span>
        )}
      </div>

      {/* Objeto */}
      <p className={`text-white text-[15px] leading-relaxed mt-3 ${!aberto && longo ? 'line-clamp-3' : ''}`}>
        {objeto || 'Objeto não informado'}
      </p>
      {longo && (
        <button onClick={() => setAberto(a => !a)} className="text-xs text-indigo-300 hover:text-indigo-200 mt-1">
          {aberto ? 'Ver menos' : 'Ver mais'}
        </button>
      )}

      {/* Dados */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr_0.9fr] gap-x-6 gap-y-2 mt-4 text-sm">
        <div className="flex items-start gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <span className="text-slate-300 line-clamp-2">{nomeProprio(e.orgao) || '—'}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <span className="text-slate-300">{local || '—'}</span>
        </div>
        <div className="flex items-start gap-2">
          <CalendarClock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <span className="text-slate-300">
            {e.encerramento_propostas ? <>Propostas até <b className="font-medium text-white">{fmtData(e.encerramento_propostas)}</b></> : 'Prazo não informado'}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Banknote className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          {valor
            ? <span className="text-emerald-300 font-medium">{brl(valor)}</span>
            : <span className="text-slate-500">Valor não informado</span>}
        </div>
      </div>

      {/* Palavras-chave (Nacional) */}
      {e.palavras_chave.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <span className="text-xs text-slate-500">Encontrado por:</span>
          {e.palavras_chave.map(k => (
            <span key={k} className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 text-xs">{k}</span>
          ))}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-white/[0.05]">
        {e.link && (
          <a href={e.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-900 hover:bg-slate-200">
            <ExternalLink className="w-3.5 h-3.5" /> Ver edital
          </a>
        )}
        {p.txt === 'Encerrado' ? (
          <span className="text-xs text-slate-500">Prazo de propostas encerrado</span>
        ) : e.status === 'novo' ? (
          <>
            <button onClick={() => onStatus(e, 'interessante')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-400/10 text-amber-300 hover:bg-amber-400/20">
              <Star className="w-3.5 h-3.5" /> Interessante
            </button>
            <button onClick={() => onStatus(e, 'descartado')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-400 hover:text-rose-300 hover:bg-rose-500/10">
              <X className="w-3.5 h-3.5" /> Descartar
            </button>
          </>
        ) : (
          <button onClick={() => onStatus(e, 'novo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]">
            <RotateCcw className="w-3.5 h-3.5" /> Desfazer
          </button>
        )}
      </div>
    </li>
  )
}

// ── Tela ──────────────────────────────────────────────────────────────────────

export default function RadarEditais() {
  const [rows, setRows]       = useState<Edital[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [escopo, setEscopo]   = useState<Escopo>('RO')
  const [filtro, setFiltro]   = useState<Filtro>('abertos')
  const [ordem, setOrdem]     = useState<Ordem>('prazo')
  const [busca, setBusca]     = useState('')
  const [agora, setAgora]     = useState(() => Date.now())
  const [execs, setExecs]     = useState<Execucao[]>([])
  const [aguardando, setAguardando] = useState(false)   // clicou e o 1º lote ainda não apareceu
  const [clicouEm, setClicouEm]     = useState<number | null>(null)
  const [aviso, setAviso]     = useState('')

  const loadExecs = useCallback(async () => {
    const { data } = await supabase.from('nexla_radar_execucoes')
      .select('id,lote,origem,status,iniciado_em,terminado_em,novos,atualizados,falhas')
      .order('iniciado_em', { ascending: false }).limit(12)
    setExecs((data ?? []) as Execucao[])
    return (data ?? []) as Execucao[]
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await buscarTodos()
    if (err) setError('Erro ao carregar: ' + err)
    else { setError(''); setRows(data) }
    setAgora(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => { load(); loadExecs() }, [load, loadExecs])

  // Relógio da tela: a cada minuto, edital com prazo vencido sai da lista sozinho
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const ciclo    = useMemo(() => cicloAtual(execs), [execs])
  const buscando = aguardando || !!ciclo?.rodando

  // Enquanto busca: consulta o progresso a cada 4s e recarrega os editais ao terminar
  useEffect(() => {
    if (!buscando) return
    const t = setInterval(async () => {
      const c = cicloAtual(await loadExecs())
      // só conta a busca que começou depois do clique (não a anterior)
      const cicloNovo = !!c && (!clicouEm || new Date(c.inicio).getTime() >= clicouEm - 5_000)
      if (aguardando && cicloNovo) setAguardando(false)
      if (c && cicloNovo && !c.rodando) {
        setAguardando(false)
        setClicouEm(null)
        await load()
        setAviso(c.novos > 0 ? `Busca concluída: ${c.novos} edita${c.novos === 1 ? 'l novo' : 'is novos'}.` : 'Busca concluída: nenhum edital novo.')
      }
    }, 4000)
    // se nada começar em 90s, libera o botão
    const limite = setTimeout(() => { setAguardando(false); setClicouEm(null) }, 90_000)
    return () => { clearInterval(t); clearTimeout(limite) }
  }, [buscando, aguardando, clicouEm, load, loadExecs])

  async function buscarAgora() {
    setAviso('')
    setError('')
    const { data, error: err } = await supabase.rpc('nexla_radar_buscar_agora')
    if (err) { setError('Não foi possível iniciar a busca: ' + err.message); return }
    if (data === 'ja_em_andamento') setAviso('Já existe uma busca em andamento — acompanhe o progresso abaixo.')
    else setClicouEm(Date.now())
    setAguardando(true)
  }

  async function mudarStatus(e: Edital, status: Edital['status']) {
    setRows(rs => rs.map(r => r.id === e.id ? { ...r, status } : r))   // otimista
    const { error: err } = await supabase.from('nexla_editais').update({ status }).eq('id', e.id)
    if (err) {
      setRows(rs => rs.map(r => r.id === e.id ? { ...r, status: e.status } : r))
      setError('Não foi possível salvar: ' + err.message)
    }
  }

  const aberto = useCallback(
    (e: Edital) => !e.encerramento_propostas || new Date(e.encerramento_propostas).getTime() >= agora,
    [agora])
  const ativo = useCallback((e: Edital) => aberto(e) && e.status !== 'descartado', [aberto])

  const doEscopo = useMemo(() => rows.filter(r => r.escopo === escopo), [rows, escopo])

  const resumo = useMemo(() => {
    const ativos = doEscopo.filter(ativo)
    return {
      abertos:      ativos.length,
      semana:       ativos.filter(r => r.encerramento_propostas && new Date(r.encerramento_propostas).getTime() - agora <= 7 * DIA).length,
      interessante: doEscopo.filter(r => aberto(r) && r.status === 'interessante').length,
    }
  }, [doEscopo, ativo, aberto, agora])

  // Prazo vencido sai de todas as listas e só aparece em "Encerrados"
  const contagem = useMemo(() => ({
    RO:           rows.filter(r => r.escopo === 'RO' && ativo(r)).length,
    NACIONAL:     rows.filter(r => r.escopo === 'NACIONAL' && ativo(r)).length,
    abertos:      resumo.abertos,
    interessante: resumo.interessante,
    descartado:   doEscopo.filter(r => aberto(r) && r.status === 'descartado').length,
    encerrado:    doEscopo.filter(r => !aberto(r)).length,
  }), [rows, doEscopo, ativo, aberto, resumo])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = doEscopo.filter(r => {
      if (filtro === 'encerrado') { if (aberto(r)) return false }
      else if (!aberto(r)) return false
      if (filtro === 'abertos' && r.status === 'descartado') return false
      if (filtro === 'interessante' && r.status !== 'interessante') return false
      if (filtro === 'descartado' && r.status !== 'descartado') return false
      if (!q) return true
      return [r.objeto, r.orgao, r.municipio, r.titulo, r.uf, r.modalidade].some(v => (v ?? '').toLowerCase().includes(q))
    })
    const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity)
    // Encerrados: mais recentes primeiro; nos demais, o prazo mais próximo primeiro
    if (ordem === 'prazo')    lista.sort((a, b) => filtro === 'encerrado'
      ? t(b.encerramento_propostas) - t(a.encerramento_propostas)
      : t(a.encerramento_propostas) - t(b.encerramento_propostas))
    if (ordem === 'valor')    lista.sort((a, b) => (Number(b.valor_estimado) || 0) - (Number(a.valor_estimado) || 0))
    if (ordem === 'recentes') lista.sort((a, b) => new Date(b.encontrado_em).getTime() - new Date(a.encontrado_em).getTime())
    return lista
  }, [doEscopo, filtro, busca, ordem, aberto])

  const filtros: { id: Filtro; label: string }[] = [
    { id: 'abertos',      label: 'Abertos' },
    { id: 'interessante', label: 'Interessantes' },
    { id: 'descartado',   label: 'Descartados' },
    { id: 'encerrado',    label: 'Encerrados' },
  ]

  const escopoAtual = ESCOPOS.find(s => s.id === escopo)!

  return (
    <div className="max-w-[1100px] mx-auto pb-12">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center shrink-0">
            <Radar className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold">Radar de Editais</h1>
            <p className="text-slate-400 text-sm">Licitações com propostas abertas no PNCP · busca automática às {HORARIOS}</p>
          </div>
        </div>
        <button onClick={buscarAgora} disabled={buscando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-60 shrink-0">
          <RefreshCw className={`w-4 h-4 ${buscando ? 'animate-spin' : ''}`} />
          {buscando ? `Buscando… ${Math.min(ciclo?.rodando ? ciclo.feitos : 0, LOTES_TOTAL)}/${LOTES_TOTAL}` : 'Buscar agora'}
        </button>
      </div>

      {/* Situação da busca */}
      <div className="flex items-center gap-2 flex-wrap text-xs mb-5 px-1">
        {buscando ? (
          <span className="inline-flex items-center gap-1.5 text-indigo-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Buscando no PNCP — pode levar alguns minutos. Pode sair da tela, a busca continua no servidor.
          </span>
        ) : ciclo ? (
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            {ciclo.falhas > 0 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-300" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            Última busca: {new Date(ciclo.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' '}({ciclo.origem === 'botao' ? 'manual' : 'automática'}) · {ciclo.novos} novo{ciclo.novos === 1 ? '' : 's'}
            {ciclo.falhas > 0 && <span className="text-amber-300"> · o PNCP falhou em parte da busca, o restante entra na próxima</span>}
          </span>
        ) : (
          <span className="text-slate-500">Nenhuma busca feita pelo sistema ainda.</span>
        )}
        {aviso && !buscando && <span className="text-emerald-300">· {aviso}</span>}
      </div>

      {/* Rondônia | Nacional */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-2">
        {ESCOPOS.map(s => (
          <button key={s.id} onClick={() => setEscopo(s.id)}
            className={`py-2.5 rounded-lg text-sm font-medium transition-colors
              ${escopo === s.id ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            {s.label} <span className={`ml-1 text-xs ${escopo === s.id ? 'text-indigo-100' : 'opacity-60'}`}>{contagem[s.id]}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500 mb-5 px-1">{escopoAtual.ajuda}</p>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Abertos',            valor: resumo.abertos,      cls: 'text-white' },
          { label: 'Encerram em 7 dias', valor: resumo.semana,       cls: resumo.semana > 0 ? 'text-amber-200' : 'text-white' },
          { label: 'Interessantes',      valor: resumo.interessante, cls: resumo.interessante > 0 ? 'text-amber-300' : 'text-white' },
        ].map(k => (
          <div key={k.label} className="rounded-xl bg-[#0a0c11] border border-white/[0.06] px-4 py-3">
            <p className={`text-2xl font-semibold ${k.cls}`}>{loading ? '—' : k.valor}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/[0.08] border border-rose-500/20 text-rose-200 text-sm">{error}</div>
      )}

      {/* Filtros, ordem e busca */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {filtros.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${filtro === f.id ? 'bg-white text-slate-900' : 'text-slate-300 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
              {f.label} <span className="opacity-60">{contagem[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-200 text-xs focus:outline-none focus:border-white/20">
            <option value="prazo"    className="bg-slate-900">Prazo mais próximo</option>
            <option value="valor"    className="bg-slate-900">Maior valor</option>
            <option value="recentes" className="bg-slate-900">Encontrados recentemente</option>
          </select>
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar objeto, órgão ou cidade"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-slate-500 focus:outline-none focus:border-white/20" />
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-slate-400 rounded-xl border border-dashed border-white/[0.08]">
          <Inbox className="w-7 h-7 opacity-50" />
          <p className="text-sm">
            {rows.length === 0 ? 'Nenhum edital ainda — clique em "Buscar agora".'
              : filtro === 'interessante' ? 'Nenhum edital interessante aberto no momento.'
              : filtro === 'encerrado' ? 'Nenhum edital encerrado. Os encerrados ficam aqui por 60 dias (interessantes, 1 ano).'
              : 'Nenhum edital encontrado com esse filtro.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2 px-1">{visiveis.length} edita{visiveis.length === 1 ? 'l' : 'is'}</p>
          <ul className="space-y-3">
            {visiveis.map(e => <CartaoEdital key={e.id} e={e} agora={agora} onStatus={mudarStatus} />)}
          </ul>
        </>
      )}
    </div>
  )
}
