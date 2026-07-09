/* =====================================================
   🔹 1. CONEXÃO COM O BANCO DE DADOS CENTRAL
===================================================== */
// Usa o cliente inicializado no arquivo supabase.js para evitar conflitos
const supabaseClient = window.supabaseClient;

/* =====================================================
   🔹 FUNÇÕES DO SUPABASE (Otimizadas)
===================================================== */

// Buscar consultas de um paciente específico (Filtro no Backend)
async function buscarConsultasPaciente(cpfPaciente) {
  const { data, error } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("paciente_cpf", cpfPaciente); // O banco filtra, economizando internet e memória

  if (error) {
    console.error("Erro ao buscar consultas:", error);
    return [];
  }
  return data || [];
}

// Buscar profissionais (Direto do Banco)
async function buscarProfissionais() {
  const { data, error } = await supabaseClient
    .from("profissionais")
    .select("*");

  if (error) {
    console.error("Erro ao buscar profissionais:", error);
    return [];
  }
  return data || [];
}

// Buscar prontuários (Direto do Banco)
async function buscarProntuarios() {
  const { data, error } = await supabaseClient
    .from("prontuarios")
    .select("*");

  if (error) {
    console.error("Erro ao buscar prontuários:", error);
    return [];
  }
  return data || [];
}

/* =====================================================
   🔹 CONTROLE DE SESSÃO SEGURO (SUPABASE AUTH)
===================================================== */

// Retorna os dados do usuário logado diretamente do banco, validando a sessão ativa
async function getUsuarioLogado() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) return null;

  // Busca os detalhes completos do paciente na tabela baseado no email autenticado
  const { data: paciente, error } = await supabaseClient
    .from('pacientes')
    .select('*')
    .eq('email', session.user.email)
    .single();

  if (error) return null;
  return paciente;
}

function getProfissionalLogado() {
  try {
    const prof = JSON.parse(localStorage.getItem("profissionalLogado"));
    // Garante que o objeto tenha uma estrutura mínima válida e não seja um resíduo do Firebase
    if (prof && prof.nome) {
      return prof;
    }
    return null;
  } catch {
    return null;
  }
}

/* =====================================================
   🔹 VERIFICAÇÃO DE SESSÃO AUTOMÁTICA
===================================================== */
async function verificarSessao() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const profissional = getProfissionalLogado();

  if (!session && !profissional) {
    return; // Ninguém logado, comportamento normal de visitante
  }

  // O Supabase já gerencia a validade do token.
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    // 👇 CORREÇÃO: Tiramos o 'SIGNED_OUT' daqui para acabar com o loop infinito!
    if (event === 'TOKEN_REFRESHED_FAILED') {
      alert("Sua sessão expirou por segurança. Faça login novamente.");
      encerrarSessao();
    }
  });
}

verificarSessao();

/* =====================================================
   🔹 ENCERRAR SESSÃO
===================================================== */

async function encerrarSessao() {
  await supabaseClient.auth.signOut(); // Destrói o token seguro no backend
  localStorage.removeItem("profissionalLogado"); // Limpa o resquício local
  window.location.href = "index.html";
}

window.sairDaConta = () => encerrarSessao();
window.sairDaContaProf = () => encerrarSessao();

/* =====================================================
   🔹 UTILITÁRIOS
===================================================== */

function formatarNome(nome) {
  return nome.toLowerCase().split(' ').map(palavra =>
    palavra.charAt(0).toUpperCase() + palavra.slice(1)
  ).join(' ');
}

function escaparHTML(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =====================================================
   🔹 3. VARIÁVEIS GLOBAIS E DASHBOARD DO PACIENTE
===================================================== */
let profissionalAtual = null;
let dataSelecionada = null;
let horarioSelecionado = null;
let consultaParaCancelar = null;

window.atualizarDashboardPaciente = async function () {
  const dashboardSection = document.getElementById("dashboardSection");
  if (!dashboardSection || dashboardSection.classList.contains("hidden")) return;

  // Busca o usuário seguro direto do banco/auth
  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return;

  const fotoSidebar = document.getElementById("fotoPerfilSidebar");
  if (fotoSidebar && usuarioLogado.foto_perfil_url) {
    fotoSidebar.src = usuarioLogado.foto_perfil_url;
  }

  // OTIMIZAÇÃO DE BACKEND: Só puxa as consultas deste CPF específico
  const minhasConsultas = await buscarConsultasPaciente(usuarioLogado.cpf);

  const jaTeveConsultaFinalizada = minhasConsultas.some(c => c.status_geral === 'finalizada');
  const menuPacote = document.getElementById('menuAgendarPacote');

  if (menuPacote) {
    // 1. Garante que o item do menu fique sempre visível na tela
    menuPacote.style.display = 'block';

    // 2. Pega o link clicável que está dentro do menu
    const linkPacote = menuPacote.querySelector('a');

    if (linkPacote) {
      if (!jaTeveConsultaFinalizada) {
        // REGRA PARA PACIENTE NOVO (BOTÃO BLOQUEADO)
        linkPacote.style.opacity = '0.5'; // Deixa o texto meio transparente
        linkPacote.style.cursor = 'not-allowed'; // Ícone de mouse bloqueado
        linkPacote.title = 'Disponível após finalizar a sua primeira consulta'; // Mensagem ao passar o mouse

        // Corta a ação do clique original
        linkPacote.onclick = function (event) {
          event.preventDefault();
          return false;
        };
      } else {
        // REGRA PARA PACIENTE VETERANO (BOTÃO LIBERADO)
        linkPacote.style.opacity = '1'; // Cor normal do texto
        linkPacote.style.cursor = 'pointer'; // Ícone de mouse normal (mãozinha)
        linkPacote.removeAttribute('title'); // Remove a mensagem flutuante

        // Devolve a função de abrir o pacote ao clicar
        linkPacote.onclick = function (event) {
          event.preventDefault();
          abrirTermosPacote();
        };
      }
    }
  }

  const listaDiv = document.getElementById("listaConsultas");
  const totalConsultasText = document.getElementById("totalConsultasText");
  const proximaConsultaText = document.getElementById("proximaConsultaText");

  if (totalConsultasText) totalConsultasText.innerText = minhasConsultas.length;

  const agora = new Date();
  let proximas = minhasConsultas.filter(c => {
    const [ano, mes, dia] = c.data.split("-");
    const [h, m] = c.hora.split(":");
    const dataC = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m));
    return dataC >= agora;
  });

  if (proximas.length > 0) {
    proximas.sort((a, b) => new Date(a.data + "T" + a.hora) - new Date(b.data + "T" + b.hora));

    // CORREÇÃO 1: Adicionado o que havia sumido!
    const [ano, mes, dia] =
      proximas[0].data.split("-");
    if (proximaConsultaText) proximaConsultaText.innerText = `${dia}/${mes}/${ano} às ${proximas[0].hora}`;
  } else {
    if (proximaConsultaText) proximaConsultaText.innerText = "Nenhuma agendada";
  }

  // CORREÇÃO 2: Removida a duplicação. Bloco único de renderização abaixo!
  if (listaDiv) {
    if (minhasConsultas.length === 0) {
      listaDiv.innerHTML = "<p>Você ainda não possui consultas agendadas.</p>";
    } else {
      listaDiv.innerHTML = "";
      minhasConsultas.forEach(consulta => {
        const [ano, mes, dia] = consulta.data.split("-");
        const [h, m] = consulta.hora.split(":");
        const dataConsulta = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m));

        let minFim = parseInt(m) + 50;
        let hFim = parseInt(h);
        if (minFim >= 60) { hFim += 1; minFim -= 60; }
        const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

        let classePassada = "";

        const tempoConsulta = dataConsulta.getTime();
        const dezMinAntes = tempoConsulta - (10 * 60 * 1000);
        const tempoFim = tempoConsulta + (50 * 60 * 1000);
        const tempo24hAntes = tempoConsulta - (24 * 60 * 60 * 1000);

        let btnReagendar = "";
        let num_reagendamentos = consulta.num_reagendamentos || 0;

        if (agora.getTime() >= tempo24hAntes) {
          btnReagendar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 13px; padding: 10px 5px;" disabled title="Não é possível reagendar com menos de 24h de antecedência.">🔄 Reagendar (Bloqueado)</button>`;
        } else if (num_reagendamentos >= 2) {
          btnReagendar = `<button style="flex: 1; margin: 0; background-color: #d9534f; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; padding: 10px 5px;" onclick="abrirModalReagendar( '${encodeURIComponent(consulta.profissional)}', '${encodeURIComponent(consulta.data)}', '${encodeURIComponent(consulta.hora)}')">🔄 Reagendar (Bloqueado)</button>`;
        } else {
          btnReagendar = `<button style="flex: 1; margin: 0; background-color: #0E5F73; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; padding: 10px 5px;" onclick="abrirModalReagendar( '${encodeURIComponent(consulta.profissional)}', '${encodeURIComponent(consulta.data)}', '${encodeURIComponent(consulta.hora)}')">🔄 Reagendar</button>`;
        }

        let btnCancelar = "";
        if (agora.getTime() >= tempo24hAntes) {
          btnCancelar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 13px; padding: 10px 5px;" disabled title="Não é possível cancelar com menos de 24h de antecedência.">❌ Cancelar (Bloqueado)</button>`;
        } else {
          btnCancelar = `<button class="btn-cancelar" style="flex: 1; margin: 0; font-size: 13px; padding: 10px 5px;" onclick="abrirModalCancelar('${consulta.profissional}', '${consulta.data}', '${consulta.hora}')">❌ Cancelar</button>`;
        }
        let btnMeet = `<button class="btn-primary btn-disabled" style="flex: 1; margin: 0; font-size: 13px; padding: 10px 5px;" disabled title="O botão estará ativo 10 minutos antes do horário agendado.">Iniciar Consulta</button>`;

        let botoesRender = "";

        if (consulta.status_geral === 'finalizada') {
          classePassada = "consulta-inativa consulta-finalizada";
          botoesRender = `<p style="color: #2E7D32; font-weight: bold; margin-top: 10px; text-decoration: none !important;">✅ Atendido</p>`;
        } else if (consulta.status_geral === 'ausente') {
          classePassada = "consulta-inativa consulta-ausente";
          botoesRender = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px; text-decoration: none !important;">❌ Não compareceu</p>`;
        } else if (agora.getTime() >= tempoFim) {
          classePassada = "consulta-inativa consulta-esgotada";
          botoesRender = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px; text-decoration: none !important;">Consulta Encerrada</p>`;
        } else {
          if (agora.getTime() >= dezMinAntes) {
            if (consulta.status_paciente === 'na_sala') {
              btnMeet = `<button class="btn-primary" style="flex: 1; margin: 0; background: #2E7D32; font-size: 13px; padding: 10px 5px;" onclick="window.open('${consulta.meet_link}', '_blank')">Retornar à Chamada</button>`;
            } else {
              btnMeet = `<button class="btn-primary" style="flex: 1; margin: 0; font-size: 13px; padding: 10px 5px;" onclick="entrarNaChamada('${consulta.profissional}', '${consulta.data}', '${consulta.hora}')">Iniciar Consulta</button>`;
            }
          }
          botoesRender = `<div style="display: flex; gap: 8px; margin-top: 15px; width: 100%;">${btnReagendar}${btnCancelar}${btnMeet}</div>`;
        }

        listaDiv.innerHTML += `
        <div class="consulta-card ${classePassada}">
            <h3>${escaparHTML(consulta.profissional)}</h3>
            <p>📅 <strong>Data:</strong> ${dia}/${mes}/${ano}</p>
            <p>⏰ <strong>Horário:</strong> ${consulta.hora} às ${horaFimStr}</p>
            ${botoesRender}
        </div>
      `;
      });
    }
  }
}
/* =====================================================
   🧑‍⚕️ DASHBOARD DO PROFISSIONAL (BACKEND OTIMIZADO)
===================================================== */

window.abaProfissionalAtual = localStorage.getItem("abaProfissionalAtual") || "tabProfPendentes";

window.atualizarDashboardProfissional = async function () {
  const profLogado = getProfissionalLogado();
  const mural = document.getElementById("listaConsultasProf");

  if (!profLogado || !mural) return;

  // 👇 OTIMIZAÇÃO: Busca apenas as consultas deste profissional específico no Supabase
  const { data: agendamentosRaw, error } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("profissional", profLogado.nome);

  if (error) {
    console.error("Erro ao buscar consultas do profissional:", error);
    mural.innerHTML = `<p style="grid-column: 1 / -1; color: #d9534f; text-align: center; padding: 20px;">Erro ao carregar dados do servidor.</p>`;
    return;
  }

  mural.innerHTML = "";

  if (!agendamentosRaw || agendamentosRaw.length === 0) {
    mural.innerHTML = `<p style="grid-column: 1 / -1; color: #555; text-align: center; padding: 20px;">Você não tem consultas.</p>`;
    return;
  }

  let minhasConsultas = agendamentosRaw;
  const agora = new Date();

  // 1. AUTO-LIMPEZA VISUAL E AUTOMÁTICA (Atualizado)
  minhasConsultas.forEach(c => {
    if (c.status_geral === 'agendada') {
      const [ano, mes, dia] = c.data.split("-");
      const [h, m] = c.hora.split(":");
      // 90 minutos = Tempo limite máximo para o sistema considerar a consulta "vencida"
      const limiteTolerancia = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m)).getTime() + (90 * 60 * 1000);

      if (agora.getTime() >= limiteTolerancia) {
        if (c.status_profissional === 'na_sala') {
          // O médico entrou na sala, mas esqueceu de clicar em "Finalizar"
          c.status_geral = 'finalizada';
          // Salva no banco de dados silenciosamente para arrumar a aba
          supabaseClient.from("consultas").update({ status_geral: "finalizada" }).eq("id", c.id).then();
        } else {
          // O médico nunca entrou na sala
          c.status_geral = 'ausente';
          supabaseClient.from("consultas").update({ status_geral: "ausente" }).eq("id", c.id).then();
        }
      }
    }
  });

  // 2. ORDENAÇÃO E SEPARAÇÃO EM ABAS
  const ordenarFuturas = (lista) => {
    return lista.sort((a, b) => new Date(a.data + "T" + a.hora.substring(0, 5)).getTime() - new Date(b.data + "T" + b.hora.substring(0, 5)).getTime());
  };
  const ordenarPassadas = (lista) => {
    return lista.sort((a, b) => new Date(b.data + "T" + b.hora.substring(0, 5)).getTime() - new Date(a.data + "T" + a.hora.substring(0, 5)).getTime());
  };

  let pendentes = ordenarFuturas(minhasConsultas.filter(c => c.status_geral === 'agendada'));
  let realizadas = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'finalizada'));
  let canceladas = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'cancelada' || c.status_geral === 'cancelada_reembolso'));
  let ausentes = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'ausente'));

  // 3. IDENTIFICAÇÃO GLOBAL DOS PACOTES E NUMERAÇÃO CRONOLÓGICA
  let historicoPacotesIDs = [];
  let contadorSessoes = {};

  // 👇 Ordena no tempo (do mais antigo pro mais novo) antes de contar
  let consultasCrescente = [...minhasConsultas].sort((a, b) => new Date(a.data + "T" + a.hora).getTime() - new Date(b.data + "T" + b.hora).getTime());

  consultasCrescente.forEach(c => {
    if (c.is_pacote) {
      let chavePacote = c.pacote_id || c.paciente_cpf;
      if (!historicoPacotesIDs.includes(chavePacote)) historicoPacotesIDs.push(chavePacote);

      if (!contadorSessoes[chavePacote]) contadorSessoes[chavePacote] = 0;
      contadorSessoes[chavePacote]++;

      let original = minhasConsultas.find(orig => orig.id === c.id);
      if (original) {
        original.pacoteIndexGlobal = historicoPacotesIDs.indexOf(chavePacote) + 1;
        original.sessaoNumeroCalculada = contadorSessoes[chavePacote];
      }
    }
  });

  // 👇 OTIMIZAÇÃO: Busca rápida de usuários para cruzar com as consultas (Isso pode virar um JOIN SQL no futuro)
  const { data: usuarios } = await supabaseClient.from("pacientes").select("cpf, nome");

  // 4. FUNÇÃO DE RENDERIZAR O CARTÃO
  const gerarHTMLCartaoProf = (c) => {
    const [ano, mes, dia] = c.data.split("-");
    const [h, m] = c.hora.split(":");
    const tempoConsulta = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m)).getTime();
    const inicioLiberado = tempoConsulta - (10 * 60 * 1000);
    const tempoParaPoderFinalizar = tempoConsulta + (30 * 60 * 1000);
    const tempoFimComTolerancia = tempoConsulta + (90 * 60 * 1000);

    let minFim = parseInt(m) + 50;
    let hFim = parseInt(h);
    if (minFim >= 60) { hFim += 1; minFim -= 60; }
    const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

    let avisoPacoteHTML = "";
    if (c.is_pacote) {
      avisoPacoteHTML = `<div style="background: #ffe3e3; color: #e63946; padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 10px; display: inline-block;">📦 Sessão ${c.sessaoNumeroCalculada || '?'}/4 do Pacote N° ${c.pacoteIndexGlobal || ''}</div>`;
    }

    let btnProf = "";
    let classePassada = "";

    if (c.status_geral === 'finalizada') {
      classePassada = "consulta-inativa consulta-finalizada";
      btnProf = `<p style="color: #2E7D32; font-weight: bold; margin-top: 10px;">✅ Consulta Finalizada</p>`;
    } else if (c.status_geral === 'ausente') {
      classePassada = "consulta-inativa consulta-ausente";
      btnProf = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px;">❌ Não compareceu</p>`;
    } else if (c.status_geral === 'cancelada' || c.status_geral === 'cancelada_reembolso') {
      classePassada = "consulta-inativa";
      btnProf = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px;">🛑 Cancelada</p>`;
    } else if (agora.getTime() >= tempoFimComTolerancia) {
      classePassada = "consulta-inativa consulta-esgotada";
      btnProf = `<p style="color: #888; font-weight: bold; margin-top: 10px;">Tempo Esgotado</p>`;
    } else {
      if (agora.getTime() < inicioLiberado) {
        btnProf = `<button style="width: 100%; margin-top: 15px; padding: 10px; background: #999; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: not-allowed;" disabled>Aguardando horário...</button>`;
      } else {
        if (c.status_profissional === 'na_sala') {
          btnProf = `<button style="width: 100%; margin-top: 15px; padding: 10px; background: #2E7D32; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;" onclick="entrarNaChamadaProfissional('${c.profissional}', '${c.data}', '${c.hora}')">Retornar à Chamada</button>`;
          if (agora.getTime() >= tempoParaPoderFinalizar) {
            btnProf += `<button style="width: 100%; margin-top: 10px; padding: 10px; background: #28a745; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;" onclick="finalizarConsulta('${c.profissional}', '${c.data}', '${c.hora}')">Finalizar Consulta</button>`;
          } else {
            btnProf += `<button style="width: 100%; margin-top: 10px; padding: 10px; background: #888; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: not-allowed;" disabled title="Só é possível finalizar a consulta após 30 minutos do início da sessão.">Finalizar Bloqueado</button>`;
          }
        } else {
          btnProf = `<button style="width: 100%; margin-top: 15px; padding: 10px; background: #0F766E; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;" onclick="entrarNaChamadaProfissional('${c.profissional}', '${c.data}', '${c.hora}')">Iniciar Consulta</button>`;
        }
      }
    }

    let cpfConsultaLimpo = String(c.paciente_cpf || "").replace(/\D/g, "");
    let pacienteEncontrado = usuarios ? usuarios.find(u => String(u.cpf || "").replace(/\D/g, "") === cpfConsultaLimpo) : null;
    let nomeDoPaciente = pacienteEncontrado ? pacienteEncontrado.nome : "Paciente não identificado";

    return `
      <div class="consulta-card ${classePassada}" style="border-left: 5px solid #0F766E; position: relative; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 15px;">
          ${avisoPacoteHTML}
          <h3 style="color: #0F4C5C; margin-bottom: 5px; font-size: 17px;">👤 ${escaparHTML(nomeDoPaciente)}</h3>
          <p style="margin-bottom: 5px; color: #555; font-size: 14px;">📅 <strong>Data:</strong> ${dia}/${mes}/${ano}</p>
          <p style="margin-bottom: 5px; color: #555; font-size: 14px;">⏰ <strong>Horário:</strong> ${c.hora} às ${horaFimStr}</p>
          ${btnProf}
          
          <button class="btn-primary" style="width: 100%; margin-top: 10px; background: #17a2b8;" onclick="abrirProntuario('${c.paciente_cpf}', '${escaparHTML(nomeDoPaciente)}')">📝 Prontuário</button>
      </div>
    `;
  };

  const renderAba = (lista) => {
    if (lista.length === 0) return `<p style="grid-column: 1 / -1; color: #777; text-align: center; padding: 20px;">Nenhuma consulta nesta categoria.</p>`;
    let html = '<div class="consultas-grid" style="grid-column: 1 / -1;">';
    lista.forEach(c => { html += gerarHTMLCartaoProf(c); });
    html += '</div>';
    return html;
  };

  let menuAbas = `
    <div style="grid-column: 1 / -1; display: flex; overflow-x: auto; gap: 15px; border-bottom: 2px solid #ddd; padding-bottom: 0px; margin-bottom: 25px; scrollbar-width: thin;">
        <button id="btn-tabProfPendentes" class="btn-aba-prof" onclick="mudarAbaConsultasProf('tabProfPendentes')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; border-bottom: 3px solid #0F766E; color: #0F766E; font-weight: bold;">📅 Agendadas</button>
        <button id="btn-tabProfRealizadas" class="btn-aba-prof" onclick="mudarAbaConsultasProf('tabProfRealizadas')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">✅ Concluídas</button>
        <button id="btn-tabProfCanceladas" class="btn-aba-prof" onclick="mudarAbaConsultasProf('tabProfCanceladas')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">🛑 Canceladas</button>
        <button id="btn-tabProfAusentes" class="btn-aba-prof" onclick="mudarAbaConsultasProf('tabProfAusentes')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">⚠️ Ausências</button>
    </div>
  `;

  mural.innerHTML = menuAbas + `
    <div id="tabProfPendentes" class="tab-content-prof" style="display: block; grid-column: 1 / -1;">
        ${renderAba(pendentes)}
    </div>
    <div id="tabProfRealizadas" class="tab-content-prof" style="display: none; grid-column: 1 / -1;">
        ${renderAba(realizadas)}
    </div>
    <div id="tabProfCanceladas" class="tab-content-prof" style="display: none; grid-column: 1 / -1;">
        ${renderAba(canceladas)}
    </div>
    <div id="tabProfAusentes" class="tab-content-prof" style="display: none; grid-column: 1 / -1;">
        ${renderAba(ausentes)}
    </div>
  `;

  const abaSalva = window.abaProfissionalAtual;
  if (!abaSalva) {
    window.abaProfissionalAtual =
      "tabProfPendentes";
  }

  window.mudarAbaConsultasProf = function (abaId) {

    window.abaProfissionalAtual = abaId;

    localStorage.setItem(
      "abaProfissionalAtual",
      abaId
    );

    document.querySelectorAll(".tab-content-prof")
      .forEach(tab => {
        tab.style.display = "none";
      });

    document.querySelectorAll(".btn-aba-prof")
      .forEach(btn => {
        btn.style.borderBottom = "none";
        btn.style.color = "#777";
        btn.style.fontWeight = "normal";
      });

    const aba =
      document.getElementById(abaId);

    if (aba) {
      aba.style.display = "block";
    }

    const botao =
      document.getElementById("btn-" + abaId);

    if (botao) {
      botao.style.borderBottom =
        "3px solid #0F766E";

      botao.style.color = "#0F766E";

      botao.style.fontWeight = "bold";
    }
  };

  document.querySelectorAll(".tab-content-prof").forEach(tab => {
    tab.style.display = "none";
  });

  document.querySelectorAll(".btn-aba-prof").forEach(btn => {
    btn.style.borderBottom = "none";
    btn.style.color = "#777";
    btn.style.fontWeight = "normal";
  });

  const abaAtiva = document.getElementById(abaSalva);
  if (abaAtiva) {
    abaAtiva.style.display = "block";
  }

  const botaoAtivo = document.getElementById("btn-" + abaSalva);
  if (botaoAtivo) {
    botaoAtivo.style.borderBottom = "3px solid #0F766E";
    botaoAtivo.style.color = "#0F766E";
    botaoAtivo.style.fontWeight = "bold";
  }
};

