import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

let listaMCs = []; let miGrafico = null; let batallasUniverso = []; let mcActualID = null;

async function inicializar() {
    const { data: mcs } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = mcs || [];
    
    // Descargamos todo el universo para poder hacer cálculos aislados
    const { data: bts } = await supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`);
    batallasUniverso = (bts || []).sort((a,b) => {
        let fA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
        let fB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
        return fA - fB;
    });
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

function cargarPerfil(idMC) {
    mcActualID = idMC;
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('buscadorMCs').value = ''; document.getElementById('sugerenciasMCs').style.display = 'none';
    
    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';
    document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC';
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    
    document.getElementById('zonaPerfil').style.display = 'block';
    aplicarFiltroPerfil();
}

function aplicarFiltroPerfil() {
    try {
        let f = document.getElementById('filtroFranqPerfil').value;
        let modo = document.getElementById('modoAnalisisPerfil').value;
        let d = document.getElementById('filtroDesdePerfil').value;
        let h = document.getElementById('filtroHastaPerfil').value;

        let franquiciasPermitidas = obtenerFranquiciasValidas(f);

        // 1. Aislamos el universo de batallas según el filtro de fechas/franquicia
        let batallasValidas = batallasUniverso.filter(b => {
            if(!b.torneos) return false;
            let okF = (f === 'TODAS') ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
            let okD = (!d) ? true : b.torneos.fecha_evento >= d; 
            let okH = (!h) ? true : b.torneos.fecha_evento <= h;
            return okF && okD && okH;
        });

        let dataDelMC = []; // Aquí guardaremos los resultados calculados para mostrar
        
        // 2. MATEMÁTICA SEGÚN EL MODO ELEGIDO
        if (modo === 'aislado') {
            let rankingAislado = {};
            listaMCs.forEach(m => rankingAislado[m.id] = 1500); // Todos parten de 1500

            batallasValidas.forEach(b => {
                let r1 = rankingAislado[b.mc1_id] || 1500;
                let r2 = rankingAislado[b.mc2_id] || 1500;
                let c1 = 0, c2 = 0;

                if (b.resultado === 'bono') {
                    c1 = b.cambio_mc1; // Respetamos el tamaño del bono
                } else {
                    let e1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400)); let e2 = 1 / (1 + Math.pow(10, (r1 - r2) / 400));
                    let s1 = 0, s2 = 0, bono1 = false, bono2 = false;
                    if (b.resultado === "victoria_total") { s1 = 1; s2 = 0; bono1=true;} else if (b.resultado === "victoria") { s1 = 1; s2 = 0;}
                    else if (b.resultado === "victoria_replica") { s1 = 0.75; s2 = 0.25;} else if (b.resultado === "derrota_replica") { s1 = 0.25; s2 = 0.75;}
                    else if (b.resultado === "derrota") { s1 = 0; s2 = 1;} else if (b.resultado === "derrota_total") { s1 = 0; s2 = 1; bono2=true;}
                    
                    c1 = Math.round(K * (s1 - e1) * (bono1 ? 1.2 : 1)); c2 = Math.round(K * (s2 - e2) * (bono2 ? 1.2 : 1));
                }

                rankingAislado[b.mc1_id] = r1 + c1; if(b.resultado !== 'bono') rankingAislado[b.mc2_id] = r2 + c2;

                if (b.mc1_id == mcActualID || b.mc2_id == mcActualID) {
                    dataDelMC.push({ ...b, calc_previo_mc1: r1, calc_previo_mc2: r2, calc_cambio_mc1: c1, calc_cambio_mc2: c2 });
                }
            });
        } else {
            // Modo Histórico (Tomamos los puntos reales de la DB)
            batallasValidas.forEach(b => {
                if (b.mc1_id == mcActualID || b.mc2_id == mcActualID) {
                    dataDelMC.push({ ...b, calc_previo_mc1: b.elo_previo_mc1, calc_previo_mc2: b.elo_previo_mc2, calc_cambio_mc1: b.cambio_mc1, calc_cambio_mc2: b.cambio_mc2 });
                }
            });
        }

        // 3. GENERACIÓN DE TABLA Y GRÁFICA CON LOS DATOS OBTENIDOS
        let labels = ['Inicio']; let datosElo = [1500]; let eloAcumulado = 1500;
        let maxElo = 1500; let minElo = 1500; let victorias = 0; let derrotas = 0; 
        let htmlTabla = '';

        let dataReversa = [...dataDelMC].reverse();

        dataDelMC.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = esMC1 ? b.calc_cambio_mc1 : b.calc_cambio_mc2;
            eloAcumulado += cambio;
            
            if (eloAcumulado > maxElo) maxElo = eloAcumulado; if (eloAcumulado < minElo) minElo = eloAcumulado;

            if (b.resultado !== 'bono') {
                let etiquetaFase = b.fase;
                if (!etiquetaFase) etiquetaFase = b.torneos ? b.torneos.nombre : 'Histórico';
                else {
                    if (etiquetaFase.startsWith('O') && etiquetaFase.length === 2) etiquetaFase = 'Octavos';
                    else if (etiquetaFase.startsWith('C') && etiquetaFase.length === 2) etiquetaFase = 'Cuartos';
                    else if (etiquetaFase.startsWith('S') && etiquetaFase.length === 2) etiquetaFase = 'Semis';
                    else if (etiquetaFase === 'F') etiquetaFase = 'Final';
                    else if (etiquetaFase === '3P') etiquetaFase = '3er Puesto';
                }
                
                labels.push(etiquetaFase); datosElo.push(eloAcumulado);
                
                let gano = false;
                if (esMC1) { if (['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado)) gano = true; } 
                else { if (['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado)) gano = true; }
                if (gano) victorias++; else derrotas++;
            } else {
                labels.push('Bono: ' + (b.fase || '')); datosElo.push(eloAcumulado);
            }
        });

        document.getElementById('statPeakElo').innerText = maxElo;
        document.getElementById('statBatallas').innerText = dataDelMC.filter(b => b.resultado !== 'bono').length;
        document.getElementById('statWinRate').innerText = (victorias + derrotas > 0) ? Math.round((victorias / (victorias + derrotas)) * 100) + '%' : '0%';
        
        dataReversa.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = esMC1 ? b.calc_cambio_mc1 : b.calc_cambio_mc2;
            let cambioTxt = cambio > 0 ? `+${cambio}` : `${cambio}`;
            let colorCambio = cambio > 0 ? '#2ed573' : (cambio < 0 ? '#ff4757' : '#aaa');
            let fechaTorneo = b.torneos ? b.torneos.fecha_evento : 'Sin Fecha';
            let nombreTorneo = b.torneos ? `${b.torneos.franquicia} - ${b.torneos.nombre}` : 'Torneo Eliminado';

            if (b.resultado === 'bono') {
                htmlTabla += `<tr style="background: rgba(46, 213, 115, 0.1);">
                    <td>${fechaTorneo}</td><td>${nombreTorneo}</td><td colspan="4" style="text-align:center; color:#2ed573; font-weight:bold;">✨ BONO: ${b.fase || ''}</td>
                    <td style="color:${colorCambio}; font-weight:bold;">${cambioTxt}</td></tr>`;
                return;
            }

            // EXPRESIÓN EXACTA COMO LA PEDISTE
            let oponenteObj = esMC1 ? listaMCs.find(m => m.id == b.mc2_id) : listaMCs.find(m => m.id == b.mc1_id);
            let nombreOpo = oponenteObj ? oponenteObj.aka : 'Desconocido';
            let eloOpo = esMC1 ? b.calc_previo_mc2 : b.calc_previo_mc1;
            let celdaOponente = `<strong>${nombreOpo}</strong> <span style="color:#aaa; font-size:12px;">(${eloOpo})</span>`; // Oponente (Pts Oponente)
            
            let eloPrevioNuestroMC = esMC1 ? b.calc_previo_mc1 : b.calc_previo_mc2; // Puntos de Nuestro MC

            let textoRes = ''; let colorRes = '';
            if (esMC1) {
                if (b.resultado === 'victoria') { textoRes = 'Victoria'; colorRes = '#2ed573'; } else if (b.resultado === 'victoria_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; }  else if (b.resultado === 'derrota') { textoRes = 'Derrota'; colorRes = '#ff4757'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; } else if (b.resultado === 'derrota_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; } 
            } else {
                if (b.resultado === 'victoria') { textoRes = 'Derrota'; colorRes = '#ff4757'; } else if (b.resultado === 'victoria_replica') { textoRes = 'Derrota (Réplica)'; colorRes = '#ff4757'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Derrota'; colorRes = '#ff4757'; }  else if (b.resultado === 'derrota') { textoRes = 'Victoria'; colorRes = '#2ed573'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Victoria (Réplica)'; colorRes = '#2ed573'; } else if (b.resultado === 'derrota_total') { textoRes = 'Victoria Total'; colorRes = '#1e90ff'; } 
            }

            let faseTabla = b.fase || '-';

            // ORDEN EXACTO DE TUS COLUMNAS
            htmlTabla += `<tr>
                <td>${fechaTorneo}</td>
                <td>${nombreTorneo}</td>
                <td>${faseTabla}</td>
                <td>${celdaOponente}</td>
                <td style="color: ${colorRes}; font-weight: bold;">${textoRes}</td>
                <td>${eloPrevioNuestroMC}</td>
                <td style="color: ${colorCambio}; font-weight: bold;">${cambioTxt}</td>
            </tr>`;
        });

        document.getElementById('cuerpoHistorial').innerHTML = htmlTabla || '<tr><td colspan="7" style="text-align:center;">No hay batallas registradas.</td></tr>';

        if (typeof Chart !== 'undefined') {
            if (miGrafico) miGrafico.destroy();
            let canvas = document.getElementById('eloChart');
            if (canvas) {
                let ctx = canvas.getContext('2d');
                miGrafico = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{ label: 'Puntuación Elo', data: datosElo, borderColor: '#1e90ff', backgroundColor: 'rgba(30, 144, 255, 0.2)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#eccc68', fill: true, tension: 0.2 }]
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