// ==========================================
// CONFIGURAÇÃO INICIAL E CREDENCIAIS DO APP
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA3obnKmTrF4zH6pdV8ogqZ88r7uACy3BI", 
    authDomain: "workin--music.firebaseapp.com",
    databaseURL: "https://workin--music-default-rtdb.firebaseio.com",
    projectId: "workin--music",
    storageBucket: "workin--music.firebasestorage.app",
    messagingSenderId: "588256543173",
    appId: "1:588256543173:web:eddf01b30628df90ca8bac"
};

// CHAVE DE API GLOBAL DO YOUTUBE (PROTEGIDA POR RESTRIÇÃO DE DOMÍNIO HTTP)
const YT_API_KEY_GLOBAL = "AIzaSyDHkLh2vGgxUJpVo11o1kKqtH1DQ5Toeu4";

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const googleProvider = new firebase.auth.GoogleAuthProvider();

// Configurações globais dinâmicas (A URL do banco continua vindo por usuário)
let CONFIG = { YT_API_KEY: YT_API_KEY_GLOBAL, FIREBASE_URL: "" };

let currentUserUid = "";
let database = [];
let canaisDinamicos = {};
let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = [];
let lastLocalSearchResults = []; 
let activeEditingIndex = null;
let canalSelecionadoProvisorio = null;

let expandedCrudCats = {};
let expandedCrudSubs = {};

// Variável local para rastrear as mudanças temporárias de cor do perfil
let corPerfilTemporaria = "";

// Validador de Provedores de E-mail Reais e Famosos
function verificarProvedorValido(email) {
    const provedoresPermitidos = [
        'gmail.com', 
        'outlook.com', 'outlook.com.br', 
        'hotmail.com', 'hotmail.com.br', 
        'live.com', 'live.com.br',
        'yahoo.com', 'yahoo.com.br', 
        'icloud.com', 
        'uol.com.br', 'bol.com.br', 'ig.com.br'
    ];
    const dominio = email.split('@')[1];
    return provedoresPermitidos.includes(dominio);
}

// Abre o modal de perfil e preenche os campos com os dados antigos salvos no banco
async function abrirModalPerfil() {
    if (!currentUserUid) return;
    
    // Se o aviso de novidade na tela estiver aberto, remove ele
    document.getElementById('alert-novidade-perfil')?.remove();

    try {
        const urlBaseBanco = firebaseConfig.databaseURL.replace(/\/$/, "");
        let res = await fetch(`${urlBaseBanco}/usuarios/${currentUserUid}.json`);
        let perfil = await res.json();
        
        if (perfil) {
            document.getElementById('profile-edit-name').value = perfil.nome || "";
            document.getElementById('profile-edit-lastname').value = perfil.sobrenome || "";
            
            // Inicializa a cor padrão baseada no que está na nuvem
            corPerfilTemporaria = perfil.cor_tema || "#ff0000";
            const txtHexPerfil = document.getElementById('profile-theme-color-hex');
            if(txtHexPerfil) txtHexPerfil.innerText = corPerfilTemporaria.toUpperCase();
            
            const selectorPerfil = document.getElementById('profile-color-spectrum-selector');
            if(selectorPerfil) selectorPerfil.style.left = "50%"; 
        }
        
        document.getElementById('profile-modal')?.classList.remove('hidden');
    } catch (e) {
        console.error("Erro ao carregar dados do perfil para edição:", e);
    }
}

// Fecha a janela de edição de perfil
function fecharModalPerfil() {
    document.getElementById('profile-modal')?.classList.add('hidden');
}

// Alterna visualmente entre os formulários de login, cadastro e recuperação preservando a logo
function alternarAbasLogin(modo) {
    const formLogin = document.getElementById('form-login-fluxo');
    const formCadastro = document.getElementById('form-cadastro-fluxo');
    const formRecuperar = document.getElementById('form-recuperar-fluxo');
    const titulo = document.getElementById('login-title');
    
    // Oculta todas as abas por padrão para evitar sobreposição
    formLogin.classList.add('hidden');
    formCadastro.classList.add('hidden');
    formRecuperar.classList.add('hidden');
    
    if (modo === 'cadastro') {
        formCadastro.classList.remove('hidden');
        titulo.innerText = "Criar Conta";
    } else if (modo === 'recuperar') {
        formRecuperar.classList.remove('hidden');
        titulo.innerText = "Recuperar Senha";
    } else {
        formLogin.classList.remove('hidden');
        titulo.innerText = "StreamHub";
    }
}

function obterUrlNodoItem(idItem = null) {
    let urlSemJson = CONFIG.FIREBASE_URL.replace(".json", "");
    return idItem ? `${urlSemJson}/${idItem}.json` : CONFIG.FIREBASE_URL;
}

function obterUrlBaseCanais() {
    return CONFIG.FIREBASE_URL.replace("midias.json", "canais_dinamicos.json");
} 

function aplicarCorTema(hexColor) {
    document.documentElement.style.setProperty('--theme-color', hexColor);
    let num = parseInt(hexColor.replace("#",""), 16);
    let r = (num >> 16) - 20; let g = ((num >> 8) & 0x00FF) - 20; let b = (num & 0x0000FF) - 20;
    r = r < 0 ? 0 : r; g = g < 0 ? 0 : g; b = b < 0 ? 0 : b;
    let hexHover = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    document.documentElement.style.setProperty('--theme-color-hover', hexHover);
    
    const txtHex = document.getElementById('theme-color-hex');
    if(txtHex) txtHex.innerText = hexColor.toUpperCase();
    
    const txtHexPerfil = document.getElementById('profile-theme-color-hex');
    if(txtHexPerfil) txtHexPerfil.innerText = hexColor.toUpperCase();
}

function posicionarSetaPelaCor(hexColor) {
    const selector = document.getElementById('color-spectrum-selector'); if (!selector) return;
    if(hexColor.toLowerCase() === "#ff0000" || hexColor.toLowerCase() === "#e50914") selector.style.left = "12%";
    if(hexColor.toLowerCase() === "#00f0ff") selector.style.left = "50%";
}

// Salva as preferências de customização respeitando o projeto configurado no topo
async function salvarPreferenciaNoFirebase(dadosModificados) {
    if (!currentUserUid || !firebaseConfig.databaseURL) return;
    try {
        const urlBaseBanco = firebaseConfig.databaseURL.replace(/\/$/, "");
        await fetch(`${urlBaseBanco}/usuarios/${currentUserUid}.json`, {
            method: "PATCH",
            body: JSON.stringify(dadosModificados),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) { console.error("Erro ao salvar preferências na nuvem:", e); }
}

function checkSession() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUserUid = user.uid;
            
            try {
                const urlBaseBanco = firebaseConfig.databaseURL.replace(/\/$/, "");
                let resPerfil = await fetch(`${urlBaseBanco}/usuarios/${currentUserUid}.json`);
                let perfil = await resPerfil.json();
                
                if (!perfil) {
                    let nomeCompleto = user.displayName || "Usuário";
                    let partesNome = nomeCompleto.split(" ");
                    let primeiroNome = partesNome[0];
                    let sobrenome = partesNome.slice(1).join(" ") || "Google";

                    perfil = {
                        nome: primeiroNome,
                        sobrenome: sobrenome,
                        cor_tema: "#ff0000",
                        tema: "",
                        firebaseUrl: `${urlBaseBanco}/usuarios/${currentUserUid}/midias.json`
                    };
                    await salvarPreferenciaNoFirebase(perfil);
                }
                
                CONFIG.FIREBASE_URL = perfil.firebaseUrl;
                CONFIG.YT_API_KEY = YT_API_KEY_GLOBAL;
                
                aplicarCorTema(perfil.cor_tema || "#ff0000");
                posicionarSetaPelaCor(perfil.cor_tema || "#ff0000");
                document.body.className = perfil.tema || "";
                
                if (perfil.nome && perfil.nome !== "Usuário") {
                    const elBadge = document.getElementById('user-profile-display');
                    const elTxt = document.getElementById('user-top-name');
                    if(elBadge && elTxt) {
                        elTxt.innerText = `Olá, ${perfil.nome}!`;
                        elBadge.classList.remove('hidden');
                    }
                } else {
                    if(!document.getElementById('alert-novidade-perfil')) {
                        const aviso = document.createElement('div');
                        aviso.className = 'alert-novidade-box';
                        aviso.id = 'alert-novidade-perfil';
                        aviso.style.cursor = 'pointer';
                        
                        aviso.onclick = (e) => {
                            if(e.target.tagName !== 'BUTTON') abrirModalPerfil();
                        };
                        aviso.innerHTML = `
                            <div style="font-weight:bold; margin-bottom:5px;">Novidade no StreamHub! 🎉</div>
                            <p style="font-size:0.85rem; margin:0 0 10px 0; line-height:1.2rem;">Agora você pode personalizar seu perfil com nome, sobrenome e tema. <strong>Clique aqui para configurar!</strong></p>
                            <button onclick="event.stopPropagation(); document.getElementById('alert-novidade-perfil').remove()" style="background:var(--theme-color); border:none; color:#fff; padding:4px 10px; border-radius:3px; cursor:pointer; font-size:0.8rem; font-weight:bold;">Fechar</button>
                        `;
                        document.body.appendChild(aviso);
                    }
                }
                
            } catch (err) {
                console.error("Erro ao inicializar perfil seguro:", err);
                CONFIG.FIREBASE_URL = `${firebaseConfig.databaseURL.replace(/\/$/, "")}/usuarios/${currentUserUid}/midias.json`;
                CONFIG.YT_API_KEY = YT_API_KEY_GLOBAL;
            }
            
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            const btnTabUsers = document.getElementById('tab-trigger-users');
            if (user.email === "admin@admin.com") {
                btnTabUsers?.classList.remove('hidden');
            } else {
                btnTabUsers?.classList.add('hidden');
            }

            initApp();
            return;
        }
        limparInterfaceLocal();
    });
}

