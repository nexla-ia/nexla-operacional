import { useMemo, useRef, useState } from 'react'
import {
  FileSpreadsheet, Upload, ClipboardPaste, Download, Loader2, Check,
  AlertTriangle, ArrowRight, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CrmLead, CrmStage, CrmProfile, CrmCadence } from '../../lib/types'
import { ORIGENS, TEMPERATURAS, hojeISO } from './constants'
import {
  CAMPOS_PLANILHA, adivinharCampo, chaveTelefone, lerTabela, normalizarTexto, valorParaNumero,
  type CampoPlanilha,
} from './planilha'
import Modal from './Modal'

const inputCls = `w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-xs
  placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors`
const selectCls = `${inputCls} [&>option]:bg-slate-900 cursor-pointer`
const rotuloCls = 'block text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1.5'

interface LinhaImport {
  nome:        string
  empresa:     string
  telefone:    string
  email:       string
  origem:      string
  responsavel: string
  valor:       number
  tags:        string[]
  observacoes: string
  duplicado:   boolean
}

interface Props {
  funilId:   string | null
  stages:    CrmStage[]
  profiles:  CrmProfile[]
  cadences:  CrmCadence[]
  leads:     CrmLead[]
  me:        { id: string; nome: string } | null
  onClose:   () => void
  onImported: (novos: CrmLead[], cadenceId: string) => Promise<void>
}

