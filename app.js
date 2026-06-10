// ==========================================
// CONFIGURAÇÃO INICIAL E CREDENCIAIS DO FIREBASE
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Provedor de Autenticação do Google
const googleProvider = new firebase.auth.GoogleAuthProvider();

const USERS_DATABASE = {
    "diego@midias.com": { 
        defaultColor: "#11ffcf",
        firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/midias.json",
        ytApiKey: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ"
    },
    "diego@canais.com": { 
        defaultColor: "#ff0000",
        firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/canais.json",
        ytApiKey: "AIzaSyD2x7SjdblFqlxQdKHlgfSZA5Nmjb1QbMk"
    },
};

let CONFIG = { YT_API_KEY: "", FIREBASE_URL: "" };

let currentUser = "";
let database = [];
let canaisDinamicos = {};
let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = [];
let lastLocalSearchResults = []; // Guarda os resultados da busca interna do acervo
let activeEditingIndex = null;
let canalSelecionadoProvisorio = null;

let expandedCrudCats = {};
let expandedCrudSubs = {};

function obterUrlNodoItem(idItem = null) {
    let urlSemJson = CONFIG.FIREBASE_URL.replace(".json", "");
    return idItem ? `${urlSemJson}/${idItem}.json` : CONFIG.FIREBASE_URL;
}

function obterUrlBaseCanais() {
    // Substitui 'midias.json' por 'canais_dinamicos.json' na URL atual do usuário
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
}

function posicionarSetaPelaCor(hexColor) {
    const selector = document.getElementById('color-spectrum-selector'); if (!selector) return;
    if(hexColor.toLowerCase() === "#ff0000" || hexColor.toLowerCase() === "#e50914") selector.style.left = "12%";
    if(hexColor.toLowerCase() === "#00f0ff") selector.style.left = "50%";
}

function carregarTemaDoUsuarioLogado(usuario) {
    let corSalva = localStorage.getItem(`streamhub_theme_${usuario}`);
    if(corSalva) { aplicarCorTema(corSalva); posicionarSetaPelaCor(corSalva); } 
    else {
        let corPadrao = USERS_DATABASE[usuario] ? USERS_DATABASE[usuario].defaultColor : "#ff0000";
        aplicarCorTema(corPadrao); posicionarSetaPelaCor(corPadrao);
    }
    let visualSalvo = localStorage.getItem(`streamhub_layout_mode_${usuario}`);
    if(visualSalvo) { document.body.className = visualSalvo; } else { document.body.className = ""; }
}

function checkSession() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user && user.email) {
            const emailLogado = user.email.toLowerCase();
            
            // 1. Verifica se é um usuário do login convencional (antigo)
            if (USERS_DATABASE[emailLogado]) {
                currentUser = emailLogado;
                CONFIG.FIREBASE_URL = USERS_DATABASE[currentUser].firebaseUrl;
                CONFIG.YT_API_KEY = USERS_DATABASE[currentUser].ytApiKey;
            } 
            // 2. Se não estiver no USERS_DATABASE, significa que logou pelo Google!
            else {
                currentUser = emailLogado;
                // Cria um nó exclusivo usando o UID do Firebase para evitar conflitos e caracteres proibidos
                CONFIG.FIREBASE_URL = `https://workin--music-default-rtdb.firebaseio.com/usuarios/${user.uid}/midias.json`;
                
                // Usamos uma API Key padrão para os usuários do Google (pode usar a do Diego Mídias como fallback)
                CONFIG.YT_API_KEY = "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ"; 
            }
            
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            carregarTemaDoUsuarioLogado(user.uid); 
            initApp();
            return;
        }
        limparInterfaceLocal();
    });
}

function configurarEventosLogin() {
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    const btnLogin = document.getElementById('btn-login');

    if (inputUser) { inputUser.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (inputPass) inputPass.focus(); } }; }
    if (inputPass) { inputPass.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }; }
    if (btnLogin) { btnLogin.onclick = (e) => { e.preventDefault(); handleLogin(); }; }
}