function configurarEventosLogin() {
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    const inputRecover = document.getElementById('recover-email');
    const btnLogin = document.getElementById('btn-login');

    if (inputUser) { inputUser.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (inputPass) inputPass.focus(); } }; }
    if (inputPass) { inputPass.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }; }
    if (inputRecover) { inputRecover.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handlePasswordRecovery(); } }; }
    if (btnLogin) { btnLogin.onclick = (e) => { e.preventDefault(); handleLogin(); }; }
}

function handleLogin() {
    const elUser = document.getElementById('login-user');
    const elPass = document.getElementById('login-pass');
    if(!elUser || !elPass) return;
    const inputEmail = elUser.value.trim().toLowerCase();
    const inputPass = elPass.value.trim();
    if (!inputEmail || !inputPass) return alert("Preencha todos os campos!");
    
    const btnLogin = document.getElementById('btn-login');
    btnLogin.innerText = "Autenticando..."; btnLogin.disabled = true;

    firebase.auth().signInWithEmailAndPassword(inputEmail, inputPass)
        .catch((error) => {
            alert("Erro na Autenticação: " + error.message);
            btnLogin.innerText = "Entrar"; btnLogin.disabled = false;
        });
}

// Dispara o e-mail nativo de redefinição de senha do Firebase Auth
function handlePasswordRecovery() {
    const elEmail = document.getElementById('recover-email');
    if (!elEmail) return;
    
    const email = elEmail.value.trim().toLowerCase();
    if (!email) return alert("Por favor, digite o seu e-mail cadastrado!");
    
    const btnRecover = document.getElementById('btn-recover-submit');
    btnRecover.innerText = "Enviando link..."; btnRecover.disabled = true;
    
    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            alert(`Link de redefinição enviado com sucesso para: ${email}\nVerifique a sua caixa de entrada ou spam!`);
            document.getElementById('form-recuperar-fluxo').reset();
            alternarAbasLogin('login'); // Retorna automaticamente para a tela de login
        })
        .catch((error) => {
            alert("Erro ao solicitar link: " + error.message);
        })
        .finally(() => {
            btnRecover.innerText = "Enviar Link de Recuperação"; btnRecover.disabled = false;
        });
}

function handleLogoutActions() {
    firebase.auth().signOut().then(() => { limparInterfaceLocal(); });
}

function limparInterfaceLocal() {
    document.body.className = ""; 
    currentUserUid = ""; CONFIG.FIREBASE_URL = ""; CONFIG.YT_API_KEY = YT_API_KEY_GLOBAL;
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch(e){} }
    if (document.getElementById('universal-player')) document.getElementById('universal-player').src = "";
    if (document.getElementById('raw-player')) { document.getElementById('raw-player').pause(); document.getElementById('raw-player').src = ""; }
    if (document.getElementById('login-user')) document.getElementById('login-user').value = "";
    if (document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
    if (document.getElementById('recover-email')) document.getElementById('recover-email').value = "";
    if (document.getElementById('btn-login')) {
        document.getElementById('btn-login').innerText = "Entrar";
        document.getElementById('btn-login').disabled = false;
    }
    if (document.getElementById('app-container')) document.getElementById('app-container').classList.add('hidden');
    if (document.getElementById('login-screen')) document.getElementById('login-screen').classList.remove('hidden');
    if (document.getElementById('btn-google-login')) {
        document.getElementById('btn-google-login').innerHTML = '<i class="fab fa-google"></i> Entrar com o Google';
        document.getElementById('btn-google-login').disabled = false;
    }
    if (document.getElementById('user-profile-display')) document.getElementById('user-profile-display').classList.add('hidden');
}

async function initApp() { await carregarCanaisDinamicos(); await recarregarDadosDoBanco(); }

async function recarregarDadosDoBanco() {
    try {
        const res = await fetch(CONFIG.FIREBASE_URL); const data = await res.json(); database = [];
        if (data) {
            if (Array.isArray(data)) { database = data.filter(item => item !== null); } 
            else { Object.keys(data).forEach(key => { if (data[key]) database.push({ idFirebase: key, ...data[key] }); }); }
        }
    } catch (e) { console.log("Erro ao carregar mídias.", e); }
    finally { renderSidebar(); renderMosaic(); alimentarSeletorCategoriasCanais(); }
}

async function carregarCanaisDinamicos() {
    try { 
        const res = await fetch(obterUrlBaseCanais()); 
        if (!res.ok) { canaisDinamicos = {}; return; }
        const data = await res.json(); 
        canaisDinamicos = data || {}; 
    } catch (e) { 
        console.error("Erro canais:", e); 
        canaisDinamicos = {}; 
    }
}

function alimentarSeletorCategoriasCanais() {
    const select = document.getElementById("channel-target-category"); if (!select) return; select.innerHTML = "";
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(key => { try { const catNome = decodeURIComponent(escape(atob(key))); if(!categories.includes(catNome)) categories.push(catNome); } catch(e){} });
    categories.sort();
    if(categories.length === 0) { select.innerHTML = `<option value="">Nenhuma categoria encontrada.</option>`; return; }
    categories.forEach(cat => { const opt = document.createElement("option"); opt.value = cat; opt.innerText = cat; select.appendChild(opt); });
}

