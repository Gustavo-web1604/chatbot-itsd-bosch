/**
 * ============================================================================
 * Projeto: ChatBot ITSD | Integração IA Anthropic
 * Desenvolvido por: Gustavo Morais
 * Descrição: Motor de busca inteligente e banco de dados embutido para 
 * roteamento de tickets de suporte (IT Service Desk). 
 * Utiliza 4 camadas de NLP/Regex e API Anthropic como fallback.
 * ============================================================================
 */

// ═══════════════════════════════════════════════════════
//  SYSTEM PROMPT — inclui toda base de dados da Bosch
// ═══════════════════════════════════════════════════════
const SYSTEM = `Você é o ChatBot ITSD 2.0 da Bosch — assistente inteligente do IT Service Desk para a América Latina.

Seu objetivo é identificar o problema relatado pelo usuário e retornar o service correto do catálogo Bosch.

== REGRAS ==
1. Analise o problema descrito e identifique o service mais adequado da base abaixo.
2. Sempre responda em português, de forma objetiva e profissional.
3. Quando identificar um service, formate a resposta EXATAMENTE assim:

[TEXTO EXPLICATIVO BREVE]

SERVICE: [nome exato do service]
TIME: [time responsável]
PLATAFORMA: [plataforma]
PODE FECHAR N1: [SIM ou NÃO]
DESCRIÇÃO: [descrição do uso]
EXEMPLOS: [exemplos de ações]

4. Se houver ambiguidade, faça UMA pergunta objetiva para clarificar.
5. Se não encontrar service compatível, informe educadamente e peça mais detalhes.

== BASE DE SERVIÇOS BOSCH (87 serviços) ==
${Object.entries(DB.services).map(([name, s]) =>
  `• ${name} | Categoria: ${s.categoria} | Time: ${s.time} | Plataforma: ${s.plataforma} | Pode Fechar: ${s.pode_fechar} | Descrição: ${s.descricao} | Exemplos: ${s.exemplos}`
).join('\n')}`;

// ═══════════════════════════════════════════════════════
//  SMART LOOKUP ENGINE — 4 camadas de inteligência
// ═══════════════════════════════════════════════════════

