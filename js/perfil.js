import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';

const K = 32;

let listaMCs = []; let miGrafico = null; let batallasUniverso = []; let mcActualID = null;

async function inicializar() {
    const { data: mcs } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = mcs || [];
    
    const { data: bts } = await supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`);
    batallasUniverso = (bts || []).sort((a,b) => {
        let fA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
        let fB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
        return fA - fB;
    });

    await cargarFranquiciasSelect('filtroFranqPerfil', true);

    const urlParams = new URLSearchParams(window.location.search);
    const idUrl = urlParams.get('id');
    if (idUrl) {
        let mcEncontrado = listaMCs.find(m => m.id == idUrl);
        if (mcEncontrado) cargarPerfil(idUrl);
    }
}

function filtrarBuscador() {
    let texto = document.getElementById('buscadorMCs').value.toLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');
    if (texto.length < 1) return cajaSugerencias.style.display = 'none';

    let resultados = listaMCs.filter(mc => mc.aka.toLowerCase().includes(texto));
    let html = '';
    if (resultados.length === 0) html += `<div class="sugerencia-item" style="color: #888; cursor: default;">No se encontraron competidores</div>`;
    else resultados.forEach(mc => { html += `<div class="sugerencia-item" onclick="cargarPerfil(${mc.id})"><span>${mc.aka}</span><span style="color: #00d2d3;">${mc.elo_actual} pts</span></div>`; });
    
    cajaSugerencias.innerHTML = html; cajaSugerencias.style.display = 'block';
}

function cargarPerfil(idMC) {
    mcActualID = idMC;
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('buscadorMCs').value = ''; document.getElementById('sugerenciasMCs').style.display = 'none';
    
    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';
    document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    
    window.history.replaceState({}, '', `perfil.html?id=${idMC}`);

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

        let batallasValidas = batallasUniverso.filter(b => {
            if(!b.torneos) return false;
            let okF = (f === 'TODAS') ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
            let okD = (!d) ? true : b.torneos.fecha_evento >= d; 
            let okH = (!h) ? true : b.torneos.fecha_evento <= h;
            return okF && okD && okH;
        });

        // 1. CÁLCULO DE RANKING EN ESTE UNIVERSO
        let rankingTemp = {};
        listaMCs.forEach(m => rankingTemp[m.id] = { id: m.id, elo_actual: 1500, batallas_totales: 0 }); 

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
                    uniqueIds.forEach(id => { sumaElo += rankingTemp[id].elo_actual; });
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
                        
                        // Guardamos el Elo simulado real
                        b.sim_previo_mc1 = rankingTemp[b.mc1_id].elo_actual;
                        b.sim_previo_mc2 = 1500;
                        b.sim_cambio_mc1 = bono;
                        b.sim_cambio_mc2 = 0;

                        if (rankingTemp[b.mc1_id]) { rankingTemp[b.mc1_id].elo_actual += bono; }

                    } else {
                        let R1 = rankingTemp[b.mc1_id].elo_actual; let R2 = rankingTemp[b.mc2_id] ? rankingTemp[b.mc2_id].elo_actual : 1500;
                        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
                        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
                        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1=true;} else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0;}
                        else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25;} else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75;}
                        else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0;} else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2=true;}
                        let c1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); let c2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));
                        
                        // Guardamos el Elo simulado real
                        b.sim_previo_mc1 = R1;
                        b.sim_previo_mc2 = R2;
                        b.sim_cambio_mc1 = c1;
                        b.sim_cambio_mc2 = c2;

                        rankingTemp[b.mc1_id].elo_actual = R1 + c1; rankingTemp[b.mc1_id].batallas_totales += 1;
                        if(rankingTemp[b.mc2_id]) { rankingTemp[b.mc2_id].elo_actual = R2 + c2; rankingTemp[b.mc2_id].batallas_totales += 1; }
                    }
                }
            }
        } else {
            batallasValidas.forEach(b => {
                rankingTemp[b.mc1_id].elo_actual = b.elo_previo_mc1 + b.cambio_mc1; rankingTemp[b.mc1_id].batallas_totales += 1;
                if(b.resultado !== 'bono' && rankingTemp[b.mc2_id]) { rankingTemp[b.mc2_id].elo_actual = b.elo_previo_mc2 + b.cambio_mc2; rankingTemp[b.mc2_id].batallas_totales += 1; }
            });
        }

        // Posición Rank Global filtrada
        let rankingOrdenado = Object.values(rankingTemp).filter(m => m.batallas_totales > 0).sort((a,b) => b.elo_actual - a.elo_actual);
        let posGlobal = rankingOrdenado.findIndex(m => m.id == mcActualID);
        document.getElementById('statRank').innerText = posGlobal !== -1 ? `#${posGlobal + 1}` : '-';

        // 2. EXTRACCIÓN DE BATALLAS DEL MC
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
                let etiquetaFase = b.fase || 'B';
                if (etiquetaFase.startsWith('D') && etiquetaFase.length <= 3) etiquetaFase = '16v';
                else if (etiquetaFase.startsWith('O') && etiquetaFase.length === 2) etiquetaFase = 'Oct';
                else if (etiquetaFase.startsWith('C') && etiquetaFase.length === 2) etiquetaFase = 'Cua';
                else if (etiquetaFase.startsWith('S') && etiquetaFase.length === 2) etiquetaFase = 'Sem';
                else if (etiquetaFase === 'F') etiquetaFase = 'Fin';
                else if (etiquetaFase === '3P') etiquetaFase = '3P';
                
                labels.push(etiquetaFase); datosElo.push(eloPostBatalla);
                
                let gano = false;
                if (esMC1) { if (['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado)) gano = true; } 
                else { if (['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado)) gano = true; }
                if (gano) victorias++; else derrotas++;
            } else {
                labels.push('Bono'); datosElo.push(eloPostBatalla);
            }
        });

        document.getElementById('statPeakElo').innerText = maxElo;
        document.getElementById('statBatallas').innerText = dataDelMC.filter(b => b.resultado !== 'bono').length;
        document.getElementById('statWinRate').innerText = (victorias + derrotas > 0) ? Math.round((victorias / (victorias + derrotas)) * 100) + '%' : '0%';
        
        // 3. TABLA CON LAS FILAS DE BONO EN VERDE
        dataReversa.forEach(b => {
            let esMC1 = b.mc1_id == mcActualID;
            let cambio = (esMC1 ? b.calc_cambio_mc1 : b.calc_cambio_mc2) || 0;
            let cambioTxt = cambio > 0 ? `+${cambio}` : `${cambio}`;
            let colorCambio = cambio > 0 ? '#2ed573' : (cambio < 0 ? '#ff4757' : '#a4b0be');
            let fechaTorneo = b.torneos ? b.torneos.fecha_evento : 'Sin Fecha';
            let nombreTorneo = b.torneos ? `<span style="color:#00d2d3">${b.torneos.franquicia}</span> ${b.torneos.nombre.replace(b.torneos.franquicia,'')}` : 'Torneo Eliminado';

            if (b.resultado === 'bono') {
                htmlTabla += `<tr class="fila-bono">
                    <td style="border-top-left-radius: 6px; border-bottom-left-radius: 6px;"><span style="font-size:11px; color:#a4b0be;">${fechaTorneo}</span></td>
                    <td style="font-size:13px; font-weight:bold;">${nombreTorneo}</td>
                    <td colspan="4" style="text-align:center; color: var(--neon-green); font-weight:bold; text-transform: uppercase; letter-spacing: 1px;">✨ ${b.fase || 'Bono'}</td>
                    <td style="color:${colorCambio}; font-weight:bold; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">${cambioTxt}</td></tr>`;
                return;
            }

            let oponenteObj = esMC1 ? listaMCs.find(m => m.id == b.mc2_id) : listaMCs.find(m => m.id == b.mc1_id);
            let nombreOpo = oponenteObj ? oponenteObj.aka : 'Desconocido';
            let eloOpo = (esMC1 ? b.calc_previo_mc2 : b.calc_previo_mc1) || 1500;
            // ELO DEL OPONENTE
            let celdaOponente = `<strong>${nombreOpo}</strong> <span style="color:#a4b0be; font-size:11px; margin-left:5px;">(${eloOpo})</span>`; 

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

        document.getElementById('cuerpoHistorial').innerHTML = htmlTabla || '<tr><td colspan="7" style="text-align:center; padding:30px; color:#a4b0be;">Sin batallas en el registro.</td></tr>';

        // 4. GRÁFICO ACTUALIZADO: Las líneas de bono se pintan de verde
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
                            label: 'Elo Pts', 
                            data: datosElo, 
                            borderColor: '#00d2d3', 
                            backgroundColor: 'rgba(0, 210, 211, 0.1)', 
                            borderWidth: 3, 
                            pointRadius: 4, 
                            
                            // El punto se pinta verde si la etiqueta dice "Bono"
                            pointBackgroundColor: (ctx) => {
                                return labels[ctx.dataIndex] && labels[ctx.dataIndex].includes('Bono') ? '#2ed573' : '#1e1e2f';
                            },
                            pointBorderColor: (ctx) => {
                                return labels[ctx.dataIndex] && labels[ctx.dataIndex].includes('Bono') ? '#2ed573' : '#00d2d3';
                            },
                            
                            // El segmento de línea se pinta verde cuando conecta hacia un "Bono"
                            segment: {
                                borderColor: (ctx) => {
                                    return labels[ctx.p1DataIndex] && labels[ctx.p1DataIndex].includes('Bono') ? '#2ed573' : '#00d2d3';
                                }
                            },

                            pointHoverRadius: 6,
                            pointHoverBackgroundColor: '#eccc68',
                            fill: true, 
                            tension: 0.3 
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { legend: { display: false } }, 
                        scales: { 
                            x: { ticks: { color: '#a4b0be', font: { family: 'Montserrat', size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, 
                            y: { ticks: { color: '#00d2d3', font: { family: 'Rajdhani', size: 14, weight: 'bold' } }, grid: { color: 'rgba(255,255,255,0.05)' } } 
                        } 
                    }
                });
            }
        }

    } catch (e) {
        console.error("Error al aplicar filtros o dibujar:", e);
    }
}

window.filtrarBuscador = filtrarBuscador; 
window.cargarPerfil = cargarPerfil; 
window.aplicarFiltroPerfil = aplicarFiltroPerfil; 

inicializar();