function renderMosaic() {
    const grid = document.getElementById('mosaic-grid'); if (!grid) return; grid.innerHTML = '';
    const bcCat = document.getElementById('bc-category'); const bcSub = document.getElementById('bc-subcategory'); const bcSrc = document.getElementById('bc-search');
    if (bcCat) bcCat.classList.add('hidden'); if (bcSub) bcSub.classList.add('hidden'); if (bcSrc) bcSrc.classList.add('hidden');

    if (currentView === 'categories') {
        const categories = [...new Set(database.map(item => item.categoria))];
        Object.keys(canaisDinamicos).forEach(key => { try { const c = decodeURIComponent(escape(atob(key))); if(!categories.includes(c)) categories.push(c); } catch(e){} });
        categories.sort().forEach(cat => {
            if(!cat) return; const match = database.find(item => item.categoria === cat); const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
            const thumbCapa = match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : '');
            grid.appendChild(createCard(cat, thumbCapa, false, false, () => { selectedCategory = cat; currentView = 'subcategories'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'subcategories') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        const subcategories = [...new Set(database.filter(item => item.categoria === selectedCategory).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
        if (canaisDinamicos[nodeName] && !subcategories.includes("Vídeos Recentes")) subcategories.push("Vídeos Recentes");
        
        subcategories.sort().forEach(sub => {
            const match = database.find(item => item.categoria === selectedCategory && item.subcategoria === sub);
            grid.appendChild(createCard(sub, match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : ''), false, false, () => { selectedSubcategory = sub; currentView = 'tracks'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'tracks') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        if (bcSub) { bcSub.classList.remove('hidden'); bcSub.querySelector('.txt').innerText = selectedSubcategory; }

        if (selectedSubcategory === "Vídeos Recentes") {
            const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
            if (canaisDinamicos[nodeName]) buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
        } else {
            currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
            currentPlaylist.forEach((track, index) => {
                const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
                grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, realIndex));
            });
        }
    }
    else if (currentView === 'search_results') {
        if (bcSrc) bcSrc.classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist'; const card = createCard(item.title, item.thumb, true, isPlaylist, null, -1);
            if (card.querySelector('.add-music-badge')) { card.querySelector('.add-music-badge').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openAdminWithTrack(item); }; }
            const btnGroup = document.createElement('div'); btnGroup.className = 'search-btn-group';
            const btnPlay = document.createElement('button'); btnPlay.style.background = '#2980b9'; btnPlay.innerHTML = `<i class="fas fa-play"></i> Assistir`;
            btnPlay.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                currentPlaylist = [{ título: item.title, link: isPlaylist ? `https://www.youtube.com/embed/videoseries?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}` }]; playTrack(0);
            };
            btnGroup.appendChild(btnPlay);
            if(isPlaylist) {
                const btnList = document.createElement('button'); btnList.style.background = '#8e44ad'; btnList.innerHTML = `<i class="fas fa-list"></i> Ver Mídias`;
                btnList.onclick = (e) => { e.preventDefault(); e.stopPropagation(); peekPlaylistContents(item.youtubeId); }; btnGroup.appendChild(btnList);
            }
            card.appendChild(btnGroup); grid.appendChild(card);
        });
    }
    else if (currentView === 'search_local_results') {
        if (bcSrc) {
            bcSrc.classList.remove('hidden');
            bcSrc.innerHTML = ` &gt; <i class="fas fa-search"></i> Resultados Locais para: "${document.getElementById('search-internal-input').value}"`;
        }
        
        if (lastLocalSearchResults.length === 0) {
            grid.innerHTML = '<h3 style="color: var(--text-gray); padding: 20px;">Nenhuma mídia encontrada no seu acervo local.</h3>';
            return;
        }

        currentPlaylist = lastLocalSearchResults;

        lastLocalSearchResults.forEach((track, index) => {
            const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
            grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, realIndex));
        });
    }
}

function alternarModoCategoriaCanal(modo) {
    const wrapExistente = document.getElementById('wrapper-channel-cat-existente');
    const wrapNova = document.getElementById('wrapper-channel-cat-nova');
    
    if (modo === 'nova') {
        wrapExistente.classList.add('hidden');
        wrapNova.classList.remove('hidden');
        document.getElementById('channel-target-category-new').focus();
    } else {
        wrapNova.classList.add('hidden');
        wrapExistente.classList.remove('hidden');
    }
}

function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback, realIndex = -1) {
    const card = document.createElement('div'); card.className = 'card';
    let htmlContent = `<img src="${imgSrc || 'https://placehold.co/160x90?text=Sem+Capa'}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-photo-film"></i> Playlist</span>`;
    if(showAddButton) htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${isPlaylist ? "Add Playlist" : "Adicionar"}</button>`;
    if(realIndex >= 0) htmlContent += `<div class="quick-edit-badge" title="Editar"><i class="fas fa-cog"></i></div>`;
    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);
    if(realIndex >= 0 && card.querySelector('.quick-edit-badge')) {
        card.querySelector('.quick-edit-badge').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAdvancedEditModal(realIndex); });
    }
    return card;
}

async function buscarVideosRecentesDoCanal(playlistId) {
    const grid = document.getElementById('mosaic-grid'); if (grid) grid.innerHTML = '<h3>Atualizando vídeos recentes do canal via API...</h3>';
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const res = await fetch(url); const data = await res.json();
        if(data.items) {
            const itensInvertidos = data.items.reverse();
            currentPlaylist = itensInvertidos.map(item => ({
                título: item.snippet.title, link: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`,
                capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
                categoria: selectedCategory, subcategoria: "Vídeos Recentes", isDinâmico: true
            }));
            if (grid) { 
                grid.innerHTML = ''; 
                currentPlaylist.forEach((track, index) => { grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, -1)); }); 
            }
        }
    } catch (e) { if (grid) grid.innerHTML = '<h3>Erro ao carregar feeds do canal.</h3>'; }
}

function configurarEventosBuscaCanal() {
    const input = document.getElementById("search-channel-input");
    const btnSearchChan = document.getElementById("btn-search-channel");
    const scrollContainer = document.getElementById("channels-scroll-container");

    const executarBusca = async (e) => {
        if(e) e.preventDefault();
        const termo = input?.value.trim();
        if(!termo) return alert("Digite o nome do canal.");
        
        scrollContainer.innerHTML = '<h3>Buscando...</h3>';
        scrollContainer.style.display = 'block';

        try {
            const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(termo)}&key=${CONFIG.YT_API_KEY}`);
            const data = await res.json();
            
            scrollContainer.innerHTML = '';
            if(!data.items || data.items.length === 0) return scrollContainer.innerHTML = '<p>Nenhum canal encontrado.</p>';

            data.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'channel-search-item';
                div.innerHTML = `<img src="${item.snippet.thumbnails.default.url}"><div class="info"><h4>${item.snippet.title}</h4></div>`;
                div.onclick = () => {
                    canalSelecionadoProvisorio = { 
                        channelId: item.snippet.channelId, 
                        title: item.snippet.title, 
                        thumb: item.snippet.thumbnails.default.url, 
                        description: item.snippet.description 
                    };
                    document.getElementById("chan-thumb").src = canalSelecionadoProvisorio.thumb;
                    document.getElementById("chan-title-text").innerText = canalSelecionadoProvisorio.title;
                    document.getElementById("chan-desc-text").innerText = canalSelecionadoProvisorio.description;
                    document.getElementById("channel-preview").style.display = "flex";
                };
                scrollContainer.appendChild(div);
            });
        } catch(err) { scrollContainer.innerHTML = '<p>Erro na API.</p>'; }
    };

    if (input) input.onkeypress = (e) => { if(e.key === 'Enter') executarBusca(e); };
    if (btnSearchChan) btnSearchChan.onclick = executarBusca;
}

function renderSidebar() {
    const tree = document.getElementById('sidebar-tree'); if (!tree) return; tree.innerHTML = '';
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(key => { try { const catNome = decodeURIComponent(escape(atob(key))); if(!categories.includes(catNome)) categories.push(catNome); } catch(e){} });
    categories.sort().forEach(cat => {
        if(!cat) return;
        const catLi = document.createElement('li'); const catToggle = document.createElement('span'); catToggle.className = 'category-toggle'; catToggle.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        const subUl = document.createElement('ul'); subUl.className = 'tree-sub hidden'; catToggle.addEventListener('click', () => subUl.classList.toggle('hidden'));
        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, ""); if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            if(!sub) return; const subLi = document.createElement('li');
            subLi.innerHTML = sub === "Vídeos Recentes" ? `<i class="fas fa-sync text-red"></i> <b>${sub}</b>` : `<i class="fas fa-photo-film"></i> ${sub}`;
            subLi.addEventListener('click', (e) => { e.stopPropagation(); selectedCategory = cat; selectedSubcategory = sub; currentView = 'tracks'; renderMosaic(); if(window.innerWidth <= 768) handleToggleSidebar(); });
            subUl.appendChild(subLi);
        });
        catLi.appendChild(catToggle); catLi.appendChild(subUl); tree.appendChild(catLi);
    });
}

function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase().trim();
    document.querySelectorAll('#sidebar-tree > li').forEach(catLi => {
        const catName = catLi.querySelector('.category-toggle').innerText.toLowerCase(); let match = catName.includes(lowerQuery); let subMatchAny = false;
        catLi.querySelectorAll('.tree-sub li').forEach(subLi => {
            const realCat = catLi.querySelector('.category-toggle').innerText.trim(); const realSub = subLi.innerText.trim();
            const mediaMatch = database.some(item => item.categoria === realCat && item.subcategoria === realSub && item.título.toLowerCase().includes(lowerQuery));
            if(subLi.innerText.toLowerCase().includes(lowerQuery) || mediaMatch || match) { subLi.classList.remove('hidden'); subMatchAny = true; } else { subLi.classList.add('hidden'); }
        });
        if(match || subMatchAny) catLi.classList.remove('hidden'); else catLi.classList.add('hidden');
    });
}

async function searchYouTubeGlobal(query) {
    if(!query.trim()) return; currentView = 'search_results'; renderMosaic();
    const grid = document.getElementById('mosaic-grid'); if (grid) grid.innerHTML = '<h3>Buscando no YouTube...</h3>';
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=30&q=${encodeURIComponent(query)}&type=video,playlist&key=${CONFIG.YT_API_KEY}`);
        const data = await response.json();
        if (data.error) { if (grid) grid.innerHTML = `<h3 style="color:#e74c3c;">Erro do YouTube: ${data.error.message}</h3>`; return; }
        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                const isPl = item.id.kind === 'youtube#playlist';
                lastYtSearchResults.push({ type: isPl ? 'playlist' : 'video', youtubeId: isPl ? item.id.playlistId : item.id.videoId, title: item.snippet.title, thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Capa' });
            });
        }
        renderMosaic();
    } catch (e) { if (grid) grid.innerHTML = '<h3>Erro de rede ao conectar à API.</h3>'; }
}