/* =====================================================
   🔹 CONTROLE DE PÁGINAS E SESSÃO (Ao carregar o HTML)
===================================================== */
document.addEventListener("DOMContentLoaded", async function () {

  const authSection = document.getElementById("secaoAutenticacao");
  const dashboardSection = document.getElementById("dashboardSection");
  const authProfSection = document.getElementById("secaoAutenticacaoProf");
  const dashboardProfSection = document.getElementById("dashboardProfSection");

  // 👇 OTIMIZAÇÃO: Usa as funções seguras do Bloco 1 👇
  const usuarioLogado = await getUsuarioLogado();
  const profLogado = getProfissionalLogado();

  // --- LÓGICA DA ÁREA DO PACIENTE ---
  if (window.location.pathname.includes("area-paciente")) {
    if (profLogado) {
      if (authSection) {
        authSection.innerHTML = `
          <div class="auth-container">
            <div class="auth-card active" style="text-align: center; max-width: 400px; padding: 40px;">
              <h2 style="color: #d9534f; margin-bottom: 15px;">Acesso Negado</h2>
              <p style="color: #555; margin-bottom: 20px; font-weight: 600;">Esta página é exclusiva para pacientes cadastrados.</p>
              <button class="btn-primary btn-full" onclick="window.location.href='area-profissional.html'">Ir para minha área de Profissional</button>
              <button class="btn-secondary btn-full" style="margin-top: 10px; background: #888;" onclick="sairDaContaProf()">Sair da conta atual</button>
            </div>
          </div>
        `;
        authSection.style.display = "flex";
      }
      if (dashboardSection) dashboardSection.classList.add("hidden");
      return;
    }

    if (usuarioLogado) {
      if (authSection) authSection.style.display = "none";
      if (dashboardSection) dashboardSection.classList.remove("hidden");

      if (document.getElementById("nomePacienteDashboard")) document.getElementById("nomePacienteDashboard").innerText = `Olá, ${formatarNome(usuarioLogado.nome)}!`;
      if (document.getElementById("nomeSidebar")) document.getElementById("nomeSidebar").innerText = usuarioLogado.nome.toUpperCase();
      if (document.getElementById("fotoPerfilSidebar") && usuarioLogado.foto_perfil_url) {
        document.getElementById("fotoPerfilSidebar").src = usuarioLogado.foto_perfil_url;
      }

      if (window.atualizarDashboardPaciente) window.atualizarDashboardPaciente();
      if (window.atualizarContadorPacote) window.atualizarContadorPacote();
      if (window.carregarMinhasConsultas) window.carregarMinhasConsultas();
    } else {
      if (authSection) authSection.style.display = "flex";
      if (dashboardSection) dashboardSection.classList.add("hidden");
    }
  }

  // --- LÓGICA DA ÁREA DO PROFISSIONAL ---
  if (window.location.pathname.includes("area-profissional")) {
    if (usuarioLogado) {
      if (authProfSection) {
        authProfSection.innerHTML = `
          <div class="auth-container">
            <div class="auth-card active" style="text-align: center; max-width: 400px; padding: 40px;">
              <h2 style="color: #d9534f; margin-bottom: 15px;">Acesso Negado</h2>
              <p style="color: #555; margin-bottom: 20px; font-weight: 600;">Esta página é exclusiva para profissionais cadastrados.</p>
              <button class="btn-primary btn-full" onclick="window.location.href='area-paciente.html'">Ir para minha área de Paciente</button>
              <button class="btn-secondary btn-full" style="margin-top: 10px; background: #888;" onclick="sairDaConta()">Sair da conta atual</button>
            </div>
          </div>
        `;
        authProfSection.classList.remove("hidden");
      }
      if (dashboardProfSection) dashboardProfSection.classList.add("hidden");
      return;
    }

    if (profLogado) {
      if (authProfSection) authProfSection.classList.add("hidden");
      if (dashboardProfSection) dashboardProfSection.classList.remove("hidden");

      if (document.getElementById("nomeProfDashboard")) document.getElementById("nomeProfDashboard").innerText = `Olá, ${profLogado.nome}!`;
      if (document.getElementById("nomeSidebarProf")) document.getElementById("nomeSidebarProf").innerText = profLogado.nome.toUpperCase();

      const fotoExibicao = document.getElementById("fotoPerfilSidebar");
      if (fotoExibicao && profLogado.foto_perfil_url) {
        fotoExibicao.src = profLogado.foto_perfil_url;
      }

      if (window.atualizarDashboardProfissional) window.atualizarDashboardProfissional();
    } else {
      if (authProfSection) authProfSection.classList.remove("hidden");
      if (dashboardProfSection) dashboardProfSection.classList.add("hidden");
    }
  }

  // --- LOGIN DO PACIENTE (SUPABASE AUTH) ---
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const cpf = document.getElementById("cpfLogin").value.replace(/\D/g, "");
      const senha = document.getElementById("senhaLogin").value;

      try {
        // 1. Busca o e-mail do paciente pelo CPF
        const { data: paciente, error: pacienteError } = await supabaseClient
          .from('pacientes')
          .select('email')
          .eq('cpf', cpf)
          .single();

        if (pacienteError || !paciente) {
          alert("Paciente não encontrado.");
          return;
        }

        // 2. Realiza o login seguro via Supabase Auth
        const { error } = await supabaseClient.auth.signInWithPassword({
          email: paciente.email,
          password: senha
        });

        if (error) {
          alert("Senha incorreta.");
          return;
        }

        // 👇 Removido o localStorage. O Supabase já gerencia a sessão de forma segura. 👇
        window.location.reload();

      } catch (err) {
        console.error("Erro ao realizar login.", err);
        alert("Erro ao realizar login.");
      }
    }
    );
  }

  // --- LOGIN DO PROFISSIONAL (BACKEND) ---
  const formLoginProf = document.getElementById("formLoginProf");
  if (formLoginProf) {
    formLoginProf.addEventListener("submit", async function (event) {
      event.preventDefault();
      const registro = document.getElementById("registroProfLogin").value.trim();
      const senha = document.getElementById("senhaProfLogin").value;

      // 👇 OTIMIZAÇÃO: Consulta diretamente a tabela de profissionais no Supabase 👇
      const { data: profEncontrado, error } = await supabaseClient
        .from("profissionais")
        .select("*")
        .eq("registro", registro)
        .eq("senha", senha)
        .single();

      if (profEncontrado) {
        // Por enquanto, mantemos no localStorage até você migrar os profissionais para o Supabase Auth
        localStorage.setItem("profissionalLogado", JSON.stringify(profEncontrado));
        window.location.reload();
      } else {
        alert("Registro ou senha incorretos.");
      }
    });
  }

  // --- MÁSCARAS E OUTRAS LÓGICAS DOM ---
  const container = document.getElementById("profissionaisContainer");
  if (container) {
    function criarTurnosHTML(turnos) {
      let html = `<div class="turnos">`;
      turnos.forEach(turno => {
        let texto = "";
        if (turno === "manha") texto = "🌅 Manhã";
        if (turno === "tarde") texto = "🌤 Tarde";
        if (turno === "noite") texto = "🌙 Noite";
        html += `<span class="turno ${turno}">${texto}</span>`;
      });
      html += `</div>`;
      return html;
    }

    // 👇 OTIMIZAÇÃO: A vitrine agora puxa direto do banco de dados 👇
    window.carregarProfissionais = async function (especialidade) {
      const profissionais = await buscarProfissionais();
      const container = document.getElementById("profissionaisContainer");
      if (!container) return;
      container.innerHTML = "";

      let filtrados = profissionais.filter(p => {
        if (!p.especialidade) return false;
        let esp = p.especialidade.toLowerCase();
        let busca = especialidade.toLowerCase();
        if (busca === 'psicologia') return esp.includes('psic');
        if (busca === 'nutricao') return esp.includes('nutri');
        if (busca === 'fono') return esp.includes('fono');
        return esp === busca;
      });

      // 👇 Verifica se o paciente está no MODO PACOTE 👇
      const urlParams = new URLSearchParams(window.location.search);
      const is_pacote = urlParams.get('tipo') === 'pacote';

      if (filtrados.length > 0) {
        filtrados.forEach(prof => {
          const imagem = prof.imagem_url || "img/logo-integra.png";
          const descricao = prof.miniBio || "Profissional de excelência cadastrado na Integra Saúde.";
          const turnos = (prof.agenda && prof.agenda.turnos) ? prof.agenda.turnos : ["manha", "tarde", "noite"];

          const precoIndividual = parseFloat(prof.valor || 0).toFixed(2).replace('.', ',');
          const precoPacote = parseFloat(prof.valor_pacote || 0).toFixed(2).replace('.', ',');

          let ehNutricao = (prof.especialidade || "").toLowerCase().includes("nutri");

          // 👇 Se for Nutrição, esconde a linha do pacote 👇
          let htmlPacote = "";
          if (!ehNutricao) {
            htmlPacote = `<p style="margin: 5px 0; font-size: 14px; color: #0F766E;"><strong>Pacote (4x):</strong> R$ ${precoPacote}</p>`;
          } else if (is_pacote) {
            // Se for pacote e o médico for nutricionista, avisa na vitrine!
            htmlPacote = `<p style="margin: 5px 0; font-size: 12px; color: #d9534f; font-weight: bold;">🚫 Indisponível para Pacotes</p>`;
          }

          // 👇 Se for pacote e o médico for nutricionista, bloqueia o botão! 👇
          let botaoAgendarHtml = `<a href="javascript:void(0)" class="btn-primary" style="display: block; text-align: center; margin-top: 15px;" onclick="abrirAgenda('${prof.nome}')">Agendar Consulta</a>`;

          if (is_pacote && ehNutricao) {
            botaoAgendarHtml = `<a href="javascript:void(0)" class="btn-primary" style="display: block; text-align: center; margin-top: 15px; background: #999; cursor: not-allowed; text-decoration: none;" onclick="alert('Pacotes promocionais são válidos apenas para Psicologia e Fonoaudiologia.')">Indisponível</a>`;
          }

          const card = `
              <div class="prof-card">
                <img src="${imagem}" alt="${prof.nome}" style="object-fit: contain; padding: 10px; background: #f4f9f9;">
                <div class="prof-info">
                  <h3 style="font-size: 24px; color: #0f4c5c; margin-bottom: 5px;">${prof.nome}</h3>
                  <p style="font-size: 18px; font-weight: 600; margin-bottom: 2px;">${prof.especialidade}</p>
                  <p style="font-size: 16px; color: #555; margin-bottom: 10px;">${prof.registro}</p>
                  <p style="font-size: 16px; color: #000; margin: 8px 0;">${descricao}</p>
                  
                  <div style="margin: 15px 0; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                      <p style="margin: 5px 0; font-size: 14px;"><strong>Avulsa:</strong> R$ ${precoIndividual}</p>
                      ${htmlPacote}
                  </div>

                  ${criarTurnosHTML(turnos)}
                  ${botaoAgendarHtml}
                </div>
              </div>
            `;
          container.innerHTML += card;
        });
      } else {
        container.innerHTML = `<p style="text-align: center; width: 100%; font-size: 18px; color: #555; padding: 40px;">Nenhum profissional de <strong>${especialidade}</strong> cadastrado no momento.</p>`;
      }
    }

    window.mostrarEspecialidade = function (especialidade, botaoClicado) {
      // 1. Carrega a lista de médicos
      window.carregarProfissionais(especialidade);

      // 2. Destaca visualmente o botão escolhido
      const botoes = document.querySelectorAll('.filtro-btn');

      if (botoes.length > 0) {
        // Tira o destaque de todos primeiro
        botoes.forEach(btn => {
          btn.style.backgroundColor = ""; // Volta pro verde original do seu CSS
          btn.style.filter = "brightness(1)";
          btn.style.fontWeight = "normal";
          btn.style.border = "none";
        });

        // Função interna para pintar o botão de escuro
        const destacar = (btn) => {
          btn.style.filter = "brightness(0.7)"; // Escurece a cor atual
          btn.style.fontWeight = "bold";
          btn.style.border = "2px solid #0F4C5C"; // Borda escura
        };

        if (botaoClicado) {
          // Se o usuário clicou fisicamente no botão
          destacar(botaoClicado);
        } else {
          // Se veio da URL (da página inicial), procura o botão certo para destacar
          botoes.forEach(btn => {
            let texto = btn.innerText.toLowerCase();
            let busca = especialidade.toLowerCase();

            if (busca === 'psicologia' && texto.includes('psic')) destacar(btn);
            if (busca === 'nutricao' && texto.includes('nutri')) destacar(btn);
            if (busca === 'fono' && texto.includes('fono')) destacar(btn);
          });
        }
      }
    };
  }

  /* =====================================================
     🔹 FUNÇÕES DE RECUPERAÇÃO DE SENHA (SUPABASE AUTH)
  ===================================================== */
  const recuperarForm = document.getElementById("recuperarForm");
  if (recuperarForm) {
    recuperarForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const cpf = document.getElementById("cpfRecuperar").value.replace(/\D/g, "");

      try {
        // 1. Busca o e-mail do paciente pelo CPF
        const { data: paciente, error: pacienteError } = await supabaseClient
          .from('pacientes')
          .select('email, nome')
          .eq('cpf', cpf)
          .single();

        if (pacienteError || !paciente) {
          alert("Nenhum cadastro encontrado com este CPF.");
          return;
        }

        // 2. Dispara e-mail de redefinição de senha seguro pelo Supabase
        const { error } = await supabaseClient.auth.resetPasswordForEmail(paciente.email, {
          redirectTo: window.location.origin + '/redefinir-senha.html', // (Você precisará criar essa página se ainda não tiver)
        });

        if (error) {
          alert("Erro ao enviar e-mail de recuperação.");
          console.error(error);
          return;
        }

        const popupMsg = document.getElementById("popupMensagem");
        const popupSenha = document.getElementById("popupSenha");
        if (popupMsg) popupMsg.innerHTML = `Olá, ${formatarNome(paciente.nome)}!<br><br>Enviamos um link de redefinição de senha para o seu e-mail cadastrado:<br><strong style="font-size:16px; color:#0e5f73;">${paciente.email}</strong>`;
        if (popupSenha) popupSenha.classList.add("active");

      } catch (err) {
        console.error("Erro no fluxo de recuperação:", err);
        alert("Ocorreu um erro inesperado.");
      }
    });
  }
}); // <-- Fim do EventListener "DOMContentLoaded" que começou no Bloco 3

/* =====================================================
   🔹 FUNÇÕES DE AÇÕES DA TELA (MODAIS)
===================================================== */
window.fecharPopup = function () {
  const popup = document.getElementById("popupSenha");
  if (popup) popup.classList.remove("active");
}

window.mostrarTipoConta = function () {
  document.querySelectorAll('.auth-card').forEach(card => card.classList.remove('active'));
  const tipoConta = document.getElementById("tipoContaCard");
  if (tipoConta) tipoConta.classList.add("active");
}

window.mostrarCadastroPaciente = function () {
  document.querySelectorAll('.auth-card').forEach(card => card.classList.remove('active'));
  const cadPaciente = document.getElementById("cadastroCard");
  if (cadPaciente) cadPaciente.classList.add("active");
}

window.mostrarCadastroProfissional = function () {
  document.querySelectorAll('.auth-card').forEach(card => card.classList.remove('active'));
  const cadProf = document.getElementById("cadastroProfCard");
  if (cadProf) cadProf.classList.add("active");
}

window.mostrarLogin = function () {
  document.querySelectorAll('.auth-card').forEach(card => card.classList.remove('active'));
  const log = document.getElementById("loginCard");
  if (log) log.classList.add("active");
}

