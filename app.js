/* THE BEST MOVELARIA — app.js */
/* Engine de cálculo, navegação, PDF e Supabase */

// ===== SUPABASE CONFIG =====
// INSTRUÇÕES: Substitua as credenciais abaixo pelas suas do Supabase
// Acesse: supabase.com → seu projeto → Settings → API
const SUPABASE_URL = 'https://frcbjkgkindptxopbllf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wgaxidwMB1X9lV5Goi6vKw_INut2BY5';

let supabase = null;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) {
  console.warn('Supabase não configurado — modo offline ativo');
}

// ===== ESTADO GLOBAL =====
let ambienteSelecionado = 'quarto';
let multiplicador = 3;
let imagens = [];
let orcamentoAtual = null;
let orcamentos = JSON.parse(localStorage.getItem('orcamentos') || '[]');

// Tabela paramétrica de chapas (calibrável na tela de Insumos)
let tabelaChapas = {
  'quarto-p': 6, 'quarto-m': 10, 'quarto-g': 14,
  'cozinha-p': 5, 'cozinha-m': 8, 'cozinha-g': 12,
  'banheiro-p': 3, 'banheiro-m': 5, 'banheiro-g': 7,
  'sala-p': 4, 'sala-m': 6, 'sala-g': 9
};

// Preços de MDF
let precosMDF = {
  'branco-6': 200, 'branco-15': 250, 'branco-18': 300,
  'madeirado-6': 320, 'madeirado-15': 450, 'madeirado-18': 500
};

// Preços de ferragens
let precosFerragens = {
  'corredica': 30, 'dobradica': 5, 'puxador': 50
};

let instalacaoPorChapa = 250;

// Carrega configurações salvas localmente
function carregarConfiguracoes() {
  const saved = localStorage.getItem('configuracoes');
  if (saved) {
    const cfg = JSON.parse(saved);
    if (cfg.tabelaChapas) tabelaChapas = { ...tabelaChapas, ...cfg.tabelaChapas };
    if (cfg.precosMDF) precosMDF = { ...precosMDF, ...cfg.precosMDF };
    if (cfg.precosFerragens) precosFerragens = { ...precosFerragens, ...cfg.precosFerragens };
    if (cfg.instalacaoPorChapa) instalacaoPorChapa = cfg.instalacaoPorChapa;
    // Aplica valores na tela de insumos
    document.querySelectorAll('.insumo-input').forEach(inp => {
      const key = inp.dataset.key;
      if (cfg.tabelaChapas && cfg.tabelaChapas[key] !== undefined) inp.value = cfg.tabelaChapas[key];
      if (cfg.precosMDF && cfg.precosMDF[key] !== undefined) inp.value = cfg.precosMDF[key];
      if (cfg.precosFerragens && cfg.precosFerragens[key] !== undefined) inp.value = cfg.precosFerragens[key];
      if (key === 'instalacao-por-chapa') inp.value = instalacaoPorChapa;
    });
  }
}

// ===== NAVEGAÇÃO =====
function navegarPara(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'historico') renderizarHistorico();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navegarPara(item.dataset.page);
  });
});

// ===== AMBIENTE =====
function selecionarAmbiente(btn) {
  document.querySelectorAll('.ambiente-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ambienteSelecionado = btn.dataset.ambiente;
}

// ===== MULTIPLICADOR =====
function setMultiplicador(val) {
  multiplicador = val;
  document.getElementById('multiplicador').value = val;
  syncMultiplicadorBtns();
}

function syncMultiplicadorBtns() {
  multiplicador = parseFloat(document.getElementById('multiplicador').value) || 3;
  document.querySelectorAll('.mult-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.textContent) === multiplicador);
  });
}

// ===== FERRAGENS =====
function adicionarFerragem() {
  const lista = document.getElementById('ferragens-lista');
  const div = document.createElement('div');
  div.className = 'ferragem-item';
  div.innerHTML = `
    <div class="input-row ferragem-row">
      <div class="field">
        <label>Item</label>
        <select class="ferragem-tipo" onchange="atualizarPrecoFerragem(this)">
          <option value="">Selecione...</option>
          <option value="corredica" data-preco="30">Corrediça (par)</option>
          <option value="dobradica" data-preco="5">Dobradiça (un.)</option>
          <option value="puxador" data-preco="50">Puxador Perfil (un.)</option>
          <option value="custom">Outro...</option>
        </select>
      </div>
      <div class="field">
        <label>Qtd</label>
        <input type="number" class="ferragem-qtd" placeholder="0" min="0" value="0">
      </div>
      <div class="field">
        <label>Preço Unit. (R$)</label>
        <input type="number" class="ferragem-preco" placeholder="0,00" min="0" step="0.01">
      </div>
      <button class="btn-remove-ferragem" onclick="removerFerragem(this)" title="Remover">×</button>
    </div>`;
  lista.appendChild(div);
}