async function peekPlaylistContents(playlistId) {
    try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`); const data = await res.json();
        if(data.items) { alert(`Mídias:\n\n` + data.items.map((item, idx) => `${idx + 1}. ${item.snippet.title}`).join('\n').substring(0, 1200)); }
    } catch(e) { alert("Erro playlist."); }
}

function inicializarSeletorCoresLinear() {
    const barAdmin = document.getElementById('color-spectrum-bar'); 
    const selectorAdmin = document.getElementById('color-spectrum-selector');
    const barPerfil = document.getElementById('profile-color-spectrum-bar');
    const selectorPerfil = document.getElementById('profile-color-spectrum-selector');

    const coresGradiente = ["#000000", "#ff0000", "#ff00ff", "#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000", "#ffffff"];
    let isDragging = false;

    function hexToRgb(hex) { let num = parseInt(hex.replace("#",""), 16); return { r: num >> 16, g: (num >> 8) & 0x00FF, b: num & 0x0000FF }; }
    function rgbToHex(r, g, b) { return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }

    function calcularCorPelaPosicao(e, barElement, selectorElement, ehPerfil) {
        if (!barElement || !selectorElement) return;
        const rect = barElement.getBoundingClientRect(); 
        let clientX = e.clientX || (e.touches && e.touches[0].clientX); 
        let x = clientX - rect.left;
        
        if (x < 0) x = 0; 
        if (x > rect.width) x = rect.width; 
        let percent = x / rect.width; 
        selectorElement.style.left = (percent * 100) + '%';
        
        let segment = percent * (coresGradiente.length - 1); 
        let index = Math.floor(segment); 
        let factor = segment - index;
        let core1 = coresGradiente[index]; 
        let cor2 = coresGradiente[index + 1] || coresGradiente[index];
        let rgb1 = hexToRgb(core1); 
        let rgb2 = hexToRgb(cor2);
        
        let r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r)); 
        let g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g)); 
        let b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));
        let hexResult = rgbToHex(r, g, b); 
        
        if (ehPerfil) {
            corPerfilTemporaria = hexResult;
            const txtHexPerfil = document.getElementById('profile-theme-color-hex');
            if (txtHexPerfil) txtHexPerfil.innerText = hexResult.toUpperCase();
        } else {
            aplicarCorTema(hexResult); 
            salvarPreferenciaNoFirebase({ cor_tema: hexResult });
        }
    }

    if (barAdmin) {
        barAdmin.addEventListener('mousedown', (e) => { isDragging = true; calcularCorPelaPosicao(e, barAdmin, selectorAdmin, false); });
        document.addEventListener('mousemove', (e) => { if (isDragging) calcularCorPelaPosicao(e, barAdmin, selectorAdmin, false); });
        barAdmin.addEventListener('touchstart', (e) => { isDragging = true; calcularCorPelaPosicao(e, barAdmin, selectorAdmin, false); }, {passive: true});
        document.addEventListener('touchmove', (e) => { if (isDragging) calcularCorPelaPosicao(e, barAdmin, selectorAdmin, false); }, {passive: true});
    }

    if (barPerfil) {
        barPerfil.addEventListener('mousedown', (e) => { isDragging = true; calcularCorPelaPosicao(e, barPerfil, selectorPerfil, true); });
        document.addEventListener('mousemove', (e) => { if (isDragging) calcularCorPelaPosicao(e, barPerfil, selectorPerfil, true); });
        barPerfil.addEventListener('touchstart', (e) => { isDragging = true; calcularCorPelaPosicao(e, barPerfil, selectorPerfil, true); }, {passive: true});
        document.addEventListener('touchmove', (e) => { if (isDragging) calcularCorPelaPosicao(e, barPerfil, selectorPerfil, true); }, {passive: true});
    }

    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('touchend', () => isDragging = false);
}

function openAdminWithTrack(item) {
    if (document.getElementById('admin-modal')) document.getElementById('admin-modal').classList.remove('hidden'); switchTabs('add-tab', 'tab-trigger-add');
    document.getElementById('manual-media-url').value = item.type === 'playlist' ? `https://www.youtube.com/playlist?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}`;
    document.getElementById('prev-thumb').src = item.thumb; document.getElementById('prev-title').value = item.title;
}