window.mostrarRecuperar = function () {
  document.querySelectorAll('.auth-card').forEach(card => card.classList.remove('active'));
  const rec = document.getElementById("recuperarCard");
  if (rec) rec.classList.add("active");
}

window.toggleSenha = function (idCampo, botao) {
  const campo = document.getElementById(idCampo);
  if (!campo) return;
  const svg = botao.querySelector("svg");

  if (campo.type === "password") {
    campo.type = "text";
    if (svg) svg.innerHTML = `<path d="M3 3l18 18M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-3.42M9.88 5.08A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a18.8 18.8 0 0 1-4.2 5.29M6.53 6.53A18.92 18.92 0 0 0 2 12s3 7 10 7a10.94 10.94 0 0 0 2.92-.39"/>`;
  } else {
    campo.type = "password";
    if (svg) svg.innerHTML = `<path d="M12 5C5 5 2 12 2 12s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>`;
  }
}

/* =====================================================
   🔹 FUNÇÕES DA AGENDA E BANCO DE DADOS (SUPABASE)
===================================================== */
window.abrirAgenda = async function (nomeProfissional) {
  try {
    const usuarioLogado = await getUsuarioLogado();

    if (!usuarioLogado) {
      alert("Você precisa acessar sua conta para visualizar a agenda e marcar consultas.");
      window.location.href = "area-paciente.html";
      return;
    }

    // 👇 CADEADO DA FOTO PERFIL 👇
    if (!usuarioLogado.foto_perfil_url) {
      let modalFoto = document.getElementById('modalFaltaFoto');
      if (!modalFoto) {
        const modalHtml = `
            <div id="modalFaltaFoto" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 99999; justify-content: center; align-items: center;">
                <div style="background: white; width: 90%; max-width: 400px; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                    <h2 style="color: #d9534f; margin-bottom: 15px;">Ação Necessária!</h2>
                    <p style="color: #555; margin-bottom: 20px; font-size: 14px; line-height: 1.5;">Sua identidade precisa ser validada. Atualize sua foto agora para prosseguir com agendamentos.</p>
                    <input type="file" id="fotoAtualizacao" accept="image/*" capture="user" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 5px;">
                    <button onclick="salvarFotoPendente()" style="background: #0F766E; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer;">Salvar e Continuar</button>
                    <button onclick="document.getElementById('modalFaltaFoto').remove()" style="background: transparent; color: #888; border: none; margin-top: 15px; cursor: pointer; font-weight: bold;">Cancelar</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
      } else {
        modalFoto.style.display = 'flex';
      }
      return;
    }

    // 👇 OTIMIZAÇÃO: Busca o profissional direto do banco
    const { data: prof, error } = await supabaseClient
      .from('profissionais')
      .select('*')
      .eq('nome', nomeProfissional)
      .single();

    if (error || !prof) {
      alert("Profissional inválido ou não encontrado.");
      return;
    }
    profissionalAtual = prof;

    const urlParams = new URLSearchParams(window.location.search);
    const is_pacote = urlParams.get('tipo') === 'pacote';
    const hoje = new Date();

    // 👇 CONTAGEM DINÂMICA DE SESSÕES 👇
    window.sessaoAtualPacote = 1;

    if (is_pacote) {
      let esp = (profissionalAtual.especialidade || "").toLowerCase();
      if (!esp.includes('psic') && !esp.includes('fono')) {
        alert("⚠️ ESPECIALIDADE INVÁLIDA\n\nPacotes estão disponíveis APENAS para Psicologia e Fonoaudiologia.");
        return;
      }

      // Conta diretamente no banco quantas sessões o paciente já marcou
      const { data: sessoesExistentes } = await supabaseClient
        .from('consultas')
        .select('id, profissional')
        .eq('paciente_cpf', usuarioLogado.cpf)
        .eq('is_pacote', true)
        .in('status_geral', ['agendada', 'finalizada', 'ausente', 'pendente_pagamento']);

      if (sessoesExistentes && sessoesExistentes.length > 0) {
        const medicoDoPacote = sessoesExistentes[0].profissional;

        // Se a divisão por 4 não for exata, o pacote está em andamento
        if (sessoesExistentes.length % 4 !== 0) {
          if (medicoDoPacote !== profissionalAtual.nome) {
            alert(`⚠️ PROFISSIONAL INCORRETO\n\nVocê tem um pacote em andamento com:\n🧑‍⚕️ ${medicoDoPacote}\n\nPor favor, volte e selecione a agenda dele(a).`);
            return;
          }
          window.sessaoAtualPacote = (sessoesExistentes.length % 4) + 1;
        } else {
          // Se já completou 4 sessões, inicia um pacote NOVO (Sessão 1)
          window.sessaoAtualPacote = 1;
        }
      }
    }

    // Lógica simplificada para bloqueio de agendamento por taxa (Se você tiver uma coluna "bloqueado" na tabela pacientes, fica ainda mais fácil no futuro).
    // Aqui adaptamos a verificação consultando o banco.
    if (!is_pacote) {
      const { data: ultimasCanceladas } = await supabaseClient
        .from('consultas')
        .select('*')
        .eq('paciente_cpf', usuarioLogado.cpf)
        .gte('num_reagendamentos', 2);

      let especialidadeAlvo = (profissionalAtual.especialidade || "").toLowerCase();
      let bloqueado = false;

      if (ultimasCanceladas) {
        // Precisaria cruzar com os profissionais para checar especialidade, mas por questão de performance, o ideal é o backend gerenciar um status de "bloqueio_especialidade_x" no perfil do paciente. 
        // Mantemos a lógica baseada na consulta puxada.
        for (let c of ultimasCanceladas) {
          const { data: profCancelado } = await supabaseClient.from('profissionais').select('especialidade').eq('nome', c.profissional).single();
          if (profCancelado && profCancelado.especialidade.toLowerCase() === especialidadeAlvo) {
            let [ano, mes, dia] = c.data.split("-");
            let limite30Dias = new Date(new Date(ano, mes - 1, dia).getTime() + (30 * 24 * 60 * 60 * 1000));
            if (hoje <= limite30Dias) {
              bloqueado = true;
              break;
            }
          }
        }
      }

      if (bloqueado) {
        alert("⚠️ AGENDAMENTO BLOQUEADO por pendência de taxa de reoperacionalização...");
        return;
      }
    }

    if (!profissionalAtual.agenda) profissionalAtual.agenda = { turnos: ["manha", "tarde", "noite"] };

    let avisoPacoteHtml = "";

    // 👇 CORREÇÃO: Tiramos a variável velha e usamos apenas 'is_pacote'
    if (is_pacote) {
      avisoPacoteHtml = `<div style="background: #FFF3CD; color: #856404; padding: 10px; text-align: center; font-weight: bold; border-radius: 6px; margin-bottom: 15px; border: 1px solid #FFEEBA;">📦 MODO PACOTE ATIVADO (Sessão ${window.sessaoAtualPacote}/4) - Suas escolhas seguirão a regra de 30 dias.</div>`;
    }

    const agenda = document.getElementById("agendaContainer");
    if (agenda) {
      agenda.innerHTML = `
            <div class="agenda-box">
            ${avisoPacoteHtml}
            <h2>Agenda de ${nomeProfissional}</h2>
            <div id="calendario"></div>
            <h3>Horários disponíveis</h3>
            <div id="horarios"></div>
            <br>
            <button onclick="confirmarConsulta()" class="btn-primary">Avançar</button>
            <button onclick="fecharAgenda()" class="btn-secondary">Fechar</button>
            </div>
          `;
      agenda.style.display = "flex";
      window.gerarCalendario();
    }
  } catch (error) {
    console.error("Erro na função abrirAgenda:", error);
  }
};

window.confirmarConsulta = function () {
  if (!dataSelecionada || !horarioSelecionado) {
    alert("Escolha um dia e um horário para a consulta.");
    return;
  }
  const [ano, mes, dia] = dataSelecionada.split("-");
  const dataFormatada = `${dia}/${mes}/${ano}`;
  const agenda = document.getElementById("agendaContainer");

  let [h, m] = horarioSelecionado.split(":");
  let minFim = parseInt(m) + 50;
  let hFim = parseInt(h);
  if (minFim >= 60) { hFim += 1; minFim -= 60; }
  const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

  // Descobre qual é a sessão do pacote
  const urlParams = new URLSearchParams(window.location.search);
  const is_pacote = urlParams.get('tipo') === 'pacote';

  // 👇 Puxa o número correto que o sistema acabou de calcular 👇
  let numSessao = window.sessaoAtualPacote || 1;

  // 👇 LÓGICA NOVA: Esconde o pagamento se for a sessão 1, 2 ou 3 do pacote 👇
  let formPagamentoHTML = "";
  let textoBotao = "Confirmar Consulta e Pagar";

  if (is_pacote && numSessao < 4) {
    formPagamentoHTML = `
        <div style="margin-bottom: 25px; text-align: left; background: #e0f2f1; padding: 15px; border-radius: 8px; border: 1px solid #b2dfdb;">
          <h4 style="color: #00695c; margin-bottom: 5px;">📦 Sessão ${numSessao}/4</h4>
          <p style="font-size: 14px; color: #004d40;">Esta sessão será agendada agora. <strong>O pagamento do pacote só será cobrado na 4ª e última sessão.</strong></p>
          <input type="hidden" name="metodoPagamento" value="gratis">
        </div>
      `;
    textoBotao = `Confirmar Sessão ${numSessao}`;
  } else {
    formPagamentoHTML = `
        <div style="margin-bottom: 25px; text-align: left; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
          <h4 style="color: #0f4c5c; margin-bottom: 15px;">Forma de Pagamento:</h4>
          <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer; font-size: 15px; color: #444;">
              <input type="radio" name="metodoPagamento" value="pix" checked style="width: 18px; height: 18px;">
              💠 PIX (Aprovação imediata sem sair da tela)
          </label>
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 15px; color: #444;">
              <input type="radio" name="metodoPagamento" value="cartao" style="width: 18px; height: 18px;">
              💳 Cartão de Crédito (Via Mercado Pago)
          </label>
        </div>
      `;
    if (is_pacote && numSessao === 4) textoBotao = "Pagar Pacote Completo";
  }

  if (agenda) {
    agenda.innerHTML = `
        <div class="agenda-box">
          <h2 style="color: #0f4c5c;">Confirme seu Agendamento</h2>
          <div style="background: #f4f9f9; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: left; border: 1px solid #cce3e6;">
            <p style="margin-bottom: 10px; font-size: 16px;">Você está prestes a agendar com:</p>
            <h3 style="color: #0E5F73; margin-bottom: 15px; font-size: 22px;">${profissionalAtual.nome}</h3>
            <p style="margin-bottom: 8px;"><strong>Data:</strong> ${dataFormatada}</p>
            <p><strong>Horário:</strong> ${horarioSelecionado} às ${horaFimStr}</p>
          </div>
          
          ${formPagamentoHTML}

          <button type="button" onclick="finalizarAgendamento(this)" class="btn-primary" style="margin-right: 15px;">${textoBotao}</button>
          <button type="button" onclick="abrirAgenda(this.dataset.nome)" data-nome="${profissionalAtual.nome}" class="btn-secondary">Voltar e Alterar</button>
        </div>
      `;
  }
}

/* =====================================================
   🔹 FINALIZAR AGENDAMENTO (Criação e Pagamento via Mercado Pago)
===================================================== */
window.finalizarAgendamento = async function (botaoElement) {
  if (botaoElement) {
    botaoElement.innerText = "Processando...";
    botaoElement.disabled = true;
  }

  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return;

  const urlParams = new URLSearchParams(window.location.search);
  const is_pacote = urlParams.get('tipo') === 'pacote';
  const uniqueId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  let numSessao = window.sessaoAtualPacote || 1;

  // TRAVA DE HORÁRIO
  const { data: conflito } = await supabaseClient.from("consultas")
    .select("id")
    .eq("profissional", profissionalAtual.nome)
    .eq("data", dataSelecionada)
    .eq("hora", horarioSelecionado)
    .in("status_geral", ["agendada", "pendente_pagamento"]);

  if (conflito && conflito.length > 0) {
    alert("⚠️ Este horário acabou de ser ocupado! Por favor, escolha outro.");
    if (botaoElement) { botaoElement.innerText = "Confirmar Consulta"; botaoElement.disabled = false; }
    return;
  }

  // ID DO PACOTE
  let meuPacoteId = null;
  if (is_pacote) {
    if (numSessao === 1) {
      meuPacoteId = "PAC_" + Date.now();
      localStorage.setItem('pacoteIdEmAndamento', meuPacoteId);
    } else {
      meuPacoteId = localStorage.getItem('pacoteIdEmAndamento') || ("PAC_" + Date.now());
    }
  }

  const novaConsulta = {
    id: uniqueId,
    profissional: profissionalAtual.nome,
    especialidade: profissionalAtual.especialidade,
    data: dataSelecionada,
    hora: horarioSelecionado,
    paciente_cpf: usuarioLogado.cpf,
    status_geral: "pendente_pagamento", // 👈 AGORA SEMPRE NASCE PENDENTE!
    is_pacote: is_pacote,
    pacote_id: meuPacoteId,
    meet_link: `https://meet.jit.si/IntegraSaude_${uniqueId}`
  };

  const { error: erroInsert } = await supabaseClient.from("consultas").insert([novaConsulta]);
  if (erroInsert) {
    alert("Erro ao reservar horário.");
    if (botaoElement) { botaoElement.innerText = "Confirmar Consulta"; botaoElement.disabled = false; }
    return;
  }

  const metodoInput = document.querySelector('input[name="metodoPagamento"]:checked') || document.querySelector('input[name="metodoPagamento"][type="hidden"]');
  const metodoSelecionado = metodoInput ? metodoInput.value : 'pix';

  // LÓGICA DAS SESSÕES 1, 2 e 3 (Não atualiza para agendada, apenas avança)
  if (metodoSelecionado === 'gratis') {
    const agenda = document.getElementById("agendaContainer");
    if (agenda) {
      agenda.innerHTML = `
          <div class="agenda-box" style="text-align: center; padding: 40px 20px;">
            <h2 style="color: #2E7D32;">Sessão ${numSessao} de 4 reservada!</h2>
            <p style="margin-top: 15px; color: #555;">O agendamento final ocorrerá após o pagamento da 4ª sessão.</p>
            <button type="button" onclick="abrirAgenda('${profissionalAtual.nome}')" class="btn-primary" style="width: 100%; margin-top: 25px; background-color: #0E5F73;">📅 Agendar a Próxima Sessão</button>
          </div>
        `;
    }
    return;
  }

  if (is_pacote && numSessao === 4) {
    localStorage.removeItem('pacoteIdEmAndamento');
  }

  let valorFinal = is_pacote ? Number(profissionalAtual.valor_pacote) : Number(profissionalAtual.valor);

  const { data: respostaPagamento, error: erroPagamento } = await supabaseClient.functions.invoke('processar-pagamento', {
    body: {
      consultaId: uniqueId,
      pacienteCpf: usuarioLogado.cpf,
      tipoAcao: is_pacote ? 'pacote' : 'consulta_normal',
      sessaoPacote: numSessao,
      valorConsulta: valorFinal,
      metodoPagamento: metodoSelecionado
    }
  });

  if (erroPagamento) {
    alert("Erro ao gerar pagamento.");
    if (botaoElement) { botaoElement.innerText = "Confirmar Consulta e Pagar"; botaoElement.disabled = false; }
    return;
  }

  if (respostaPagamento && respostaPagamento.isPixAPI) {
    const agenda = document.getElementById("agendaContainer");
    agenda.innerHTML = `
      <div class="agenda-box" style="text-align: center; padding: 30px;">
        <h2 style="color: #0F4C5C;">Pague com PIX</h2>
        <img src="data:image/png;base64,${respostaPagamento.qrCodeBase64}" style="width: 200px; margin-bottom: 20px;">
        <div style="display: flex; gap: 5px; margin-bottom: 20px;">
            <input type="text" id="pixCopiaCola" value="${respostaPagamento.qrCodeCopiaCola}" readonly style="flex: 1; padding: 10px; font-size: 12px;">
            <button onclick="navigator.clipboard.writeText(document.getElementById('pixCopiaCola').value)" style="background: #0F766E; color: white; padding: 10px;">Copiar</button>
        </div>
        <div id="statusPagamentoAoVivo"><p style="color: #d9534f; font-weight: bold;">⏳ Aguardando pagamento...</p></div>
      </div>
    `;

    const radarDePagamento = setInterval(async () => {
      const { data: statusConsulta } = await supabaseClient.from("consultas").select("status_geral").eq("id", respostaPagamento.consultaId).single();

      if (statusConsulta && statusConsulta.status_geral === "agendada") {
        clearInterval(radarDePagamento);

        // 👇 O PULO DO GATO: Se o Pix for pago, confirma as 4 consultas ao mesmo tempo!
        if (is_pacote) {
          await supabaseClient.from("consultas").update({ status_geral: "agendada" }).eq("pacote_id", meuPacoteId);
        }

        document.getElementById("statusPagamentoAoVivo").innerHTML = `<p style="color: #2E7D32; font-weight: bold; font-size: 18px;">✅ Pagamento Confirmado!</p>`;
        setTimeout(() => { window.location.href = `sucesso.html?id=${respostaPagamento.consultaId}`; }, 1500);
      }
    }, 3000);
    return;
  }

  if (respostaPagamento && respostaPagamento.url) {
    window.location.href = respostaPagamento.url;
    return;
  }
};

window.fecharAgenda = function () {
  const agenda = document.getElementById("agendaContainer");
  if (agenda) agenda.style.display = "none";
  profissionalAtual = null;
  dataSelecionada = null;
  horarioSelecionado = null;
}

/* =====================================================
   🔹 SISTEMA DE AGENDAMENTO (CALENDÁRIO E HORÁRIOS)
===================================================== */
window.gerarCalendario = function () {
  const calendario = document.getElementById("calendario");
  if (!calendario) return;
  calendario.innerHTML = "";

  const diasSemanaNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  diasSemanaNomes.forEach(dia => {
    let div = document.createElement("div");
    div.innerText = dia;
    div.style.fontWeight = "bold";
    div.style.textAlign = "center";
    div.style.color = "#0f4c5c";
    calendario.appendChild(div);
  });

  const agora = new Date();
  const limiteTempo = new Date(agora.getTime());
  const limite2Meses = new Date(agora.getFullYear(), agora.getMonth() + 2, agora.getDate());
  let dataAtual = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  let diaSemanaAtual = dataAtual.getDay();
  for (let i = 0; i < diaSemanaAtual; i++) calendario.appendChild(document.createElement("div"));

  while (dataAtual <= limite2Meses) {
    let div = document.createElement("div");
    div.classList.add("dia");
    div.innerText = `${dataAtual.getDate().toString().padStart(2, '0')}/${(dataAtual.getMonth() + 1).toString().padStart(2, '0')}`;

    let diaSemana = dataAtual.getDay();
    let dataStr = `${dataAtual.getFullYear()}-${(dataAtual.getMonth() + 1).toString().padStart(2, '0')}-${dataAtual.getDate().toString().padStart(2, '0')}`;

    if (diaSemana === 0 || diaSemana === 6) {
      div.classList.add("indisponivel");
    } else {
      div.classList.add("disponivel");
      div.onclick = (e) => window.selecionarDia(dataStr, e.target);
    }

    calendario.appendChild(div);
    dataAtual.setDate(dataAtual.getDate() + 1);
  }
};

window.selecionarDia = function (dataStr, elementoClicado) {
  dataSelecionada = dataStr;
  horarioSelecionado = null;
  document.querySelectorAll("#calendario .dia").forEach(d => d.style.outline = "none");
  elementoClicado.style.outline = "3px solid #0E5F73";
  window.mostrarHorarios();
};

window.mostrarHorarios = async function () {
  const horariosDiv = document.getElementById("horarios");
  horariosDiv.innerHTML = "Carregando horários...";

  const agora = new Date();
  const limiteTempo = new Date(agora.getTime());
  let [ano, mes, dia] = dataSelecionada.split("-");

  let slots = window.gerarSlotsProfissional();

  const { data: consultasDoDia } = await supabaseClient
    .from("consultas")
    .select("hora")
    .eq("profissional", profissionalAtual.nome)
    .eq("data", dataSelecionada)
    .in("status_geral", ["agendada", "pendente_pagamento"]);

  horariosDiv.innerHTML = "";

  slots.forEach(hora => {
    let div = document.createElement("div");
    div.classList.add("horario");

    let [h, m] = hora.split(":");
    let dataHoraSlot = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m));

    let minFim = parseInt(m) + 50;
    let hFim = parseInt(h);
    if (minFim >= 60) { hFim += 1; minFim -= 60; }
    const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

    div.innerText = hora === "12:00" ? "12:00 (Almoço)" : `${hora} - ${horaFimStr}`;

    // 👇 SOLUÇÃO: Lê apenas os 5 primeiros caracteres (HH:MM) para ignorar os segundos do banco 👇
    let ocupado = consultasDoDia ? consultasDoDia.some(c => c.hora.substring(0, 5) === hora.substring(0, 5)) : false;

    if (hora === "12:00" || dataHoraSlot < limiteTempo || ocupado) {
      div.classList.add("horario-indisponivel");
      // 👇 SOLUÇÃO: Força bruta do CSS com !important para garantir a cor cinza 👇
      div.style.setProperty('background-color', '#e0e0e0', 'important');
      div.style.setProperty('color', '#999999', 'important');
      div.style.setProperty('border-color', '#cccccc', 'important');
      div.style.setProperty('cursor', 'not-allowed', 'important');
      div.style.setProperty('text-decoration', 'line-through', 'important');
      div.onclick = null;
    } else {
      div.classList.add("horario-disponivel");
      div.onclick = (e) => {
        horarioSelecionado = hora;
        document.querySelectorAll("#horarios .horario").forEach(el => el.style.outline = "none");
        e.target.style.outline = "3px solid #000";
      };
    }
    horariosDiv.appendChild(div);
  });
};