function handleLogin() {
    const elUser = document.getElementById('login-user');
    const elPass = document.getElementById('login-pass');
    if(!elUser || !elPass) return;
    const inputEmail = elUser.value.trim().toLowerCase();
    const inputPass = elPass.value.trim();
    if (!inputEmail || !inputPass) return alert("Preencha todos os campos!");
    if (!USERS_DATABASE[inputEmail]) return alert("Este utilizador não possui perfil configurado!");
    
    const btnLogin = document.getElementById('btn-login');
    btnLogin.innerText = "Autenticando..."; btnLogin.disabled = true;

    firebase.auth().signInWithEmailAndPassword(inputEmail, inputPass)
        .catch((error) => {
            alert("Erro na Autenticação: " + error.message);
            btnLogin.innerText = "Entrar"; btnLogin.disabled = false;
        });
}

function handleLogoutActions() {
    firebase.auth().signOut().then(() => { limparInterfaceLocal(); });
}

function limparInterfaceLocal() {
    document.body.className = ""; 
    currentUser = ""; CONFIG.FIREBASE_URL = ""; CONFIG.YT_API_KEY = "";
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch(e){} }
    if (document.getElementById('universal-player')) document.getElementById('universal-player').src = "";
    if (document.getElementById('raw-player')) { document.getElementById('raw-player').pause(); document.getElementById('raw-player').src = ""; }
    if (document.getElementById('login-user')) document.getElementById('login-user').value = "";
    if (document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
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

// ==========================================
// CANAIS DINÂMICOS - AGORA COM SCROLL DE 10 RESULTADOS
// ==========================================
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
    else if(linkOriginal.toLowerCase().endsWith('.mp4') || linkOriginal.toLowerCase().endsWith('.mkv') || linkOriginal.toLowerCase().includes('raw.githubusercontent')) {
        if (rawPlayerEl) { rawPlayerEl.classList.remove('hidden'); rawPlayerEl.src = linkOriginal; rawPlayerEl.play(); aplicarVolume(); rawPlayerEl.onended = () => { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }; }
    } 
    else { if (univPlayerEl) { univPlayerEl.classList.remove('hidden'); univPlayerEl.src = linkOriginal.includes("archive.org/details/") ? linkOriginal.replace("archive.org/details/", "archive.org/embed/") : linkOriginal; } }
}

