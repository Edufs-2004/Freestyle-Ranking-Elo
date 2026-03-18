import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';

let listaMCs = []; let miGrafico = null; let batallasGlobalesMC = []; let mcActualID = null;

async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = data;
}

function filtrarBuscador() {
    let texto = document.getElementById('buscadorMCs').value.toLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');
    if (texto.length < 1) return cajaSugerencias.style.display = 'none';

    let resultados = listaMCs.filter(mc => mc.aka.toLowerCase().includes(texto));
    let html = '';
    if (resultados.length === 0) html += `<div class="sugerencia-item" style="color: #888;">No se encontraron MCs</div>`;
    else resultados.forEach(mc => { html += `<div class="sugerencia-item" onclick="cargarPerfil(${mc.id})"><span>${mc.aka}</span><span style="color: #888;">Elo: ${mc.elo_actual}</span></div>`; });
    
    cajaSugerencias.innerHTML = html; cajaSugerencias.style.display = 'block';
}

async function cargarPerfil(idMC) {
    mcActualID = idMC;
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('buscadorMCs').value = mcPrincipal.aka;
    document.getElementById('sugerenciasMCs').style.display = 'none';

    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC';
    document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';

    const { data: batallas, error } = await supabase.from('batallas').select(`
            id, fase, resultado, mc1_id, mc2_id, elo_previo_mc1, elo_previo_mc2, cambio_mc1, cambio_mc2,
            torneos(nombre, franquicia, fecha_evento), mc1:competidores!batallas_mc1_id_fkey(id, aka), mc2:competidores!batallas_mc2_id_fkey(id, aka)
        `).or(`mc1_id.eq.${idMC},mc2_id.eq.${idMC}`);

    if (error) return alert("Error cargando historial.");

    let validas = batallas.filter(b => b.torneos !== null);
    validas.sort((a, b) => {
        let dateA = new Date(a.torneos.fecha_evento).getTime(); let dateB = new Date(b.torneos.fecha_evento).getTime();
        if (dateA === dateB) return a.id - b.id; return dateA - dateB;
    });

    batallasGlobalesMC = validas;
    renderizarPerfil(batallasGlobalesMC, mcPrincipal, false, null);
    document.getElementById('zonaPerfil').style.display = 'block';
}

async function aplicarFiltroPerfil() {
    let f = document.getElementById('filtroFranqPerfil').value; let d = document.getElementById('filtroDesdePerfil').value; let h = document.getElementById('filtroHastaPerfil').value;
    let estaFiltrado = (f !== 'TODAS' || d !== "" || h !== "");
    if (!estaFiltrado) return cargarPerfil(mcActualID); 

    document.getElementById('cuerpoHistorial').innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ff4757;"><strong>⏳ Simulando universo aislado...</strong></td></tr>';

    const { data: mcs } = await supabase.from('competidores').select('id, aka');
    let rankingTemp = {}; mcs.forEach(mc => { rankingTemp[mc.id] = 1500; });

    const { data: batallas, error } = await supabase.from('batallas').select(`
        id, fase, resultado, mc1_id, mc2_id, cambio_mc1,
        torneos(nombre, franquicia, fecha_evento), mc1:competidores!batallas_mc1_id_fkey(aka), mc2:competidores!batallas_mc2_id_fkey(aka)
    `);

    let franquiciasPermitidas = obtenerFranquiciasValidas(f);

    let filtradas = batallas.filter(b => {
        if(!b.torneos) return false;
        let okF = (f === 'TODAS') ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
        let okD = (!d) ? true : b.torneos.fecha_evento >= d; let okH = (!h) ? true : b.torneos.fecha_evento <= h;
        return okF && okD && okH;
    });

    filtradas.sort((a, b) => {
        let dateA = new Date(a.torneos.fecha_evento).getTime(); let dateB = new Date(b.torneos.fecha_evento).getTime();
        if (dateA === dateB) return a.id - b.id; return dateA - dateB;
    });

    const K = 32; let simulacionPerfil = [];

    filtradas.forEach(b => {
        if (b.resultado === 'bono') {
            let eloPrev = rankingTemp[b.mc1_id];
            rankingTemp[b.mc1_id] += b.cambio_mc1;
            if (b.mc1_id == mcActualID) {
                simulacionPerfil.push({ ...b, elo_previo_mc1: eloPrev, cambio_mc1: b.cambio_mc1 });
            }
            return;
        }

        let R1 = rankingTemp[b.mc1_id]; let R2 = rankingTemp[b.mc2_id];
        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;

        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
        else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
        else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }

        let p1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); let p2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));

        rankingTemp[b.mc1_id] = R1 + p1; rankingTemp[b.mc2_id] = R2 + p2;

        if (b.mc1_id == mcActualID || b.mc2_id == mcActualID) {
            simulacionPerfil.push({ ...b, elo_previo_mc1: R1, elo_previo_mc2: R2, cambio_mc1: p1, cambio_mc2: p2 });
        }
    });

    let mcPrincipal = listaMCs.find(m => m.id == mcActualID);
    renderizarPerfil(simulacionPerfil, mcPrincipal, true, rankingTemp[mcActualID]);
}