window.gerarSlotsProfissional = function () {
  const turnos = profissionalAtual.agenda.turnos;
  let slots = [];
  if (turnos.includes("manha")) { for (let h = 6; h < 12; h++) slots.push(`${h.toString().padStart(2, '0')}:00`); }
  if (turnos.includes("tarde")) { for (let h = 13; h < 18; h++) slots.push(`${h.toString().padStart(2, '0')}:00`); }
  if (turnos.includes("noite")) { for (let h = 18; h < 22; h++) slots.push(`${h.toString().padStart(2, '0')}:00`); }
  if (turnos.includes("manha") || turnos.includes("tarde")) { if (!slots.includes("12:00")) slots.push("12:00"); }
  return slots.sort();
}

window.verificarStatusDia = async function (dataVerificar, dataStr, limiteTempo) {
  let slots = window.gerarSlotsProfissional();
  if (slots.length === 0) return "indisponivel";

  // OTIMIZAÇÃO: Bloqueia o horário tanto para consultas confirmadas quanto para as que estão aguardando o pagamento do Mercado Pago
  const { data: consultasDoDia } = await supabaseClient
    .from("consultas")
    .select("hora, paciente_cpf")
    .eq("profissional", profissionalAtual.nome)
    .eq("data", dataStr)
    .in("status_geral", ["agendada", "pendente_pagamento"]); // 👈 Correção essencial

  let totalSlotsValidos = 0;
  let slotsOcupados = 0;

  slots.forEach(hora => {
    let [h, m] = hora.split(":");
    let dataHoraSlot = new Date(dataVerificar.getFullYear(), dataVerificar.getMonth(), dataVerificar.getDate(), parseInt(h), parseInt(m));
    if (dataHoraSlot >= limiteTempo) {
      if (hora !== "12:00") {
        totalSlotsValidos++;
        let ocupado = consultasDoDia ? consultasDoDia.some(c => c.hora === hora) : false;
        if (ocupado) slotsOcupados++;
      }
    }
  });

  if (totalSlotsValidos === 0 || totalSlotsValidos === slotsOcupados) return "indisponivel";
  return "disponivel";
}

/* =====================================================
   🔹 CONTINUAÇÃO: EFETIVAR CANCELAMENTO (SUPABASE)
===================================================== */

window.abrirModalCancelar = function (consultaId, profissional, data, hora, isPacote, sessaoNumero, pacoteId) {
  consultaParaCancelar = {
    id: consultaId,
    profissional: profissional,
    data: data,
    hora: hora,
    is_pacote: isPacote,
    sessaoNumero: sessaoNumero,
    pacote_id: pacoteId
  };

  const divConfirmacao = document.getElementById("estadoConfirmacao");
  const divSucesso = document.getElementById("estadoSucesso");

  if (divConfirmacao) {
    divConfirmacao.classList.remove("hidden");
    // 👇 Muda o texto dependendo se é Pacote ou Consulta Avulsa 👇
    if (isPacote) {
      divConfirmacao.innerHTML = `
            <h3 style="color: #d9534f; margin-bottom: 10px;">Cancelar Pacote Inteiro</h3>
            <p style="color: #555; margin-bottom: 25px; font-size: 14px;">Você está prestes a cancelar <strong>TODAS AS CONSULTAS</strong> deste pacote. Esta ação não pode ser desfeita.</p>
            <div style="display: flex; justify-content: center; gap: 15px;">
              <button onclick="efetivarCancelamento()" class="btn-primary" style="background-color: #d9534f;">Sim, Cancelar Pacote</button>
              <button onclick="fecharModalCancelar()" class="btn-secondary">Não</button>
            </div>
          `;
    } else {
      divConfirmacao.innerHTML = `
            <h3 style="color: #d9534f; margin-bottom: 10px;">Cancelar e Reembolsar</h3>
            <p style="color: #555; margin-bottom: 25px; font-size: 14px;">Tem certeza que deseja cancelar? O valor da consulta será estornado para a sua forma de pagamento original.</p>
            <div style="display: flex; justify-content: center; gap: 15px;">
              <button onclick="efetivarCancelamento()" class="btn-primary" style="background-color: #d9534f;">Sim, Cancelar</button>
              <button onclick="fecharModalCancelar()" class="btn-secondary">Não</button>
            </div>
          `;
    }
  }

  if (divSucesso) divSucesso.classList.add("hidden");

  const modalCanc = document.getElementById("modalCancelar");
  if (modalCanc) modalCanc.classList.add("active");
};

window.efetivarCancelamento = async function () {
  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado || !consultaParaCancelar) return;

  const divConfirmacao = document.getElementById("estadoConfirmacao");
  divConfirmacao.innerHTML = `<h3 style="color: #0F4C5C;">Processando cancelamento...</h3><p style="color: #555;">Aguarde um momento.</p>`;

  // 👇 SE FOR PACOTE, CANCELA AS 4 CONSULTAS DE UMA VEZ SÓ 👇
  if (consultaParaCancelar.is_pacote) {

    // Atualiza o banco de dados (muda o status de todas as 4)
    const { error } = await supabaseClient.from("consultas")
      .update({ status_geral: 'cancelada' })
      .eq('pacote_id', consultaParaCancelar.pacote_id);

    if (error) {
      alert("Erro ao cancelar o pacote.");
      fecharModalCancelar();
      return;
    }

    // Aciona o reembolso (a sua Edge Function vai cuidar de estornar se a 4ª já estiver paga)
    await supabaseClient.functions.invoke('processar-reembolso', {
      body: {
        consultaId: consultaParaCancelar.id,
        isPacote: true,
        pacoteId: consultaParaCancelar.pacote_id
      }
    });

    divConfirmacao.classList.add("hidden");
    document.getElementById("estadoSucesso").classList.remove("hidden");
    return;
  }

  // 👇 SE FOR CONSULTA AVULSA, SEGUE O FLUXO NORMAL 👇
  const { data, error } = await supabaseClient.functions.invoke('processar-reembolso', {
    body: {
      consultaId: consultaParaCancelar.id,
      isPacote: false
    }
  });

  if (error || (data && data.erro)) {
    console.error("Erro no reembolso:", error || (data && data.erro));
    alert("Não foi possível realizar o cancelamento. Contate o suporte.");
    fecharModalCancelar();
    return;
  }

  // Atualiza o status da avulsa no banco
  await supabaseClient.from("consultas").update({ status_geral: 'cancelada' }).eq('id', consultaParaCancelar.id);

  divConfirmacao.classList.add("hidden");
  document.getElementById("estadoSucesso").classList.remove("hidden");
}

window.fecharModalCancelar = function () {
  const modalCanc = document.getElementById("modalCancelar");
  if (modalCanc) modalCanc.classList.remove("active");
  consultaParaCancelar = null;
}

window.fecharModalSucesso = function () {
  const modalCanc = document.getElementById("modalCancelar");
  if (modalCanc) modalCanc.classList.remove("active");
  consultaParaCancelar = null;
  window.location.reload(); // Recarrega para atualizar a tela
}

/* =====================================================
   🔹 INTEGRAÇÃO COM VÍDEO CHAMADA EM TEMPO REAL
===================================================== */
let chamadaWebRTC = null; // Mantido por compatibilidade

window.entrarNaChamada = async function (prof, data, hora) {
  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return alert("Sessão expirada. Faça login novamente.");

  const { data: consulta } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("profissional", prof)
    .eq("data", data)
    .eq("hora", hora)
    .eq("paciente_cpf", usuarioLogado.cpf)
    .single();

  if (consulta) {
    let meet_link = consulta.meet_link;

    // Atualiza status no banco para avisar o médico
    await supabaseClient
      .from("consultas")
      .update({ status_paciente: "na_sala" })
      .eq("id", consulta.id);

    const novaAba = window.open(meet_link, '_blank', 'noopener,noreferrer');
    if (!novaAba) alert("O navegador bloqueou a abertura da chamada. Permita os pop-ups.");
  }
};

window.entrarNaChamadaProfissional = async function (prof, data, hora) {
  const { data: consulta } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("profissional", prof)
    .eq("data", data)
    .eq("hora", hora)
    .single();

  if (consulta) {
    // Atualiza status no banco para avisar o paciente
    await supabaseClient
      .from("consultas")
      .update({ status_profissional: "na_sala" })
      .eq("id", consulta.id);

    const novaAba = window.open(consulta.meet_link, '_blank', 'noopener,noreferrer');
    if (!novaAba) alert("O navegador bloqueou a abertura da chamada.");
  }
};

window.finalizarConsulta = async function (prof, data, hora) {
  if (confirm("Deseja realmente finalizar esta consulta e marcar como concluída?")) {
    const profLogado = getProfissionalLogado();
    if (!profLogado || profLogado.nome !== prof) return alert("Acesso negado.");

    await supabaseClient
      .from("consultas")
      .update({ status_geral: "finalizada" })
      .eq("profissional", prof)
      .eq("data", data)
      .eq("hora", hora);

    window.location.reload();
  }
};

window.marcarAusencia = async function (prof, data, hora) {
  if (confirm("O paciente não compareceu. Deseja encerrar a consulta por falta?")) {
    await supabaseClient
      .from("consultas")
      .update({ status_geral: "ausente" })
      .eq("profissional", prof)
      .eq("data", data)
      .eq("hora", hora);

    window.location.reload();
  }
};

/* =====================================================
   🔹 PAINEL DO ADMINISTRADOR E TRIAGEM (TRABALHE CONOSCO)
===================================================== */
const formTrabalheConosco = document.getElementById("formTrabalheConosco");

if (formTrabalheConosco) {
  // Mascara de CPF
  document.getElementById("candCpf").addEventListener("input", function () {
    let valor = this.value.replace(/\D/g, "").substring(0, 11);
    if (valor.length > 9) valor = valor.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    else if (valor.length > 6) valor = valor.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
    else if (valor.length > 3) valor = valor.replace(/(\d{3})(\d{0,3})/, "$1.$2");
    this.value = valor;
  });

  // MÁGICA DO CEP (ViaCEP - Mantido pois é uma API aberta excelente)
  const candCepInput = document.getElementById("candCep");
  if (candCepInput) {
    candCepInput.addEventListener("input", function () {
      let v = this.value.replace(/\D/g, "").substring(0, 8);
      if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, "$1-$2");
      this.value = v;
    });

    candCepInput.addEventListener("blur", function () {
      let cepVal = this.value.replace(/\D/g, "");
      if (cepVal.length === 8) {
        fetch(`https://viacep.com.br/ws/${cepVal}/json/`)
          .then(res => res.json())
          .then(data => {
            if (!data.erro) {
              document.getElementById("candRua").value = data.logradouro;
              document.getElementById("candBairro").value = data.bairro;
              document.getElementById("candCidade").value = data.localidade;
              document.getElementById("candUf").value = data.uf;
              document.getElementById("candNumero").focus();
            } else {
              alert("CEP não encontrado! Verifique o número digitado.");
            }
          });
      }
    });
  }

  // Salvando a ficha na Base de Dados (Tabela: candidatos_espera)
  formTrabalheConosco.addEventListener("submit", async function (e) {
    e.preventDefault();
    let cpfLimpo = document.getElementById("candCpf").value.replace(/\D/g, "");

    // 1. Verifica se já mandou ficha antes
    const { data: jaEnviou } = await supabaseClient
      .from("candidatos_espera")
      .select("cpf")
      .eq("cpf", cpfLimpo)
      .single();

    if (jaEnviou) return alert("Você já enviou uma ficha. Aguarde o contato da nossa equipe!");

    // 2. Verifica se o CPF já pertence a um profissional ativo
    const { data: jaProfissional } = await supabaseClient
      .from("profissionais")
      .select("cpf")
      .eq("cpf", cpfLimpo)
      .single();

    if (jaProfissional) return alert("Já existe um profissional cadastrado com este CPF.");

    // 3. Insere a ficha no Supabase
    const novoCandidato = {
      nome: document.getElementById("candNome").value.trim(),
      cpf: cpfLimpo,
      nascimento: document.getElementById("candNascimento").value,
      telefone: document.getElementById("candTelefone").value.trim(),
      email: document.getElementById("candEmail").value.trim(),
      profissao: document.getElementById("candProfissao").value,
      registro: document.getElementById("candRegistro").value.trim(),
      estado: document.getElementById("candEstado").value.trim().toUpperCase(),
      exp: document.getElementById("candExp").value.trim(),
      publico: document.getElementById("candPublico").value.trim(),
      atuacao: document.getElementById("candAtuacao").value.trim(),
      cep: document.getElementById("candCep").value,
      rua: document.getElementById("candRua").value,
      numero: document.getElementById("candNumero").value,
      complemento: document.getElementById("candComplemento").value,
      bairro: document.getElementById("candBairro").value,
      cidade: document.getElementById("candCidade").value,
      uf: document.getElementById("candUf").value
    };

    const { error } = await supabaseClient
      .from("candidatos_espera")
      .insert([novoCandidato]);

    if (error) {
      console.error(error);
      alert("Erro ao enviar a ficha. Tente novamente mais tarde.");
    } else {
      alert("Ficha enviada com sucesso! Nossa equipe entrará em contato.");
      formTrabalheConosco.reset();
    }
  });
}

/* =====================================================
   🔹 PAINEL DO ADMINISTRADOR: APROVAR/RECUSAR FICHAS
===================================================== */

// Monta a lista de fichas na tela do Admin buscando do Supabase
window.renderizarAdminCandidatos = async function () {
  const listaDiv = document.getElementById("listaCandidatos");
  if (!listaDiv) return;

  const { data: candidatos, error } = await supabaseClient
    .from("candidatos_espera")
    .select("*");

  if (error || !candidatos || candidatos.length === 0) {
    listaDiv.innerHTML = "<p style='font-size: 18px; color: #555;'>Nenhuma ficha aguardando avaliação no momento.</p>";
    return;
  }

  listaDiv.innerHTML = "";
  candidatos.forEach(cand => {
    listaDiv.innerHTML += `
      <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-left: 6px solid #f39c12; margin-bottom:15px;">
        <h3 style="color: #0F4C5C; font-size: 22px; margin-bottom: 10px;">${cand.nome} <span style="font-size: 16px; color: #777;">(${cand.profissao})</span></h3>
        <div style="display: flex; gap: 40px; margin-bottom: 20px; font-size: 14px; color: #444;">
          <div>
            <p><strong>CPF:</strong> ${cand.cpf}</p>
            <p><strong>Registro:</strong> ${cand.registro} - ${cand.estado}</p>
            <p><strong>Experiência:</strong> ${cand.exp} anos</p>
          </div>
          <div>
            <p><strong>Telefone:</strong> ${cand.telefone}</p>
            <p><strong>E-mail:</strong> ${cand.email}</p>
            <p><strong>Público:</strong> ${cand.publico}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #444; margin-bottom: 20px;"><strong>Áreas de atuação:</strong> ${cand.atuacao}</p>
        <p style="font-size: 14px; color: #444; margin-bottom: 20px;"><strong>Endereço:</strong> ${cand.rua}, ${cand.numero} ${cand.complemento ? ' - ' + cand.complemento : ''} - ${cand.bairro}, ${cand.cidade}/${cand.uf} (CEP: ${cand.cep})</p>
        <div style="display: flex; gap: 15px;">
          <button onclick='aprovarCandidato("${cand.cpf}")' style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">✅ CADASTRAR (Aprovar e Enviar Whats)</button>
          <button onclick="recusarCandidato('${cand.cpf}')" style="background: #d9534f; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">❌ RECUSAR (Apagar e Enviar Whats)</button>
        </div>
      </div>
    `;
  });
}

// Ação CADASTRAR (Supabase)
window.aprovarCandidato = async function (cpf) {
  // 1. Pega os dados do candidato no banco
  const { data: cand } = await supabaseClient.from("candidatos_espera").select("*").eq("cpf", cpf).single();
  if (!cand) return;

  const senhaProvisoria = cand.cpf.substring(0, 6);

  const novoProfissional = {
    nome: cand.nome,
    cpf: cand.cpf,
    email: cand.email,
    telefone: cand.telefone,
    senha: senhaProvisoria,
    registro: cand.registro,
    especialidade: cand.profissao,
    estadoReg: cand.estado,
    miniBio: "Profissional da Integra Saúde.",
    imagem_url: "img/logo-integra.png",
    agenda: { turnos: ["manha", "tarde", "noite"] },
    valor: 1.00 // 👈 Adicione o valor padrão aqui
  };

  // 2. Insere na tabela de profissionais
  const { error: errInsert } = await supabaseClient.from("profissionais").insert([novoProfissional]);

  if (errInsert) {
    alert("Erro ao cadastrar profissional.");
    return;
  }

  // 3. Remove da fila de espera
  await supabaseClient.from("candidatos_espera").delete().eq("cpf", cpf);

  // 4. Envia a mensagem pelo WhatsApp
  let telLimpo = cand.telefone.replace(/\D/g, "");
  let msgAprovacao = `Olá, ${cand.nome}! Tudo bem? Aqui é da equipe Integra Saúde.\n\nTemos uma excelente notícia: avaliamos a sua ficha e você acaba de ser integrado(a) à nossa plataforma! 🎉\n\nSua senha provisória de acesso ao painel são os 6 primeiros dígitos do seu CPF.`;
  window.open(`https://api.whatsapp.com/send?phone=55${telLimpo}&text=${encodeURIComponent(msgAprovacao)}`, "_blank", "noopener,noreferrer");

  renderizarAdminCandidatos(); // Atualiza a tela
}

// Ação RECUSAR (Supabase)
window.recusarCandidato = async function (cpf) {
  if (confirm("Tem certeza que deseja recusar este candidato?")) {
    const { data: cand } = await supabaseClient.from("candidatos_espera").select("nome, telefone").eq("cpf", cpf).single();

    if (cand) {
      await supabaseClient.from("candidatos_espera").delete().eq("cpf", cpf);

      let telLimpo = cand.telefone.replace(/\D/g, "");
      let msgRecusa = `Olá, ${cand.nome}. Tudo bem? Aqui é da equipe Integra Saúde.\n\nAgradecemos o interesse, mas infelizmente não seguiremos com a sua integração à plataforma neste momento. Manteremos seus dados em nosso banco de talentos.`;
      window.open(`https://api.whatsapp.com/send?phone=55${telLimpo}&text=${encodeURIComponent(msgRecusa)}`, "_blank", "noopener,noreferrer");

      renderizarAdminCandidatos();
    }
  }
}