function extractYoutubeId(url) {
    if (!url || url.includes('videoseries')) return null; 
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/shorts\/)([^#\&\?]*).*/; const match = url.match(regExp);
    if (match && match[2].length === 11) return match[2]; if (url.trim().length === 11 && !url.includes('/') && !url.includes('.')) return url.trim(); return null;
}

// --- MOTOR DE VOLUME ---
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

// CORREÇÃO AUXILIAR: Renomear Categorias dinamicamente no Firebase
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

async function renomearSubcategoriaCompleta(cat, antigaSub, novaSub) { try { database.forEach(item => { if(item.categoria === cat && item.subcategoria === antigaSub) item.subcategoria = novaSub; }); await empurrarBancoIntegralParaServidor(); await recarregarDadosDoBanco(); renderCrudManager(); } catch(e){} }

function downloadJSON(obj, filename) {
    const prepararObjeto = Array.isArray(obj) ? obj.map(({idFirebase, ...r}) => r) : obj;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prepararObjeto, null, 2));
    const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`);
    document.body.appendChild(a); a.click(); a.remove();
}

function inicializarSeletorCoresLinear() {
    const bar = document.getElementById('color-spectrum-bar'); const selector = document.getElementById('color-spectrum-selector'); if (!bar || !selector) return;
    let isDragging = false; const coresGradiente = ["#000000", "#ff0000", "#ff00ff", "#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000", "#ffffff"];
    function calcularCorPelaPosicao(e) {
        const rect = bar.getBoundingClientRect(); let clientX = e.clientX || (e.touches && e.touches[0].clientX); let x = clientX - rect.left;
        if (x < 0) x = 0; if (x > rect.width) x = rect.width; let percent = x / rect.width; selector.style.left = (percent * 100) + '%';
        let segment = percent * (coresGradiente.length - 1); let index = Math.floor(segment); let factor = segment - index;
        let core1 = coresGradiente[index]; let cor2 = coresGradiente[index + 1] || coresGradiente[index];
        let rgb1 = hexToRgb(core1); let rgb2 = hexToRgb(cor2);
        let r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r)); let g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g)); let b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));
        let hexResult = rgbToHex(r, g, b); aplicarCorTema(hexResult); if(currentUser) localStorage.setItem(`streamhub_theme_${currentUser}`, hexResult);
    }
    function hexToRgb(hex) { let num = parseInt(hex.replace("#",""), 16); return { r: num >> 16, g: (num >> 8) & 0x00FF, b: num & 0x0000FF }; }
    function rgbToHex(r, g, b) { return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
    bar.addEventListener('mousedown', (e) => { isDragging = true; calcularCorPelaPosicao(e); });
    document.addEventListener('mousemove', (e) => { if (isDragging) calcularCorPelaPosicao(e); }); document.addEventListener('mouseup', () => isDragging = false);
    bar.addEventListener('touchstart', (e) => { isDragging = true; calcularCorPelaPosicao(e); }, {passive: true});
    document.addEventListener('touchmove', (e) => { if (isDragging) calcularCorPelaPosicao(e); }, {passive: true}); document.addEventListener('touchend', () => isDragging = false);
}

function handleToggleSidebar() {
    const sidebar = document.getElementById('sidebar'); if (!sidebar) return;
    if (window.innerWidth <= 768) { sidebar.classList.toggle('open'); sidebar.classList.remove('collapsed'); }
    else { sidebar.classList.toggle('collapsed'); sidebar.classList.remove('open'); }
}

// ==========================================
// DELEGAÇÃO GLOBAL DE EVENTOS (À PROVA DE FALHAS)
// ==========================================
function switchTabs(targetTabId, activeTriggerBtnId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const triggerBtn = document.getElementById(activeTriggerBtnId); 
    const targetTab = document.getElementById(targetTabId);
    if (triggerBtn) triggerBtn.classList.add('active'); 
    if (targetTab) targetTab.classList.remove('hidden');
}

function setupEventListeners() {
    console.log("Configurando Delegação de Eventos...");

    document.addEventListener('click', async (e) => {
        // --- NAVEGAÇÃO SUPERIOR ---
        if (e.target.closest('#toggle-sidebar')) handleToggleSidebar();
        if (e.target.closest('#bc-root') || e.target.closest('#bc-home')) { currentView = 'categories'; selectedCategory=''; selectedSubcategory=''; renderMosaic(); }
        if (e.target.closest('#bc-category')) { currentView = 'subcategories'; selectedSubcategory=''; renderMosaic(); }
        if (e.target.closest('#btn-logout')) handleLogoutActions();
        if (e.target.closest('#btn-toggle-search-mobile')) {
            const row = document.getElementById('mobile-search-row');
            if(row) { row.classList.toggle('hidden'); if(!row.classList.contains('hidden')) document.getElementById('search-yt-input-mobile').focus(); }
        }
        
        // --- LOGIN COM O GOOGLE ---
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

        // --- ABAS E MODAL ADMIN ---
        if (e.target.closest('#btn-open-admin')) { 
            document.getElementById('admin-modal')?.classList.remove('hidden'); 
            switchTabs('add-tab', 'tab-trigger-add'); renderCrudManager(); 
        }
        if (e.target.closest('#btn-close-admin')) document.getElementById('admin-modal')?.classList.add('hidden');
        
        if (e.target.closest('#tab-trigger-add')) switchTabs('add-tab', 'tab-trigger-add');
        if (e.target.closest('#tab-trigger-channel')) switchTabs('channel-tab', 'tab-trigger-channel');
        if (e.target.closest('#tab-trigger-manage')) { switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager(); }

        if (e.target.closest('#btn-save-media')) saveMediaToDatabase(e);
        if (e.target.closest('#btn-submit-edit-media')) saveAdvancedEditChanges(e);
        if (e.target.closest('#btn-cancel-edit-media') || e.target.closest('#btn-cancel-edit-media-2')) {
            document.getElementById('edit-media-modal')?.classList.add('hidden');
        }
        if (e.target.closest('#btn-save-channel-link')) {
            const catDestino = document.getElementById("channel-target-category")?.value; 
            if(!canalSelecionadoProvisorio || !catDestino) return alert("Selecione um canal e uma categoria.");
            try {
                const payload = { channelId: canalSelecionadoProvisorio.channelId, uploadsPlaylistId: canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU"), title: canalSelecionadoProvisorio.title, thumb: canalSelecionadoProvisorio.thumb };
                const nodeName = btoa(unescape(encodeURIComponent(catDestino))).replace(/=/g, "");
                let urlCanalIndividual = obterUrlBaseCanais().replace(".json", `/${nodeName}.json`);
                await fetch(urlCanalIndividual, { method: "PUT", body: JSON.stringify(payload) });
                alert("Canal vinculado!"); document.getElementById("channel-preview").style.display = "none"; document.getElementById('search-channel-input').value = "";
                canalSelecionadoProvisorio = null; initApp();
            } catch(err) { alert("Erro ao salvar canal."); }
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
            if(currentUser) { localStorage.removeItem(`streamhub_theme_${currentUser}`); let c = USERS_DATABASE[currentUser] ? USERS_DATABASE[currentUser].defaultColor : "#ff0000"; aplicarCorTema(c); posicionarSetaPelaCor(c); }
        }

        // --- CONTROLES DO PLAYER ---
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

        // --- TEMAS VISUAIS ---
        const themeBtn = e.target.closest('[id^="theme-switch-"]');
        if (themeBtn) {
            const tema = themeBtn.id.replace('theme-switch-', '');
            const className = tema === 'youtube' ? "" : `theme-${tema}`;
            document.body.className = className;
            if(currentUser) localStorage.setItem(`streamhub_layout_mode_${currentUser}`, className);
        }
    });

    // Filtros e Inputs (Eventos de teclado)
    document.getElementById('search-yt-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); });
    document.getElementById('search-yt-input-mobile')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); });
    
    document.getElementById('search-internal-input')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        filterInternalDatabase(termo);
        if (termo === "") {
            currentView = 'categories';
            selectedCategory = '';
            selectedSubcategory = '';
            renderMosaic();
        }
    });

    document.getElementById('search-internal-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const termo = e.target.value.toLowerCase().trim();
            if (!termo) return;

            lastLocalSearchResults = database.filter(item => 
                item.título.toLowerCase().includes(termo) || 
                item.categoria.toLowerCase().includes(termo) || 
                (item.subcategoria && item.subcategoria.toLowerCase().includes(termo))
            );

            currentView = 'search_local_results';
            renderMosaic();
            
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar')?.classList.remove('open');
            }
        }
    });

    // Importar via arquivo JSON
    document.getElementById('file-import-json')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = async (evt) => {
            try { let p = JSON.parse(evt.target.result); await processarInjecaoDeDadosAcumulativa(Array.isArray(p) ? p : Object.values(p)); e.target.value = ""; } catch(err) { alert("Erro de arquivo."); }
        }; reader.readAsText(file);
    });

    // Controle de volume slider
    document.addEventListener('input', (e) => {
        if (e.target.id === 'player-volume-slider') {
            const btnMute = document.getElementById('btn-mute-toggle');
            if (btnMute) btnMute.setAttribute('data-muted', 'false'); 
            aplicarVolume();
        }
    });

    configurarEventosBuscaCanal();
    inicializarSeletorCoresLinear();
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    configurarEventosLogin();
    setupEventListeners();
    checkSession();
});