function extractPlaylistId(url) { const reg = /[&?]list=([^#\&\?]+)/; const match = url.match(reg); return match ? match[1] : null; }

function playTrack(index) {
    if(currentPlaylist.length === 0) return; currentTrackIndex = index; const track = currentPlaylist[index];
    if (document.getElementById('player-container')) document.getElementById('player-container').classList.remove('hidden');
    if (document.getElementById('current-track-title')) document.getElementById('current-track-title').innerText = track.título;

    const ytPlayerEl = document.getElementById('yt-player'); const univPlayerEl = document.getElementById('universal-player'); const rawPlayerEl = document.getElementById('raw-player');
    if (univPlayerEl) univPlayerEl.src = ""; if (rawPlayerEl) rawPlayerEl.src = "";
    if (univPlayerEl) univPlayerEl.classList.add('hidden'); if (rawPlayerEl) rawPlayerEl.classList.add('hidden'); if (ytPlayerEl) ytPlayerEl.classList.remove('hidden');
    if (rawPlayerEl) rawPlayerEl.pause(); const linkOriginal = track.link.trim(); const vId = extractYoutubeId(linkOriginal);

    if(vId) {
        if (ytPlayerEl) ytPlayerEl.classList.remove('hidden');
        if (!ytPlayer) { 
            ytPlayer = new YT.Player('yt-player', { 
                videoId: vId, 
                playerVars: { 'autoplay': 1, 'playsinline': 1, 'enablejsapi': 1 }, 
                events: { 
                    'onReady': () => { aplicarVolume(); }, 
                    'onStateChange': (e) => { if(e.data === 0 && currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); } 
                } 
            }); 
        } 
        else { 
            ytPlayer.loadVideoById(vId); 
            setTimeout(() => aplicarVolume(), 300); 
        }
    } 
    else if(linkOriginal.toLowerCase().endsWith('.mp4') || linkOriginal.toLowerCase().endsWith('.mkv') || linkOriginal.toLowerCase().includes('raw.githubusercontent') || linkOriginal.includes('docs.google.com/uc?export=download')) {
        if (rawPlayerEl) { rawPlayerEl.classList.remove('hidden'); rawPlayerEl.src = linkOriginal; rawPlayerEl.play(); aplicarVolume(); rawPlayerEl.onended = () => { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }; }
    } 
    else { 
        if (univPlayerEl) { 
            univPlayerEl.classList.remove('hidden'); 
            let urlTratada = linkOriginal;
            
            if (urlTratada.includes("archive.org/details/")) {
                urlTratada = urlTratada.replace("archive.org/details/", "archive.org/embed/");
            } 
            else if (urlTratada.includes("youtube.com/embed/videoseries")) {
                const separador = urlTratada.includes("?") ? "&" : "?";
                urlTratada = `${urlTratada}${separador}playsinline=1&enablejsapi=1&origin=${window.location.origin}`;
            }
            else if (urlTratada.includes("drive.google.com/file/d/")) {
                if (urlTratada.includes("/preview")) {
                    urlTratada = urlTratada.replace("/preview", "/preview?rm=minimal");
                } else if (!urlTratada.includes("?")) {
                    urlTratada += "?rm=minimal";
                } else if (!urlTratada.includes("rm=minimal")) {
                    urlTratada += "&rm=minimal";
                }
                const separador = urlTratada.includes("?") ? "&" : "?";
                urlTratada = `${urlTratada}${separador}playsinline=1&enablejsapi=1&origin=${window.location.origin}`;
            }
            univPlayerEl.src = urlTratada; 
        } 
    }
} 

function extractYoutubeId(url) {
    if (!url || url.includes('videoseries')) return null; 
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/shorts\/)([^#\&\?]*).*/; const match = url.match(regExp);
    if (match && match[2].length === 11) return match[2]; if (url.trim().length === 11 && !url.includes('/') && !url.includes('.')) return url.trim(); return null;
}

function aplicarVolume() {
    const slider = document.getElementById('player-volume-slider');
    const btnMute = document.getElementById('btn-mute-toggle');
    if (!slider || !btnMute) return;

    let vol = parseInt(slider.value);
    let isMuted = btnMute.getAttribute('data-muted') === 'true';

    btnMute.innerHTML = isMuted || vol === 0 ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';

    const rawPlayer = document.getElementById('raw-player');
    if (rawPlayer) {
        rawPlayer.volume = vol / 100;
        rawPlayer.muted = isMuted;
    }

    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
        if (isMuted) ytPlayer.mute();
        else { ytPlayer.unMute(); ytPlayer.setVolume(vol); }
    }
}

function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list'); if (!listContainer) return; listContainer.innerHTML = '';
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(k => { try { const c = decodeURIComponent(escape(atob(k))); if(!categories.includes(c)) categories.push(c); } catch(e){} });

    categories.sort().forEach(cat => {
        if(!cat) return;
        const catRow = createCrudRow(cat, 'categoria', () => { let n = prompt("Novo nome para a Categoria:", cat); if(n && n.trim() !== "") renomearCategoriaCompleta(cat, n.trim()); }, () => { if(confirm(`Excluir ${cat}?`)) deletarCategoriaCompleta(cat); }, () => downloadJSON(database.filter(item => item.categoria === cat), `cat_${cat}`));
        const subContainer = document.createElement('div'); subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';
        
        catRow.addEventListener('click', (e) => { 
            if(e.target.closest('.crud-actions')) return; 
            expandedCrudCats[cat] = !expandedCrudCats[cat]; 
            subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none'; 
        });
        listContainer.appendChild(catRow);

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, ""); if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            const subRow = createCrudRow(sub, 'subcategoria', sub === "Vídeos Recentes" ? null : () => { let n = prompt("Novo nome para a Subcategoria:", sub); if(n && n.trim() !== "") renomearSubcategoriaCompleta(cat, sub, n.trim()); }, () => { if(confirm(`Excluir a subcategoria ${sub}?`)) deletarSubcategoria(cat, sub); }, () => downloadJSON(database.filter(item => item.categoria === cat && item.subcategoria === sub), `sub_${sub}`));
            const mediaContainer = document.createElement('div'); mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';
            
            subRow.addEventListener('click', (e) => { 
                if(e.target.closest('.crud-actions')) return; 
                expandedCrudSubs[cat + '_' + sub] = !expandedCrudSubs[cat + '_' + sub]; 
                mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none'; 
            });
            subContainer.appendChild(subRow);

            if(sub === "Vídeos Recentes") {
                const iRow = document.createElement('div'); iRow.className = 'crud-item track-level'; iRow.innerHTML = `<span><i class="fas fa-link"></i> Canal: ${canaisDinamicos[nodeName].title}</span>`; mediaContainer.appendChild(iRow);
            } else {
                database.forEach((item, idx) => {
                    if(item.categoria === cat && item.subcategoria === sub) {
                        mediaContainer.appendChild(createCrudRow(item.título, 'mídia', () => openAdvancedEditModal(idx), () => { if(confirm(`Excluir a mídia: ${item.título}?`)) deletarMidiaUnica(idx); }, () => downloadJSON(item, item.título)));
                    }
                });
            }
            subContainer.appendChild(mediaContainer);
        });
        listContainer.appendChild(subContainer);
    });
}

function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div'); row.className = `crud-item ${type === 'subcategoria' ? 'sub-level' : type === 'mídia' ? 'track-level' : ''}`;
    let icon = type === 'categoria' ? '<i class="fas fa-folder"></i>' : (type === 'subcategoria' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-play-circle"></i>');
    row.innerHTML = `<span>${icon} <strong>[${type.toUpperCase()}]</strong> ${title}</span><div class="crud-actions">${onEdit ? '<button class="crud-btn btn-edit"><i class="fas fa-edit"></i></button>' : ''}<button class="crud-btn btn-del"><i class="fas fa-trash"></i></button><button class="crud-btn btn-exp"><i class="fas fa-download"></i></button></div>`;
    if(onEdit) row.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); onEdit(); };
    row.querySelector('.btn-del').onclick = (e) => { e.stopPropagation(); onDel(); }; row.querySelector('.btn-exp').onclick = (e) => { e.stopPropagation(); onExp(); }; return row;
}

async function renomearCategoriaCompleta(antiga, nova) { 
    try { 
        database.forEach(item => { if(item.categoria === antiga) item.categoria = nova; }); 
        await empurrarBancoIntegralParaServidor(); 
        const oldNodeName = btoa(unescape(encodeURIComponent(antiga))).replace(/=/g, ""); 
        if (canaisDinamicos[oldNodeName]) { 
            const newNodeName = btoa(unescape(encodeURIComponent(nova))).replace(/=/g, ""); 
            let urlNovoCanal = obterUrlBaseCanais().replace(".json", `/${newNodeName}.json`);
            let urlAntigoCanal = obterUrlBaseCanais().replace(".json", `/${oldNodeName}.json`);
            await fetch(urlNovoCanal, { method: "PUT", body: JSON.stringify(canaisDinamicos[oldNodeName]) }); 
            await fetch(urlAntigoCanal, { method: "DELETE" }); 
        } 
        await recarregarDadosDoBanco(); 
        renderCrudManager(); 
    } catch(e){ console.error("Erro ao renomear categoria:", e); } 
}

function openAdvancedEditModal(index) {
    activeEditingIndex = index; const item = database[index];
    document.getElementById('edit-field-title').value = item.título || ""; document.getElementById('edit-field-link').value = item.link || "";
    document.getElementById('edit-field-capa').value = item.capa || ""; document.getElementById('edit-field-category').value = item.categoria || "";
    document.getElementById('edit-field-subcategory').value = item.subcategoria || "";
    if (document.getElementById('edit-media-modal')) document.getElementById('edit-media-modal').classList.remove('hidden');
}

async function saveAdvancedEditChanges(e) {
    if(e) e.preventDefault();
    const t = document.getElementById('edit-field-title').value.trim(); const l = document.getElementById('edit-field-link').value.trim();
    const c = document.getElementById('edit-field-capa').value.trim(); const cat = document.getElementById('edit-field-category').value.trim();
    const sub = document.getElementById('edit-field-subcategory').value.trim();
    if(!t || !l || !cat) return alert("Preencha os campos!");

    database[activeEditingIndex].título = t; database[activeEditingIndex].link = l; database[activeEditingIndex].capa = c;
    database[activeEditingIndex].categoria = cat; database[activeEditingIndex].subcategoria = sub;
    
    try {
        await empurrarBancoIntegralParaServidor();
        document.getElementById('edit-media-modal').classList.add('hidden');
        await recarregarDadosDoBanco(); 
        renderCrudManager();
        alert("Alteração salva com sucesso!");
    } catch (err) { alert("Erro: " + err.message); }
}

