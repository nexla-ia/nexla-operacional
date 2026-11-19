// Edge Function: nexla-radar-editais
// Busca editais com propostas abertas no PNCP e grava em nexla_editais.
//
// Chamada SÓ pelo banco (nexla_radar_disparar, via pg_net) com o header
// x-nexla-token — cujo hash fica em nexla_integracao_tokens ('radar_cron').
// Corpo: { lote: 'ro1'|'ro2'|'nac1'|'nac2', origem: 'cron'|'botao', encadear: boolean }
//
// Lotes (cada um cabe no limite de tempo da Edge Function):
//   ro1  → Rondônia, páginas 1-5      ro2  → Rondônia, páginas 6-30
//   nac1 → Nacional, palavras 1-5     nac2 → Nacional, palavras 6-10
// Com encadear=true, ao terminar dispara o próximo lote (ro1→ro2→nac1→nac2).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PALAVRAS_NACIONAL = [
  'inteligência artificial',
  'chatbot',
  'assistente virtual',
  'atendimento automatizado',
  'automação de processos',
  'automação robótica',
  'agente virtual',
  'IA generativa',
  'WhatsApp',
  'transformação digital',
]

type Lote = 'ro1' | 'ro2' | 'nac1' | 'nac2'
const LOTES: Record<Lote, { tipo: 'RO' | 'NACIONAL'; de: number; ate: number; proximo: Lote | null }> = {
  ro1:  { tipo: 'RO',       de: 1, ate: 5,  proximo: 'ro2'  },
  ro2:  { tipo: 'RO',       de: 6, ate: 30, proximo: 'nac1' },
  nac1: { tipo: 'NACIONAL', de: 0, ate: 5,  proximo: 'nac2' },
  nac2: { tipo: 'NACIONAL', de: 5, ate: 10, proximo: null   },
}

const BASE           = 'https://pncp.gov.br'
const TAMANHO_PAGINA = 50
const MAX_PAGINAS_KW = 4
const ORCAMENTO_MS   = 120_000   // para de iniciar chamadas depois disso (limite da Edge Function)
const PAUSA_MS       = 2_000     // o PNCP limita requisições (HTTP 429)

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

type Edital = Record<string, unknown>

// ── HTTP com retentativa ─────────────────────────────────────────────────────
// O PNCP derruba conexões com frequência (~40% em rajadas) e devolve 429.
async function getJson(url: string, tentativas: number, prazoFinal: number): Promise<any> {
  let ultimo: unknown
  for (let i = 0; i < tentativas; i++) {
    if (Date.now() > prazoFinal) break
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 45_000)
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return await res.json()
      ultimo = new Error(`HTTP ${res.status}`)
      await pausa(res.status === 429 ? 20_000 : 3_000 * (i + 1))
    } catch (e) {
      ultimo = e
      await pausa(3_000 * (i + 1))
    }
  }
  throw ultimo ?? new Error('tempo esgotado')
}

// Datas do PNCP vêm no horário de Brasília sem fuso
function dataBR(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return s
  return (s.length === 16 ? s + ':00' : s.slice(0, 19)) + '-03:00'
}

const linkPNCP = (cnpj?: string, ano?: unknown, seq?: unknown) =>
  cnpj && ano && seq ? `${BASE}/app/editais/${cnpj}/${ano}/${seq}` : null