function removerFerragem(btn) {
  btn.closest('.ferragem-item').remove();
}

function atualizarPrecoFerragem(sel) {
  const opt = sel.selectedOptions[0];
  const preco = opt.dataset.preco;
  const precoInput = sel.closest('.ferragem-item').querySelector('.ferragem-preco');
  if (preco) precoInput.value = preco;
  if (sel.value === 'custom') {
    precoInput.value = '';
    precoInput.placeholder = 'Informe o preço';
  }
}

// ===== ENGINE DE CÁLCULO =====
function estimarChapas(ambiente, largura, altura) {
  const chavePorte = (largura) => {
    if (ambiente === 'banheiro') {
      if (largura < 1.5) return 'p';
      if (largura <= 2.5) return 'm';
      return 'g';
    }
    if (largura < 2) return 'p';
    if (largura <= 3) return 'm';
    return 'g';
  };
  const porte = chavePorte(largura);
  const chaveBase = `${ambiente}-${porte}`;
  let chapasBase = tabelaChapas[chaveBase] || 8;

  // Ajuste proporcional por altura (base: 2.5m)
  const fatorAltura = altura > 0 ? (altura / 2.5) : 1;
  chapasBase = Math.round(chapasBase * fatorAltura);

  return Math.max(2, chapasBase);
}

function calcularCustoMDF(chapas, mdfCaixaKey, mdfPortaKey, pctPorta) {
  const precoCaixa = precosMDF[mdfCaixaKey] || 250;
  const precoPorta = precosMDF[mdfPortaKey] || 300;
  const pct = (pctPorta || 30) / 100;
  const chapasPorta = Math.ceil(chapas * pct);
  const chapasCaixa = chapas - chapasPorta;
  return (chapasCaixa * precoCaixa) + (chapasPorta * precoPorta);
}

function calcularFerragens() {
  let total = 0;
  document.querySelectorAll('.ferragem-item').forEach(item => {
    const qtd = parseFloat(item.querySelector('.ferragem-qtd').value) || 0;
    const preco = parseFloat(item.querySelector('.ferragem-preco').value) || 0;
    total += qtd * preco;
  });
  return total;
}

function calcular() {
  const largura = parseFloat(document.getElementById('largura').value) || 0;
  const altura = parseFloat(document.getElementById('altura').value) || 0;
  const mdfCaixa = document.getElementById('mdf-caixa').value;
  const mdfPorta = document.getElementById('mdf-porta').value;
  const pctPorta = parseInt(document.getElementById('pct-porta').value) || 30;
  const frete = parseFloat(document.getElementById('frete').value) || 0;
  const instalacaoCustom = document.getElementById('instalacao-custom').value;

  if (!largura || !altura) {
    notificar('Informe a largura e altura do ambiente.', 'error');
    return null;
  }
  if (!mdfCaixa || !mdfPorta) {
    notificar('Selecione o MDF da caixa e das portas.', 'error');
    return null;
  }

  const chapas = estimarChapas(ambienteSelecionado, largura, altura);
  const custoMDF = calcularCustoMDF(chapas, mdfCaixa, mdfPorta, pctPorta);
  const custoFerragens = calcularFerragens();
  const custoInstalacao = instalacaoCustom
    ? parseFloat(instalacaoCustom)
    : chapas * instalacaoPorChapa;
  const custoTotal = custoMDF + custoFerragens + custoInstalacao + frete;
  const precoVenda = custoTotal * multiplicador;
  const margem = precoVenda - custoTotal;

  return {
    chapas, custoMDF, custoFerragens, custoInstalacao,
    frete, custoTotal, precoVenda, margem, multiplicador,
    mdfCaixa, mdfPorta, pctPorta, largura, altura,
    ambiente: ambienteSelecionado
  };
}