// Camada 1 — Sinônimos contextuais: palavras do dia a dia → termos do catálogo
// A ordem importa: termos mais específicos vêm primeiro
const CONTEXT_RULES = [
  // ── E-mail ─────────────────────────────────────────────────────────────
  { pattern: /quarantine|email externo|email.*cliente|cliente.*email|external.*mail|mail.*external/,   service: 'INTERNET MAIL' },
  { pattern: /criptograf|assinatura digital|email.*criptog|entrust|trust center/,                      service: 'ENTRUST' },
  { pattern: /assinatura.*outlook|outlook.*assinatura|desin kit|eforms/,                               service: 'EFORMS' },
  { pattern: /email|outlook|correio|caixa de entrada|inbox|mailbox|e-mail/,                           service: 'MS OUTLOOK' },

  // ── SAP ────────────────────────────────────────────────────────────────
  { pattern: /imprim.*sap|sap.*imprim|nao imprime.*sap|sap.*nao imprime/,                              service: 'SAP PRINTING' },
  { pattern: /oracle.*bloqueado|bloqueado.*oracle|desbloquear.*oracle|autorizacao.*oracle/,            service: 'RL-ORA-AUTHORIZATION' },
  { pattern: /zeus/,                                                                                   service: 'RL-ORA-ZEUSP' },
  { pattern: /sap.*gui|sapgui|saplogon|logon.*sap|idioma.*sap|tema.*sap|sap.*idioma|sap.*tema|app.*sap|aplicativo.*sap|software.*sap/,  service: 'SAPGUI-SAPLOGON-APPLICATION' },
  { pattern: /\bsap\b/,                                                                                service: 'SAPGUI-SAPLOGON-APPLICATION' },

  // ── Windows / Sistema ─────────────────────────────────────────────────
  { pattern: /windows.*hello|hello.*windows|biometria|desbloqueio.*biometrico|fingerprint/,            service: 'WH4B SERVICE' },
  { pattern: /senha.*admin|admin.*senha|acesso.*admin|liberacao.*admin|admin.*temporar|admin rights/,  service: 'SCCM CLIENT ADMIN RIGHTS |WORLD' },
  { pattern: /atualiz.*windows|windows.*atualiz|falha.*windows|bug.*windows|erro.*windows|windows.*trava/,  service: 'SCCM WINDOWS CLIENT OS' },
  { pattern: /instalar.*software|software.*instalar|instalar.*programa|programa.*instalar|software.*center|software center/,  service: 'SCCM PACKAGE INSTALLATION FAILURE' },
  { pattern: /usb.*bloqueado|bloqueado.*usb|habilitar.*usb|desabilitar.*usb|liberar.*usb|\busb\b/,     service: 'SCCM CLIENT USB ACCESS |WORLD' },
  { pattern: /driver.*hardware|hardware.*driver|controlador.*hardware/,                                service: 'SCCM CLIENT HARDWARE DRIVERS' },
  { pattern: /toolkit|sccm.*agent|it workplace/,                                                       service: 'IT WORKPLACE TOOLKIT AND SCCM AGENT' },

  // ── Senha / Acesso ────────────────────────────────────────────────────
  { pattern: /esqueci.*senha|senha.*esquecida|esqueceu.*senha|nao.*lembro.*senha|bloqueio.*conta|conta.*bloqueada|desbloquear.*conta|desbloqueio/,  service: 'WINDOWS PASSWORD RESET AND UNLOCK' },
  { pattern: /reset.*senha|senha.*reset|redefinir.*senha|trocar.*senha/,                               service: 'WINDOWS PASSWORD RESET AND UNLOCK' },
  { pattern: /mfa|autenticac|dois.*fator|fator.*duplo|verificacao.*dois|2fa|authenticator/,            service: 'MULTIFACTORAUTHENTICATION' },
  { pattern: /oneidm|roles.*acesso|idm.*expert|idm2bcd/,                                               service: 'ONEIDM - SUPPORT' },
  { pattern: /usuario.*externo|external.*collab|acesso.*externo.*usuario|ecu/,                         service: 'EXTERNAL COLLABORATION USER' },
  { pattern: /criar.*usuario|novo.*usuario|alterar.*usuario|deletar.*usuario|owner.*conta|conta.*owner/,  service: 'IDENTITIES (USERS) NEW / CHANGE' },
  { pattern: /keepass|gerenciador.*senha|senha.*keepass/,                                              service: 'KEEPASS' },

  // ── Office / Microsoft 365 ────────────────────────────────────────────
  { pattern: /excel|planilha/,                                                                         service: 'MS EXCEL' },
  { pattern: /powerpoint|apresentacao|pptx/,                                                           service: 'MS POWERPOINT' },
  { pattern: /microsoft project|\bproject\b.*microsoft|ms project/,                                  service: 'MS PROJECT ONLINE DESKTOP CLIENT' },
  { pattern: /teams|microsoft teams|reuniao.*online|videochamada|conferencia.*microsoft/,            service: 'MICROSOFT TEAMS' },
  { pattern: /power bi|powerbi|dashboard.*power|relatorio.*power|dataset/,                           service: 'MICROSOFT POWER BI' },
  { pattern: /fabric|onelake|data.*lake.*microsoft/,                                                 service: 'MICROSOFT FABRIC' },
  { pattern: /m365|microsoft 365|office 365|o365|licenca.*office|office.*geral|365.*core/,            service: 'MICROSOFT 365 CORE' },
  { pattern: /\bword\b/,                                                                               service: 'MICROSOFT 365 CORE' },
  { pattern: /licenca.*m365|m365.*licenca|license.*management/,                                      service: 'LICENSE MANAGEMENT BD' },

  // ── Impressão ─────────────────────────────────────────────────────────
  { pattern: /toner|troca.*toner|suprimento.*impressora/,                                              service: 'MY PRINTER - LOCAL SUPPORT |WORLD' },
  { pattern: /reparo.*impressora|impressora.*quebrada|peca.*impressora|lexmark|hp.*impressora/,        service: 'MY PRINTER - DEVICE REPAIR (MPS) |WORLD' },
  { pattern: /gerenciar.*impressora|administrar.*impressora|job.*impressao|oms/,                       service: 'OMS' },
  { pattern: /impressora.*cloud|cloud.*print|driver.*impressora|instalar.*impressora|conexao.*impressora/,  service: 'CLOUD-PRINTING' },
  { pattern: /impressora/,                                                                             service: 'CLOUD-PRINTING' },

  // ── Computador / Hardware ─────────────────────────────────────────────
  { pattern: /reparo.*computador|computador.*quebrado|defeito.*hardware|bateria.*defeito|notebook.*quebrado|laptop.*quebrado/,  service: 'MY COMPUTER - DEVICE REPAIR' },
  { pattern: /formatar|formata|firewall.*windows|configurar.*computador|suporte.*local.*pc|suporte.*pc/,  service: 'MY COMPUTER - LOCAL SUPPORT |WORLD' },
  { pattern: /informac.*computador|dados.*maquina|checar.*pc|consultar.*equipamento/,                  service: 'MY COMPUTER - CONSULTATION |WORLD' },
  { pattern: /notebook|laptop|computador|maquina.*trabalho|pc.*bosch/,                                service: 'MY COMPUTER - LOCAL SUPPORT |WORLD' },

  // ── Mobile ────────────────────────────────────────────────────────────
  { pattern: /celular.*pessoal|pessoal.*celular|mobile.*workplace.*lite|my.*bosch.*app/,               service: 'MOBILE WORKPLACE LITE' },
  { pattern: /celular.*corporativo|corporativo.*celular|roaming|chip|linha.*celular|mobile.*pim|numero.*celular/,  service: 'MOBILE PIM' },
  { pattern: /celular|smartphone|telefone.*celular/,                                                 service: 'MOBILE PIM' },

  // ── Rede / VPN / WiFi ─────────────────────────────────────────────────
  { pattern: /vpn|corason|acesso.*remoto.*vpn|conexao.*vpn|cisco.*anyconnect/,                        service: 'CORASON' },
  { pattern: /wifi|wi.fi|wireless.*bosch|rede.*sem.*fio/,                                              service: 'WIFI CLIENT SERVICE' },
  { pattern: /ip.*fixo|configurar.*ip|endereco.*ip|criar.*ip/,                                         service: 'LOCAL LAN SUPPORT |AM' },
  { pattern: /infra.*rede|rede.*corporativa|lan.*infra|network.*corp/,                                 service: 'LAN INFRASTRUCTURE SERVICE' },
  { pattern: /site.*bloqueado|acesso.*site|liberacao.*proxy|proxy|site.*bosch.*acesso/,                service: 'INTERNET WEB ACCESS' },
  { pattern: /internet.*acesso|acesso.*internet|\binternet\b/,                                         service: 'INTERNET WEB ACCESS' },

  // ── Sharepoint / OneDrive ─────────────────────────────────────────────
  { pattern: /sharepoint.*externo|acesso.*externo.*share|inside.*share/,                               service: 'INSIDE.SHARE EXTERNAL' },
  { pattern: /sharepoint|share.*point|onedrive/,                                                       service: 'SHAREPOINT ONLINE' },

  // ── Pasta / Arquivo ───────────────────────────────────────────────────
  { pattern: /pasta.*rede|mapear.*drive|drive.*mapear|acesso.*pasta|recuperar.*pasta|file.*share|dfs/,  service: 'FILE SHARE AND DFS SERVICES AM' },

  // ── Active Directory ──────────────────────────────────────────────────
  { pattern: /lista.*distribuicao|distribution.*group|grupo.*email.*ad|grupo.*seguranca.*ad/,        service: 'ACTIVE DIRECTORY GROUP MANAGEMENT |BR' },
  { pattern: /migrar.*grupo.*ad|grupo.*nao.*gerido/,                                                 service: 'MIGRATE UNMANAGED ACTIVE DIRECTORY GROUPS TO ITSP' },

  // ── Virtualização ─────────────────────────────────────────────────────
  { pattern: /maquina.*virtual|virtual.*machine|\bvm\b|citrix.*app|virtual.*workplace/,              service: 'VIRTUAL WORKPLACE' },
  { pattern: /citrix/,                                                                                 service: 'CITRIX WORKSPACE' },
  { pattern: /acesso.*rsa|remote.*shopfloor|shopfloor/,                                                service: 'REMOTE SHOPFLOOR ACCESS - ONBOARDING CONSULTANCY |WORLD' },

  // ── Segurança ─────────────────────────────────────────────────────────
  { pattern: /bitlocker|criptografia.*disco|chave.*recuperacao.*disco/,                                service: 'BITLOCKER' },
  { pattern: /alto.*risco|conta.*risco|bloqueio.*microsoft.*seguranca/,                                service: 'ISY-VST OTRS SUPPORT CERT-INSTANCE' },

  // ── Banco de Dados ────────────────────────────────────────────────────
  { pattern: /sql.*server|banco.*dados.*sql|database.*sql|ms.*sql/,                                  service: 'MS SQL DATABASE' },

  // ── Adobe ─────────────────────────────────────────────────────────────
  { pattern: /adobe|acrobat|pdf.*assinatura|assinar.*pdf/,                                             service: 'ADOBE ACROBAT STANDARD+PROFESSIONAL' },
  { pattern: /docusign|assinatura.*digital.*external|digital.*signature/,                              service: 'DIGITAL SIGNATURE WORKFLOW FOR EXTERNALS' },

  // ── Portal ITSP ───────────────────────────────────────────────────────
  { pattern: /itsp.*formulario|formulario.*itsp|nao.*encontro.*formulario|nao.*acho.*formulario/,      service: 'ITSP-10-CANNOT FIND OR SUBMIT SERVICE REQUEST' },
  { pattern: /status.*requisicao|requisicao.*status|ritm/,                                             service: 'ITSP-20-ORDER STATUS AND DELIVERY' },
  { pattern: /aprovacao.*ticket|ticket.*aprovacao|alterar.*aprovador/,                                 service: 'ITSP-30-APPROVAL AND REJECTION ISSUES' },
  { pattern: /erro.*itsp|falha.*itsp|plataforma.*itsp/,                                                service: 'ITSP-40-TECHNICAL PLATFORM ISSUE' },
  { pattern: /\bitsp\b/,                                                                                 service: 'ITSP-50-OTHER' },

  // ── Deploy / Projetos ─────────────────────────────────────────────────
  { pattern: /track.*release|track.*and.*release|deploy.*projeto|falha.*deploy/,                       service: 'TRACK AND RELEASE' },
  { pattern: /docupedia/,                                                                                service: 'DOCUPEDIA' },
  { pattern: /boschtube|bosch.*tube/,                                                                    service: 'BOSCHTUBE' },

  // ── Outros ────────────────────────────────────────────────────────────
  { pattern: /workon|work.*on|workflow/,                                                                 service: 'WORKON' },
  { pattern: /ecomex|comercio.*exterior/,                                                                service: 'ECOMEX-USERS' },
  { pattern: /eforms|assinatura.*eforms|desin.*kit/,                                                     service: 'EFORMS' },
  { pattern: /eplan|software.*engenharia.*eletrica/,                                                     service: 'EPLAN ELECTRIC' },
  { pattern: /avaya|telefonia.*corporativa|telefone.*fixo/,                                              service: 'AVAYA SERVICE TOOLS' },
  { pattern: /treinamento.*portal|portal.*treinamento|learning.*portal|hrglobal/,                        service: 'HRGLOBAL-LEARNING' },
  { pattern: /pig.*sistema|sistema.*pig|pig.*sap|pig.*sinc/,                                             service: 'PIG_AA_SF_SR' },
  { pattern: /wcms|first.*spirit|cms.*bosch/,                                                            service: 'WCMS INTERNET' },
  { pattern: /windows.*server|servidor.*windows/,                                                        service: 'WINDOWS SERVER SERVICE' },
  { pattern: /igel|thin.*client/,                                                                        service: 'IGEL' },
  { pattern: /arduino/,                                                                                  service: 'ARDUINO IDE' },
  { pattern: /autodesk|licenca.*cad|cad.*licenca/,                                                       service: 'AUTODESK LICENSE' },
  { pattern: /etas.*licenca|licenca.*etas/,                                                              service: 'ETAS BDC SERVICES' },
  { pattern: /ibc.*device|computador.*ibc|internet.*client.*bosch/,                                      service: 'INTUNE WINDOWS INTERNET CLIENT' },
  { pattern: /\bzip\b|compactar|extrair.*arquivo|7-zip|7zip/,                                            service: '7-ZIP' },
];