// ── Rondônia ────────────────────────────────────────────────────────────────
async function buscarRO(de: number, ate: number, prazoFinal: number, gravar: (e: Edital[]) => Promise<void>, falhas: string[]) {
  const dataFinal = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  for (let pagina = de; pagina <= ate; pagina++) {
    if (Date.now() > prazoFinal) { falhas.push(`tempo esgotado antes da página ${pagina}`); break }
    const url = `${BASE}/api/consulta/v1/contratacoes/proposta?dataFinal=${dataFinal}&uf=RO&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
    let r: any
    try { r = await getJson(url, 5, prazoFinal) }
    catch (e) { falhas.push(`RO página ${pagina}: ${String(e)}`); break }
    const itens: any[] = r?.data ?? []
    await gravar(itens.map(c => ({
      escopo: 'RO', fonte: 'PNCP',
      id_externo:             c.numeroControlePNCP,
      titulo:                 [c.modalidadeNome, c.numeroCompra ? `nº ${c.numeroCompra}/${c.anoCompra}` : null].filter(Boolean).join(' '),
      objeto:                 c.objetoCompra,
      orgao:                  c.orgaoEntidade?.razaoSocial,
      unidade:                c.unidadeOrgao?.nomeUnidade,
      uf:                     c.unidadeOrgao?.ufSigla || 'RO',
      municipio:              c.unidadeOrgao?.municipioNome,
      modalidade:             c.modalidadeNome,
      valor_estimado:         c.valorTotalEstimado ?? null,
      data_publicacao:        dataBR(c.dataPublicacaoPncp),
      abertura_propostas:     dataBR(c.dataAberturaProposta),
      encerramento_propostas: dataBR(c.dataEncerramentoProposta),
      link:                   linkPNCP(c.orgaoEntidade?.cnpj, c.anoCompra, c.sequencialCompra),
      link_origem:            c.linkSistemaOrigem || null,
      palavras_chave:         [],
    })))
    if (pagina >= (r?.totalPaginas ?? 1) || itens.length === 0) break
    await pausa(PAUSA_MS)
  }
}

// ── Nacional ────────────────────────────────────────────────────────────────
async function buscarNacional(de: number, ate: number, prazoFinal: number, gravar: (e: Edital[]) => Promise<void>, falhas: string[]) {
  for (const kw of PALAVRAS_NACIONAL.slice(de, ate)) {
    if (Date.now() > prazoFinal) { falhas.push(`tempo esgotado antes de "${kw}"`); break }
    const q = encodeURIComponent(kw.includes(' ') ? `"${kw}"` : kw)
    for (let pagina = 1; pagina <= MAX_PAGINAS_KW; pagina++) {
      const url = `${BASE}/api/search/?q=${q}&tipos_documento=edital&ordenacao=-data&status=recebendo_proposta&pagina=${pagina}&tam_pagina=${TAMANHO_PAGINA}`
      let r: any
      try { r = await getJson(url, 4, prazoFinal) }
      catch (e) { falhas.push(`"${kw}" página ${pagina}: ${String(e)}`); break }
      const itens: any[] = (r?.items ?? []).filter((it: any) => !it.cancelado && it.numero_controle_pncp)
      await gravar(itens.map(it => {
        const partes = String(it.item_url || '').split('/').filter(Boolean) // compras/<cnpj>/<ano>/<seq>
        return {
          escopo: 'NACIONAL', fonte: 'PNCP',
          id_externo:             it.numero_controle_pncp,
          titulo:                 [it.modalidade_licitacao_nome, it.title].filter(Boolean).join(' · '),
          objeto:                 it.description,
          orgao:                  it.orgao_nome,
          unidade:                it.unidade_nome,
          uf:                     it.uf,
          municipio:              it.municipio_nome,
          modalidade:             it.modalidade_licitacao_nome,
          valor_estimado:         it.valor_global ?? null,
          data_publicacao:        dataBR(it.data_publicacao_pncp),
          abertura_propostas:     dataBR(it.data_inicio_vigencia),
          encerramento_propostas: dataBR(it.data_fim_vigencia),
          link:                   partes.length >= 4 ? linkPNCP(partes[1], partes[2], partes[3]) : null,
          link_origem:            null,
          palavras_chave:         [kw],
        }
      }))
      if (pagina * TAMANHO_PAGINA >= (r?.total ?? 0) || itens.length === 0) break
      await pausa(PAUSA_MS)
    }
    await pausa(PAUSA_MS)
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const inicio = Date.now()
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Autenticação: token da integração (só o banco conhece o token, via Vault)
  const token = req.headers.get('x-nexla-token') ?? ''
  const { data: tk } = await admin.from('nexla_integracao_tokens').select('token_hash').eq('nome', 'radar_cron').maybeSingle()
  if (!token || !tk || tk.token_hash !== await sha256hex(token)) return json({ error: 'nao autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const lote = body.lote as Lote
  const cfg = LOTES[lote]
  if (!cfg) return json({ error: 'lote invalido' }, 400)
  const origem = body.origem === 'botao' ? 'botao' : 'cron'

  const { data: exec } = await admin.from('nexla_radar_execucoes')
    .insert({ lote, origem, status: 'rodando' }).select('id').single()

  const falhas: string[] = []
  const totais = { recebidos: 0, novos: 0, atualizados: 0 }
  const gravar = async (editais: Edital[]) => {
    if (editais.length === 0) return
    const { data, error } = await admin.rpc('nexla_editais_upsert', { p_token: null, p_editais: editais })
    if (error) { falhas.push(`gravação: ${error.message}`); return }
    totais.recebidos += data.recebidos; totais.novos += data.novos; totais.atualizados += data.atualizados
  }

  let erro: string | null = null
  try {
    const prazoFinal = inicio + ORCAMENTO_MS
    if (cfg.tipo === 'RO') await buscarRO(cfg.de, cfg.ate, prazoFinal, gravar, falhas)
    else await buscarNacional(cfg.de, cfg.ate, prazoFinal, gravar, falhas)
  } catch (e) {
    erro = String(e)
  }

  await admin.from('nexla_radar_execucoes').update({
    status: erro ? 'erro' : 'ok', terminado_em: new Date().toISOString(),
    ...totais, falhas, erro,
  }).eq('id', exec?.id)

  // Próximo lote (disparado pelo banco, em segundo plano)
  if (body.encadear && cfg.proximo) {
    const { error: e2 } = await admin.rpc('nexla_radar_disparar', { p_lote: cfg.proximo, p_origem: origem })
    if (e2) falhas.push(`encadear ${cfg.proximo}: ${e2.message}`)
  }

  return json({ lote, origem, ...totais, falhas, erro, duracao_ms: Date.now() - inicio })
})