/* =====================================================
   🔹 SISTEMA DE REAGENDAMENTO (MUDANÇA DE DATA/PROFISSIONAL)
===================================================== */
window.abrirModalReagendar = async function (profissionalNome, dataOriginal, horaOriginal) {
  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return alert("Sessão expirada. Faça login novamente.");

  const { data: consultaAtual } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("paciente_cpf", usuarioLogado.cpf)
    .eq("profissional", profissionalNome)
    .eq("data", dataOriginal)
    .eq("hora", horaOriginal)
    .eq("status_geral", "agendada")
    .single();

  if (!consultaAtual) return;

  if (consultaAtual.is_pacote === true) {
    alert("⚠️ REAGENDAMENTO NEGADO\n\nConsultas agendadas através de Pacotes Promocionais não podem ser reagendadas.");
    return;
  }

  let num_reagendamentos = consultaAtual.num_reagendamentos || 0;

  // AVISO DE TAXA EM VEZ DE BLOQUEIO
  if (num_reagendamentos >= 2) {
    alert("⚠️ ATENÇÃO:\nVocê já utilizou os seus 2 reagendamentos gratuitos.\n\nPara confirmar este novo reagendamento, será cobrada uma taxa de 30% do valor da consulta com o profissional selecionado.");
  }

  consultaParaReagendar = consultaAtual;

  const { data: profOriginal } = await supabaseClient.from("profissionais").select("especialidade").eq("nome", profissionalNome).single();
  if (!profOriginal) return;

  let especialidadeOriginal = profOriginal.especialidade.toLowerCase();
  const { data: todosProfissionais } = await supabaseClient.from("profissionais").select("nome, especialidade, registro, agenda, valor");

  let profsDaMesmaArea = todosProfissionais.filter(p => {
    if (!p.especialidade) return false;
    let espBanco = p.especialidade.toLowerCase();
    if (especialidadeOriginal.includes('psic')) return espBanco.includes('psic');
    if (especialidadeOriginal.includes('nutri')) return espBanco.includes('nutri');
    if (especialidadeOriginal.includes('fono')) return espBanco.includes('fono');
    return espBanco === especialidadeOriginal;
  });

  let select = document.getElementById("selectProfissionalReagendar");
  if (!select) return;

  select.innerHTML = "";
  profsDaMesmaArea.forEach(p => {
    let selected = (p.nome === profissionalNome) ? "selected" : "";
    select.innerHTML += `<option value="${p.nome}" ${selected}>🧑‍⚕️ ${p.nome} (${p.especialidade})</option>`;
  });

  document.getElementById("modalReagendar").classList.add("active");
  window.profissionaisReagendarCache = profsDaMesmaArea;
  window.mudarProfissionalReagendamento();
};

window.confirmarReagendamento = async function (botaoElement) {
  if (!dataSelecionada || !horarioSelecionado) return alert("Selecione um dia e um horário para reagendar.");

  // Feedback visual e trava de duplo clique
  if (botaoElement) {
    botaoElement.innerText = "Processando...";
    botaoElement.disabled = true;
  }

  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) {
    if (botaoElement) { botaoElement.innerText = "Confirmar Reagendamento"; botaoElement.disabled = false; }
    return;
  }

  let novaContagem = (consultaParaReagendar.num_reagendamentos || 0) + 1;

  // 1. Verifica choque de horário (AGORA BLOQUEANDO PENDENTES TAMBÉM)
  const { data: choque } = await supabaseClient
    .from("consultas")
    .select("id")
    .eq("profissional", profissionalReagendarAtual.nome)
    .eq("data", dataSelecionada)
    .eq("hora", horarioSelecionado)
    .in("status_geral", ["agendada", "pendente_pagamento"]); // 👈 Correção essencial

  if (choque && choque.length > 0) {
    alert("O horário selecionado acabou de ser ocupado. Por favor, escolha outro.");
    if (botaoElement) { botaoElement.innerText = "Confirmar Reagendamento"; botaoElement.disabled = false; }
    return;
  }

  // 2. Lógica de Cobrança da Taxa de 30%
  if (novaContagem > 2) {
    const { data: respostaPagamento, error: erroPagamento } = await supabaseClient.functions.invoke('processar-pagamento', {
      body: {
        consultaId: consultaParaReagendar.id,
        pacienteCpf: usuarioLogado.cpf,
        tipoAcao: 'reagendamento_taxa',
        novoProfissional: profissionalReagendarAtual.nome,
        novaData: dataSelecionada,
        novaHora: horarioSelecionado,
        valorConsulta: profissionalReagendarAtual.valor || 0
      }
    });

    console.log("RESPOSTA PAGAMENTO:", respostaPagamento);

    if (erroPagamento) {
      console.error(erroPagamento);
      alert("Erro ao gerar pagamento da taxa.");
      if (botaoElement) { botaoElement.innerText = "Confirmar Reagendamento"; botaoElement.disabled = false; }
      return;
    }

    // 👈 REDIRECIONAMENTO CORRIGIDO (Sem duplicidade)
    if (respostaPagamento && respostaPagamento.url) {
      window.location.href = respostaPagamento.url;
      return;
    } else {
      alert("Link de pagamento não recebido.");
      if (botaoElement) { botaoElement.innerText = "Confirmar Reagendamento"; botaoElement.disabled = false; }
      return;
    }

  } else {
    // 3. Reagendamento Gratuito (1º e 2º)
    const { error } = await supabaseClient
      .from("consultas")
      .update({
        profissional: profissionalReagendarAtual.nome,
        data: dataSelecionada,
        hora: horarioSelecionado,
        num_reagendamentos: novaContagem,
        status_paciente: null,
        status_profissional: null
      })
      .eq("id", consultaParaReagendar.id);

    if (error) {
      console.error(error);
      alert("Erro ao reagendar consulta.");
      if (botaoElement) { botaoElement.innerText = "Confirmar Reagendamento"; botaoElement.disabled = false; }
      return;
    }

    alert(`Sua consulta foi reagendada com sucesso! Você utilizou ${novaContagem} de 2 reagendamentos gratuitos.`);
    fecharModalReagendar();
    window.location.reload();
  }
};

window.fecharModalReagendar = function () {
  document.getElementById("modalReagendar").classList.remove("active");
  consultaParaReagendar = null;
  profissionalReagendarAtual = null;
  dataSelecionada = null;
  horarioSelecionado = null;
};

window.mudarProfissionalReagendamento = function () {
  let nomeEscolhido = document.getElementById("selectProfissionalReagendar").value;
  // Puxa do cache que criamos no abrirModalReagendar
  profissionalReagendarAtual = window.profissionaisReagendarCache.find(p => p.nome === nomeEscolhido);
  if (!profissionalReagendarAtual.agenda) profissionalReagendarAtual.agenda = { turnos: ["manha", "tarde", "noite"] };

  dataSelecionada = null; horarioSelecionado = null;
  document.getElementById("horariosReagendar").innerHTML = "";
  window.gerarCalendarioReagendar();
};

/* =====================================================
   🔹 SISTEMA DE REAGENDAMENTO (CALENDÁRIO)
===================================================== */
window.gerarCalendarioReagendar = function () {
  const calendario = document.getElementById("calendarioReagendar");
  if (!calendario) return;
  calendario.innerHTML = "";

  const diasSemanaNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  diasSemanaNomes.forEach(dia => {
    let div = document.createElement("div");
    div.innerText = dia;
    div.style.fontWeight = "bold";
    div.style.textAlign = "center";
    div.style.color = "#0f4c5c";
    calendario.appendChild(div);
  });

  const agora = new Date();
  const limiteTempo = new Date(agora.getTime());
  const limite2Meses = new Date(agora.getFullYear(), agora.getMonth() + 2, agora.getDate());
  let dataAtual = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  let diaSemanaAtual = dataAtual.getDay();
  for (let i = 0; i < diaSemanaAtual; i++) calendario.appendChild(document.createElement("div"));

  while (dataAtual <= limite2Meses) {
    let div = document.createElement("div");
    div.classList.add("dia");
    div.innerText = `${dataAtual.getDate().toString().padStart(2, '0')}/${(dataAtual.getMonth() + 1).toString().padStart(2, '0')}`;

    let diaSemana = dataAtual.getDay();
    let dataStr = `${dataAtual.getFullYear()}-${(dataAtual.getMonth() + 1).toString().padStart(2, '0')}-${dataAtual.getDate().toString().padStart(2, '0')}`;

    if (diaSemana === 0 || diaSemana === 6) {
      div.classList.add("indisponivel");
    } else {
      let profSalvo = profissionalAtual;
      profissionalAtual = profissionalReagendarAtual;

      div.classList.add("disponivel");
      div.onclick = (e) => window.selecionarDiaReagendar(dataStr, e.target);

      profissionalAtual = profSalvo;
    }

    calendario.appendChild(div);
    dataAtual.setDate(dataAtual.getDate() + 1);
  }
};

window.selecionarDiaReagendar = function (dataStr, elementoClicado) {
  dataSelecionada = dataStr; horarioSelecionado = null;
  document.querySelectorAll("#calendarioReagendar .dia").forEach(d => d.style.outline = "none");
  elementoClicado.style.outline = "3px solid #0E5F73";
  window.mostrarHorariosReagendar();
};

window.mostrarHorariosReagendar = async function () {
  const horariosDiv = document.getElementById("horariosReagendar");
  horariosDiv.innerHTML = "Carregando horários...";

  const agora = new Date(); const limiteTempo = new Date(agora.getTime());
  let [ano, mes, dia] = dataSelecionada.split("-");

  let profSalvo = profissionalAtual; profissionalAtual = profissionalReagendarAtual;
  let slots = window.gerarSlotsProfissional();
  profissionalAtual = profSalvo;

  const { data: consultasDoDia } = await supabaseClient
    .from("consultas")
    .select("hora")
    .eq("profissional", profissionalReagendarAtual.nome)
    .eq("data", dataSelecionada)
    .in("status_geral", ["agendada", "pendente_pagamento"]);

  horariosDiv.innerHTML = "";

  slots.forEach(hora => {
    let div = document.createElement("div"); div.classList.add("horario");

    let [h, m] = hora.split(":");
    let dataHoraSlot = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m));

    let minFim = parseInt(m) + 50;
    let hFim = parseInt(h);
    if (minFim >= 60) { hFim += 1; minFim -= 60; }
    const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

    div.innerText = hora === "12:00" ? "12:00 (Almoço)" : `${hora} - ${horaFimStr}`;

    let ocupado = consultasDoDia ? consultasDoDia.some(c => c.hora.substring(0, 5) === hora.substring(0, 5)) : false;
    let isHorarioAntigo = (profissionalReagendarAtual.nome === consultaParaReagendar.profissional && dataSelecionada === consultaParaReagendar.data && hora === consultaParaReagendar.hora.substring(0, 5));

    if (hora === "12:00" || dataHoraSlot < limiteTempo || (ocupado && !isHorarioAntigo)) {
      div.classList.add("horario-indisponivel");
      div.style.setProperty('background-color', '#e0e0e0', 'important');
      div.style.setProperty('color', '#999999', 'important');
      div.style.setProperty('border-color', '#cccccc', 'important');
      div.style.setProperty('cursor', 'not-allowed', 'important');
      div.style.setProperty('text-decoration', 'line-through', 'important');
      div.onclick = null;
    } else {
      div.classList.add("horario-disponivel");
      if (isHorarioAntigo) div.style.setProperty('background-color', '#2a9fec', 'important');
      div.onclick = (e) => {
        horarioSelecionado = hora;
        document.querySelectorAll("#horariosReagendar .horario").forEach(el => el.style.outline = "none");
        e.target.style.outline = "3px solid #000";
      };
    }
    horariosDiv.appendChild(div);
  });
};

/* =====================================================
   🔹 6. LOGIN DE SEGURANÇA DO ADMINISTRADOR
===================================================== */
const formLoginAdmin = document.getElementById("formLoginAdmin");
if (formLoginAdmin) {
  // Nota: Idealmente a senha do Admin tbm deve ser checada via Backend. 
  // Mantido fixo para facilitar sua gestão temporária, mas não recomendável em Prod!
  const USUARIO_CORRETO = "admin";
  const SENHA_CORRETA = "integra2026";

  if (localStorage.getItem("adminLogado") === "true") {
    document.getElementById("secaoLoginAdmin").classList.add("hidden");
    document.getElementById("conteudoAdmin").classList.remove("hidden");
    window.renderizarAdminCandidatos();
  }

  formLoginAdmin.addEventListener("submit", function (e) {
    e.preventDefault();
    const userDigitado = document.getElementById("usuarioAdmin").value;
    const senhaDigitada = document.getElementById("senhaAdmin").value;

    if (userDigitado === USUARIO_CORRETO && senhaDigitada === SENHA_CORRETA) {
      localStorage.setItem("adminLogado", "true");
      document.getElementById("secaoLoginAdmin").classList.add("hidden");
      document.getElementById("conteudoAdmin").classList.remove("hidden");
      window.renderizarAdminCandidatos();
    } else {
      alert("Usuário ou senha incorretos! Acesso negado.");
      document.getElementById("senhaAdmin").value = "";
    }
  });
}

window.sairAdmin = function () {
  localStorage.removeItem("adminLogado");
  window.location.reload();
}

/* =====================================================
   🔹 7. FUNÇÕES DO NOVO PAINEL ADMINISTRADOR (DASHBOARD)
===================================================== */
window.mudarAbaAdmin = function (aba) {
  document.getElementById("abaVisaoGeral").classList.add("hidden");
  document.getElementById("abaTriagem").classList.add("hidden");
  document.getElementById("abaProfissionais").classList.add("hidden");
  document.getElementById("abaFinanceiro").classList.add("hidden");

  document.querySelectorAll(".sidebar-admin button").forEach(btn => btn.classList.remove("ativo"));

  if (aba === 'visaoGeral') {
    document.getElementById("abaVisaoGeral").classList.remove("hidden");
    document.getElementById("menuVisaoGeral").classList.add("ativo");
    window.renderizarAdminVisaoGeral();
  } else if (aba === 'triagem') {
    document.getElementById("abaTriagem").classList.remove("hidden");
    document.getElementById("menuTriagem").classList.add("ativo");
    window.renderizarAdminCandidatos();
  } else if (aba === 'profissionais') {
    document.getElementById("abaProfissionais").classList.remove("hidden");
    document.getElementById("menuProfissionais").classList.add("ativo");
    window.renderizarAdminProfissionais();
  } else if (aba === 'financeiro') {
    document.getElementById("abaFinanceiro").classList.remove("hidden");
    document.getElementById("menuFinanceiro").classList.add("ativo");
    window.renderizarAdminFinanceiro();
  }
}

// OTIMIZADO: Busca totais através da contagem do Supabase
window.renderizarAdminVisaoGeral = async function () {
  const [{ count: countPacientes }, { count: countProfs }, { count: countFichas }, { count: countConsultas }] = await Promise.all([
    supabaseClient.from("pacientes").select('*', { count: 'exact', head: true }),
    supabaseClient.from("profissionais").select('*', { count: 'exact', head: true }),
    supabaseClient.from("candidatos_espera").select('*', { count: 'exact', head: true }),
    supabaseClient.from("consultas").select('*', { count: 'exact', head: true })
  ]);

  if (document.getElementById("totalPacientesAdmin")) document.getElementById("totalPacientesAdmin").innerText = countPacientes || 0;
  if (document.getElementById("totalProfissionaisAdmin")) document.getElementById("totalProfissionaisAdmin").innerText = countProfs || 0;
  if (document.getElementById("totalFichasAdmin")) document.getElementById("totalFichasAdmin").innerText = countFichas || 0;
  if (document.getElementById("totalConsultasAdmin")) document.getElementById("totalConsultasAdmin").innerText = countConsultas || 0;
}

// OTIMIZADO: Lista profissionais e permite ao Admin editar os valores
window.renderizarAdminProfissionais = async function () {
  const listaDiv = document.getElementById("listaProfissionaisAdmin");
  if (!listaDiv) return;

  const { data: profissionais } = await supabaseClient.from("profissionais").select("*");
  const { data: consultas } = await supabaseClient.from("consultas").select("profissional, status_geral");

  listaDiv.innerHTML = "";
  if (!profissionais || profissionais.length === 0) {
    listaDiv.innerHTML = "<p>Nenhum profissional cadastrado na plataforma.</p>";
    return;
  }

  profissionais.forEach(prof => {
    let consultasDoProf = consultas ? consultas.filter(c => c.profissional === prof.nome) : [];
    let concluidas = consultasDoProf.filter(c => c.status_geral === 'finalizada').length;
    let futuras = consultasDoProf.filter(c => c.status_geral === 'agendada').length;

    // Valores atuais do profissional (ou 0 se não tiver)
    let valInd = parseFloat(prof.valor || 0).toFixed(2);
    let valPac = parseFloat(prof.valor_pacote || 0).toFixed(2);

    listaDiv.innerHTML += `
      <div style="background: white; padding: 20px; border-radius: 8px; border-left: 5px solid #2ecc71; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 15px;">
        <div>
          <h3 style="color: #0F4C5C; margin-bottom: 5px; font-size: 18px;">${prof.nome} <span style="font-size: 13px; color: #777;">(${prof.especialidade})</span></h3>
          <p style="font-size: 13px; color: #555; margin-bottom: 8px;"><strong>Registro:</strong> ${prof.registro} | <strong>Contato:</strong> ${prof.telefone || 'Não informado'}</p>
          <p style="font-size: 13px; color: #0F766E; font-weight: bold;">Avulsa: R$ ${valInd} | Pacote: R$ ${valPac}</p>
          
          <div style="margin-top: 10px; display: flex; gap: 10px;">
              <button onclick="abrirModalValoresAdmin('${prof.registro}', '${prof.nome}', ${prof.valor || 0}, ${prof.valor_pacote || 0})" style="background: #f39c12; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">💰 Editar Valores</button>
              <button onclick="removerProfissional('${prof.registro}')" style="background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">🗑️ Remover</button>
          </div>
        </div>
        <div style="text-align: right; font-size: 13px; color: #444;">
          <p><strong>Consultas Futuras:</strong> ${futuras}</p>
          <p style="color: #2E7D32;"><strong>Consultas Concluídas:</strong> ${concluidas}</p>
        </div>
      </div>
    `;
  });
}

