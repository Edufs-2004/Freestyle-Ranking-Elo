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
    document.getElementById('buscadorMCs').value = ''; document.getElementById('sugerenciasMCs').style.display = 'none';
    
    document.getElementById('perfilNombre').innerText = (mcPrincipal.nacionalidad ? mcPrincipal.nacionalidad + ' ' : '') + mcPrincipal.aka;
    document.getElementById('perfilFoto').src = mcPrincipal.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC';
    document.getElementById('perfilElo').innerText = mcPrincipal.elo_actual;
    
    const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`).or(`mc1_id.eq.${idMC},mc2_id.eq.${idMC}`).order('id', { ascending: true });
    if(error) return console.error(error);
    
    // Protección contra torneos huérfanos/borrados para que no rompa el código
    batallasGlobalesMC = batallas.sort((a,b) => {
        let fA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
        let fB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
        return fA - fB;
    });
    
    document.getElementById('panelPerfil').style.display = 'block';
    aplicarFiltroPerfil();
}

function aplicarFiltroPerfil() {
    // Búsqueda inteligente de filtros: se adapta a cualquier ID que tengas en tu HTML sin romperse
    let selectF = document.getElementById('filtroFranqPerfil');
    let inputD = document.getElementById('filtroDesdePerfil') || document.getElementById('fechaDesde') || document.getElementById('desde');
    let inputH = document.getElementById('filtroHastaPerfil') || document.getElementById('fechaHasta') || document.getElementById('hasta');

    let f = selectF ? selectF.value : 'TODAS';
    let d = inputD ? inputD.value : '';
    let h = inputH ? inputH.value : '';

    let franquiciasPermitidas = obtenerFranquiciasValidas(f);

    let filtradas = batallasGlobalesMC.filter(b => {
        if(!b.torneos) return false;
        let okF = (f === 'TODAS') ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
        let okD = (!d) ? true : b.torneos.fecha_evento >= d; 
        let okH = (!h) ? true : b.torneos.fecha_evento <= h;
        return okF && okD && okH;
    });

    // Generar Gráfica
    let labels = []; let datosElo = []; let eloAcumulado = 1500;
    let maxElo = 1500; let minElo = 1500; let victorias = 0; let derrotas = 0; let replicas = 0;
    
    labels.push('Inicio'); datosElo.push(1500);

    let htmlTabla = '';
    
    // Iterar en reversa para que la tabla muestre lo más reciente primero
    let filtradasReversa = [...filtradas].reverse();

    filtradas.forEach(b => {
        let esMC1 = b.mc1_id == mcActualID;
        let cambio = esMC1 ? b.cambio_mc1 : b.cambio_mc2;
        eloAcumulado += cambio;
        
        if (eloAcumulado > maxElo) maxElo = eloAcumulado;
        if (eloAcumulado < minElo) minElo = eloAcumulado;

        if (b.resultado !== 'bono') {
            labels.push(b.torneos ? b.torneos.nombre : 'Torneo Desconocido');
            datosElo.push(eloAcumulado);
            
            let gano = false; let huboReplica = false;
            if (esMC1) {
                if (['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado)) gano = true;
                if (['victoria_replica', 'derrota_replica'].includes(b.resultado)) huboReplica = true;
            } else {
                if (['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado)) gano = true;
                if (['victoria_replica', 'derrota_replica'].includes(b.resultado)) huboReplica = true;
            }
            
            if (gano) victorias++; else derrotas++;
            if (huboReplica) replicas++;
        } else {
            labels.push('Bono: ' + b.fase);
            datosElo.push(eloAcumulado);
        }
    });

    document.getElementById('statPeak').innerText = maxElo;
    document.getElementById('statWR').innerText = (victorias + derrotas > 0) ? Math.round((victorias / (victorias + derrotas)) * 100) + '%' : '0%';
    document.getElementById('statReplicas').innerText = replicas;
    
    filtradasReversa.forEach(b => {
        let esMC1 = b.mc1_id == mcActualID;
        let cambio = esMC1 ? b.cambio_mc1 : b.cambio_mc2;
        let cambioTxt = cambio > 0 ? `+${cambio}` : `${cambio}`;
        let colorCambio = cambio > 0 ? '#2ed573' : (cambio < 0 ? '#ff4757' : '#aaa');
        
        let fechaTorneo = b.torneos ? b.torneos.fecha_evento : 'Sin Fecha';
        let nombreTorneo = b.torneos ? `${b.torneos.franquicia} - ${b.torneos.nombre}` : 'Torneo Eliminado';

        if (b.resultado === 'bono') {
            htmlTabla += `<tr style="background: rgba(46, 213, 115, 0.1);">
                <td>${fechaTorneo}</td>
                <td>${nombreTorneo}</td>
                <td colspan="2" style="text-align:center; color:#2ed573; font-weight:bold;">✨ BONO: ${b.fase}</td>
                <td style="color:${colorCambio}; font-weight:bold;">${cambioTxt}</td>
            </tr>`;
            return;
        }

        let oponenteObj = esMC1 ? listaMCs.find(m => m.id == b.mc2_id) : listaMCs.find(m => m.id == b.mc1_id);
        let nombreOpo = oponenteObj ? oponenteObj.aka : 'Desconocido';
        
        // 1. ELO EXACTO DEL OPONENTE EN ESE MOMENTO (Protección de nulos incluida)
        let eloOpo = (esMC1 ? b.elo_previo_mc2 : b.elo_previo_mc1) || 1500;
        let textoOponente = `<strong>${nombreOpo}</strong> <br><span style="color:#aaa; font-size:12px;">(Elo Rival: ${eloOpo})</span>`;

        // 2. TEXTO DE RESULTADO ESPECÍFICO Y COLOR
        let textoRes = ''; let colorRes = '';
        
        if (esMC1) {
            if (b.resultado === 'victoria') { textoRes = 'Victoria'; colorRes = '#2ed573'; }
            else if (b.resultado === 'victoria_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; }
            else if (b.resultado === 'victoria_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; } 
            else if (b.resultado === 'derrota') { textoRes = 'Derrota'; colorRes = '#ff4757'; }
            else if (b.resultado === 'derrota_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; }
            else if (b.resultado === 'derrota_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; } // Derrota normal para el que pierde
        } else {
            if (b.resultado === 'victoria') { textoRes = 'Derrota'; colorRes = '#ff4757'; }
            else if (b.resultado === 'victoria_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; }
            else if (b.resultado === 'victoria_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; } // Derrota normal para el que pierde
            else if (b.resultado === 'derrota') { textoRes = 'Victoria'; colorRes = '#2ed573'; }
            else if (b.resultado === 'derrota_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; }
            else if (b.resultado === 'derrota_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; } 
        }

        htmlTabla += `<tr>
            <td>${fechaTorneo}</td>
            <td>${nombreTorneo}<br><small style="color:#aaa;">${b.fase}</small></td>
            <td>${textoOponente}</td>
            <td style="color: ${colorRes}; font-weight: bold;">${textoRes}</td>
            <td style="color: ${colorCambio}; font-weight: bold;">${cambioTxt}</td>
        </tr>`;
    });

    document.getElementById('cuerpoHistorial').innerHTML = htmlTabla || '<tr><td colspan="5" style="text-align:center;">No hay batallas registradas.</td></tr>';

    if (miGrafico) miGrafico.destroy();
    let canvas = document.getElementById('graficoElo');
    if (canvas) {
        let ctx = canvas.getContext('2d');
        miGrafico = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Puntuación Elo',
                    data: datosElo,
                    borderColor: '#1e90ff',
                    backgroundColor: 'rgba(30, 144, 255, 0.2)',
                    borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#eccc68', fill: true, tension: 0.2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'white' } } }, scales: { x: { ticks: { color: '#aaa' }, grid: { color: '#373752' } }, y: { ticks: { color: '#aaa' }, grid: { color: '#373752' } } } }
        });
    }
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

configurarSesion();
inicializar();
cargarFranquiciasSelect('filtroFranqPerfil', true);