function mostrarResumo() {
  const res = calcular();
  if (!res) return;
  orcamentoAtual = res;

  const fmt = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('r-chapas').textContent = res.chapas + ' chapas';
  document.getElementById('r-material').textContent = fmt(res.custoMDF);
  document.getElementById('r-ferragens').textContent = fmt(res.custoFerragens);
  document.getElementById('r-instalacao').textContent = fmt(res.custoInstalacao);
  document.getElementById('r-frete').textContent = fmt(res.frete);
  document.getElementById('r-custo').textContent = fmt(res.custoTotal);
  document.getElementById('r-venda').textContent = fmt(res.precoVenda);
  document.getElementById('r-mult').textContent = res.multiplicador;
  document.getElementById('r-margem').textContent = fmt(res.margem);

  const sec = document.getElementById('resumo-section');
  sec.style.display = 'block';
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== IMAGENS =====
function handleImages(input) {
  const files = Array.from(input.files);
  if (imagens.length + files.length > 3) {
    notificar('Máximo de 3 imagens permitidas.', 'error');
    return;
  }
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagens.push(e.target.result);
      renderizarPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderizarPreviews() {
  const container = document.getElementById('img-preview');
  container.innerHTML = '';
  imagens.forEach((src, i) => {
    const div = document.createElement('div');
    div.className = 'img-thumb';
    div.innerHTML = `<img src="${src}" alt="Imagem ${i+1}"><button class="remove-img" onclick="removerImagem(${i})">×</button>`;
    container.appendChild(div);
  });
}

function removerImagem(idx) {
  imagens.splice(idx, 1);
  renderizarPreviews();
}

// ===== GERAR PDF =====
function gerarPDF() {
  if (!orcamentoAtual) { notificar('Calcule o orçamento primeiro.', 'error'); return; }

  const nome = document.getElementById('cliente-nome').value || 'Cliente';
  const tel = document.getElementById('cliente-tel').value || '';
  const validadeRaw = document.getElementById('validade').value;
  const validade = validadeRaw ? new Date(validadeRaw + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  const obsAmbiente = document.getElementById('obs-ambiente').value || '';
  const res = orcamentoAtual;

  const fmt = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ambienteNome = { quarto: 'Quarto / Guarda-Roupa', cozinha: 'Cozinha', banheiro: 'Banheiro', sala: 'Sala / Home' };
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const numOrc = 'TB' + Date.now().toString().slice(-6);

  const imgSection = imagens.length > 0 ? `
    <div style="margin:28px 0">
      <div style="font-family:'Jost',sans-serif;font-size:9px;color:#9a7a30;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,0.2)">Referências do Projeto</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${imagens.map(src => `<img src="${src}" style="width:${imagens.length === 1 ? '100%' : imagens.length === 2 ? 'calc(50% - 5px)' : 'calc(33% - 7px)'};max-height:200px;object-fit:cover;border-radius:6px;border:1px solid rgba(201,168,76,0.2)" />`).join('')}
      </div>
    </div>` : '';

  const html = `
  <div style="font-family:'Jost',sans-serif;background:#0d0d0d;color:#f8f5ef;padding:0;margin:0;width:794px">

    <!-- CAPA / HEADER -->
    <div style="background:#0d0d0d;padding:44px 52px 32px;border-bottom:1px solid rgba(201,168,76,0.25)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;color:#e2c47a;letter-spacing:4px;line-height:1">THE BEST</div>
          <div style="font-family:'Jost',sans-serif;font-size:10px;color:#9a7a30;letter-spacing:5px;margin-top:2px">MOVELARIA</div>
          <div style="font-size:8px;color:#5a5856;letter-spacing:2px;margin-top:6px">COMPROMISSO · EXCELÊNCIA · CONFIANÇA</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#888680;letter-spacing:1px">ORÇAMENTO Nº</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#c9a84c;letter-spacing:2px">${numOrc}</div>
          <div style="font-size:11px;color:#5a5856;margin-top:4px">Emitido em ${dataHoje}</div>
          ${validade ? `<div style="font-size:11px;color:#9a7a30;margin-top:2px">Válido até ${validade}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- BODY -->
    <div style="padding:36px 52px">

      <!-- PARA -->
      <div style="margin-bottom:28px">
        <div style="font-size:9px;color:#9a7a30;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,0.2)">Para</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;color:#f8f5ef;letter-spacing:1px">${nome}</div>
        ${tel ? `<div style="font-size:12px;color:#888680;margin-top:4px">${tel}</div>` : ''}
      </div>

      <!-- ESPECIFICAÇÕES -->
      <div style="margin-bottom:28px">
        <div style="font-size:9px;color:#9a7a30;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,0.2)">Especificações do Projeto</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:12px;color:#888680;width:180px">Ambiente</td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:13px;color:#f8f5ef;font-weight:500">${ambienteNome[res.ambiente]}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:12px;color:#888680">Dimensões</td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:13px;color:#f8f5ef">${res.largura}m (L) × ${res.altura}m (H)</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:12px;color:#888680">MDF Estrutural</td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:13px;color:#f8f5ef">${formatarMDF(res.mdfCaixa)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:12px;color:#888680">MDF Portas</td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(201,168,76,0.08);font-size:13px;color:#f8f5ef">${formatarMDF(res.mdfPorta)}</td>
          </tr>
          ${obsAmbiente ? `<tr><td style="padding:8px 0;font-size:12px;color:#888680">Observações</td><td style="padding:8px 0;font-size:13px;color:#f8f5ef">${obsAmbiente}</td></tr>` : ''}
        </table>
      </div>

      <!-- IMAGENS -->
      ${imgSection}

      <!-- INVESTIMENTO -->
      <div style="margin-bottom:28px">
        <div style="font-size:9px;color:#9a7a30;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,0.2)">Investimento</div>
        <div style="background:#141414;border:1px solid rgba(201,168,76,0.15);border-radius:10px;padding:24px 28px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid rgba(201,168,76,0.08)">
            <span style="font-size:12px;color:#888680">Material (MDF e acabamentos)</span>
            <span style="font-size:14px;color:#f8f5ef">${fmt(res.custoMDF * res.multiplicador)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid rgba(201,168,76,0.08)">
            <span style="font-size:12px;color:#888680">Ferragens e acessórios</span>
            <span style="font-size:14px;color:#f8f5ef">${fmt(res.custoFerragens * res.multiplicador)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid rgba(201,168,76,0.08)">
            <span style="font-size:12px;color:#888680">Fabricação, montagem e instalação</span>
            <span style="font-size:14px;color:#f8f5ef">${fmt(res.custoInstalacao * res.multiplicador)}</span>
          </div>
          ${res.frete > 0 ? `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid rgba(201,168,76,0.08)"><span style="font-size:12px;color:#888680">Frete e logística</span><span style="font-size:14px;color:#f8f5ef">${fmt(res.frete)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:18px 0 0">
            <span style="font-family:'Cormorant Garamond',serif;font-size:18px;color:#e2c47a;letter-spacing:1px">Total do Investimento</span>
            <span style="font-family:'Cormorant Garamond',serif;font-size:32px;color:#c9a84c;font-weight:400">${fmt(res.precoVenda)}</span>
          </div>
        </div>
      </div>

      <!-- DIFERENCIAIS -->
      <div style="margin-bottom:28px;background:rgba(201,168,76,0.04);border:1px solid rgba(201,168,76,0.15);border-radius:10px;padding:22px 28px">
        <div style="font-size:9px;color:#9a7a30;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px">Por que a The Best Movelaria?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:20px;height:20px;background:rgba(201,168,76,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#c9a84c">✓</div>
            <div><div style="font-size:12px;color:#f8f5ef;font-weight:500">Material Premium</div><div style="font-size:11px;color:#888680;margin-top:2px">MDF de alta qualidade com corte e fitagem profissional</div></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:20px;height:20px;background:rgba(201,168,76,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#c9a84c">✓</div>
            <div><div style="font-size:12px;color:#f8f5ef;font-weight:500">Instalação Especializada</div><div style="font-size:11px;color:#888680;margin-top:2px">Montagem técnica com garantia de qualidade</div></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:20px;height:20px;background:rgba(201,168,76,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#c9a84c">✓</div>
            <div><div style="font-size:12px;color:#f8f5ef;font-weight:500">Projeto Personalizado</div><div style="font-size:11px;color:#888680;margin-top:2px">Desenvolvido sob medida para o seu espaço</div></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:20px;height:20px;background:rgba(201,168,76,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#c9a84c">✓</div>
            <div><div style="font-size:12px;color:#f8f5ef;font-weight:500">Entrega Pontual</div><div style="font-size:11px;color:#888680;margin-top:2px">Cumprimos o prazo combinado, sempre</div></div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      ${validade ? `
      <div style="text-align:center;margin-bottom:28px;padding:20px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:10px">
        <div style="font-family:'Cormorant Garamond',serif;font-size:16px;color:#e2c47a;margin-bottom:6px">Este orçamento é válido até ${validade}</div>
        <div style="font-size:12px;color:#888680">Confirme sua aprovação para garantir disponibilidade e este valor</div>
      </div>` : ''}

    </div>

    <!-- RODAPÉ -->
    <div style="background:#141414;border-top:1px solid rgba(201,168,76,0.2);padding:20px 52px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:14px;color:#9a7a30;letter-spacing:2px">THE BEST MOVELARIA</div>
        <div style="font-size:9px;color:#5a5856;letter-spacing:2px;margin-top:2px">COMPROMISSO · EXCELÊNCIA · CONFIANÇA</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#5a5856">
        <div>Orçamento Nº ${numOrc}</div>
        <div style="margin-top:2px">Emitido em ${dataHoje}</div>
      </div>
    </div>
  </div>`;

  document.getElementById('pdf-content').innerHTML = html;
  document.getElementById('pdf-template').style.display = 'block';

  const opt = {
    margin: 0,
    filename: `Orcamento_TheBest_${nome.replace(/\s+/g, '_')}_${numOrc}.pdf`,
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0d0d0d' },
    jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }
  };

  notificar('Gerando PDF...', '');

  html2pdf().set(opt).from(document.getElementById('pdf-content')).save().then(() => {
    document.getElementById('pdf-template').style.display = 'none';
    notificar('PDF gerado com sucesso!', 'success');
    salvarOrcamento(numOrc, nome);
  });
}

function formatarMDF(key) {
  const map = {
    'branco-6': 'Branco TX 6mm', 'branco-15': 'Branco TX 15mm', 'branco-18': 'Branco TX 18mm',
    'madeirado-6': 'Madeirado 6mm', 'madeirado-15': 'Madeirado 15mm', 'madeirado-18': 'Madeirado 18mm'
  };
  return map[key] || key;
}

// ===== SALVAR ORÇAMENTO =====
async function salvarOrcamento(numOrc, nomeCliente) {
  if (!orcamentoAtual) return;
  const nome = nomeCliente || document.getElementById('cliente-nome').value || 'Cliente';
  const tel = document.getElementById('cliente-tel').value || '';
  const ambienteNome = { quarto:'Quarto', cozinha:'Cozinha', banheiro:'Banheiro', sala:'Sala' };
  const num = numOrc || 'TB' + Date.now().toString().slice(-6);

  const registro = {
    id: Date.now(),
    numero: num,
    cliente: nome,
    telefone: tel,
    ambiente: ambienteNome[orcamentoAtual.ambiente],
    chapas: orcamentoAtual.chapas,
    custo: orcamentoAtual.custoTotal,
    preco: orcamentoAtual.precoVenda,
    margem: orcamentoAtual.margem,
    multiplicador: orcamentoAtual.multiplicador,
    status: 'enviado',
    data: new Date().toLocaleDateString('pt-BR'),
    timestamp: new Date().toISOString()
  };

  // Salva local
  orcamentos.unshift(registro);
  localStorage.setItem('orcamentos', JSON.stringify(orcamentos));

  // Salva no Supabase se configurado
  if (supabase && SUPABASE_URL !== 'SUA_SUPABASE_URL_AQUI') {
    try {
      await supabase.from('orcamentos').insert([{
        numero: registro.numero,
        cliente: registro.cliente,
        telefone: registro.telefone,
        ambiente: registro.ambiente,
        chapas: registro.chapas,
        custo_total: registro.custo,
        preco_venda: registro.preco,
        multiplicador: registro.multiplicador,
        status: registro.status,
        dados_completos: JSON.stringify(orcamentoAtual)
      }]);
    } catch(e) {
      console.warn('Supabase: erro ao salvar', e);
    }
  }

  notificar('Orçamento salvo no histórico!', 'success');
}

// ===== RENDERIZAR HISTÓRICO =====
function renderizarHistorico() {
  const lista = document.getElementById('historico-lista');
  if (!orcamentos.length) {
    lista.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
      <p>Nenhum orçamento salvo ainda</p>
      <button class="btn-gold" onclick="navegarPara('orcamento')">Criar primeiro orçamento</button>
    </div>`;
    return;
  }

  lista.innerHTML = orcamentos.map((o, i) => `
    <div class="historico-item">
      <div class="historico-info">
        <div class="historico-nome">${o.cliente}</div>
        <div class="historico-meta">${o.numero} · ${o.ambiente} · ${o.chapas} chapas · ${o.data}</div>
      </div>
      <div class="historico-valor">R$ ${(o.preco || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
      <select class="status-select" onchange="alterarStatus(${i}, this.value)" style="background:transparent;border:none;font-family:inherit;font-size:12px;cursor:pointer;color:inherit">
        <option value="enviado" ${o.status==='enviado'?'selected':''}>📤 Enviado</option>
        <option value="fechado" ${o.status==='fechado'?'selected':''}>✅ Fechado</option>
        <option value="perdido" ${o.status==='perdido'?'selected':''}>❌ Perdido</option>
      </select>
    </div>`).join('');
}

function alterarStatus(idx, status) {
  orcamentos[idx].status = status;
  localStorage.setItem('orcamentos', JSON.stringify(orcamentos));
  renderizarHistorico();
}

// ===== INSUMOS =====
function salvarInsumos() {
  const inputs = document.querySelectorAll('.insumo-input');
  const cfg = { tabelaChapas: {}, precosMDF: {}, precosFerragens: {} };

  inputs.forEach(inp => {
    const key = inp.dataset.key;
    const val = parseFloat(inp.value);
    if (!isNaN(val)) {
      if (key in tabelaChapas) { cfg.tabelaChapas[key] = val; tabelaChapas[key] = val; }
      else if (key in precosMDF) { cfg.precosMDF[key] = val; precosMDF[key] = val; }
      else if (key in precosFerragens) { cfg.precosFerragens[key] = val; precosFerragens[key] = val; }
      else if (key === 'instalacao-por-chapa') { cfg.instalacaoPorChapa = val; instalacaoPorChapa = val; }
    }
  });

  localStorage.setItem('configuracoes', JSON.stringify(cfg));
  notificar('Preços e tabela atualizados com sucesso!', 'success');
}

function adicionarInsumoCustom() {
  const tbody = document.getElementById('ferragens-tbody');
  const key = 'custom-' + Date.now();
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Nome do item" style="background:transparent;border:none;color:#f8f5ef;font-family:inherit;font-size:13px;width:100%"></td>
    <td><input type="text" placeholder="un." style="background:transparent;border:none;color:#888680;font-family:inherit;font-size:13px;width:60px"></td>
    <td><input type="number" class="insumo-input" data-key="${key}" value="0" step="1"></td>`;
  tbody.appendChild(tr);
}

// ===== RESET =====
function resetForm() {
  document.getElementById('cliente-nome').value = '';
  document.getElementById('cliente-tel').value = '';
  document.getElementById('validade').value = '';
  document.getElementById('largura').value = '';
  document.getElementById('altura').value = '';
  document.getElementById('profundidade').value = '';
  document.getElementById('mdf-caixa').value = '';
  document.getElementById('mdf-porta').value = '';
  document.getElementById('obs-ambiente').value = '';
  document.getElementById('frete').value = '0';
  document.getElementById('instalacao-custom').value = '';
  document.getElementById('multiplicador').value = '3';
  multiplicador = 3;
  imagens = [];
  renderizarPreviews();
  document.getElementById('resumo-section').style.display = 'none';
  document.getElementById('ferragens-lista').innerHTML = '';
  adicionarFerragem();
  document.querySelectorAll('.ambiente-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-ambiente="quarto"]').classList.add('active');
  ambienteSelecionado = 'quarto';
  syncMultiplicadorBtns();
  notificar('Formulário limpo.', '');
}

// ===== NOTIFICAÇÃO =====
let notifTimer = null;
function notificar(msg, tipo) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = 'notification show ' + (tipo || '');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== DATA PADRÃO PARA VALIDADE (30 dias) =====
function setDataPadrao() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  document.getElementById('validade').value = d.toISOString().split('T')[0];
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  carregarConfiguracoes();
  setDataPadrao();
  adicionarFerragem();
  syncMultiplicadorBtns();
});