/* =====================================================
   🔹 CONTROLE DE PREÇOS PELO ADMINISTRADOR
===================================================== */
window.abrirModalValoresAdmin = function (registro, nome, valorAtual, valorPacoteAtual) {
  // Remove qualquer modal antigo que tenha ficado preso na tela
  const modalAntigo = document.getElementById('modalAdminValores');
  if (modalAntigo) modalAntigo.remove();

  const modalHtml = `
        <div id="modalAdminValores" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="background: white; padding: 25px; border-radius: 8px; width: 90%; max-width: 400px; text-align: left;">
                <h3 style="color: #0F4C5C; margin-bottom: 15px; font-size: 18px;">Precificação: <span style="color: #555;">${nome}</span></h3>
                
                <label style="font-size: 14px; font-weight: bold; color: #333;">Consulta Individual (R$):</label>
                <input type="number" id="adminInputValor" value="${valorAtual}" step="0.01" style="width: 100%; padding: 10px; margin: 5px 0 15px; border: 1px solid #ccc; border-radius: 4px;">
                
                <label style="font-size: 14px; font-weight: bold; color: #333;">Pacote c/ 4 Sessões (R$):</label>
                <input type="number" id="adminInputPacote" value="${valorPacoteAtual}" step="0.01" style="width: 100%; padding: 10px; margin: 5px 0 20px; border: 1px solid #ccc; border-radius: 4px;">
                
                <div style="display: flex; gap: 10px;">
                    <button onclick="salvarValoresAdmin('${registro}')" id="btnSalvarValoresAdmin" style="flex: 1; background: #0F766E; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Salvar Preços</button>
                    <button onclick="document.getElementById('modalAdminValores').remove()" style="flex: 1; background: #888; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">❌ Cancelar</button>
                </div>
            </div>
        </div>
    `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.salvarValoresAdmin = async function (registro) {
  const btnSalvar = document.getElementById("btnSalvarValoresAdmin");
  btnSalvar.innerText = "⏳ Salvando...";
  btnSalvar.disabled = true;

  const valNovo = parseFloat(document.getElementById("adminInputValor").value) || 0;
  const pacNovo = parseFloat(document.getElementById("adminInputPacote").value) || 0;

  const { error } = await supabaseClient.from("profissionais").update({
    valor: valNovo,
    valor_pacote: pacNovo
  }).eq("registro", registro);

  if (error) {
    alert("❌ Erro ao atualizar os valores no banco de dados.");
    btnSalvar.innerText = "💾 Salvar Preços";
    btnSalvar.disabled = false;
  } else {
    alert("✅ Valores atualizados com sucesso!");
    document.getElementById('modalAdminValores').remove();
    window.renderizarAdminProfissionais(); // Atualiza a lista na hora
  }
}

window.removerProfissional = async function (registro) {
  if (confirm("⚠️ ATENÇÃO!\n\nTem certeza absoluta que deseja EXCLUIR este profissional da plataforma?\n\nEle será removido da vitrine e não poderá mais acessar o painel. Esta ação não pode ser desfeita.")) {
    const { error } = await supabaseClient.from("profissionais").delete().eq("registro", registro);
    if (!error) {
      alert("Profissional removido com sucesso!");
      window.renderizarAdminProfissionais();
    } else {
      alert("Erro ao remover profissional.");
    }
  }
}

// OTIMIZADO: Admin Financeiro
window.renderizarAdminFinanceiro = async function () {
  const listaDiv = document.getElementById("listaFinanceiroAdmin");
  if (!listaDiv) return;

  listaDiv.innerHTML = "<p style='color: #666;'>Carregando transações...</p>";

  // 👇 CORREÇÃO: Removido o 'created_at' e substituído por 'data' e 'hora'
  const { data: consultas, error: errC } = await window.supabaseClient
    .from("consultas")
    .select("*")
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  const { data: pacientes } = await window.supabaseClient
    .from("pacientes")
    .select("cpf, nome");

  listaDiv.innerHTML = "";

  // Adicionada uma trava de segurança que avisa se der erro no banco
  if (errC) {
    console.error("Erro no Painel Financeiro:", errC);
    listaDiv.innerHTML = "<p style='color: #d9534f;'>Erro ao carregar as transações. Verifique o console.</p>";
    return;
  }

  if (!consultas || consultas.length === 0) {
    listaDiv.innerHTML = "<p>Nenhuma transação ou consulta registrada no sistema.</p>";
    return;
  }

  consultas.forEach(consulta => {
    let paciente = pacientes ? pacientes.find(u => u.cpf === consulta.paciente_cpf) : null;
    let nomePac = paciente ? paciente.nome : "Paciente Desconhecido";

    // Mapeamento das cores e status do financeiro
    let statusHTML = `<span style="background: #3498db; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">AGENDADA</span>`;

    if (consulta.status_geral === 'finalizada') {
      statusHTML = `<span style="background: #2ecc71; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">CONCLUÍDA</span>`;
    } else if (consulta.status_geral === 'ausente') {
      statusHTML = `<span style="background: #e67e22; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">PACIENTE FALTOU</span>`;
    } else if (consulta.status_geral === 'cancelada_reembolso') {
      statusHTML = `<span style="background: #e74c3c; color: white; padding: 6px 10px; border-radius: 4px; font-size: 12px; font-weight: bold;">🚨 CANCELADA - REEMBOLSAR</span>`;
    } else if (consulta.status_geral === 'pendente_pagamento') {
      statusHTML = `<span style="background: #f1c40f; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">AGUARDANDO PAGAMENTO</span>`;
    } else if (consulta.status_geral === 'cancelada') {
      statusHTML = `<span style="background: #95a5a6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">CANCELADA</span>`;
    }

    let dataFormatada = "Data não definida";
    if (consulta.data) {
      let [ano, mes, dia] = consulta.data.split('-');
      dataFormatada = `${dia}/${mes}/${ano}`;
    }

    listaDiv.innerHTML += `
      <div style="background: white; padding: 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee; margin-bottom: 10px;">
        <div>
          <h3 style="font-size: 16px; color: #333; margin-bottom: 5px;">${dataFormatada} às ${consulta.hora || '--:--'}</h3>
          <p style="font-size: 13px; color: #555;"><strong>Profissional:</strong> ${consulta.profissional}</p>
          <p style="font-size: 13px; color: #555;"><strong>Paciente:</strong> ${nomePac} (CPF: ${consulta.paciente_cpf})</p>
        </div>
        <div style="text-align: right;">
          ${statusHTML}
        </div>
      </div>
    `;
  });
};

setTimeout(() => {
  const conteudoAdmin = document.getElementById("conteudoAdmin");
  if (conteudoAdmin && !conteudoAdmin.classList.contains("hidden")) {
    window.renderizarAdminVisaoGeral();
  }
}, 500);

/* =====================================================
   🔹 8. PRONTUÁRIO ELETRÔNICO E PRESCRIÇÃO
===================================================== */
let pacienteProntuarioAtual = null;

window.abrirProntuario = async function (cpfPaciente, nomePaciente) {
  // Otimizado: Busca apenas o paciente específico
  const { data: paciente } = await supabaseClient.from("pacientes").select("*").eq("cpf", cpfPaciente).single();

  if (!paciente) { alert("Erro: Dados do paciente não encontrados."); return; }

  pacienteProntuarioAtual = paciente;
  document.getElementById("nomePacienteProntuario").innerText = "Paciente: " + nomePaciente;

  window.renderizarHistoricoProntuario();
  if (typeof carregarExamesDoPaciente === 'function') {
    carregarExamesDoPaciente(cpfPaciente);
  }

  const modal = document.getElementById("modalProntuario");
  if (modal) modal.classList.add("active");
};

window.fecharProntuario = function () {
  const modal = document.getElementById("modalProntuario");
  if (modal) modal.classList.remove("active");
  pacienteProntuarioAtual = null;
  document.getElementById("textoEvolucao").value = "";
  document.getElementById("textoPrescricao").value = "";
};

/* =====================================================
   🔹 8. PRONTUÁRIO ELETRÔNICO E PRESCRIÇÃO (Backend)
===================================================== */
window.renderizarHistoricoProntuario = async function () {
  const historicoDiv = document.getElementById("historicoProntuario");
  if (!historicoDiv) return;

  const profLogado = getProfissionalLogado();
  if (!profLogado || !pacienteProntuarioAtual) return;

  historicoDiv.innerHTML = "<p style='color: #888; font-size: 14px;'>Carregando prontuários...</p>";

  const { data: registros, error } = await supabaseClient
    .from("prontuarios")
    .select("*")
    .eq("paciente_cpf", pacienteProntuarioAtual.cpf)
    .eq("profissional_id", profLogado.id)
    .order("criado_em", { ascending: false }); // 👈 AQUI ESTÁ A CORREÇÃO: "criado_em"

  historicoDiv.innerHTML = "";

  if (error || !registros || registros.length === 0) {
    historicoDiv.innerHTML = "<p style='color: #888; font-size: 14px;'>Nenhum registro encontrado para este paciente.</p>";
    return;
  }

  registros.forEach(reg => {
    let ehEvolucao = reg.tipo === 'evolucao';
    let corBorda = ehEvolucao ? '#0F4C5C' : '#D62828';
    let icone = ehEvolucao ? '📝 Evolução' : '💊 Prescrição / Solicitação';

    historicoDiv.innerHTML += `
            <div style="border-left: 4px solid ${corBorda}; background: white; padding: 12px; border-radius: 4px; border: 1px solid #ddd; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: ${corBorda}; font-size: 14px;">${icone}</strong>
                    <span style="font-size: 12px; color: #888; font-weight: bold;">${reg.data_hora}</span>
                </div>
                <p style="font-size: 13px; color: #333; margin: 0; white-space: pre-wrap;">${reg.texto}</p>
            </div>
        `;
  });
};

window.salvarRegistroProntuario = async function (tipo, enviarEmail) {
  const campoId = tipo === 'evolucao' ? 'textoEvolucao' : 'textoPrescricao';
  const texto = document.getElementById(campoId).value.trim();

  if (!texto) {
    alert(`Por favor, digite a ${tipo === 'evolucao' ? 'evolução' : 'prescrição'} antes de salvar.`);
    return;
  }

  if (confirm("⚠️ ATENÇÃO: Este registro é definitivo e não poderá ser editado. Deseja prosseguir?")) {
    const profLogado = getProfissionalLogado();
    const agora = new Date();
    const dataHoraStr = `${agora.getDate().toString().padStart(2, '0')}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${agora.getFullYear()} às ${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
    const documentoId = "DOC-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

    const novoRegistro = {
      id: documentoId,
      paciente_cpf: pacienteProntuarioAtual.cpf,
      profissional_id: profLogado.id, // 👈 ENVIA O ID NUMÉRICO
      tipo: tipo,
      texto: texto,
      data_hora: dataHoraStr // 👈 NOME EXATO DA COLUNA NO BANCO
    };

    const { error } = await supabaseClient
      .from("prontuarios")
      .insert([novoRegistro]);

    if (error) {
      console.error(error);
      alert("Erro ao salvar o registro no servidor. Verifique o console para mais detalhes.");
      return;
    }

    document.getElementById(campoId).value = "";
    window.renderizarHistoricoProntuario();

    if (enviarEmail && typeof window.enviarEmailProntuario === 'function') {
      window.enviarEmailProntuario(tipo, texto, profLogado, documentoId, dataHoraStr);
    } else {
      alert("Registro salvo com sucesso!");
    }
  }
};

// =====================================================
// 🔹 GERAÇÃO DO MODELO PDF ORGANIZADO (Fica idêntico!)
// =====================================================
// (Eu vou encurtar a visualização dessa função aqui no chat para focar na lógica de banco, 
//  mas no seu código você DEVE MANTER toda a lógica do jsPDF que você já criou perfeitamente).
window.enviarEmailProntuario = async function (tipo, texto, profLogado, documentoId, dataHoraStr) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. CARREGAR A LOGO PARA O PDF
    const carregarLogoBase64 = () => {
      return new Promise((resolve) => {
        let img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          let canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          let ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL('image/png'), w: img.width, h: img.height });
        };
        img.onerror = () => resolve(null);
        img.src = 'img/logo.png';
      });
    };

    const logoObj = await carregarLogoBase64();

    // 2. GERAR O QR CODE
    let baseUrl = window.location.origin;

    // Se o PDF for gerado em testes no computador local, força a URL oficial da internet
    if (!baseUrl.startsWith("http") || baseUrl.includes("localhost") || baseUrl === "null") {
      baseUrl = "https://integra-saude.moreirasantosv15.workers.dev";
    }

    const linkValidacao = baseUrl + "/validar.html?id=" + documentoId;
    const qr = new QRious({
      value: linkValidacao,
      size: 800,
      level: 'H'
    });
    const qrBase64 = qr.toDataURL('image/png');

    // 3. CONFIGURAÇÕES DA PÁGINA
    const margemEsquerda = 15;
    const larguraPagina = 210;
    const alturaPagina = 297;
    const larguraUtil = larguraPagina - (margemEsquerda * 2);

    // Limite da linha do texto (deixa espaço para os Dados do Profissional no final)
    const maxLinha = 205;

    // Novo design do título: Letra com a cor principal e linha fina de sublinhado
    const desenharTituloSublinhado = (titulo, y) => {
      doc.setFontSize(11);
      doc.setTextColor(15, 76, 92);
      doc.setFont("helvetica", "bold");
      doc.text(titulo, margemEsquerda, y);

      // Linha do sublinhado
      doc.setDrawColor(15, 76, 92);
      doc.setLineWidth(0.4);
      doc.line(margemEsquerda, y + 2, margemEsquerda + larguraUtil, y + 2);

      doc.setTextColor(0, 0, 0); // Volta pro preto normal
      return y + 10;
    };

    // Função que desenha a marca d'água e o rodapé em CADA folha
    const aplicarFundoERodape = (isUltimaPagina = false) => {
      // Marca D'água (Centralizada)
      if (logoObj) {
        doc.setGState(new doc.GState({ opacity: 0.1 }));
        const logoW = 120;
        const logoH = (logoObj.h * logoW) / logoObj.w;
        doc.addImage(logoObj.data, 'PNG', (larguraPagina - logoW) / 2, (alturaPagina - logoH) / 2, logoW, logoH);
        doc.setGState(new doc.GState({ opacity: 1.0 }));
      }

      // 🔹 Se for a última página, imprime os DADOS DO PROFISSIONAL no final
      if (isUltimaPagina) {
        let yProf = 220;
        desenharTituloSublinhado("DADOS DO PROFISSIONAL", yProf);

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`Nome:`, margemEsquerda, yProf + 8);
        doc.setFont("helvetica", "normal");
        doc.text(profLogado.nome, margemEsquerda + 13, yProf + 8);

        doc.setFont("helvetica", "bold");
        doc.text(`Registro:`, margemEsquerda, yProf + 15);
        doc.setFont("helvetica", "normal");
        doc.text(profLogado.registro, margemEsquerda + 19, yProf + 15);
      }

      // 🔹 Caixa do Rodapé - Validação
      let yRodape = 250;
      doc.setFillColor(15, 76, 92);
      doc.rect(margemEsquerda, yRodape, larguraUtil, 7, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.text("Validação do documento", margemEsquerda + 3, yRodape + 5);

      // Textos de Isenção
      yRodape += 11;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Documento emitido por meio da plataforma Integra Saúde.", margemEsquerda, yRodape);
      doc.text("A responsabilidade clínica é exclusiva do profissional emissor.", margemEsquerda, yRodape + 5);

      // QR Code posicionado à esquerda (Tamanho Reduzido para 16x16)
      doc.addImage(qrBase64, 'PNG', margemEsquerda, yRodape + 8, 16, 16);

      // Código de Autenticação ao lado do QR Code (SEM NEGRITO)
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`CÓDIGO DE AUTENTICAÇÃO: ${documentoId}`, margemEsquerda + 22, yRodape + 18);
    };

    // ==========================================
    // PREENCHENDO O DOCUMENTO
    // ==========================================
    let linhaAtual = 15;

    // Logo no Topo
    if (logoObj) {
      const wTopo = 50;
      const hTopo = (logoObj.h * wTopo) / logoObj.w;
      doc.addImage(logoObj.data, 'PNG', (larguraPagina - wTopo) / 2, linhaAtual, wTopo, hTopo);
      linhaAtual += hTopo + 5;
    } else {
      linhaAtual += 15;
    }

    // Texto INTEGRA SAÚDE abaixo da logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 76, 92);
    const nomeSite = "INTEGRA SAÚDE";
    doc.text(nomeSite, (larguraPagina - doc.getTextWidth(nomeSite)) / 2, linhaAtual);
    linhaAtual += 12;

    // BLOCO 1: DADOS DO PACIENTE
    linhaAtual = desenharTituloSublinhado("DADOS DO PACIENTE", linhaAtual);

    let nomePac = pacienteProntuarioAtual ? pacienteProntuarioAtual.nome : "Não identificado";
    let cpfPac = pacienteProntuarioAtual ? pacienteProntuarioAtual.cpf : "00000000000";
    cpfPac = cpfPac.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    let nasc = (pacienteProntuarioAtual && pacienteProntuarioAtual.nascimento)
      ? pacienteProntuarioAtual.nascimento.split('-').reverse().join('/')
      : "Não informada";

    const colunaEsq = margemEsquerda;
    const colunaDir = 120;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Nome:`, colunaEsq, linhaAtual);
    doc.setFont("helvetica", "normal");
    doc.text(nomePac, colunaEsq + 13, linhaAtual);

    doc.setFont("helvetica", "bold");
    doc.text(`Data de nascimento:`, colunaDir, linhaAtual);
    doc.setFont("helvetica", "normal");
    doc.text(nasc, colunaDir + 35, linhaAtual);

    linhaAtual += 7;

    doc.setFont("helvetica", "bold");
    doc.text(`CPF:`, colunaEsq, linhaAtual);
    doc.setFont("helvetica", "normal");
    doc.text(cpfPac, colunaEsq + 10, linhaAtual);

    doc.setFont("helvetica", "bold");
    doc.text(`Data do atendimento:`, colunaDir, linhaAtual);
    doc.setFont("helvetica", "normal");
    doc.text(dataHoraStr, colunaDir + 38, linhaAtual);

    linhaAtual += 12;

    // BLOCO 2: CORPO DO DOCUMENTO COM TÍTULO DINÂMICO

    // Captura a PRIMEIRA LINHA digitada pelo profissional para ser o Título
    let linhasDoTexto = texto.split('\n');
    let tituloDinamico = (linhasDoTexto.length > 0 && linhasDoTexto[0].trim() !== '') ? linhasDoTexto[0].trim().toUpperCase() : 'DOCUMENTO';

    // Remove a primeira linha para não repeti-la no corpo do texto
    if (linhasDoTexto.length > 0 && linhasDoTexto[0].trim() !== '') {
      linhasDoTexto.shift();
    }

    let textoConteudo = linhasDoTexto.join('\n').trim();
    if (!textoConteudo) textoConteudo = "Nenhuma observação adicional.";

    // Desenha a primeira linha capturada com o formato do título principal
    linhaAtual = desenharTituloSublinhado(tituloDinamico, linhaAtual);

    doc.setFont("helvetica", "normal");
    const linhasQuebradas = doc.splitTextToSize(textoConteudo, larguraUtil);

    // Paginação: Se o texto for longo, ele cria uma folha nova
    for (let i = 0; i < linhasQuebradas.length; i++) {
      if (linhaAtual > maxLinha) {
        aplicarFundoERodape(false); // Rodapé da página incompleta (sem Dados do Profissional)
        doc.addPage();
        linhaAtual = 20;
      }
      doc.text(linhasQuebradas[i], margemEsquerda, linhaAtual);
      linhaAtual += 6;
    }

    // Aplica o rodapé final na última página (onde ficarão os DADOS DO PROFISSIONAL)
    aplicarFundoERodape(true);

    // ==========================================
    // DOWNLOAD
    // ==========================================
    const sufixoArquivo = tipo === 'evolucao' ? 'Evolucao' : 'Prescricao';
    const nomeArquivoLimpo = nomePac.replace(/\s+/g, '_');
    doc.save(`${sufixoArquivo}_${nomeArquivoLimpo}.pdf`);

  } catch (erro) {
    console.error("Erro na geração do PDF:", erro);
    alert("Ocorreu um erro ao gerar o arquivo PDF. Verifique a aba Console para mais detalhes.");
  }
};