async function saveMediaToDatabase(e) {
    if(e) e.preventDefault(); const url = document.getElementById('manual-media-url').value.trim(); 
    const categoria = document.getElementById('media-category').value.trim(); const subcategoria = document.getElementById('media-subcategory').value.trim();
    if(!url || !categoria) return alert("Preencha os campos."); const pId = extractPlaylistId(url); const btnSave = document.getElementById('btn-save-media');

    try {
        if(pId) {
            btnSave.innerText = "Processando..."; btnSave.disabled = true;
            let urlApi = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${pId}&key=${CONFIG.YT_API_KEY}`;
            let res = await fetch(urlApi); let data = await res.json();
            if(data.error) throw new Error(data.error.message); if(!data.items || data.items.length === 0) throw new Error("Playlist vazia.");
            
            for(let item of data.items) {
                let vId = item.snippet.resourceId.videoId; let título = item.snippet.title;
                let capa = item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url; let linkVideo = `https://www.youtube.com/embed/${vId}`;
                database.push({ título, link: linkVideo, capa, categoria, subcategoria });
            }
            await empurrarBancoIntegralParaServidor();
            alert(`Sucesso! Foram importados ${data.items.length} vídeos.`);
        } else {
            const título = document.getElementById('prev-title').value.trim() || "Nova Mídia"; 
            const capa = document.getElementById('prev-thumb').src;
            database.push({ título, link: url, capa, categoria, subcategoria });
            await empurrarBancoIntegralParaServidor();
            alert("Vídeo salvo!");
        }
        document.getElementById('manual-media-url').value = ""; 
        document.getElementById('admin-modal')?.classList.add('hidden');
        await recarregarDadosDoBanco();
    } catch (err) { alert("Erro: " + err.message); } finally { btnSave.innerText = "Salvar no meu Firebase"; btnSave.disabled = false; }
}

async function processarInjecaoDeDadosAcumulativa(novosItens) {
    if(!Array.isArray(novosItens) || novosItens.length === 0) return alert("Nenhum dado válido para importar.");
    try {
        const res = await fetch(CONFIG.FIREBASE_URL); const data = await res.json(); let bancoAtual = [];
        if (data) {
            if (Array.isArray(data)) bancoAtual = data.filter(item => item !== null);
            else Object.keys(data).forEach(k => { if(data[k]) bancoAtual.push(data[k]); });
        }
        novosItens.forEach(novo => {
            const limpo = { título: novo.título, link: novo.link, capa: novo.capa || "", categoria: novo.categoria, subcategoria: novo.subcategoria || "" };
            const jaExiste = bancoAtual.some(velho => velho.link === limpo.link && velho.categoria === limpo.categoria);
            if(!jaExiste) bancoAtual.push(limpo);
        });
        database = bancoAtual;
        await empurrarBancoIntegralParaServidor();
        await recarregarDadosDoBanco(); 
        renderCrudManager();
        alert(`Importação concluída! Total de mídias: ${database.length}`);
    } catch(e) { alert("Falha na mesclagem de dados."); }
}

async function empurrarBancoIntegralParaServidor() {
    const loteLimpoParaSalvar = database.map(({idFirebase, ...resto}) => resto);
    let resposta = await fetch(CONFIG.FIREBASE_URL, { method: "PUT", body: JSON.stringify(loteLimpoParaSalvar), headers: { 'Content-Type': 'application/json' } });
    if (!resposta.ok) throw new Error("Erro na gravação remota do banco.");
}

async function deletarMidiaUnica(indexNoBanco) { try { database.splice(indexNoBanco, 1); await empurrarBancoIntegralParaServidor(); await recarregarDadosDoBanco(); renderCrudManager(); } catch(e){} }
async function deletarSubcategoria(cat, sub) { try { database = database.filter(item => !(item.categoria === cat && item.subcategoria === sub)); await empurrarBancoIntegralParaServidor(); await recarregarDadosDoBanco(); renderCrudManager(); } catch(e){} }
async function deletarCategoriaCompleta(cat) { 
    try { 
        database = database.filter(item => item.categoria !== cat); 
        await empurrarBancoIntegralParaServidor(); 
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        let urlCanalIndividual = obterUrlBaseCanais().replace(".json", `/${nodeName}.json`);
        await fetch(urlCanalIndividual, { method: 'DELETE' }); 
        currentView = 'categories'; 
        selectedCategory = ''; 
        selectedSubcategory = ''; 
        await recarregarDadosDoBanco(); 
        renderCrudManager(); 
    } catch(e){ console.error("Erro ao deletar categoria completa:", e); } 
}

async function renameSubcategoryComplete(cat, antigaSub, novaSub) { try { database.forEach(item => { if(item.categoria === cat && item.subcategoria === antigaSub) item.subcategoria = novaSub; }); await empurrarBancoIntegralParaServidor(); await recarregarDadosDoBanco(); renderCrudManager(); } catch(e){} }

