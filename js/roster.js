import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';

const K = 32;
let listaMcs = [];
let batallasUniverso = [];
let mcActualID = null;
let miGraficoModal = null;

async function inicializar() {
    document.getElementById('rosterGrid').innerHTML = '<h3 style="color:#a4b0be; text-align:center; width:100%; grid-column: 1 / -1;">⏳ Cargando base de datos...</h3>';
    
    const { data: mcs, error: errMcs } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    if (errMcs) return document.getElementById('rosterGrid').innerHTML = '<h3 style="color:#ff4757; text-align:center; width:100%; grid-column: 1 / -1;">Error al cargar datos.</h3>';
    listaMcs = mcs || [];

    const { data: bts } = await supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`);
    batallasUniverso = (bts || []).sort((a,b) => {
        let fA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
        let fB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
        return fA - fB;
    });

    await cargarFranquiciasSelect('modalFranqPerfil', true);
    renderizarRoster(listaMcs);
}

function renderizarRoster(lista) {
    let html = '';
    lista.forEach(mc => {
        let foto = mc.foto || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';
        let bandera = mc.nacionalidad || '🌍';
        
        html += `
        <div class="mc-card" onclick="abrirPerfilModal(${mc.id})">
            <img src="${foto}" class="mc-photo" alt="${mc.aka}">
            <h3 class="mc-name">${mc.aka}</h3>
            <div class="mc-flag">${bandera}</div>
            <div class="mc-elo">🏆 ${mc.elo_actual} pts</div>
            
            <div class="card-actions">
                <button class="btn-edit-card" onclick="event.stopPropagation(); abrirEdicionMC(${mc.id})">✏️ Editar</button>
                <button class="btn-del-card" onclick="event.stopPropagation(); eliminarMC(${mc.id}, '${mc.aka}')">🗑️ Borrar</button>
            </div>
        </div>
        `;
    });
    
    if(html === '') html = '<h3 style="color:#a4b0be; text-align:center; width:100%; grid-column: 1 / -1;">No se encontraron competidores.</h3>';
    document.getElementById('rosterGrid').innerHTML = html;
}

window.filtrarRoster = function() {
    let texto = document.getElementById('buscadorRoster').value.toLowerCase();
    let filtrados = listaMcs.filter(mc => mc.aka.toLowerCase().includes(texto));
    renderizarRoster(filtrados);
}

window.agregarMC = async function() {
    let aka = document.getElementById('nuevoAka').value.trim();
    let nac = document.getElementById('nuevaNac').value.trim() || '🌍';
    let foto = document.getElementById('nuevaFoto').value.trim() || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';

    if (!aka) return alert("Debes ingresar al menos el A.K.A del competidor.");

    const { error } = await supabase.from('competidores').insert([{ 
        aka: aka, nacionalidad: nac, foto: foto, elo_actual: 1500, batallas_totales: 0 
    }]);

    if (error) return alert("Error al guardar en la base de datos.");
    
    document.getElementById('nuevoAka').value = ""; document.getElementById('nuevaNac').value = ""; document.getElementById('nuevaFoto').value = "";
    inicializar();
}

window.abrirEdicionMC = function(id) {
    let mc = listaMcs.find(m => m.id === id);
    if(!mc) return;
    
    document.getElementById('editMcId').value = mc.id;
    document.getElementById('editMcAka').value = mc.aka;
    document.getElementById('editMcNac').value = mc.nacionalidad || '';
    document.getElementById('editMcFoto').value = mc.foto || '';
    
    document.getElementById('overlayEditMC').style.display = 'block';
    document.getElementById('modalEditMC').style.display = 'block';
}

window.cerrarEdicionMC = function() {
    document.getElementById('overlayEditMC').style.display = 'none';
    document.getElementById('modalEditMC').style.display = 'none';
}

window.guardarEdicionMC = async function() {
    let id = document.getElementById('editMcId').value;
    let aka = document.getElementById('editMcAka').value.trim();
    let nac = document.getElementById('editMcNac').value.trim();
    let foto = document.getElementById('editMcFoto').value.trim();

    if(!aka) return alert("El nombre no puede estar vacío.");

    const { error } = await supabase.from('competidores').update({ 
        aka: aka, nacionalidad: nac, foto: foto 
    }).eq('id', id);

    if (error) return alert("Error al actualizar los datos.");
    
    cerrarEdicionMC();
    inicializar();
}

window.eliminarMC = async function(id, nombre) {
    if(!confirm(`⚠️ ¿Estás seguro de que quieres borrar a ${nombre}?`)) return;
    const { error } = await supabase.from('competidores').delete().eq('id', id);
    if (error) alert("❌ No se pudo borrar a este MC. Es probable que ya tenga batallas registradas.");
    else inicializar();
}

window.abrirPerfilModal = function(id) {
    mcActualID = id;
    let mc = listaMcs.find(m => m.id === id);
    if(!mc) return;

    document.getElementById('modalAkaMC').innerText = mc.aka;
    document.getElementById('modalBanderaMC').innerText = mc.nacionalidad || '🌍';
    document.getElementById('modalImgMC').src = mc.foto || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';
    document.getElementById('modalEloMC').innerText = mc.elo_actual;

    document.getElementById('overlayPerfil').style.display = 'block';
    document.getElementById('modalPerfil').style.display = 'flex';

    aplicarFiltroModal();
}

window.cerrarPerfilModal = function() {
    document.getElementById('overlayPerfil').style.display = 'none';
    document.getElementById('modalPerfil').style.display = 'none';
}

window.aplicarFiltroModal = function() {
    try {
        let f = document.getElementById('modalFranqPerfil').value;
        let modo = document.getElementById('modalModoPerfil').value;
        let d = document.getElementById('modalDesdePerfil').value;
        let h = document.getElementById('modalHastaPerfil').value;

        let franquiciasPermitidas = obtenerFranquiciasValidas(f);

        let batallasValidas = batallasUniverso.filter(b => {
            if(!b.torneos) return false;
            let okF = (f === 'TODAS') ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
            let okD = (!d) ? true : b.torneos.fecha_evento >= d; 
            let okH = (!h) ? true : b.torneos.fecha_evento <= h;
            return okF && okD && okH;
        });

        // 1. CÁLCULO DE RANKING GLOBAL
        let rankingTemp = {};
        listaMcs.forEach(mc => { rankingTemp[mc.id] = { id: mc.id, elo_actual: 1500, batallas_totales: 0 }; });

        if (modo === 'aislado') {
            let mapTorneos = new Map(); let ordenTorneos = [];
            batallasValidas.forEach(b => {
                if (!mapTorneos.has(b.torneo_id)) { mapTorneos.set(b.torneo_id, []); ordenTorneos.push(b.torneo_id); }
                mapTorneos.get(b.torneo_id).push(b);
            });

            for (let tId of ordenTorneos) {
                let batallasT = mapTorneos.get(tId);
                batallasT.sort((a, b) => {
                    if (a.resultado === 'bono' && b.resultado !== 'bono') return 1;
                    if (a.resultado !== 'bono' && b.resultado === 'bono') return -1;
                    return a.id - b.id;
                });

                let uniqueIds = new Set(); let isLiga = false;
                batallasT.forEach(b => {
                    if (b.resultado !== 'bono') { uniqueIds.add(b.mc1_id); uniqueIds.add(b.mc2_id); }
                    if (b.torneos && b.torneos.formato && b.torneos.formato.toLowerCase().includes('liga')) isLiga = true;
                });

                let sizeReal = uniqueIds.size; let pozoLocal = 0;
                if (!isLiga && sizeReal >= 4) {
                    let sumaElo = 0;
                    uniqueIds.forEach(id => { sumaElo += (rankingTemp[id] ? rankingTemp[id].elo_actual : 1500); });
                    pozoLocal = Math.round((sumaElo / sizeReal) * (sizeReal * 0.003)); 
                }
                let formatoOficial = sizeReal > 16 ? 32 : (sizeReal > 8 ? 16 : (sizeReal > 4 ? 8 : 4));

                for (let b of batallasT) {
                    if (b.resultado === 'bono') {
                        let bono = 0;
                        if (!isLiga && pozoLocal > 0) {
                            let f = b.fase || '';
                            let hayTercero = batallasT.some(bx => bx.resultado === 'bono' && (bx.fase || '').includes('Tercer'));
                            if (formatoOficial === 32) { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.35); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.18); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.10); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.07); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.085); else if (f.includes('Cuartofinalista')) bono = Math.round(pozoLocal * 0.05); else if (f.includes('Octavofinalista')) bono = Math.round(pozoLocal * 0.0125);
                            } else if (formatoOficial === 16) { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.40); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.20); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.12); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.08); else if (f.includes('Cuartofinalista')) bono = Math.round(pozoLocal * 0.05); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.10); 
                            } else if (formatoOficial === 8) { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.45); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.25); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.18); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.12); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.15); 
                            } else if (formatoOficial === 4) { if (hayTercero) { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.50); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.30); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.20); } else { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.60); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.40); } }
                        }
                        if (bono === 0 && b.cambio_mc1 > 0 && isLiga) {
                            bono = b.cambio_mc1; 
                        } 
                        
                        b.sim_previo_mc1 = rankingTemp[b.mc1_id].elo_actual;
                        b.sim_previo_mc2 = 1500;
                        b.sim_cambio_mc1 = bono;
                        b.sim_cambio_mc2 = 0;

                        if (rankingTemp[b.mc1_id]) { rankingTemp[b.mc1_id].elo_actual += bono; }

                    } else {
                        let R1 = rankingTemp[b.mc1_id].elo_actual; let R2 = rankingTemp[b.mc2_id] ? rankingTemp[b.mc2_id].elo_actual : 1500;
                        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
                        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
                        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }
                        let c1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); let c2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));
                        
                        b.sim_previo_mc1 = R1;
                        b.sim_previo_mc2 = R2;
                        b.sim_cambio_mc1 = c1;
                        b.sim_cambio_mc2 = c2;

                        rankingTemp[b.mc1_id].elo_actual = R1 + c1; rankingTemp[b.mc1_id].batallas_totales += 1;
                        if (rankingTemp[b.mc2_id]) { rankingTemp[b.mc2_id].elo_actual = R2 + c2; rankingTemp[b.mc2_id].batallas_totales += 1; }
                    }
                }
            }
        } else {
            batallasValidas.forEach(b => {
                rankingTemp[b.mc1_id].elo_actual = b.elo_previo_mc1 + b.cambio_mc1; rankingTemp[b.mc1_id].batallas_totales += 1;
                if(b.resultado !== 'bono' && rankingTemp[b.mc2_id]) { rankingTemp[b.mc2_id].elo_actual = b.elo_previo_mc2 + b.cambio_mc2; rankingTemp[b.mc2_id].batallas_totales += 1; }
            });
        }

        let rankingOrdenado = Object.values(rankingTemp).filter(m => m.batallas_totales > 0).sort((a,b) => b.elo_actual - a.elo_actual);
        let posGlobal = rankingOrdenado.findIndex(m => m.id == mcActualID);
        document.getElementById('modalRank').innerText = posGlobal !== -1 ? `#${posGlobal + 1}` : '-';

        let dataDelMC = []; 
        if (modo === 'aislado') {
            batallasValidas.forEach(b => {
                if (b.mc1_id == mcActualID || b.mc2_id == mcActualID) {
                    dataDelMC.push({ 
                        ...b, 
                        calc_previo_mc1: b.sim_previo_mc1, 
                        calc_previo_mc2: b.sim_previo_mc2, 
                        calc_cambio_mc1: b.sim_cambio_mc1, 
                        calc_cambio_mc2: b.sim_cambio_mc2 
                    });
                }
            });
        } else {
            batallasValidas.forEach(b => {
                if (b.mc1_id == mcActualID || b.mc2_id == mcActualID) {
                    dataDelMC.push({ ...b, calc_previo_mc1: b.elo_previo_mc1, calc_previo_mc2: b.elo_previo_mc2, calc_cambio_mc1: b.cambio_mc1, calc_cambio_mc2: b.cambio_mc2 });
                }
            });
        }

        let eloInicial = 1500;
        if (dataDelMC.length > 0) {
            let primeraBatalla = dataDelMC[0];
            let esMC1Primera = primeraBatalla.mc1_id == mcActualID;
            eloInicial = (esMC1Primera ? primeraBatalla.calc_previo_mc1 : primeraBatalla.calc_previo_mc2) || 1500;
        }

        let labels = ['In']; let datosElo = [eloInicial]; 
        let eloAcumulado = eloInicial; 
        let maxElo = eloInicial; let minElo = eloInicial; let victorias = 0; let derrotas = 0; 
        let htmlTabla = '';

        let dataReversa = [...dataDelMC].reverse();

        dataDelMC.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = (esMC1 ? b.calc_cambio_mc1 : b.calc_cambio_mc2) || 0;
            let previoReal = (esMC1 ? b.calc_previo_mc1 : b.calc_previo_mc2) || 1500;
            
            let eloPostBatalla = 1500;
            if (modo === 'aislado') { eloAcumulado += cambio; eloPostBatalla = eloAcumulado; } 
            else { eloPostBatalla = previoReal + cambio; eloAcumulado = eloPostBatalla; }
            
            if (eloAcumulado > maxElo) maxElo = eloAcumulado; 
            if (eloAcumulado < minElo) minElo = eloAcumulado;

            if (b.resultado !== 'bono') {
                let etiquetaFase = b.fase;
                if (!etiquetaFase) etiquetaFase = 'B';
                else {
                    if (etiquetaFase.startsWith('D') && etiquetaFase.length <= 3) etiquetaFase = '16v';
                    else if (etiquetaFase.startsWith('O') && etiquetaFase.length === 2) etiquetaFase = 'Oct';
                    else if (etiquetaFase.startsWith('C') && etiquetaFase.length === 2) etiquetaFase = 'Cua';
                    else if (etiquetaFase.startsWith('S') && etiquetaFase.length === 2) etiquetaFase = 'Sem';
                    else if (etiquetaFase === 'F') etiquetaFase = 'Fin';
                    else if (etiquetaFase === '3P') etiquetaFase = '3P';
                }
                labels.push(etiquetaFase); datosElo.push(eloPostBatalla);
                let gano = false;
                if (esMC1) { if (['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado)) gano = true; } 
                else { if (['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado)) gano = true; }
                if (gano) victorias++; else derrotas++;
            } else {
                labels.push('Bono'); datosElo.push(eloPostBatalla);
            }
        });

        document.getElementById('modalPeak').innerText = maxElo;
        let cantBatallas = dataDelMC.filter(b => b.resultado !== 'bono').length;
        document.getElementById('modalBatallas').innerText = cantBatallas;
        document.getElementById('modalWinRate').innerText = (victorias + derrotas > 0) ? Math.round((victorias / (victorias + derrotas)) * 100) + '%' : '0%';
        
        dataReversa.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = (esMC1 ? b.calc_cambio_mc1 : b.calc_cambio_mc2) || 0;
            let cambioTxt = cambio > 0 ? `+${cambio}` : `${cambio}`;
            let colorCambio = cambio > 0 ? '#2ed573' : (cambio < 0 ? '#ff4757' : '#a4b0be');
            let fechaTorneo = b.torneos ? b.torneos.fecha_evento : 'Sin Fecha';
            let nombreTorneo = b.torneos ? `<span style="color:#00d2d3">${b.torneos.franquicia}</span> ${b.torneos.nombre.replace(b.torneos.franquicia,'')}` : 'Torneo Eliminado';

            if (b.resultado === 'bono') {
                let estiloBono = "background: rgba(46, 213, 115, 0.15) !important; border-top: 1px solid rgba(46, 213, 115, 0.3) !important; border-bottom: 1px solid rgba(46, 213, 115, 0.3) !important;";
                htmlTabla += `<tr>
                    <td style="${estiloBono} font-size: 14px; border-top-left-radius: 6px; border-bottom-left-radius: 6px;">${fechaTorneo}</td>
                    <td style="${estiloBono} font-size: 14px; font-weight: bold; color:white;">${nombreTorneo}</td>
                    <td colspan="4" style="${estiloBono} text-align:center; color: var(--neon-green); font-weight:bold; text-transform: uppercase; letter-spacing: 1px;">✨ ${b.fase || 'Bono'}</td>
                    <td style="${estiloBono} font-size: 14px; color:${colorCambio}; font-weight:bold; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">${cambioTxt}</td></tr>`;
                return;
            }

            let oponenteObj = esMC1 ? listaMcs.find(m => m.id == b.mc2_id) : listaMcs.find(m => m.id == b.mc1_id);
            let nombreOpo = oponenteObj ? oponenteObj.aka : 'Desconocido';
            let celdaOponente = `<strong>${nombreOpo}</strong>`; 
            let eloPrevioNuestroMC = (esMC1 ? b.calc_previo_mc1 : b.calc_previo_mc2) || 1500; 

            let textoRes = ''; let claseRes = '';
            if (esMC1) {
                if (b.resultado === 'victoria') { textoRes = 'Victoria'; claseRes = 'color: var(--neon-green); font-weight: bold;'; } else if (b.resultado === 'victoria_replica') { textoRes = 'Victoria (R)'; claseRes = 'color: var(--neon-green); font-weight: bold;'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Victoria Total'; claseRes = 'color: var(--neon-green); font-weight: bold;'; }  else if (b.resultado === 'derrota') { textoRes = 'Derrota'; claseRes = 'color: var(--neon-red); font-weight: bold;'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Derrota (R)'; claseRes = 'color: var(--neon-red); font-weight: bold;'; } else if (b.resultado === 'derrota_total') { textoRes = 'Derrota'; claseRes = 'color: var(--neon-red); font-weight: bold;'; } 
            } else {
                if (b.resultado === 'victoria') { textoRes = 'Derrota'; claseRes = 'color: var(--neon-red); font-weight: bold;'; } else if (b.resultado === 'victoria_replica') { textoRes = 'Derrota (R)'; claseRes = 'color: var(--neon-red); font-weight: bold;'; }
                else if (b.resultado === 'victoria_total') { textoRes = 'Derrota'; claseRes = 'color: var(--neon-red); font-weight: bold;'; }  else if (b.resultado === 'derrota') { textoRes = 'Victoria'; claseRes = 'color: var(--neon-green); font-weight: bold;'; }
                else if (b.resultado === 'derrota_replica') { textoRes = 'Victoria (R)'; claseRes = 'color: var(--neon-green); font-weight: bold;'; } else if (b.resultado === 'derrota_total') { textoRes = 'Victoria Total'; claseRes = 'color: var(--neon-green); font-weight: bold;'; } 
            }

            htmlTabla += `<tr>
                <td><span style="font-size:11px; color:#a4b0be;">${fechaTorneo}</span></td>
                <td style="font-size:13px; font-weight:bold;">${nombreTorneo}</td>
                <td><span style="background:rgba(0,0,0,0.5); padding:4px 8px; border-radius:4px; font-size:11px; color:#fff;">${b.fase || '-'}</span></td>
                <td>${celdaOponente}</td>
                <td style="${claseRes}">${textoRes}</td>
                <td style="color:#a4b0be;">${eloPrevioNuestroMC}</td>
                <td style="color: ${colorCambio}; font-weight: bold;">${cambioTxt}</td>
            </tr>`;
        });

        document.getElementById('modalCuerpoHistorial').innerHTML = htmlTabla || '<tr><td colspan="7" style="text-align:center; padding:30px; color:#a4b0be;">Sin batallas en el registro.</td></tr>';

        if (typeof Chart !== 'undefined') {
            if (miGraficoModal) miGraficoModal.destroy();
            let canvas = document.getElementById('modalChart');
            if (canvas) {
                let ctx = canvas.getContext('2d');
                miGraficoModal = new Chart(ctx, {
                    type: 'line',
                    data: { 
                        labels: labels, 
                        datasets: [{ 
                            label: 'Elo', 
                            data: datosElo, 
                            borderColor: '#00d2d3', 
                            backgroundColor: 'rgba(0, 210, 211, 0.1)', 
                            borderWidth: 2, 
                            pointRadius: 3, 
                            pointBackgroundColor: (ctx) => { return labels[ctx.dataIndex] && labels[ctx.dataIndex].includes('Bono') ? '#2ed573' : '#1e1e2f'; },
                            pointBorderColor: (ctx) => { return labels[ctx.dataIndex] && labels[ctx.dataIndex].includes('Bono') ? '#2ed573' : '#00d2d3'; },
                            segment: { borderColor: (ctx) => { return labels[ctx.p1DataIndex] && labels[ctx.p1DataIndex].includes('Bono') ? '#2ed573' : '#00d2d3'; } },
                            fill: true, 
                            tension: 0.3 
                        }] 
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#a4b0be', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#00d2d3', font: { size: 11, weight: 'bold' } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
                });
            }
        }

    } catch (e) {
        console.error("Error al aplicar filtros en el modal:", e);
    }
}

// 📸 MAGIA DE EXPORTAR: Oculta tabla e inputs, muestra logo y captura.
window.descargarFichaAdmin = function(boton) {
    document.getElementById('controlesFiltroFicha').style.display = 'none';
    document.getElementById('historialAdminWrap').style.display = 'none'; 
    document.getElementById('headerFichaExport').style.display = 'flex'; 
    
    let tarjeta = document.getElementById('areaCapturaFicha');
    let textoOriginal = boton.innerText;
    boton.innerText = "⏳ Generando Imagen Profesional...";
    boton.disabled = true;

    html2canvas(tarjeta, { backgroundColor: '#1e1e2f', scale: 2, useCORS: true }).then(canvas => {
        let enlace = document.createElement('a');
        let titulo = document.getElementById('modalAkaMC').innerText.replace(/[^a-zA-Z0-9]/g, '_');
        enlace.download = `Ficha_Tecnica_${titulo}.png`;
        enlace.href = canvas.toDataURL('image/png');
        enlace.click();
        
        document.getElementById('controlesFiltroFicha').style.display = 'flex';
        document.getElementById('historialAdminWrap').style.display = 'block'; 
        document.getElementById('headerFichaExport').style.display = 'none'; 
        boton.innerText = textoOriginal;
        boton.disabled = false;
    });
}

configurarSesion();
inicializar();