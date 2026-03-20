import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';

let listaMCs = []; let miGrafico = null; let batallasGlobalesMC = []; let mcActualID = null;

async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = data || [];
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
    try {
        mcActualID = idMC;
        let mcPrincipal = listaMCs.find(m => m.id == idMC);
        if (!mcPrincipal) return console.error("MC no encontrado.");

        document.getElementById('buscadorMCs').value = ''; 
        document.getElementById('sugerenciasMCs').style.display = 'none';
        
        // CORREGIDO: Conectado a TUS nombres exactos de HTML
        document.getElementById('nombreMC').innerText = mcPrincipal.aka;
        document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';
        document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC';
        document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
        
        const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`).or(`mc1_id.eq.${idMC},mc2_id.eq.${idMC}`).order('id', { ascending: true });
        if(error) throw error;
        
        batallasGlobalesMC = (batallas || []).sort((a,b) => {
            let fA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
            let fB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
            return fA - fB;
        });
        
        // CORREGIDO: Tu contenedor principal
        document.getElementById('zonaPerfil').style.display = 'block';
        aplicarFiltroPerfil();

    } catch (e) {
        console.error("Error al cargar el perfil:", e);
    }
}

function aplicarFiltroPerfil() {
    try {
        let selectF = document.getElementById('filtroFranqPerfil');
        let inputD = document.getElementById('filtroDesdePerfil');
        let inputH = document.getElementById('filtroHastaPerfil');

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

        let labels = []; let datosElo = []; let eloAcumulado = 1500;
        let maxElo = 1500; let minElo = 1500; let victorias = 0; let derrotas = 0; 
        
        labels.push('Inicio'); datosElo.push(1500);
        let htmlTabla = '';
        let filtradasReversa = [...filtradas].reverse();

        filtradas.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = (esMC1 ? b.cambio_mc1 : b.cambio_mc2) || 0;
            eloAcumulado += cambio;
            
            if (eloAcumulado > maxElo) maxElo = eloAcumulado;
            if (eloAcumulado < minElo) minElo = eloAcumulado;

            if (b.resultado !== 'bono') {
                labels.push(b.torneos ? b.torneos.nombre : 'Torneo Desconocido');
                datosElo.push(eloAcumulado);
                
                let gano = false;
                if (esMC1) {
                    if (['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado)) gano = true;
                } else {
                    if (['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado)) gano = true;
                }
                if (gano) victorias++; else derrotas++;
            } else {
                labels.push('Bono: ' + b.fase);
                datosElo.push(eloAcumulado);
            }
        });

        // CORREGIDO: Conectado a TUS identificadores de estadísticas
        document.getElementById('statPeakElo').innerText = maxElo;
        document.getElementById('statBatallas').innerText = filtradas.filter(b => b.resultado !== 'bono').length;
        document.getElementById('statWinRate').innerText = (victorias + derrotas > 0) ? Math.round((victorias / (victorias + derrotas)) * 100) + '%' : '0%';
        
        filtradasReversa.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = (esMC1 ? b.cambio_mc1 : b.cambio_mc2) || 0;
            let cambioTxt = cambio > 0 ? `+${cambio}` : `${cambio}`;
            let colorCambio = cambio > 0 ? '#2ed573' : (cambio < 0 ? '#ff4757' : '#aaa');
            
            let fechaTorneo = b.torneos ? b.torneos.fecha_evento : 'Sin Fecha';
            let nombreTorneo = b.torneos ? `${b.torneos.franquicia} - ${b.torneos.nombre}` : 'Torneo Eliminado';

            if (b.resultado === 'bono') {
                // CORREGIDO: Adaptado a las 7 columnas de tu HTML
                htmlTabla += `<tr style="background: rgba(46, 213, 115, 0.1);">
                    <td>${fechaTorneo}</td>
                    <td>${nombreTorneo}</td>
                    <td colspan="4" style="text-align:center; color:#2ed573; font-weight:bold;">✨ BONO: ${b.fase}</td>
                    <td style="color:${colorCambio}; font-weight:bold;">${cambioTxt}</td>
                </tr>`;
                return;
            }

            let oponenteObj = esMC1 ? listaMCs.find(m => m.id == b.mc2_id) : listaMCs.find(m => m.id == b.mc1_id);
            let nombreOpo = oponenteObj ? oponenteObj.aka : 'Desconocido';
            let eloOpo = (esMC1 ? b.elo_previo_mc2 : b.elo_previo_mc1) || 1500;
            
            let textoRes = ''; let colorRes = '';
            if (esMC1) {
                if (b.resultado === 'victoria') { textoRes = 'Victoria'; colorRes = '#2ed573'; }
                else if (b.resultado === 'victoria_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; } 
                else if (b.resultado === 'derrota') { textoRes = 'Derrota'; colorRes = '#ff4757'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; }
                else if (b.resultado === 'derrota_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; } 
            } else {
                if (b.resultado === 'victoria') { textoRes = 'Derrota'; colorRes = '#ff4757'; }
                else if (b.resultado === 'victoria_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; } 
                else if (b.resultado === 'derrota') { textoRes = 'Victoria'; colorRes = '#2ed573'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; }
                else if (b.resultado === 'derrota_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; } 
            }

            // CORREGIDO: Rellenando las 7 columnas exactas que pediste en tu diseño
            htmlTabla += `<tr>
                <td>${fechaTorneo}</td>
                <td>${nombreTorneo}</td>
                <td>${b.fase}</td>
                <td><strong>${nombreOpo}</strong></td>
                <td style="color: ${colorRes}; font-weight: bold;">${textoRes}</td>
                <td>${eloOpo}</td>
                <td style="color: ${colorCambio}; font-weight: bold;">${cambioTxt}</td>
            </tr>`;
        });

        document.getElementById('cuerpoHistorial').innerHTML = htmlTabla || '<tr><td colspan="7" style="text-align:center;">No hay batallas registradas.</td></tr>';

        // CORREGIDO: Conectado a eloChart
        if (typeof Chart !== 'undefined') {
            if (miGrafico) miGrafico.destroy();
            let canvas = document.getElementById('eloChart');
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

    } catch (e) {
        console.error("Error al aplicar filtros o dibujar:", e);
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