// Normaliza texto: minúsculas + sem acentos + sem pontuação
function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════
//  NLP HELPER: Distância de Levenshtein (Tolerância a erros)
// ═══════════════════════════════════════════════════════
function calcularDistancia(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matriz = [];
  for (let i = 0; i <= b.length; i++) matriz[i] = [i];
  for (let j = 0; j <= a.length; j++) matriz[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matriz[i][j] = matriz[i - 1][j - 1];
      } else {
        matriz[i][j] = Math.min(
          matriz[i - 1][j - 1] + 1, // Substituição (ex: a -> e)
          matriz[i][j - 1] + 1,     // Inserção
          matriz[i - 1][j] + 1      // Deleção
        );
      }
    }
  }
  return matriz[b.length][a.length];
}

// Verifica se uma palavra digitada é "quase igual" a uma keyword (CALIBRADO)
function isFuzzyMatch(userInput, keyword) {
  const userWords = userInput.split(/\s+/);
  const keyWords = keyword.split(/\s+/);
  
  if (keyWords.length > userWords.length) return false;

  let matchCount = 0;
  for (const kw of keyWords) {
    if (kw.length <= 4) {
      // Palavras curtas (ex: vpn, sap, pdf): exigem acerto EXATO
      if (userWords.includes(kw)) matchCount++;
    } else if (kw.length === 5) {
      // Palavras médias (ex: senha, linha, excel): toleram apenas 1 ERRO
      if (userWords.some(uw => calcularDistancia(kw, uw) <= 1)) matchCount++;
    } else {
      // Palavras longas (ex: impressora, corporativo): toleram até 2 ERROS
      if (userWords.some(uw => calcularDistancia(kw, uw) <= 2)) matchCount++;
    }
  }
  return matchCount === keyWords.length;
}