function renderizarPerfil(arrayBatallas, mcPrincipal, estaFiltrado, eloFinalSimulado) {
    let historialHtml = ''; let etiquetasGrafico = []; let datosGrafico = []; let esPremioSegmento = []; 
    let peakElo = 1500; let victorias = 0; let batallasJugadas = 0;

    if (arrayBatallas.length > 0) {
        let primera = arrayBatallas[0];
        let eloEntrada = (primera.resultado === 'bono') ? primera.elo_previo_mc1 : (primera.mc1_id == mcPrincipal.id ? primera.elo_previo_mc1 : primera.elo_previo_mc2);
        etiquetasGrafico.push(estaFiltrado ? 'Puntos de Entrada' : 'Inicio');
        datosGrafico.push(eloEntrada); esPremioSegmento.push(false); peakElo = eloEntrada;
    }

    arrayBatallas.forEach(b => {
        if (b.resultado === 'bono') {
            let eloD = b.elo_previo_mc1 + b.cambio_mc1;
            etiquetasGrafico.push(b.fase); datosGrafico.push(eloD); esPremioSegmento.push(true);
            if(eloD > peakElo) peakElo = eloD;

            let filaPremio = `
                <tr style="background-color: rgba(255, 71, 87, 0.1);">
                    <td>${b.torneos.fecha_evento}</td><td><strong>${b.torneos.nombre}</strong></td>
                    <td>${b.fase}</td><td>-</td><td><span class='win'>Premio/Bono</span></td>
                    <td>${b.elo_previo_mc1}</td><td class="win" style="color: #ff4757;">+${b.cambio_mc1} pts</td>
                </tr>`;
            historialHtml = filaPremio + historialHtml;
            return;
        }

        batallasJugadas++;
        let soyMC1 = b.mc1_id == mcPrincipal.id;
        let oponente = soyMC1 ? b.mc2.aka : b.mc1.aka;
        let miEloPrevio = soyMC1 ? b.elo_previo_mc1 : b.elo_previo_mc2;
        let miCambio = soyMC1 ? b.cambio_mc1 : b.cambio_mc2;
        let miEloDespues = miEloPrevio + miCambio;

        let gane = soyMC1 ? ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado) : ['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado);
        if (gane) victorias++;
        if (miEloDespues > peakElo) peakElo = miEloDespues;

        etiquetasGrafico.push(b.fase); datosGrafico.push(miEloDespues); esPremioSegmento.push(false); 

        let txtRes = gane ? "<span class='win'>Victoria</span>" : "<span class='loss'>Derrota</span>";
        let cCam = miCambio >= 0 ? "win" : "loss"; let sCam = miCambio >= 0 ? "+" : "";

        historialHtml = `
            <tr>
                <td>${b.torneos.fecha_evento}</td><td><strong>${b.torneos.nombre}</strong></td>
                <td>${b.fase}</td><td>vs ${oponente}</td><td>${txtRes}</td>
                <td>${miEloPrevio}</td><td class="${cCam}">${sCam}${miCambio} pts</td>
            </tr>` + historialHtml; 
    });

    document.getElementById('statEloActual').innerText = estaFiltrado ? (eloFinalSimulado || 1500) : mcPrincipal.elo_actual;
    document.getElementById('statBatallas').innerText = batallasJugadas; document.getElementById('statPeakElo').innerText = peakElo;
    document.getElementById('statWinRate').innerText = batallasJugadas > 0 ? Math.round((victorias / batallasJugadas) * 100) + '%' : '0%';
    document.getElementById('cuerpoHistorial').innerHTML = historialHtml || '<tr><td colspan="7" style="text-align:center;">No hay registros.</td></tr>';

    dibujarGrafico(etiquetasGrafico, datosGrafico, mcPrincipal.aka, esPremioSegmento);
}

function dibujarGrafico(etiquetas, datos, nombre, arraySegmentos) {
    let ctx = document.getElementById('eloChart').getContext('2d');
    if (miGrafico) miGrafico.destroy();
    miGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels: etiquetas, datasets: [{ label: `Evolución de Elo - ${nombre}`, data: datos, backgroundColor: 'rgba(30, 144, 255, 0.2)', borderWidth: 3, pointBackgroundColor: '#eccc68', pointRadius: 4, fill: true, tension: 0.3, segment: { borderColor: ctx => arraySegmentos[ctx.p1DataIndex] ? '#ff4757' : '#1e90ff' } }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'white' } } }, scales: { x: { ticks: { color: '#aaa' }, grid: { color: '#373752' } }, y: { ticks: { color: '#aaa' }, grid: { color: '#373752' } } } }
    });
}

function abrirEdicion() {
    let mcPrincipal = listaMCs.find(m => m.id == mcActualID);
    document.getElementById('editAka').value = mcPrincipal.aka; document.getElementById('editNacionalidad').value = mcPrincipal.nacionalidad || ''; document.getElementById('editFoto').value = mcPrincipal.foto || '';
    document.getElementById('formEdicion').style.display = 'block';
}

function cerrarEdicion() { document.getElementById('formEdicion').style.display = 'none'; }

async function guardarEdicion() {
    let nAka = document.getElementById('editAka').value.trim(); let nNac = document.getElementById('editNacionalidad').value.trim(); let nFoto = document.getElementById('editFoto').value.trim();
    if(!nAka) return alert("El nombre no puede estar vacío");
    const { error } = await supabase.from('competidores').update({ aka: nAka, nacionalidad: nNac, foto: nFoto }).eq('id', mcActualID);
    if (error) return alert("Error al guardar.");
    cerrarEdicion(); await inicializar(); cargarPerfil(mcActualID); 
}

window.filtrarBuscador = filtrarBuscador; window.cargarPerfil = cargarPerfil; window.aplicarFiltroPerfil = aplicarFiltroPerfil; 
window.abrirEdicion = abrirEdicion; window.cerrarEdicion = cerrarEdicion; window.guardarEdicion = guardarEdicion;

async function cargarPagina() {
    await configurarSesion();
    await inicializar();
    await cargarFranquiciasSelect('filtroFranqPerfil', true);
}

cargarPagina();