/* =====================================================
   🔹 9. SISTEMA DE VALIDAÇÃO DE DOCUMENTOS (QR CODE)
===================================================== */
if (window.location.pathname.includes("validar")) {
  // 👈 Executa imediatamente sem esperar (evita congelamentos)
  (async function () {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("id");
    const box = document.getElementById("resultadoBox");

    if (!docId) {
      if (box) box.innerHTML = `
        <div class="status-icon invalid">❌</div>
        <h2 style="color: #d9534f; margin-bottom: 10px;">Documento Inválido</h2>
        <p style="color: #666;">Nenhum código de validação foi fornecido no link.</p>
        <button class="btn-primary" style="margin-top:20px; width:100%;" onclick="window.location.href='index.html'">Acessar o Site</button>
      `;
      return;
    }

    if (box) box.innerHTML = `<p style="color: #666;">Consultando servidor de autenticação...</p>`;

    try {
      // Busca o documento no banco
      const { data: documento, error: errDoc } = await window.supabaseClient
        .from("prontuarios")
        .select("*")
        .eq("id", docId)
        .single();

      if (errDoc || !documento) {
        if (box) box.innerHTML = `
            <div class="status-icon invalid">❌</div>
            <h2>Erro ao validar</h2>
            <p>Documento não encontrado na base de dados ou acesso negado.</p>
          `;
        return;
      }

      // Busca o nome do Paciente com segurança
      let nomePac = "Paciente não identificado";
      if (documento.paciente_cpf) {
        const { data: paciente } = await window.supabaseClient
          .from("pacientes")
          .select("nome")
          .eq("cpf", documento.paciente_cpf)
          .single();
        if (paciente) nomePac = paciente.nome;
      }

      // Busca os dados do Profissional com segurança
      let nomeProf = "Profissional não identificado";
      let regProf = "Não identificado";
      if (documento.profissional_id) {
        const { data: prof } = await window.supabaseClient
          .from("profissionais")
          .select("nome, registro")
          .eq("id", documento.profissional_id)
          .single();
        if (prof) {
          nomeProf = prof.nome;
          regProf = prof.registro;
        }
      }

      let tipoNome = documento.tipo === 'evolucao' ? 'Evolução Clínica (Prontuário)' : 'Prescrição de Exames/Medicamentos';

      // Garante que o CPF vire TEXTO (String) antes de formatar com pontos e traços
      let cpfFormatado = "000.000.000-00";
      if (documento.paciente_cpf) {
        cpfFormatado = String(documento.paciente_cpf).padStart(11, '0').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      }

      // Exibe o selo de autenticidade
      if (box) box.innerHTML = `
              <div class="status-icon valid">✅</div>
              <h2 style="color: #2E7D32; margin-bottom: 20px;">Documento Autêntico</h2>
              
              <div class="doc-info">
                <p><strong>Código de Autenticação:</strong> <span style="color:#0F4C5C;">${documento.id}</span></p>
                <p><strong>Tipo de Documento:</strong> ${tipoNome}</p>
                <p><strong>Data de Emissão:</strong> ${documento.data_hora || "Data não registrada"}</p>
                <p><strong>Paciente:</strong> ${nomePac} (CPF: ${cpfFormatado})</p>
                <p><strong>Emitido por:</strong> ${nomeProf} (${regProf})</p>
              </div>
              
              <p style="font-size: 13px; color: #777; margin-bottom: 20px;">Este documento foi assinado e salvo de forma definitiva e imutável no banco de dados da Integra Saúde.</p>
              <button class="btn-primary" style="width:100%;" onclick="window.location.href='index.html'">Voltar para a Integra Saúde</button>
           `;

    } catch (err) {
      console.error("Erro interno ao validar:", err);
      if (box) box.innerHTML = `
            <div class="status-icon invalid">❌</div>
            <h2>Erro no Sistema</h2>
            <p>Ocorreu um problema ao processar os dados. Tente atualizar a página.</p>
        `;
    }
  })();
}

// =====================================================
// 🔹 PREENCHIMENTO AUTOMÁTICO DA PRESCRIÇÃO
// =====================================================
if (window.location.pathname.includes("prescricao.html")) {
  document.addEventListener("DOMContentLoaded", async function () {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("id");

    if (!docId) {
      alert("Documento não encontrado.");
      return;
    }

    const { data: documento, error } = await supabaseClient
      .from("prontuarios")
      .select("*")
      .eq("id", docId)
      .single();

    if (!documento || error) {
      alert("Documento inválido.");
      return;
    }

    const { data: paciente } = await supabaseClient.from("pacientes").select("*").eq("cpf", documento.paciente_cpf).single();

    // 👈 BUSCA PROFISSIONAL PELO ID
    const { data: prof } = await supabaseClient.from("profissionais").select("*").eq("id", documento.profissional_id).single();

    document.getElementById("nome").innerText = paciente?.nome || "-";
    let cpf = documento.paciente_cpf || "00000000000";
    cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    document.getElementById("cpf").innerText = cpf;
    let nasc = paciente?.nascimento
      ? paciente.nascimento.split('-').reverse().join('/')
      : "-";

    document.getElementById("nascimento").innerText = nasc;
    document.getElementById("atendimento").innerText = documento.data_hora;
    document.getElementById("prescricao").innerText = documento.texto;
    document.getElementById("profissional").innerText = prof?.nome || "-";
    document.getElementById("registro").innerText = prof?.registro || "-";

    let conselho = "Conselho Regional";
    let esp = (prof?.especialidade || "").toLowerCase();

    if (esp.includes("psic")) conselho = "CRP";
    else if (esp.includes("nutri")) conselho = "CRN";
    else if (esp.includes("fono")) conselho = "CRFa";

    document.getElementById("conselho").innerText = conselho;

    const baseUrl = window.location.origin;
    const linkValidacao = baseUrl + "/validar.html?id=" + documento.id;

    const qr = new QRious({
      element: document.getElementById("qrCode"),
      value: linkValidacao,
      size: 120
    });
  });
}

// =========================================================================
// 🔹 SISTEMA DE ENVIO 100% GRATUITO (VIA GOOGLE APPS SCRIPT)
// =========================================================================
// (Essa parte pode permanecer inalterada pois é uma comunicação HTTP via Fetch que não depende de BD)
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbwDNlsXAHndlacz_zKL5_giNjXr68qzprAniosJfvSeBBMhpTzxVeD4q6W-im6MvxbCGA/exec";

window.enviarDocumentoAssinado = async function () {
  const fileInput = document.getElementById('uploadPdfEnvio');
  const btn = document.getElementById('btnEnviarPaciente');
  const paciente = typeof pacienteProntuarioAtual !== 'undefined' ? pacienteProntuarioAtual : null;

  if (!paciente || !paciente.email || paciente.email.trim() === "") {
    alert("⚠️ Não é possível enviar: Este paciente não possui um e-mail cadastrado no sistema.");
    return;
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Nenhum arquivo selecionado.");
    return;
  }

  const file = fileInput.files;
  btn.innerHTML = "⏳ Enviando e-mail... Aguarde.";
  btn.disabled = true;

  const reader = new FileReader();

  reader.onload = async function () {
    try {
      const base64data = reader.result.split(',');
      const pacoteDeDados = {
        token: "INT_94xAqP7z_2026_PRIVATE",
        origin: window.location.origin,
        pdfBase64: base64data,
        email: paciente.email,
        nome: paciente.nome || "Paciente",
        nomeArquivo: file.name
      };

      const response = await fetch(URL_GOOGLE_SCRIPT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(pacoteDeDados),
      });

      const resultado = await response.json();
      if (resultado.status === "erro") throw new Error("O Google Script recusou o envio. Motivo: " + resultado.mensagem);

      alert(`✅ ENVIADO COM SUCESSO!\n\nO documento foi enviado para: ${paciente.email}`);

      fileInput.value = "";
      document.getElementById("nome-arquivo-envio").innerText = "Nenhum arquivo selecionado";
      btn.innerHTML = "🚀 Enviar Diretamente ao Paciente";
      btn.disabled = true;
      btn.style.opacity = "0.6";

    } catch (error) {
      console.error("Erro no envio:", error);
      alert("❌ FALHA AO ENVIAR: " + error.message);
      btn.disabled = false;
      btn.innerHTML = "🚀 Tentar Novamente";
      btn.style.opacity = "1";
    }
  };
  reader.onerror = function () {
    alert("Erro na leitura do arquivo no seu computador.");
    btn.disabled = false;
    btn.innerHTML = "🚀 Tentar Novamente";
    btn.style.opacity = "1";
  };
  reader.readAsDataURL(file);
};

window.selecionarArquivoPDF = function (input) {
  const nomeTxt = document.getElementById("nome-arquivo-envio");
  const btn = document.getElementById("btnEnviarPaciente");
  if (input.files && input.files.length > 0) {
    nomeTxt.innerHTML = `✅ Arquivo pronto: <b>${input.files.name}</b>`;
    btn.disabled = false;
    btn.style.opacity = "1";
  } else {
    nomeTxt.innerHTML = "Nenhum arquivo selecionado";
    btn.disabled = true;
    btn.style.opacity = "0.6";
  }
};

window.soltarArquivoPDF = function (event) {
  event.preventDefault();
  const dropzone = document.getElementById("dropzone-envio");
  dropzone.style.backgroundColor = "#f0f7f7";
  dropzone.style.borderColor = "#0F766E";
  const files = event.dataTransfer.files;

  if (files.length > 0 && files.type === "application/pdf") {
    const fileInput = document.getElementById("uploadPdfEnvio");
    fileInput.files = files;
    window.selecionarArquivoPDF(fileInput);
  } else {
    alert("⚠️ Por favor, solte apenas arquivos no formato PDF.");
  }
};

/* =====================================================
   📁 SISTEMA DE EXAMES (CLOUDINARY + SUPABASE)
===================================================== */
// 1. Abre o modal e carrega a lista de médicos que o paciente tem consulta
window.abrirModalExames = async function () {
  const selectProf = document.getElementById("selectProfissionalExame");
  selectProf.innerHTML = '<option value="">⏳ Carregando profissionais...</option>';
  document.getElementById('modalExames').style.display = 'flex';

  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return;

  // Busca na agenda os médicos desse paciente
  const { data: consultas } = await supabaseClient
    .from("consultas")
    .select("profissional")
    .eq("paciente_cpf", usuarioLogado.cpf);

  if (consultas && consultas.length > 0) {
    // Tira os nomes duplicados (se ele marcou 2 vezes com o mesmo médico)
    const profsUnicos = [...new Set(consultas.map(c => c.profissional))];
    selectProf.innerHTML = '<option value="">Selecione o profissional...</option>';
    profsUnicos.forEach(prof => {
      selectProf.innerHTML += `<option value="${prof}">${prof}</option>`;
    });
  } else {
    selectProf.innerHTML = '<option value="">Nenhuma consulta encontrada.</option>';
  }
};

window.fecharModalExames = function () {
  document.getElementById('modalExames').style.display = 'none';
};

// 2. Faz o Upload e AGORA SALVA NO BANCO
window.salvarExamePaciente = async function () {
  const selectProf = document.getElementById("selectProfissionalExame");
  const profissionalEscolhido = selectProf.value;
  const inputArquivo = document.getElementById("arquivoExame");
  const arquivoSelecionado = inputArquivo.files[0];

  if (!profissionalEscolhido) {
    alert("Por favor, selecione para qual profissional deseja enviar o exame.");
    return;
  }

  if (!arquivoSelecionado) {
    alert("Por favor, selecione um arquivo primeiro.");
    return;
  }

  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return;

  const btnSalvar = document.getElementById("btnSalvarExame");
  btnSalvar.innerText = "⏳ Enviando...";
  btnSalvar.disabled = true;

  try {
    const extensao = arquivoSelecionado.name.split('.').pop();
    const nomeUnico = `exame_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extensao}`;

    // Upload pro Storage
    const { data: uploadData, error: uploadError } = await window.supabaseClient
      .storage.from('exames').upload(nomeUnico, arquivoSelecionado, { cacheControl: '3600', upsert: false });

    if (uploadError) throw new Error("Falha no upload para o Supabase Storage.");

    const { data: urlData } = window.supabaseClient.storage.from('exames').getPublicUrl(nomeUnico);
    const linkDoExame = urlData.publicUrl;

    // Formata a data para o padrão YYYY-MM-DD que o banco de dados exige
    const dataHoje = new Date().toISOString().split('T')[0];

    // 👇 Inserindo com as colunas EXATAS do seu banco de dados 👇
    const { error: dbError } = await window.supabaseClient.from('exames_pacientes').insert({
      arquivo_url: linkDoExame,         // 👈 CORRIGIDO de "url"
      paciente_cpf: usuarioLogado.cpf,
      nome_arquivo: arquivoSelecionado.name,
      tipo_arquivo: arquivoSelecionado.type, // 👈 CORRIGIDO de "tipo"
      data_envio: dataHoje,
      profissional: profissionalEscolhido
    });

    if (dbError) throw dbError;

    alert("Exame enviado com sucesso para o profissional selecionado!");
    fecharModalExames();

  } catch (error) {
    console.error("ERRO:", error);
    alert("❌ Erro ao enviar. Verifique sua conexão e tente novamente.");
  } finally {
    btnSalvar.innerText = "📤 Enviar Exame";
    btnSalvar.disabled = false;
    inputArquivo.value = "";
  }
};

// 3. O Profissional puxa APENAS os exames mandados para ele (Atualizado com nomes do BD)
window.carregarExamesDoPaciente = async function (idpaciente_cpf) {
  const container = document.getElementById('listaExamesPaciente');
  if (!container) return;

  const profLogado = getProfissionalLogado();
  if (!profLogado) return;

  container.innerHTML = "<p style='font-size: 13px; color: #777;'>⏳ Buscando exames no servidor...</p>";

  // 👇 CORREÇÃO 1: Ordenando pela coluna "criado_em" igual ao seu banco
  const { data: examesDoPaciente, error } = await supabaseClient
    .from("exames_pacientes")
    .select("*")
    .eq("paciente_cpf", idpaciente_cpf)
    .eq("profissional", profLogado.nome)
    .order('criado_em', { ascending: false });

  if (error || !examesDoPaciente || examesDoPaciente.length === 0) {
    if (error) console.error("Erro ao puxar exames:", error); // Ajuda a rastrear qualquer erro no F12
    container.innerHTML = "<p style='font-size: 13px; color: #777;'>Nenhum exame anexado para você por este paciente.</p>";
    return;
  }

  container.innerHTML = "";

  examesDoPaciente.forEach(exame => {
    const div = document.createElement('div');
    div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 8px;";

    // 👇 CORREÇÃO 2: Lendo os dados com os nomes exatos das colunas da tabela 👇
    const icone = exame.tipo_arquivo && exame.tipo_arquivo.includes('pdf') ? '📄' : '🖼️';

    div.innerHTML = `
        <div>
            <strong style="color: #0F4C5C;">${icone} ${exame.nome_arquivo}</strong><br>
            <span style="font-size: 11px; color: #888;">Enviado em: ${exame.data_envio}</span>
        </div>
        <a href="${exame.arquivo_url}" target="_blank" style="background: #0F766E; color: white; padding: 6px 15px; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">📥 Abrir Exame</a>
    `;
    container.appendChild(div);
  });
};

/* =====================================================
   🗓️ LISTAGEM DE CONSULTAS DO PACIENTE (OTIMIZADA)
===================================================== */

window.mudarAbaConsultas = function (abaAtiva) {
  document.querySelectorAll('.tab-content-paciente').forEach(tab => tab.style.display = 'none');
  document.querySelectorAll('.btn-aba-paciente').forEach(btn => {
    btn.style.borderBottom = 'none';
    btn.style.color = '#777';
    btn.style.fontWeight = 'normal';
  });

  const tabElement = document.getElementById(abaAtiva);
  if (tabElement) tabElement.style.display = 'block';

  const btnAtivo = document.getElementById('btn-' + abaAtiva);
  if (btnAtivo) {
    btnAtivo.style.borderBottom = '3px solid #0F766E';
    btnAtivo.style.color = '#0F766E';
    btnAtivo.style.fontWeight = 'bold';
  }
};

window.mudarAbaConsultasProf = function (abaId) {
  window.abaProfissionalAtual = abaId;
  localStorage.setItem("abaProfissionalAtual", abaId);

  document.querySelectorAll(".tab-content-prof").forEach(tab => {
    tab.style.display = "none";
  });

  document.querySelectorAll(".btn-aba-prof").forEach(btn => {
    btn.style.borderBottom = "none";
    btn.style.color = "#777";
    btn.style.fontWeight = "normal";
  });

  const aba = document.getElementById(abaId);
  if (aba) aba.style.display = "block";

  const botao = document.getElementById("btn-" + abaId);
  if (botao) {
    botao.style.borderBottom = "3px solid #0F766E";
    botao.style.color = "#0F766E";
    botao.style.fontWeight = "bold";
  }
};