// ═══════════════════════════════════════════════════════
// MOTOR DE BUSCA LOCAL COM SISTEMA DE PONTUAÇÃO (SCORE)
// ═══════════════════════════════════════════════════════
function localLookup(text) {
  const t = norm(text);
  let melhoresResultados = {}; // Guarda { "NOME_DO_SERVICO": pontuacao }

  // ── Camada 1: Regras contextuais complexas (Regex) -> PESO ALTO (10 pontos) ──
  for (const rule of CONTEXT_RULES) {
    if (rule.pattern.test(t)) {
      melhoresResultados[rule.service] = (melhoresResultados[rule.service] || 0) + 10;
    }
  }

  // ── Camada 2: Keywords da planilha -> PESO MÉDIO ──
  for (const [kw, sname] of Object.entries(DB.keywords)) {
    const kwn = norm(kw);
    const re = new RegExp('(^|\\s)' + kwn.replace(/[-[\]/{}()*+?.\\^$|]/g,'\\$&') + '(\\s|$)');
    
    if (re.test(t) || t.includes(kwn)) {
      // Match exato (palavra escrita perfeitamente) -> 5 pontos
      melhoresResultados[sname] = (melhoresResultados[sname] || 0) + 5;
    } else if (isFuzzyMatch(t, kwn)) {
      // Match aproximado (com erro de digitação aceitável) -> 2 pontos
      melhoresResultados[sname] = (melhoresResultados[sname] || 0) + 2;
    }
  }

  // ── Camada 3: Nome do serviço direto na frase -> PESO BAIXO (3 pontos) ──
  for (const [sname] of Object.entries(DB.services)) {
    const sn = norm(sname);
    if (t.includes(sn)) {
      melhoresResultados[sname] = (melhoresResultados[sname] || 0) + 3;
    }
  }

  // ── AVALIAÇÃO FINAL: Qual serviço somou mais pontos? ──
  let servicoVencedor = null;
  let maiorPontuacao = 0;

  for (const [servico, pontuacao] of Object.entries(melhoresResultados)) {
    // console.log(`[DEBUG] ${servico} fez ${pontuacao} pontos.`); // Remova o '//' se quiser ver a contagem no console do navegador!
    if (pontuacao > maiorPontuacao) {
      maiorPontuacao = pontuacao;
      servicoVencedor = servico;
    }
  }

  // Só retorna o serviço se ele fez pelo menos 2 pontos (evita chutes muito fracos)
  if (servicoVencedor && maiorPontuacao >= 2) {
    return servicoVencedor;
  }

  return null; // Se ninguém pontuou bem, joga para a inteligência da Claude
}