function downloadJSON(obj, filename) {
    const prepararObjeto = Array.isArray(obj) ? obj.map(({idFirebase, ...r}) => r) : obj;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prepararObjeto, null, 2));
    const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`);
    document.body.appendChild(a); a.click(); a.remove();
}

function handleToggleSidebar() {
    const sidebar = document.getElementById('sidebar'); if (!sidebar) return;
    if (window.innerWidth <= 768) { sidebar.classList.toggle('open'); sidebar.classList.remove('collapsed'); }
    else { sidebar.classList.toggle('collapsed'); sidebar.classList.remove('open'); }
}

function switchTabs(targetTabId, activeTriggerBtnId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const triggerBtn = document.getElementById(activeTriggerBtnId); 
    const targetTab = document.getElementById(targetTabId);
    if (triggerBtn) triggerBtn.classList.add('active'); 
    if (targetTab) targetTab.classList.remove('hidden');
}

async function renderizarListaUsuariosPedidosExclusao() {
    const container = document.getElementById('admin-users-request-list');
    if (!container) return;
    
    container.innerHTML = "<p style='color:var(--text-gray); font-size:0.9rem;'><i class='fas fa-spinner fa-spin'></i> Carregando dados do nó /usuarios...</p>";
    
    try {
        let urlRaizLimpa = firebaseConfig.databaseURL.replace(/\/$/, "");
        let res = await fetch(`${urlRaizLimpa}/usuarios.json`);
        
        if (!res.ok) {
            container.innerHTML = `<p style='color:#e74c3c; padding:10px; font-weight:bold;'>❌ Erro de HTTP no Firebase: ${res.status}</p>`;
            return;
        }
        
        let data = await res.json();
        if (!data) {
            container.innerHTML = "<p style='color:var(--text-gray); padding:10px; font-size:0.9rem;'>Nenhum registro encontrado no nó /usuarios. O banco está vazio. ✨</p>";
            return;
        }

        let usuariosObjeto = {};
        if (Array.isArray(data)) {
            data.forEach((item, index) => { if (item) usuariosObjeto[index] = item; });
        } else {
            usuariosObjeto = data;
        }
        
        container.innerHTML = ""; 
        let encontrouNenhum = true;
        
        Object.keys(usuariosObjeto).forEach(uid => {
            try {
                const userPerfil = usuariosObjeto[uid];
                if (!userPerfil || typeof userPerfil !== 'object') return;
                
                const pediuExclusao = userPerfil.solicitou_exclusao === true || 
                                     userPerfil.solicitou_exclusao === "true" ||
                                     userPerfil.solicitouExclusao === true || 
                                     userPerfil.solicitouExclusao === "true";
                
                if (pediuExclusao) {
                    encontrouNenhum = false;
                    
                    const row = document.createElement('div');
                    row.className = "crud-item";
                    row.style.background = "rgba(231, 76, 60, 0.1)";
                    row.style.borderLeft = "4px solid #e74c3c";
                    row.style.padding = "10px";
                    row.style.marginBottom = "5px";
                    row.style.display = "flex";
                    row.style.justifyContent = "space-between";
                    row.style.alignItems = "center";
                    row.style.width = "100%";
                    
                    row.innerHTML = `
                        <div style="display:flex; flex-direction:column; gap:2px; text-align:left;">
                            <span style="color:#fff; font-weight:bold;">${userPerfil.nome || 'Usuário Sem Nome'} ${userPerfil.sobrenome || ''}</span>
                            <span style="font-size:0.72rem; color:var(--text-gray); font-family:monospace; user-select:all;"><i class="fas fa-fingerprint"></i> UID: ${uid}</span>
                        </div>
                        <button class="crud-btn btn-del" onclick="processarExclusaoDefinitivaPeloMaster('${uid}')" style="padding:6px 12px; font-size:0.8rem; flex-shrink:0; margin-left:10px;"><i class="fas fa-user-minus"></i> Limpar</button>
                    `;
                    container.appendChild(row);
                }
            } catch (innerError) {
                console.error("Erro ao processar linha de usuário individual:", innerError);
            }
        });
        
        if (encontrouNenhum) {
            container.innerHTML = "<p style='color:var(--text-gray); padding:10px; font-size:0.9rem;'>Nenhuma solicitação pendente no momento! Seu Firebase está limpo. ✨</p>";
        }
        
    } catch(err) {
        console.error("Erro crítico na renderização:", err);
        container.innerHTML = `<p style='color:#e74c3c; padding:10px; font-weight:bold;'>❌ Falha Crítica no Script: ${err.message}</p>`;
    }
}

async function processarExclusaoDefinitivaPeloMaster(uidUsuarioAlvo) {
    if (!confirm("Atenção Admin: Deseja apagar permanentemente todas as mídias e preferências deste usuário do banco? (Lembre-se de deletar a credencial dele no painel Firebase Auth)")) return;
    
    try {
        const urlBaseBanco = firebaseConfig.databaseURL.replace(/\/$/, "");
        await fetch(`${urlBaseBanco}/usuarios/${uidUsuarioAlvo}.json`, { method: "DELETE" });
        alert("Dados do Realtime Database removidos com sucesso!");
        renderizarListaUsuariosPedidosExclusao();
    } catch(e) {
        alert("Erro técnico ao limpar nó do usuário.");
    }
}

function setupEventListeners() {
    console.log("Configurando Delegação de Eventos...");

    document.addEventListener('click', async (e) => {
        if (e.target.closest('#toggle-sidebar')) handleToggleSidebar();
        if (e.target.closest('#bc-root') || e.target.closest('#bc-home')) { currentView = 'categories'; selectedCategory=''; selectedSubcategory=''; renderMosaic(); }
        if (e.target.closest('#bc-category')) { currentView = 'subcategories'; selectedSubcategory=''; renderMosaic(); }
        if (e.target.closest('#btn-logout')) handleLogoutActions();
        if (e.target.closest('#btn-toggle-search-mobile')) {
            const row = document.getElementById('mobile-search-row');
            if(row) { row.classList.toggle('hidden'); if(!row.classList.contains('hidden')) document.getElementById('search-yt-input-mobile').focus(); }
        }
        
        if (e.target.closest('#btn-google-login')) {
            const btnGoogle = e.target.closest('#btn-google-login');
            btnGoogle.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
            btnGoogle.disabled = true;

            firebase.auth().signInWithPopup(googleProvider)
                .catch((error) => {
                    alert("Erro ao logar com o Google: " + error.message);
                    btnGoogle.innerHTML = '<i class="fab fa-google"></i> Entrar com o Google';
                    btnGoogle.disabled = false;
                });
        }

        if (e.target.closest('#btn-trigger-dropdown-mobile')) {
            e.stopPropagation();
            document.getElementById('dropdown-menu-mobile')?.classList.toggle('hidden');
        } else {
            document.getElementById('dropdown-menu-mobile')?.classList.add('hidden');
        }

        if (e.target.closest('#btn-open-admin-mobile')) {
            document.getElementById('admin-modal')?.classList.remove('hidden'); 
            switchTabs('add-tab', 'tab-trigger-add'); 
            renderCrudManager();
        }

        if (e.target.closest('#btn-logout-mobile')) {
            handleLogoutActions();
        }
        
        if (e.target.closest('#btn-open-admin')) { 
            document.getElementById('admin-modal')?.classList.remove('hidden'); 
            switchTabs('add-tab', 'tab-trigger-add'); renderCrudManager(); 
        }
        if (e.target.closest('#btn-close-admin')) document.getElementById('admin-modal')?.classList.add('hidden');
        
        if (e.target.closest('#tab-trigger-add')) switchTabs('add-tab', 'tab-trigger-add');
        if (e.target.closest('#tab-trigger-channel')) switchTabs('channel-tab', 'tab-trigger-channel');
        if (e.target.closest('#tab-trigger-manage')) { switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager(); }
        if (e.target.closest('#tab-trigger-users')) { switchTabs('users-tab', 'tab-trigger-users'); renderizarListaUsuariosPedidosExclusao(); }

        if (e.target.closest('#btn-save-media')) saveMediaToDatabase(e);
        if (e.target.closest('#btn-submit-edit-media')) saveAdvancedEditChanges(e);
        if (e.target.closest('#btn-cancel-edit-media') || e.target.closest('#btn-cancel-edit-media-2')) {
            document.getElementById('edit-media-modal')?.classList.add('hidden');
        }
        
        if (e.target.closest('#btn-save-channel-link')) {
            const modoSelecionado = document.querySelector('input[name="cat-mode-channel"]:checked')?.value || 'existente';
            let catDestino = "";

            if (modoSelecionado === 'nova') {
                catDestino = document.getElementById("channel-target-category-new")?.value.trim();
            } else {
                catDestino = document.getElementById("channel-target-category")?.value;
            }

            if(!canalSelecionadoProvisorio || !catDestino) {
                return alert("Por favor, selecione um canal e defina/selecione uma categoria válida.");
            }

            try {
                const payload = { 
                    channelId: canalSelecionadoProvisorio.channelId, 
                    uploadsPlaylistId: canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU"), 
                    title: canalSelecionadoProvisorio.title, 
                    thumb: canalSelecionadoProvisorio.thumb 
                };
                
                const nodeName = btoa(unescape(encodeURIComponent(catDestino))).replace(/=/g, "");
                let urlCanalIndividual = obterUrlBaseCanais().replace(".json", `/${nodeName}.json`);
                
                await fetch(urlCanalIndividual, { method: "PUT", body: JSON.stringify(payload) });
                
                alert(`Canal vinculado com sucesso na categoria "${catDestino}"!`);
                
                document.getElementById("channel-preview").style.display = "none"; 
                document.getElementById('search-channel-input').value = "";
                if(document.getElementById('channel-target-category-new')) document.getElementById('channel-target-category-new').value = "";
                
                const radExistente = document.querySelector('input[name="cat-mode-channel"][value="existente"]');
                if(radExistente) { radExistente.checked = true; alternarModoCategoriaCanal('existente'); }

                canalSelecionadoProvisorio = null; 
                initApp();
            } catch(err) { 
                alert("Erro ao salvar canal: " + err.message); 
            }
        }

        if (e.target.closest('#btn-request-delete-account')) {
            e.preventDefault();
            if (!confirm("Tem certeza absoluta de que deseja solicitar a exclusão da sua conta? Seu acervo e preferências serão agendados para eliminação pelo administrador.")) return;
            
            try {
                await salvarPreferenciaNoFirebase({ solicitou_exclusao: true });
                alert("Sua solicitação de exclusão foi enviada com sucesso! Você pode fechar o site ou deslogar.");
                fecharModalPerfil();
            } catch(err) {
                alert("Falha ao registrar pedido.");
            }
        }
        
        if (e.target.closest('#btn-fetch-manual')) {
            const url = document.getElementById('manual-media-url').value.trim(); if(!url) return alert("Insira uma URL.");
            const btn = e.target.closest('#btn-fetch-manual'); btn.innerText = "Buscando..."; const vId = extractYoutubeId(url);
            try {
                if (vId) {
                    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vId}&key=${CONFIG.YT_API_KEY}`); const data = await res.json();
                    if (data.items && data.items.length > 0) { const snip = data.items[0].snippet; document.getElementById('prev-title').value = snip.title; document.getElementById('prev-thumb').src = snip.thumbnails.medium ? snip.thumbnails.medium.url : snip.thumbnails.default.url; } 
                }
            } catch(err) {} finally { btn.innerText = "Capturar Dados"; }
        }

        if (e.target.closest('#btn-export-all-json')) { if (database.length > 0) downloadJSON(database, "backup_completo_streamhub"); else alert("Banco vazio!"); }
        if (e.target.closest('#btn-submit-json-code')) {
            const val = document.getElementById('json-input-field')?.value.trim(); if(!val) return alert("Cole o código JSON");
            try { let p = JSON.parse(val); await processarInjecaoDeDadosAcumulativa(Array.isArray(p) ? p : Object.values(p)); document.getElementById('json-input-field').value = ""; } catch(err) { alert("JSON inválido."); }
        }
        
        if (e.target.closest('#btn-reset-theme')) {
            if(currentUserUid) {
                let padrao = { cor_tema: "#ff0000" };
                aplicarCorTema("#ff0000"); posicionarSetaPelaCor("#ff0000");
                salvarPreferenciaNoFirebase(padrao);
            }
        }

        if (e.target.closest('#profile-btn-reset-theme')) {
            corPerfilTemporaria = "#ff0000";
            aplicarCorTema("#ff0000");
            const selectorPerfil = document.getElementById('profile-color-spectrum-selector');
            if(selectorPerfil) selectorPerfil.style.left = "12%";
        }

        if (e.target.closest('#btn-next-track')) { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }
        if (e.target.closest('#btn-prev-track')) { if(currentTrackIndex > 0) playTrack(currentTrackIndex - 1); }
        if (e.target.closest('#btn-close-player')) {
            if(ytPlayer?.stopVideo) ytPlayer.stopVideo(); document.getElementById('universal-player').src = ""; document.getElementById('raw-player').pause();
            document.getElementById('player-container')?.classList.add('hidden');
        }
        if (e.target.closest('#btn-mute-toggle')) {
            const btnMute = e.target.closest('#btn-mute-toggle');
            let isMuted = btnMute.getAttribute('data-muted') === 'true';
            btnMute.setAttribute('data-muted', !isMuted); 
            aplicarVolume();
        }

        const themeBtn = e.target.closest('[id^="theme-switch-"]');
        if (themeBtn) {
            const tema = themeBtn.id.replace('theme-switch-', '');
            const className = tema === 'youtube' ? "" : `theme-${tema}`;
            document.body.className = className;
            salvarPreferenciaNoFirebase({ tema: className });
        }

        const profileThemeBtn = e.target.closest('.profile-theme-btn');
        if (profileThemeBtn) {
            const temaSelecionado = profileThemeBtn.getAttribute('data-theme');
            const className = temaSelecionado === 'youtube' ? "" : `theme-${temaSelecionado}`;
            document.body.className = className;
            profileThemeBtn.parentElement.querySelectorAll('.profile-theme-btn').forEach(btn => btn.classList.remove('active'));
            profileThemeBtn.classList.add('active');
        }

        // DISPARO DA REQUISIÇÃO DE RECUPERAÇÃO DE SENHA
        if (e.target.closest('#btn-recover-submit')) {
            e.preventDefault();
            handlePasswordRecovery();
        }
    });

    document.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-save-profile-changes')) {
            e.preventDefault();
            
            const novoNome = document.getElementById('profile-edit-name').value.trim();
            const novoSobrenome = document.getElementById('profile-edit-lastname').value.trim();
            const btnTemaAtivo = document.querySelector('.profile-theme-btn.active');
            let temaFinal = document.body.className; 
            
            if (btnTemaAtivo) {
                const dataTheme = btnTemaAtivo.getAttribute('data-theme');
                temaFinal = dataTheme === 'youtube' ? "" : `theme-${dataTheme}`;
            }
            
            if (!novoNome || !novoSobrenome) {
                return alert("Os campos Nome e Sobrenome não podem ficar vazios!");
            }
            
            const btnSaveProf = document.getElementById('btn-save-profile-changes');
            btnSaveProf.innerText = "Salvando..."; btnSaveProf.disabled = true;
            
            try {
                const dadosAtualizados = {
                    nome: novoNome,
                    sobrenome: novoSobrenome,
                    cor_tema: corPerfilTemporaria || "#ff0000",
                    tema: temaFinal
                };
                
                await salvarPreferenciaNoFirebase(dadosAtualizados);
                aplicarCorTema(dadosAtualizados.cor_tema);
                document.body.className = dadosAtualizados.tema;
                
                const elTxt = document.getElementById('user-top-name');
                if (elTxt) elTxt.innerText = `Olá, ${novoNome}!`;
                
                alert("Perfil e preferências salvos com sucesso!");
                fecharModalPerfil();
                
            } catch (err) {
                alert("Erro ao salvar alterações do perfil: " + err.message);
            } finally {
                btnSaveProf.innerText = "Salvar Alterações"; btnSaveProf.disabled = false;
            }
        }
    });
    
    const tratarBuscaGlobal = (e) => {
        if (e.key === 'Enter' || e.type === 'change') {
            const termo = e.target.value.trim();
            if (termo) {
                searchYouTubeGlobal(termo);
                e.target.blur(); 
                document.getElementById('mobile-search-row')?.classList.add('hidden');
            }
        }
    };

    document.getElementById('search-yt-input')?.addEventListener('keypress', tratarBuscaGlobal);
    document.getElementById('search-yt-input')?.addEventListener('change', tratarBuscaGlobal);

    document.getElementById('search-yt-input-mobile')?.addEventListener('keypress', tratarBuscaGlobal);
    document.getElementById('search-yt-input-mobile')?.addEventListener('change', tratarBuscaGlobal);
    
    document.getElementById('search-internal-input')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        filterInternalDatabase(termo);
        if (termo === "") { currentView = 'categories'; selectedCategory = ''; selectedSubcategory = ''; renderMosaic(); }
    });

    document.getElementById('search-internal-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const termo = e.target.value.toLowerCase().trim();
            if (!termo) return;

            lastLocalSearchResults = database.filter(item => {
                const titulo = item.título || item.titulo || ""; 
                const categoria = item.categoria || item.Categoria || "";
                const subcategoria = item.subcategoria || "";
                return titulo.toLowerCase().includes(termo) || categoria.toLowerCase().includes(termo) || subcategoria.toLowerCase().includes(termo);
            });

            currentView = 'search_local_results'; renderMosaic();
            if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('open');
        }
    });

    document.getElementById('file-import-json')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = async (evt) => {
            try { let p = JSON.parse(evt.target.result); await processarInjecaoDeDadosAcumulativa(Array.isArray(p) ? p : Object.values(p)); e.target.value = ""; } catch(err) { alert("Erro de arquivo."); }
        }; reader.readAsText(file);
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'player-volume-slider') {
            const btnMute = document.getElementById('btn-mute-toggle');
            if (btnMute) btnMute.setAttribute('data-muted', 'false'); 
            aplicarVolume();
        }
    });

    // PROCESSAMENTO DO CADASTRO COMPLETO DE USUÁRIOS COM FILTRO DE PROVEDOR REAL
    document.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-register-submit')) {
            e.preventDefault();
            
            const nome = document.getElementById('register-name').value.trim();
            const sobrenome = document.getElementById('register-lastname').value.trim();
            const email = document.getElementById('register-email').value.trim().toLowerCase();
            const senha = document.getElementById('register-pass').value.trim();
            const senhaConfirm = document.getElementById('register-pass-confirm').value.trim();
            
            if(!nome || !sobrenome || !email || !senha) {
                return alert("Por favor, preencha todos os campos do cadastro!");
            }
            
            // TRAVA DE PROVEDOR REAL: Aplica a validação do front-end
            if (!verificarProvedorValido(email)) {
                return alert("Cadastro Bloqueado!\nPor razões de segurança e viabilidade de recuperação de senha, use um e-mail válido pertencente aos grandes provedores (Gmail, Hotmail, Outlook, Yahoo, iCloud, UOL, BOL ou IG).");
            }

            if(senha.length < 6) {
                return alert("A senha precisa ter no mínimo 6 caracteres!");
            }
            if(senha !== senhaConfirm) {
                return alert("As senhas digitadas não batem! Verifique a confirmação.");
            }
            
            const btnReg = document.getElementById('btn-register-submit');
            btnReg.innerText = "Criando conta..."; btnReg.disabled = true;
            
            try {
                const cred = await firebase.auth().createUserWithEmailAndPassword(email, senha);
                const novoUid = cred.user.uid;
                const urlBaseBanco = firebaseConfig.databaseURL.replace(/\/$/, "");
                
                const novoPerfil = {
                    nome: nome,
                    sobrenome: sobrenome,
                    cor_tema: "#ff0000",
                    tema: "",
                    firebaseUrl: `${urlBaseBanco}/usuarios/${novoUid}/midias.json`
                };
                
                await fetch(`${urlBaseBanco}/usuarios/${novoUid}.json`, {
                    method: "PATCH",
                    body: JSON.stringify(novoPerfil),
                    headers: { 'Content-Type': 'application/json' }
                });
                
                alert(`Conta criada com absoluto sucesso, ${nome}! Seja bem-vindo.`);
                
                document.getElementById('form-cadastro-fluxo').reset();
                alternarAbasLogin('login');
                
            } catch(error) {
                alert("Erro ao realizar cadastro: " + error.message);
            } finally {
                btnReg.innerText = "Criar Minha Conta"; btnReg.disabled = false;
            }
        }
    });

    configurarEventosBuscaCanal();
    inicializarSeletorCoresLinear();
}

// INICIALIZAÇÃO DO ECOSSISTEMA
document.addEventListener('DOMContentLoaded', () => {
    configurarEventosLogin();
    setupEventListeners();
    checkSession();
});
