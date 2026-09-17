import { useEffect, useState } from 'react'
import { Repeat, Plus, Trash2, Loader2, Star, GripVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CrmCadence, CrmCadenceStep, CrmCanal } from '../../lib/types'
import { CANAIS, canalOf, DEFAULT_CADENCE_STEPS } from './constants'
import Modal from './Modal'

const inputCls = `w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-xs
  placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors`
const selectCls = `${inputCls} [&>option]:bg-slate-900 cursor-pointer`
const rotuloCls = 'block text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1.5'

interface Linha {
  id?:       string
  dia:       number      // "Dia 1" = dia de entrada do lead (offset 0)
  canal:     CrmCanal
  titulo:    string
  descricao: string
}

interface Props {
  cadences:  CrmCadence[]
  steps:     CrmCadenceStep[]
  onClose:   () => void
  onChanged: () => Promise<void> | void
}

export default function CadenciaModal({ cadences, steps, onClose, onChanged }: Props) {
  const [selId, setSelId]       = useState<string | null>(cadences.find(c => c.padrao)?.id ?? cadences[0]?.id ?? null)
  const [nome, setNome]         = useState('')
  const [descricao, setDescricao] = useState('')
  const [padrao, setPadrao]     = useState(false)
  const [linhas, setLinhas]     = useState<Linha[]>([])
  const [removidos, setRemovidos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState('')

  const selecionada = cadences.find(c => c.id === selId) ?? null

  useEffect(() => {
    if (!selecionada) { setNome(''); setDescricao(''); setPadrao(false); setLinhas([]); setRemovidos([]); return }
    setNome(selecionada.nome)
    setDescricao(selecionada.descricao ?? '')
    setPadrao(selecionada.padrao)
    setLinhas(
      steps.filter(s => s.cadence_id === selecionada.id)
        .sort((a, b) => a.dia_offset - b.dia_offset || a.posicao - b.posicao)
        .map(s => ({ id: s.id, dia: s.dia_offset + 1, canal: s.canal, titulo: s.titulo, descricao: s.descricao ?? '' })),
    )
    setRemovidos([])
  }, [selId, cadences, steps])

  const totalDias = linhas.length ? Math.max(...linhas.map(l => l.dia)) : 0

  function alterar(i: number, mudanca: Partial<Linha>) {
    setLinhas(cur => cur.map((l, idx) => (idx === i ? { ...l, ...mudanca } : l)))
  }

  function remover(i: number) {
    const alvo = linhas[i]
    if (alvo.id) setRemovidos(cur => [...cur, alvo.id!])
    setLinhas(cur => cur.filter((_, idx) => idx !== i))
  }

  function adicionar() {
    const ultimo = linhas.length ? Math.max(...linhas.map(l => l.dia)) : 0
    setLinhas(cur => [...cur, { dia: ultimo + 2, canal: 'whatsapp', titulo: '', descricao: '' }])
  }

  async function novaRegua() {
    setSalvando(true)
    const { data, error } = await supabase.from('crm_cadences')
      .insert({ nome: 'Nova régua', descricao: null, padrao: cadences.length === 0 }).select().single()
    if (!error && data) {
      const novaId = (data as CrmCadence).id
      await supabase.from('crm_cadence_steps').insert(
        DEFAULT_CADENCE_STEPS.map(s => ({ ...s, cadence_id: novaId })),
      )
      await onChanged()
      setSelId(novaId)
    }
    setSalvando(false)
  }

  async function excluirRegua() {
    if (!selecionada) return
    if (!confirm(`Excluir a régua "${selecionada.nome}"? As tarefas já criadas continuam na agenda.`)) return
    setSalvando(true)
    await supabase.from('crm_cadences').delete().eq('id', selecionada.id)
    await onChanged()
    setSelId(cadences.find(c => c.id !== selecionada.id)?.id ?? null)
    setSalvando(false)
  }

  async function salvar() {
    if (!selecionada) return
    if (!nome.trim()) { setErro('Dê um nome para a régua.'); return }
    if (linhas.some(l => !l.titulo.trim())) { setErro('Todo toque precisa de um título.'); return }
    setErro('')
    setSalvando(true)

    // Só uma régua pode ser a padrão — é ela que entra pré-selecionada no novo lead.
    if (padrao) await supabase.from('crm_cadences').update({ padrao: false }).neq('id', selecionada.id)
    await supabase.from('crm_cadences')
      .update({ nome: nome.trim(), descricao: descricao.trim() || null, padrao })
      .eq('id', selecionada.id)

    if (removidos.length) await supabase.from('crm_cadence_steps').delete().in('id', removidos)

    const ordenadas = [...linhas].sort((a, b) => a.dia - b.dia)
    const novos  = ordenadas.filter(l => !l.id)
    const antigos = ordenadas.filter(l => l.id)

    await Promise.all(antigos.map(l => supabase.from('crm_cadence_steps').update({
      posicao: ordenadas.indexOf(l), dia_offset: Math.max(0, l.dia - 1),
      canal: l.canal, titulo: l.titulo.trim(), descricao: l.descricao.trim() || null,
    }).eq('id', l.id!)))

    if (novos.length) {
      await supabase.from('crm_cadence_steps').insert(novos.map(l => ({
        cadence_id: selecionada.id, posicao: ordenadas.indexOf(l),
        dia_offset: Math.max(0, l.dia - 1), canal: l.canal,
        titulo: l.titulo.trim(), descricao: l.descricao.trim() || null,
      })))
    }

    await onChanged()
    setSalvando(false)
    setRemovidos([])
  }

  return (
    <Modal titulo="Réguas de follow-up" Icon={Repeat} largura="max-w-4xl"
      subtitulo="A sequência de toques que todo lead novo recebe — vira tarefa com data na Agenda"
      onClose={onClose}>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">{erro}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-5">

        {/* Lista de réguas */}
        <div className="space-y-1.5">
          <label className={rotuloCls}>Réguas</label>
          {cadences.map(c => (
            <button key={c.id} onClick={() => setSelId(c.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-colors
                ${selId === c.id ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30' : 'text-slate-300 hover:bg-white/[0.04]'}`}>
              <span className="flex-1 truncate font-medium">{c.nome}</span>
              {c.padrao && <Star className="w-3 h-3 text-amber-400 shrink-0" />}
            </button>
          ))}
          <button onClick={novaRegua} disabled={salvando}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-white/[0.1] text-slate-400 text-xs hover:border-indigo-500/40 hover:text-indigo-300 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Nova régua
          </button>
        </div>

        {/* Editor */}
        {!selecionada ? (
          <p className="text-slate-500 text-xs py-6">Crie uma régua para começar.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={rotuloCls}>Nome</label>
                <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} placeholder="Régua de Prospecção" />
              </div>
              <div>
                <label className={rotuloCls}>Descrição</label>
                <input className={inputCls} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="6 toques em 10 dias" />
              </div>
            </div>

            <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] cursor-pointer">
              <input type="checkbox" checked={padrao} onChange={e => setPadrao(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
              <span className="text-slate-300 text-xs">Régua padrão — já vem selecionada ao cadastrar um lead novo</span>
            </label>

            {/* Toques */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`${rotuloCls} mb-0`}>
                  Toques {linhas.length > 0 && `· ${linhas.length} em ${totalDias} dia(s)`}
                </label>
                <button onClick={adicionar}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors">
                  <Plus className="w-3 h-3" /> Adicionar toque
                </button>
              </div>

              {linhas.length === 0 && (
                <p className="text-slate-500 text-[11px] py-3">Nenhum toque. Adicione o primeiro contato da régua.</p>
              )}

              <div className="space-y-2">
                {linhas.map((l, i) => {
                  const canal = canalOf(l.canal)
                  return (
                    <div key={l.id ?? `novo-${i}`} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <GripVertical className="w-3.5 h-3.5 text-slate-700 mt-2 shrink-0" />
                      <div className="w-[70px] shrink-0">
                        <input type="number" min={1} className={`${inputCls} px-2 text-center tabular-nums`} value={l.dia}
                          onChange={e => alterar(i, { dia: Math.max(1, Number(e.target.value) || 1) })} />
                        <p className="text-slate-600 text-[9px] text-center mt-1">dia</p>
                      </div>
                      <div className="w-[130px] shrink-0">
                        <select className={selectCls} value={l.canal}
                          onChange={e => alterar(i, { canal: e.target.value as CrmCanal })}>
                          {CANAIS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <p className={`text-[9px] mt-1 text-center ${canal.tone.split(' ')[1]}`}>canal</p>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <input className={inputCls} value={l.titulo} placeholder="Título do toque (ex.: Ligação de apresentação)"
                          onChange={e => alterar(i, { titulo: e.target.value })} />
                        <input className={inputCls} value={l.descricao} placeholder="Orientação para o vendedor (opcional)"
                          onChange={e => alterar(i, { descricao: e.target.value })} />
                      </div>
                      <button onClick={() => remover(i)} title="Remover toque"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="text-slate-500 text-[11px] leading-relaxed">
              O <span className="text-slate-300">dia 1</span> é o dia em que o lead entra. Alterar a régua não mexe nas
              tarefas que já foram criadas — vale para os próximos leads.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={excluirRegua} disabled={salvando}
                className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm hover:bg-red-500/20 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Fechar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar régua
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