function buildCard(serviceName) {
  const s = DB.services[serviceName];
  if (!s) return '';
  const pfBadge = (s.pode_fechar || '').toUpperCase() === 'SIM'
    ? `<span class="badge badge-sim">SIM</span>`
    : `<span class="badge badge-nao">NÃO</span>`;
  return `<div class="scard">
    <div class="scard-title">Service Identificado</div>
    <div class="scard-row"><span class="scard-label">Serviço:</span><span class="scard-val">${esc(serviceName)}</span></div>
    <div class="scard-row"><span class="scard-label">Time:</span><span class="scard-val">${esc(s.time)}</span></div>
    <div class="scard-row"><span class="scard-label">Plataforma:</span><span class="scard-val">${esc(s.plataforma)}</span></div>
    <div class="scard-row"><span class="scard-label">Pode Fechar N1:</span><span class="scard-val">${pfBadge}</span></div>
    <div class="scard-row"><span class="scard-label">Descrição:</span><span class="scard-val">${esc(s.descricao)}</span></div>
    <div class="scard-row"><span class="scard-label">Exemplos:</span><span class="scard-val">${esc(s.exemplos)}</span></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
//  PARSE AI RESPONSE — extrai bloco SERVICE: ... do texto
// ═══════════════════════════════════════════════════════
function parseAIResponse(text) {
  const match = text.match(/SERVICE:\s*(.+)/i);
  if (!match) return { html: fmtText(text), foundService: null };

  const sname = match[1].trim();
  const intro = text.slice(0, text.indexOf('SERVICE:')).trim();

  // Try exact match first, then partial
  let key = Object.keys(DB.services).find(k => k.toLowerCase() === sname.toLowerCase());
  if (!key) key = Object.keys(DB.services).find(k =>
    k.toLowerCase().includes(sname.toLowerCase()) ||
    sname.toLowerCase().includes(k.toLowerCase())
  );

  const card = key ? buildCard(key) : '';
  return {
    html: (intro ? `<div style="margin-bottom:8px">${fmtText(intro)}</div>` : '') + card,
    foundService: key || null
  };
}

// ═══════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtText(s) {
  return esc(s).replace(/\n/g,'<br>');
}

let history = [];

function addMsg(role, html) {
  const chat = document.getElementById('chat');
  const row = document.createElement('div');
  row.className = `row ${role}`;
  if (role === 'bot') {
    row.innerHTML = `<div class="avatar">IT</div><div class="bubble">${html}</div>`;
  } else {
    row.innerHTML = `<div class="bubble">${html}</div>`;
  }
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function showTyping() {
  const chat = document.getElementById('chat');
  const row = document.createElement('div');
  row.id = 'typing';
  row.className = 'row bot';
  row.innerHTML = `<div class="avatar">IT</div><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div>`;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}
function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

function addChips(chips) {
  const chat = document.getElementById('chat');
  const row = document.createElement('div');
  row.className = 'row bot';
  const html = `<div class="avatar">IT</div><div class="bubble"><div class="chips">${
    chips.map(c => `<button class="chip" onclick="chipClick(this)">${esc(c)}</button>`).join('')
  }</div></div>`;
  row.innerHTML = html;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function chipClick(btn) {
  document.getElementById('inp').value = btn.textContent;
  send();
}

// ═══════════════════════════════════════════════════════
//  MAIN SEND
// ═══════════════════════════════════════════════════════
async function send() {
  const inp = document.getElementById('inp');
  const sbtn = document.getElementById('sbtn');
  const text = inp.value.trim();
  if (!text) return;

  inp.value = ''; inp.style.height = '';
  sbtn.disabled = true;
  addMsg('user', fmtText(text));
  history.push({ role:'user', content: text });

  // ── Fast local keyword match ──
  const local = localLookup(text);
  if (local && DB.services[local]) {
    const s = DB.services[local];
    history.push({ role:'assistant', content:`Service identificado: ${local}` });
    addMsg('bot', `Serviço identificado com base na sua descrição:${buildCard(local)}`);
    sbtn.disabled = false;
    inp.focus();
    return;
  }

  // ── AI fallback ──
  // ── AI fallback (Modo Portfólio / Simulação) ──
  showTyping();
  
  // Usamos um setTimeout para simular o tempo de resposta (delay) de uma API real
  setTimeout(() => {
    hideTyping();
    
    // Resposta padrão demonstrando maturidade técnica
    const reply = "Identifiquei que esta solicitação é complexa e requer análise de contexto profundo. \n\nEm um ambiente de produção real, eu me conectaria agora à API da Claude (Anthropic) passando o nosso System Prompt e o seu histórico para processar a resposta. \n\n*Nota de Portfólio: A chamada real à API foi desativada no frontend para proteger chaves de acesso (Security Best Practices).*";
    
    history.push({ role:'assistant', content: reply });
    
    // Mostra a mensagem na tela usando a nossa função de formatar texto
    addMsg('bot', fmtText(reply));
    
    sbtn.disabled = false;
    inp.focus();
  }, 2000); // O bot vai "pensar" por 2 segundos antes de responder
}

function clearChat() {
  history = [];
  document.getElementById('chat').innerHTML = '';
  boot();
}

// ═══════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════
function boot() {
  addMsg('bot', 'Olá! Sou o ChatBot ITSD, seu assistente de suporte. Descreva seu problema, sistema ou serviço com o máximo de detalhe possível para que eu possa identificar a solicitação e retornar as informações do service relacionado.');
  addChips(['Problema no Teams','Erro no Outlook','VPN não conecta','Impressora com problema','Reset de senha','Problema no SAP']);
}

// ═══════════════════════════════════════════════════════
//  AUTO-RESIZE + ENTER TO SEND
// ═══════════════════════════════════════════════════════
window.onload = () => {
  boot();
  const inp = document.getElementById('inp');
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
};