window.carregarMinhasConsultas = async function () {
  const usuarioLogado = await getUsuarioLogado(); // Seguro
  const mural = document.getElementById('muralDeConsultas');

  if (!usuarioLogado || !mural) return;

  // 👇 OTIMIZAÇÃO: Baixa APENAS as consultas deste paciente específico
  const { data: minhasConsultas, error } = await supabaseClient
    .from("consultas")
    .select("*")
    .eq("paciente_cpf", usuarioLogado.cpf)
    .order('data', { ascending: false });

  if (error || !minhasConsultas || minhasConsultas.length === 0) {
    mural.innerHTML = `<div style="padding: 20px; text-align: center;"><p style="color: #555;">Você não tem histórico de consultas.</p></div>`;
    return;
  }

  // 1. AUTO-LIMPEZA VISUAL E AUTOMÁTICA (Agora salvando no banco!)
  const agora = new Date();
  minhasConsultas.forEach(c => {
    if (c.status_geral === 'agendada') {
      const [ano, mes, dia] = c.data.split("-");
      const [h, m] = c.hora.split(":");
      const limiteTolerancia = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m)).getTime() + (90 * 60 * 1000);

      if (agora.getTime() >= limiteTolerancia) {
        if (c.status_paciente === 'na_sala' || c.status_profissional === 'na_sala') {
          c.status_geral = 'finalizada'; // Muda na tela

          // 👇 A LINHA MÁGICA QUE FALTAVA PARA SALVAR NO BANCO 👇
          window.supabaseClient.from("consultas")
            .update({ status_geral: "finalizada" })
            .eq("id", c.id)
            .then();

        } else {
          c.status_geral = 'ausente'; // Muda na tela
          window.supabaseClient.from("consultas")
            .update({ status_geral: "ausente" })
            .eq("id", c.id)
            .then();
        }
      }
    }
  });

  // 2. IDENTIFICAÇÃO GLOBAL DOS PACOTES E NUMERAÇÃO CRONOLÓGICA
  let historicoPacotesIDs = [];
  let contadorSessoes = {};

  // 👇 Ordena no tempo (do mais antigo pro mais novo) antes de contar
  let consultasCrescente = [...minhasConsultas].sort((a, b) => new Date(a.data + "T" + a.hora).getTime() - new Date(b.data + "T" + b.hora).getTime());

  consultasCrescente.forEach(c => {
    if (c.is_pacote) {
      let chavePacote = c.pacote_id || c.profissional;
      if (!historicoPacotesIDs.includes(chavePacote)) historicoPacotesIDs.push(chavePacote);

      if (!contadorSessoes[chavePacote]) contadorSessoes[chavePacote] = 0;
      contadorSessoes[chavePacote]++;

      // Devolve o número certo para a consulta original
      let original = minhasConsultas.find(orig => orig.id === c.id);
      if (original) {
        original.pacoteIndexGlobal = historicoPacotesIDs.indexOf(chavePacote) + 1;
        original.sessaoNumeroCalculada = contadorSessoes[chavePacote];
      }
    }
  });

  // 3. ORDENAÇÃO E SEPARAÇÃO
  // Consultas futuras: Da mais próxima (hoje) para a mais distante
  const ordenarFuturas = (lista) => {
    return lista.sort((a, b) => new Date(a.data + "T" + a.hora.substring(0, 5)).getTime() - new Date(b.data + "T" + b.hora.substring(0, 5)).getTime());
  };

  // Consultas passadas: Da mais recente que aconteceu para a mais antiga
  const ordenarPassadas = (lista) => {
    return lista.sort((a, b) => new Date(b.data + "T" + b.hora.substring(0, 5)).getTime() - new Date(a.data + "T" + a.hora.substring(0, 5)).getTime());
  };

  let pacotes = ordenarFuturas(minhasConsultas.filter(c => c.is_pacote && c.status_geral === 'agendada'));
  let individuais = ordenarFuturas(minhasConsultas.filter(c => !c.is_pacote && c.status_geral === 'agendada'));

  let realizadas = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'finalizada'));
  let canceladas = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'cancelada' || c.status_geral === 'cancelada_reembolso'));
  let perdidas = ordenarPassadas(minhasConsultas.filter(c => c.status_geral === 'ausente'));

  let menuAbas = `
    <div style="display: flex; overflow-x: auto; gap: 15px; border-bottom: 2px solid #ddd; padding-bottom: 0px; margin-bottom: 25px; scrollbar-width: thin;">
        <button id="btn-tabIndividuais" class="btn-aba-paciente" onclick="mudarAbaConsultas('tabIndividuais')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">📅 Individuais Pendentes</button>
        <button id="btn-tabPacotes" class="btn-aba-paciente" onclick="mudarAbaConsultas('tabPacotes')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; border-bottom: 3px solid #0F766E; color: #0F766E; font-weight: bold;">📦 Pacotes Pendentes</button>
        <button id="btn-tabRealizadas" class="btn-aba-paciente" onclick="mudarAbaConsultas('tabRealizadas')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">✅ Realizadas</button>
        <button id="btn-tabCanceladas" class="btn-aba-paciente" onclick="mudarAbaConsultas('tabCanceladas')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">🛑 Canceladas</button>
        <button id="btn-tabPerdidas" class="btn-aba-paciente" onclick="mudarAbaConsultas('tabPerdidas')" style="background: none; border: none; padding: 10px 5px; font-size: 14px; cursor: pointer; white-space: nowrap; color: #777;">⚠️ Perdidas</button>
    </div>
  `;

  // (A Função gerarHTMLCartao permanece visualmente idêntica e perfeitamente funcional aqui)
  const gerarHTMLCartao = (c, isAbaPrincipalPacotes = false) => {
    const [ano, mes, dia] = c.data.split("-");
    const [h, m] = c.hora.split(":");
    const dataConsulta = new Date(ano, mes - 1, dia, parseInt(h), parseInt(m));
    const tempoConsulta = dataConsulta.getTime();
    const tempo24hAntes = tempoConsulta - (24 * 60 * 60 * 1000);
    const dezMinAntes = tempoConsulta - (10 * 60 * 1000);
    const tempoFim = tempoConsulta + (50 * 60 * 1000);

    let minFim = parseInt(m) + 50;
    let hFim = parseInt(h);
    if (minFim >= 60) { hFim += 1; minFim -= 60; }
    const horaFimStr = `${hFim.toString().padStart(2, '0')}:${minFim.toString().padStart(2, '0')}`;

    let botoesRender = "";
    let classePassada = "";
    let avisoPacoteHTML = "";

    if (c.is_pacote) {
      if (isAbaPrincipalPacotes) {
        avisoPacoteHTML = `<div style="background: #ffe3e3; color: #e63946; padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 10px; display: inline-block;">📦 Sessão ${c.sessaoNumeroCalculada}/4 do Pacote</div>`;
      } else {
        avisoPacoteHTML = `<div style="background: #ffe3e3; color: #e63946; padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 10px; display: inline-block;">📦 Consulta do Pacote N° ${c.pacoteIndexGlobal}</div>`;
      }
    }

    if (c.status_geral === 'finalizada') {
      classePassada = "consulta-inativa consulta-finalizada";
      botoesRender = `<p style="color: #2E7D32; font-weight: bold; margin-top: 10px;">✅ Consulta Concluída</p>`;
    } else if (c.status_geral === 'ausente') {
      classePassada = "consulta-inativa consulta-ausente";
      botoesRender = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px;">❌ Não compareceu</p>`;
    } else if (c.status_geral === 'cancelada' || c.status_geral === 'cancelada_reembolso') {
      classePassada = "consulta-inativa";
      botoesRender = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px;">🛑 Consulta Cancelada</p>`;
    } else if (agora.getTime() >= tempoFim) {
      classePassada = "consulta-inativa consulta-esgotada";
      botoesRender = `<p style="color: #d9534f; font-weight: bold; margin-top: 10px;">Consulta Encerrada</p>`;
    } else {
      let btnReagendar = "";
      let btnCancelar = "";
      let btnMeet = `<button style="flex: 1; margin: 0; background: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled>Iniciar Consulta</button>`;

      if (c.is_pacote) {
        btnReagendar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled>🔄 Reagendar (Bloqueado)</button>`;
      } else if (agora.getTime() >= tempo24hAntes) {
        btnReagendar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled>🔄 Reagendar (Bloqueado)</button>`;
      } else {
        btnReagendar = `<button style="flex: 1; margin: 0; background-color: #5bc0de; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; padding: 10px 2px;" onclick="abrirModalReagendar('${c.profissional}', '${c.data}', '${c.hora}')">🔄 Reagendar</button>`;
      }

      if (c.is_pacote && c.sessaoNumeroCalculada !== 1) {
        btnCancelar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled>❌ Cancelar (Bloqueado)</button>`;
      } else if (agora.getTime() >= tempo24hAntes) {
        btnCancelar = `<button style="flex: 1; margin: 0; background-color: #999; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled>❌ Cancelar (Bloqueado)</button>`;
      } else {
        btnCancelar = `<button style="flex: 1; margin: 0; background-color: #d9534f; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; padding: 10px 2px;" onclick="abrirModalCancelar('${c.id}', '${c.profissional}', '${c.data}', '${c.hora}', ${c.is_pacote}, ${c.sessaoNumeroCalculada || 0}, '${c.pacote_id || ''}')">❌ Cancelar</button>`;
      }

      if (agora.getTime() >= dezMinAntes) {
        if (c.status_profissional === 'na_sala') {
          if (c.status_paciente === 'na_sala') {
            btnMeet = `<button style="flex: 1; margin: 0; background: #2E7D32; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; padding: 10px 2px;" onclick="entrarNaChamada('${c.profissional}', '${c.data}', '${c.hora}')">Retornar à Chamada</button>`;
          } else {
            btnMeet = `<button style="flex: 1; margin: 0; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; padding: 10px 2px;" onclick="entrarNaChamada('${c.profissional}', '${c.data}', '${c.hora}')">Entrar na Chamada</button>`;
          }
        } else {
          btnMeet = `<button style="flex: 1; margin: 0; background: #f39c12; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600; font-size: 12px; padding: 10px 2px;" disabled title="Aguarde o profissional abrir a sala de atendimento.">Aguardando Profissional...</button>`;
        }
      }

      botoesRender = `<div style="display: flex; gap: 5px; margin-top: 15px; width: 100%;">${btnReagendar}${btnCancelar}${btnMeet}</div>`;
    }

    return `
          <div class="consulta-card ${classePassada}" style="border-left: 5px solid #0F766E; position: relative;">
              ${avisoPacoteHTML}
              <h3 style="color: #0F4C5C; margin-bottom: 10px; font-size: 17px;">🧑‍⚕️ ${c.profissional}</h3>
              <p style="margin-bottom: 5px; color: #555; font-size: 14px;">📅 <strong>Data:</strong> ${dia}/${mes}/${ano}</p>
              <p style="margin-bottom: 5px; color: #555; font-size: 14px;">⏰ <strong>Horário:</strong> ${c.hora} às ${horaFimStr}</p>
              ${botoesRender}
          </div>
      `;
  };

  const renderAbaPacotes = (lista) => {
    if (lista.length === 0) return `<p style="color: #777; text-align: center; padding: 20px;">Nenhum pacote pendente no momento.</p>`;
    let gruposArray = [];
    lista.forEach(c => {
      let chave = c.pacote_id || c.profissional;
      let grupo = gruposArray.find(g => g.id === chave);
      if (!grupo) { grupo = { id: chave, consultas: [] }; gruposArray.push(grupo); }
      grupo.consultas.push(c);
    });
    gruposArray.forEach(g => { g.consultas.sort((a, b) => new Date(a.data + "T" + a.hora) - new Date(b.data + "T" + b.hora)); });
    let html = '';
    gruposArray.forEach((grupo, index) => {
      html += '<div class="consultas-grid" style="margin-bottom: 20px;">';
      grupo.consultas.forEach(c => { html += gerarHTMLCartao(c, true); });
      html += '</div>';
      if (index < gruposArray.length - 1) html += `<hr style="border: 0; border-top: 2px dashed #b2dfdb; margin: 30px 0;">`;
    });
    return html;
  };

  const renderAbaNormal = (lista) => {
    if (lista.length === 0) return `<p style="color: #777; text-align: center; padding: 20px;">Nenhuma consulta nesta categoria.</p>`;
    let html = '<div class="consultas-grid">';
    lista.forEach(c => { html += gerarHTMLCartao(c, false); });
    html += '</div>';
    return html;
  };

  mural.innerHTML = menuAbas + `
    <div id="tabIndividuais" class="tab-content-paciente" style="display: block;">
        ${renderAbaNormal(individuais)}
    </div>
    <div id="tabPacotes" class="tab-content-paciente" style="display: none;">
        ${renderAbaPacotes(pacotes)}
    </div>
    <div id="tabRealizadas" class="tab-content-paciente" style="display: none;">
        ${renderAbaNormal(realizadas)}
    </div>
    <div id="tabCanceladas" class="tab-content-paciente" style="display: none;">
        ${renderAbaNormal(canceladas)}
    </div>
    <div id="tabPerdidas" class="tab-content-paciente" style="display: none;">
        ${renderAbaNormal(perdidas)}
    </div>
  `;
  window.mudarAbaConsultas('tabIndividuais');
};

/* =====================================================
   📦 MOTOR DE REGRAS: PACOTES DE CONSULTA
===================================================== */
window.atualizarContadorPacote = async function () {
  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) return;

  const { data: sessoesExistentes } = await supabaseClient
    .from("consultas")
    .select("id")
    .eq("paciente_cpf", usuarioLogado.cpf)
    .eq("is_pacote", true)
    .in("status_geral", ["agendada", "finalizada", "ausente", "pendente_pagamento"]);

  const painel = document.getElementById("painelStatusPacote");
  const txtSessao = document.getElementById("numSessao");
  const txtValidade = document.getElementById("txtValidadePacote");

  if (!painel) return;

  // Se o número de sessões não for um múltiplo exato de 4, o pacote está rolando!
  if (sessoesExistentes && sessoesExistentes.length > 0 && (sessoesExistentes.length % 4 !== 0)) {
    let proximaSessao = (sessoesExistentes.length % 4) + 1;
    painel.style.display = "block";
    if (txtSessao) txtSessao.innerText = proximaSessao;
    if (txtValidade) txtValidade.innerText = "Pacote em andamento";
  } else {
    painel.style.display = "none";
  }
};

// AVISO DE TERMOS DO PACOTE
window.abrirTermosPacote = function () {
  const termosHtml = `
        <div id="modalTermosPacote" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="background: white; width: 90%; max-width: 500px; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <h2 style="color: #0F4C5C; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">📦 Regras do Pacote de Consultas</h2>
                <ul style="color: #444; font-size: 14px; line-height: 1.6; padding-left: 20px; margin-bottom: 25px;">
                    <li style="margin-bottom: 10px;"><strong>Especialidade:</strong> Válido APENAS para Psicologia e Fonoaudiologia.</li>
                    <li style="margin-bottom: 10px;"><strong>Fidelidade:</strong> As 4 consultas devem ser agendadas com o <strong>mesmo profissional</strong>.</li>
                    <li style="margin-bottom: 10px;"><strong>Prazo:</strong> Você tem até <strong>30 dias</strong> para realizar todas as consultas. Caso não conclua dentro desse período, as consultas não realizadas serão automaticamente perdidas.</li>
                    <li style="margin-bottom: 10px;"><strong>Cancelamento:</strong> O pacote poderá ser cancelado apenas até 24 horas antes da primeira consulta. Após esse prazo ou após a realização da primeira sessão, não será mais permitido o cancelamento.</li>
                    <li style="margin-bottom: 10px; color: #d9534f;"><strong>Atenção:</strong> Consultas de pacote <strong>NÃO podem ser reagendadas</strong>. O não comparecimento implicará na perda da sessão sem reembolso.</li>
                </ul>
                <div style="display: flex; gap: 15px;">
                    <button onclick="document.getElementById('modalTermosPacote').remove(); window.location.href='profissionais.html?tipo=pacote'" style="flex: 1; background: #0F766E; color: white; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">✅ Continuar o agendamento</button>
                    <button onclick="document.getElementById('modalTermosPacote').remove()" style="flex: 1; background: #888; color: white; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">❌ Não agendar</button>
                </div>
            </div>
        </div>
    `;
  document.body.insertAdjacentHTML('beforeend', termosHtml);
};

/* =====================================================
   📷 SISTEMA DE FOTO COM COMPRESSÃO E UPLOAD (SUPABASE)
===================================================== */

// 1. Função para comprimir a imagem no navegador antes de enviar
function comprimirImagem(arquivo, callback, errorCallback) {
  try {
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const tamanhoMaximo = 400;
        canvas.width = tamanhoMaximo;
        canvas.height = tamanhoMaximo;
        ctx.drawImage(img, 0, 0, tamanhoMaximo, tamanhoMaximo);

        canvas.toBlob((blob) => {
          if (blob) {
            callback(blob);
          } else {
            if (errorCallback) errorCallback("Erro ao comprimir imagem.");
          }
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => {
        if (errorCallback) errorCallback("O arquivo não é uma imagem válida.");
      };
      img.src = e.target.result;
    };
    leitor.readAsDataURL(arquivo);
  } catch (err) {
    if (errorCallback) errorCallback("Falha na leitura: " + err.message);
  }
}

// 2. Helper para fazer o upload do Blob gerado direto para o SUPABASE STORAGE
async function fazerUploadSupabase(blob, cpf) {
  const nomeArquivo = `${cpf}.jpg`;

  // Faz o upload substituindo o arquivo se ele já existir (upsert: true)
  const { data, error } = await supabaseClient
    .storage
    .from('fotos-perfil') // O nome exato do seu bucket
    .upload(nomeArquivo, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/jpeg'
    });

  if (error) {
    throw new Error("Erro no upload para o Supabase: " + error.message);
  }

  // Pega a URL pública
  const { data: urlData } = supabaseClient
    .storage
    .from('fotos-perfil')
    .getPublicUrl(nomeArquivo);

  // Adicionamos um timestamp "?t=..." no final para forçar o navegador a não usar o cache antigo
  return urlData.publicUrl + "?t=" + new Date().getTime();
}

// 3. Função de clique direto na foto da Sidebar
window.atualizarFotoPerfil = async function (inputElement) {
  if (!inputElement || !inputElement.files || inputElement.files.length === 0) return;

  const arquivo = inputElement.files[0];
  const usuarioLogado = await getUsuarioLogado();

  if (!usuarioLogado) {
    alert("Sessão expirada. Faça login novamente.");
    return;
  }

  const fotoSidebar = document.getElementById("fotoPerfilSidebar");
  const urlOriginal = fotoSidebar ? fotoSidebar.src : "";
  if (fotoSidebar) fotoSidebar.style.opacity = "0.5";

  comprimirImagem(
    arquivo,
    async (blobComprimido) => {
      try {
        // Sobe para o Supabase Storage
        const urlFotoSupabase = await fazerUploadSupabase(blobComprimido, usuarioLogado.cpf);

        // Atualiza a URL na tabela de pacientes
        const { error } = await supabaseClient
          .from("pacientes")
          .update({ foto_perfil_url: urlFotoSupabase })
          .eq("cpf", usuarioLogado.cpf); // Corrigido para cpf, dependendo do que estiver na sua tabela. Se for paciente_cpf, mude aqui.

        if (error) throw error;

        // Atualiza a tela
        if (fotoSidebar) {
          fotoSidebar.src = urlFotoSupabase;
          fotoSidebar.style.opacity = "1";
        }
        alert("✅ Foto de perfil atualizada com sucesso!");

      } catch (err) {
        console.error("Erro no upload:", err);
        alert("❌ Erro ao salvar a foto. Tente novamente.");
        if (fotoSidebar) {
          fotoSidebar.src = urlOriginal;
          fotoSidebar.style.opacity = "1";
        }
      }
    },
    (erroMsg) => {
      alert("❌ " + erroMsg);
      if (fotoSidebar) fotoSidebar.style.opacity = "1";
    }
  );
};

// 4. Função do Modal Obrigatório ("Ação Necessária")
window.salvarFotoPendente = async function () {
  const input = document.getElementById("fotoAtualizacao");

  if (!input || !input.files || input.files.length === 0) {
    alert("Selecione uma foto do seu rosto.");
    return;
  }

  const arquivo = input.files[0];
  const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

  if (!tiposPermitidos.includes(arquivo.type)) {
    alert("Formato inválido. Use JPG, PNG ou WEBP.");
    return;
  }

  if (arquivo.size > 10 * 1024 * 1024) {
    alert("Imagem muito grande. O limite é 10MB.");
    return;
  }

  const usuarioLogado = await getUsuarioLogado();
  if (!usuarioLogado) {
    alert("Sessão expirada.");
    return;
  }

  const btnSalvar = document.querySelector("#modalFaltaFoto button");
  const textoOriginalBtn = btnSalvar ? btnSalvar.innerText : "Salvar";
  if (btnSalvar) {
    btnSalvar.innerText = "⏳ Processando...";
    btnSalvar.disabled = true;
  }

  comprimirImagem(
    arquivo,
    async (blobComprimido) => {
      try {
        // Sobe para o Supabase Storage
        const urlFotoSupabase = await fazerUploadSupabase(blobComprimido, usuarioLogado.cpf);

        // Atualiza o banco de dados (Tabela pacientes)
        const { error } = await supabaseClient
          .from("pacientes")
          .update({ foto_perfil_url: urlFotoSupabase })
          .eq("cpf", usuarioLogado.cpf);

        if (error) throw error;

        // Atualiza a UI e fecha o modal
        const fotoSidebar = document.getElementById("fotoPerfilSidebar");
        if (fotoSidebar) fotoSidebar.src = urlFotoSupabase;

        const modal = document.getElementById("modalFaltaFoto");
        if (modal) modal.remove();

        alert("✅ Foto salva com sucesso! Agora você pode agendar suas consultas.");

      } catch (err) {
        console.error(err);
        alert("Erro ao enviar a foto para o servidor.");
        if (btnSalvar) {
          btnSalvar.innerText = textoOriginalBtn;
          btnSalvar.disabled = false;
        }
      }
    },
    (erroMsg) => {
      alert("Erro: " + erroMsg);
      if (btnSalvar) {
        btnSalvar.innerText = textoOriginalBtn;
        btnSalvar.disabled = false;
      }
    }
  );
};

// =========================================
// CARREGAR FILTRO LENDO A URL DA HOME
// =========================================
document.addEventListener("DOMContentLoaded", function () {
  if (window.location.pathname.includes("profissionais")) {
    setTimeout(() => {
      if (typeof window.mostrarEspecialidade === "function") {

        // Lê o que veio no final do link (ex: ?esp=nutricao)
        const urlParams = new URLSearchParams(window.location.search);
        const espDaUrl = urlParams.get('esp');

        if (espDaUrl) {
          // Se o paciente veio clicando na Home
          window.mostrarEspecialidade(espDaUrl);
        } else {
          // Se ele entrou na página de outra forma, abre Psicologia por padrão
          window.mostrarEspecialidade('psicologia');
        }
      }
    }, 200);
  }
});

/* =====================================================
   🔹 FUNÇÃO DE ABRIR MODAL DE CANCELAMENTO
===================================================== */
window.abrirModalCancelar = function (consultaId, profissional, data, hora, isPacote, sessaoNumero, pacoteId) {
  // Salva os dados completos usando o ID único!
  consultaParaCancelar = {
    id: consultaId,
    profissional: profissional,
    data: data,
    hora: hora,
    is_pacote: isPacote,
    sessaoNumero: sessaoNumero,
    pacote_id: pacoteId
  };

  const divConfirmacao = document.getElementById("estadoConfirmacao");
  const divSucesso = document.getElementById("estadoSucesso");

  if (divConfirmacao) divConfirmacao.classList.remove("hidden");
  if (divSucesso) divSucesso.classList.add("hidden");

  const modalCanc = document.getElementById("modalCancelar");
  if (modalCanc) modalCanc.classList.add("active");
};