export default function ImportarModal({ funilId, stages, profiles, cadences, leads, me, onClose, onImported }: Props) {
  const [etapa, setEtapa]     = useState<'fonte' | 'mapa' | 'fim'>('fonte')
  const [texto, setTexto]     = useState('')
  const [tabela, setTabela]   = useState<string[][]>([])
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [mapa, setMapa]       = useState<CampoPlanilha[]>([])
  const [arquivo, setArquivo] = useState('')
  const [erro, setErro]       = useState('')
  const [arrastando, setArrastando] = useState(false)

  const [stageId, setStageId]   = useState(stages[0]?.id ?? '')
  const [respId, setRespId]     = useState(me?.id ?? '')
  const [origemPadrao, setOrigemPadrao] = useState('Prospecção ativa')
  const [temperatura, setTemperatura]   = useState<'frio' | 'morno' | 'quente'>('morno')
  const [cadenceId, setCadenceId] = useState(cadences.find(c => c.padrao)?.id ?? '')
  const [pularDuplicados, setPularDuplicados] = useState(true)

  const [importando, setImportando] = useState(false)
  const [resultado, setResultado]   = useState<{ criados: number; pulados: number; invalidos: number } | null>(null)
  const inputFile = useRef<HTMLInputElement>(null)

  // ── Leitura ─────────────────────────────────────────────────────────────────

  function carregarTexto(conteudo: string, nomeArquivo = '') {
    const linhas = lerTabela(conteudo)
    if (linhas.length === 0) { setErro('Não encontrei nenhuma linha com conteúdo.'); return }

    const usados = new Set<CampoPlanilha>()
    const palpite = linhas[0].map(h => {
      const c = adivinharCampo(h, usados)
      if (c !== 'ignorar') usados.add(c)
      return c
    })

    setArquivo(nomeArquivo)
    setTabela(linhas)
    setMapa(palpite)
    setTemCabecalho(palpite.some(c => c !== 'ignorar'))
    setErro('')
    setEtapa('mapa')
  }

  function lerArquivo(file: File) {
    if (/\.xlsx?$/i.test(file.name)) {
      setErro('Arquivo do Excel: no Excel use "Salvar como → CSV", ou copie as células e cole no campo abaixo.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => carregarTexto(String(reader.result ?? ''), file.name)
    reader.onerror = () => setErro('Não consegui ler esse arquivo.')
    reader.readAsText(file, 'utf-8')
  }

  function baixarModelo() {
    const csv = [
      'Nome;Empresa;Telefone;E-mail;Origem;Responsavel;Valor;Segmento;Instagram;Observacoes',
      'Ana Souza;Estúdio Fisio Ana;69999990000;ana@exemplo.com;Prospecção ativa;Davi;1500;Fisioterapia;@fisioana;Indicada pela Dra. Marina',
    ].join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Linhas prontas para importar ────────────────────────────────────────────

  const chavesExistentes = useMemo(() => {
    const tels = new Set<string>()
    const nomes = new Set<string>()
    for (const l of leads) {
      const t = chaveTelefone(l.telefone)
      if (t) tels.add(t)
      nomes.add(normalizarTexto(`${l.nome} ${l.empresa ?? ''}`))
    }
    return { tels, nomes }
  }, [leads])

  const linhas = useMemo<LinhaImport[]>(() => {
    const corpo = temCabecalho ? tabela.slice(1) : tabela
    const pegar = (l: string[], campo: CampoPlanilha) => {
      const i = mapa.indexOf(campo)
      return i >= 0 ? (l[i] ?? '').trim() : ''
    }

    const vistosTel = new Set<string>()
    const vistosNome = new Set<string>()

    return corpo.map(l => {
      const nome    = pegar(l, 'nome')
      const empresa = pegar(l, 'empresa')
      const tel     = pegar(l, 'telefone')
      const insta   = pegar(l, 'instagram')
      const obs     = pegar(l, 'observacoes')
      const tags    = pegar(l, 'tags')

      const chaveT = chaveTelefone(tel)
      const chaveN = normalizarTexto(`${nome} ${empresa}`)
      const dupBase = (!!chaveT && chavesExistentes.tels.has(chaveT)) || (!!nome && chavesExistentes.nomes.has(chaveN))
      const dupArquivo = (!!chaveT && vistosTel.has(chaveT)) || (!!nome && vistosNome.has(chaveN))
      if (chaveT) vistosTel.add(chaveT)
      if (nome) vistosNome.add(chaveN)

      return {
        nome,
        empresa,
        telefone:    tel,
        email:       pegar(l, 'email'),
        origem:      pegar(l, 'origem'),
        responsavel: pegar(l, 'responsavel'),
        valor:       valorParaNumero(pegar(l, 'valor')),
        tags:        tags ? tags.split(/[;,/|]/).map(t => t.trim()).filter(Boolean) : [],
        observacoes: [obs, insta ? `Instagram: ${insta}` : ''].filter(Boolean).join('\n'),
        duplicado:   dupBase || dupArquivo,
      }
    })
  }, [tabela, temCabecalho, mapa, chavesExistentes])

  const validas     = linhas.filter(l => l.nome.length >= 2)
  const invalidas   = linhas.length - validas.length
  const duplicadas  = validas.filter(l => l.duplicado).length
  const aImportar   = pularDuplicados ? validas.filter(l => !l.duplicado) : validas
  const semColunaNome = !mapa.includes('nome')

  // ── Importação ──────────────────────────────────────────────────────────────

  async function importar() {
    if (aImportar.length === 0) return
    setImportando(true)
    setErro('')

    const perfilPorNome = new Map(profiles.map(p => [normalizarTexto(p.full_name ?? ''), p]))
    const agora = new Date().toISOString()

    const registros = aImportar.map(l => {
      const perfil = l.responsavel ? perfilPorNome.get(normalizarTexto(l.responsavel)) : undefined
      const resp   = perfil ?? profiles.find(p => p.id === respId)
      return {
        funil_id:           funilId,
        stage_id:           stageId || null,
        nome:               l.nome,
        empresa:            l.empresa || null,
        telefone:           l.telefone || null,
        email:              l.email || null,
        origem:             l.origem || origemPadrao || null,
        temperatura,
        valor:              l.valor,
        tags:               l.tags,
        responsavel_id:     resp?.id ?? null,
        responsavel_nome:   resp?.full_name ?? (resp ? null : l.responsavel || null),
        observacoes:        l.observacoes || null,
        data_entrada_etapa: agora,
      }
    })

    const criados: CrmLead[] = []
    for (let i = 0; i < registros.length; i += 100) {
      const { data, error } = await supabase.from('crm_leads').insert(registros.slice(i, i + 100)).select()
      if (error) {
        setErro(`Erro ao importar: ${error.message}${criados.length ? ` (${criados.length} já foram criados)` : ''}`)
        setImportando(false)
        if (criados.length) await onImported(criados, '')
        return
      }
      criados.push(...((data ?? []) as CrmLead[]))
    }

    // Histórico: cada lead nasce com o registro da importação
    for (let i = 0; i < criados.length; i += 100) {
      await supabase.from('crm_interactions').insert(criados.slice(i, i + 100).map(l => ({
        lead_id: l.id, tipo: 'nota' as const,
        conteudo: `Lead importado de planilha${arquivo ? ` (${arquivo})` : ''} em ${hojeISO().split('-').reverse().join('/')}`,
        autor_nome: me?.nome ?? null,
      })))
    }

    await onImported(criados, cadenceId)
    setResultado({ criados: criados.length, pulados: pularDuplicados ? duplicadas : 0, invalidos: invalidas })
    setImportando(false)
    setEtapa('fim')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal titulo="Importar leads de planilha" Icon={FileSpreadsheet} largura="max-w-4xl"
      subtitulo="CSV do Excel/Google Sheets ou colado direto da planilha" onClose={onClose}>

      {erro && (
        <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro('')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── 1. De onde vêm os dados ── */}
      {etapa === 'fonte' && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={e => {
              e.preventDefault(); setArrastando(false)
              const f = e.dataTransfer.files?.[0]
              if (f) lerArquivo(f)
            }}
            onClick={() => inputFile.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors
              ${arrastando ? 'border-indigo-500/60 bg-indigo-500/[0.06]' : 'border-white/[0.1] hover:border-indigo-500/40'}`}>
            <Upload className={`w-6 h-6 ${arrastando ? 'text-indigo-300' : 'text-slate-500'}`} />
            <p className="text-white text-sm font-medium">Arraste o arquivo CSV aqui</p>
            <p className="text-slate-500 text-xs">ou clique para escolher · aceita .csv e .txt</p>
            <input ref={inputFile} type="file" accept=".csv,.txt,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f) }} />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.07]" />
            <span className="text-slate-500 text-[11px]">ou cole da planilha</span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>

          <div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5}
              placeholder={'Selecione as células no Excel ou Google Sheets, copie (Ctrl+C) e cole aqui.\n\nNome\tEmpresa\tTelefone\nAna Souza\tEstúdio Fisio Ana\t69999990000'}
              className={`${inputCls} resize-none font-mono text-[11px]`} />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => texto.trim() ? carregarTexto(texto) : setErro('Cole o conteúdo da planilha primeiro.')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors">
                <ClipboardPaste className="w-3.5 h-3.5" /> Ler o que colei
              </button>
              <button onClick={baixarModelo}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs hover:text-white transition-colors">
                <Download className="w-3.5 h-3.5" /> Baixar modelo
              </button>
            </div>
          </div>

          <p className="text-slate-500 text-[11px] leading-relaxed">
            Do Excel: <span className="text-slate-300">Arquivo → Salvar como → CSV</span>. Do Google Sheets:{' '}
            <span className="text-slate-300">Arquivo → Fazer download → CSV</span>. Colar funciona com qualquer um dos dois.
          </p>
        </div>
      )}

      {/* ── 2. Mapear colunas e conferir ── */}
      {etapa === 'mapa' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-300 text-xs">
              {arquivo || 'Dados colados'} · <span className="text-white font-semibold">{linhas.length}</span> linha(s)
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={temCabecalho} onChange={e => setTemCabecalho(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-500" />
              <span className="text-slate-300 text-[11px]">a primeira linha é o cabeçalho</span>
            </label>
            <div className="flex-1" />
            <button onClick={() => { setEtapa('fonte'); setTabela([]) }}
              className="text-slate-400 text-[11px] hover:text-white transition-colors">trocar arquivo</button>
          </div>

          {/* Mapeamento + prévia */}
          <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-white/[0.03]">
                  {mapa.map((campo, i) => (
                    <th key={i} className="p-2 align-top min-w-[150px]">
                      <select value={campo} className={`${selectCls} text-[11px]`}
                        onChange={e => setMapa(cur => cur.map((c, idx) => (idx === i ? e.target.value as CampoPlanilha : c)))}>
                        {CAMPOS_PLANILHA.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      {temCabecalho && (
                        <p className="text-slate-500 text-[10px] mt-1 truncate text-left">{tabela[0]?.[i] || '—'}</p>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(temCabecalho ? tabela.slice(1, 6) : tabela.slice(0, 5)).map((l, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    {mapa.map((campo, j) => (
                      <td key={j} className={`px-2 py-1.5 truncate max-w-[200px] ${campo === 'ignorar' ? 'text-slate-600' : 'text-slate-300'}`}>
                        {l[j] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {semColunaNome && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Escolha qual coluna é o <span className="font-semibold">nome do lead</span> — sem ela não dá para importar.
            </div>
          )}

          {/* Como entram no CRM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={rotuloCls}>Etapa de entrada</label>
              <select className={selectCls} value={stageId} onChange={e => setStageId(e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={rotuloCls}>Responsável padrão</label>
              <select className={selectCls} value={respId} onChange={e => setRespId(e.target.value)}>
                <option value="">Sem responsável</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
              </select>
              <p className="text-slate-600 text-[10px] mt-1">usado quando a planilha não traz o nome</p>
            </div>
            <div>
              <label className={rotuloCls}>Origem padrão</label>
              <select className={selectCls} value={origemPadrao} onChange={e => setOrigemPadrao(e.target.value)}>
                <option value="">Sem origem</option>
                {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={rotuloCls}>Temperatura</label>
              <select className={selectCls} value={temperatura} onChange={e => setTemperatura(e.target.value as typeof temperatura)}>
                {TEMPERATURAS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            {cadences.length > 0 && (
              <div className="sm:col-span-2">
                <label className={rotuloCls}>Régua de follow-up</label>
                <select className={selectCls} value={cadenceId} onChange={e => setCadenceId(e.target.value)}>
                  <option value="">Sem régua</option>
                  {cadences.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <p className="text-slate-600 text-[10px] mt-1">cria os toques de todos os leads importados a partir de hoje</p>
              </div>
            )}
          </div>

          {/* Resumo */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.07]">
            <span className="text-xs text-slate-300">
              <span className="text-white font-bold text-sm">{aImportar.length}</span> lead(s) serão importados
            </span>
            {duplicadas > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pularDuplicados} onChange={e => setPularDuplicados(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500" />
                <span className="text-amber-200 text-[11px]">pular {duplicadas} já cadastrado(s) / repetido(s)</span>
              </label>
            )}
            {invalidas > 0 && (
              <span className="text-slate-500 text-[11px]">{invalidas} linha(s) sem nome serão ignoradas</span>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
              Cancelar
            </button>
            <button onClick={importar} disabled={importando || aImportar.length === 0 || semColunaNome}
              className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Importar {aImportar.length} lead(s)
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Resultado ── */}
      {etapa === 'fim' && resultado && (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-white font-semibold text-base">{resultado.criados} lead(s) importados</p>
          <p className="text-slate-400 text-xs max-w-sm">
            {resultado.pulados > 0 && <>{resultado.pulados} pulado(s) por já estarem na base. </>}
            {resultado.invalidos > 0 && <>{resultado.invalidos} linha(s) sem nome ignorada(s). </>}
            {cadenceId ? 'Os toques da régua já estão na Agenda.' : 'Aplique uma régua quando quiser começar os toques.'}
          </p>
          <button onClick={onClose}
            className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-colors">
            Concluir
          </button>
        </div>
      )}
    </Modal>
  )
}
