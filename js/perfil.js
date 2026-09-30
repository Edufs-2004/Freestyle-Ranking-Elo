import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { cargarTodasLasFilas, calcularRankingActual, contribucionActual, fechaEventoActual, filtrarBatallasActuales } from './actual.mjs';

const K = 32;

let listaMCs = []; let miGrafico = null; let batallasUniverso = []; let mcActualID = null; let errorCargaBatallasPerfil = null;

async function inicializar() {
    const { data: mcs, error: errorMcs } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    if (errorMcs) {
        console.error('Error al cargar competidores:', errorMcs);
        renderizarCompetidores([], '', 'No se pudieron cargar los competidores. Intenta recargar la página.');
        return;
    }
    listaMCs = mcs || [];
    renderizarCompetidores(listaMCs);
    
    try {
        const consulta = supabase.from('batallas').select(`*, torneos(nombre, franquicia, fecha_evento)`).order('id', { ascending: true });
        batallasUniverso = (await cargarTodasLasFilas(consulta)).sort((a, b) => {
            const fechaA = a.torneos ? new Date(a.torneos.fecha_evento) : new Date(0);
            const fechaB = b.torneos ? new Date(b.torneos.fecha_evento) : new Date(0);
            return fechaA - fechaB;
        });
    } catch (error) {
        console.error('Error al cargar batallas del perfil:', error);
        errorCargaBatallasPerfil = error;
    }

    await cargarFranquiciasSelect('filtroFranqPerfil', true);

    const urlParams = new URLSearchParams(window.location.search);
    const idUrl = urlParams.get('id');
    if (idUrl) {
        let mcEncontrado = listaMCs.find(m => m.id == idUrl);
        if (mcEncontrado) cargarPerfil(idUrl);
    }
}

function renderizarCompetidores(lista, texto = '', mensajeVacio = '') {
    const grid = document.getElementById('competidoresGridPerfil');
    const contador = document.getElementById('contadorCompetidores');
    if (!grid || !contador) return;

    contador.textContent = `${lista.length} de ${listaMCs.length} competidores`;
    grid.replaceChildren();

    if (lista.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'competidores-vacio';
        vacio.textContent = mensajeVacio || (texto ? 'No se encontraron competidores con ese A.K.A.' : 'Aún no hay competidores registrados.');
        grid.appendChild(vacio);
        return;
    }

    const fragmento = document.createDocumentFragment();
    lista.forEach(mc => {
        const tarjeta = document.createElement('button');
        tarjeta.type = 'button';
        tarjeta.className = 'competidor-card';
        tarjeta.setAttribute('aria-label', `Ver perfil de ${mc.aka || 'competidor'}`);

        const foto = document.createElement('img');
        foto.className = 'competidor-foto';
        foto.src = mc.foto || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';
        foto.alt = mc.aka ? `Foto de ${mc.aka}` : 'Foto del competidor';
        foto.onerror = () => { foto.src = 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC'; };

        const nombre = document.createElement('h3');
        nombre.className = 'competidor-nombre';
        nombre.textContent = mc.aka || 'Sin A.K.A.';

        const bandera = document.createElement('div');
        bandera.className = 'competidor-bandera';
        bandera.textContent = mc.nacionalidad || '🌍';

        const elo = document.createElement('div');
        elo.className = 'competidor-elo';
        elo.textContent = `🏆 ${mc.elo_actual ?? 1500} pts`;

        tarjeta.append(foto, nombre, bandera, elo);
        tarjeta.addEventListener('click', () => cargarPerfil(mc.id));
        fragmento.appendChild(tarjeta);
    });
    grid.appendChild(fragmento);
}

function filtrarBuscador() {
    let texto = document.getElementById('buscadorMCs').value.trim().toLocaleLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');
    let resultados = texto
        ? listaMCs.filter(mc => String(mc.aka || '').toLocaleLowerCase().includes(texto))
        : listaMCs;
    renderizarCompetidores(resultados, texto);

    cajaSugerencias.replaceChildren();
    if (!texto) {
        cajaSugerencias.style.display = 'none';
        return;
    }

    if (resultados.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'sugerencia-item';
        vacio.style.color = '#888';
        vacio.style.cursor = 'default';
        vacio.textContent = 'No se encontraron competidores';
        cajaSugerencias.appendChild(vacio);
    } else {
        resultados.slice(0, 8).forEach(mc => {
            const sugerencia = document.createElement('div');
            sugerencia.className = 'sugerencia-item';
            sugerencia.setAttribute('role', 'button');
            sugerencia.tabIndex = 0;

            const nombre = document.createElement('span');
            nombre.textContent = mc.aka || 'Sin A.K.A.';
            const elo = document.createElement('span');
            elo.style.color = '#00d2d3';
            elo.textContent = `${mc.elo_actual ?? 1500} pts`;
            sugerencia.append(nombre, elo);
            sugerencia.addEventListener('click', () => cargarPerfil(mc.id));
            sugerencia.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    cargarPerfil(mc.id);
                }
            });
            cajaSugerencias.appendChild(sugerencia);
        });
    }
    cajaSugerencias.style.display = 'block';
}

function cargarPerfil(idMC) {
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    if (!mcPrincipal) return;
    mcActualID = idMC;
    let contenedorBuscador = document.querySelector('.search-container');
    contenedorBuscador.classList.add('perfil-activo');
    contenedorBuscador.querySelector('.search-input').placeholder = '🔍 Buscar otro competidor...';
    document.getElementById('btnVolverLista').hidden = false;
    document.getElementById('selectorCompetidor').style.display = 'none';
    document.getElementById('buscadorMCs').value = '';
    document.getElementById('sugerenciasMCs').style.display = 'none';
    renderizarCompetidores(listaMCs);
    
    document.getElementById('nombreMC').innerText = mcPrincipal.aka || 'Sin A.K.A.';
    document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';
    document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/1e1e2f/00d2d3?text=MC';
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    
    window.history.replaceState({}, '', `perfil.html?id=${idMC}`);

    document.getElementById('zonaPerfil').style.display = 'block';
    aplicarFiltroPerfil();
    document.getElementById('zonaPerfil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function volverALista() {
    document.getElementById('zonaPerfil').style.display = 'none';
    document.getElementById('selectorCompetidor').style.display = 'block';
    document.getElementById('btnVolverLista').hidden = true;
    document.querySelector('.search-container').classList.remove('perfil-activo');
    document.getElementById('buscadorMCs').placeholder = '🔍 Ingresa el A.K.A del competidor...';
    document.getElementById('buscadorMCs').value = '';
    document.getElementById('sugerenciasMCs').style.display = 'none';
    window.history.replaceState({}, '', 'perfil.html');
    renderizarCompetidores(listaMCs);
    document.getElementById('selectorCompetidor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function aplicarFiltroPerfil() {
    try {
        let f = document.getElementById('filtroFranqPerfil').value;
        let modo = document.getElementById('modoAnalisisPerfil').value;
        let d = document.getElementById('filtroDesdePerfil').value;
        let h = document.getElementById('filtroHastaPerfil').value;

        if (modo === 'actual') {
            const fechaCorte = h || new Date().toISOString().slice(0, 10);
            if (errorCargaBatallasPerfil) {
                renderErrorActualPerfil();
                return;
            }
            const franquiciasPermitidas = obtenerFranquiciasValidas(f);
            const batallasActuales = filtrarBatallasActuales(batallasUniverso, {
                franquicia: f,
                franquiciasPermitidas,
                desde: d,
                hasta: h
            }).sort((a, b) => (fechaEventoActual(a) || '').localeCompare(fechaEventoActual(b) || ''));
            const rankingActual = calcularRankingActual(listaMCs, batallasActuales, fechaCorte);
            renderizarPerfilActual(batallasActuales, rankingActual, fechaCorte);
            return;
        }

        document.getElementById('infoFiltroActual').hidden = true;
        document.getElementById('statEloLabel').innerText = 'Power Rating (Elo)';
        document.getElementById('statPeakLabel').innerText = 'Pico Histórico';
        document.getElementById('cambioPrevioLabel').innerText = 'Elo Previo';
        document.getElementById('cambioActualLabel').innerText = '+/-';
        const mcSeleccionado = listaMCs.find(mc => mc.id == mcActualID);
        document.getElementById('statEloActual').innerText = mcSeleccionado?.elo_actual ?? 1500;

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

function renderErrorActualPerfil() {
    document.getElementById('infoFiltroActual').hidden = false;
    document.getElementById('infoFiltroActual').innerText = 'No se pudo cargar el historial completo; no se muestran resultados parciales.';
    document.getElementById('statRank').innerText = '-';
    document.getElementById('statEloLabel').innerText = 'Puntaje Actual';
    document.getElementById('statPeakLabel').innerText = 'Pico del corte';
    document.getElementById('statEloActual').innerText = '—';
    document.getElementById('statPeakElo').innerText = '—';
    document.getElementById('statBatallas').innerText = '—';
    document.getElementById('statWinRate').innerText = '—';
    document.getElementById('cuerpoHistorial').innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#ff4757;">No se pudo cargar el historial completo.</td></tr>';
    if (miGrafico) miGrafico.destroy();
}

function renderizarPerfilActual(batallas, ranking, fechaCorte) {
    const eventos = batallas.filter(b => (b.mc1_id == mcActualID || b.mc2_id == mcActualID)
        && contribucionActual(b, mcActualID, fechaCorte) !== null);
    let saldo = 1500;
    let pico = saldo;
    let victorias = 0;
    let derrotas = 0;
    const etiquetas = ['Base'];
    const puntos = [saldo];
    const filas = [];

    eventos.forEach(batalla => {
        const contribucion = contribucionActual(batalla, mcActualID, fechaCorte);
        saldo += contribucion.cambioActual;
        pico = Math.max(pico, saldo);
        etiquetas.push(batalla.resultado === 'bono' ? 'Bono' : (batalla.fase || 'Batalla'));
        puntos.push(saldo);

        if (batalla.resultado !== 'bono' && contribucion.peso > 0) {
            const esMC1 = batalla.mc1_id == mcActualID;
            const resultadoPositivo = esMC1
                ? ['victoria', 'victoria_replica', 'victoria_total'].includes(batalla.resultado)
                : ['derrota', 'derrota_replica', 'derrota_total'].includes(batalla.resultado);
            if (resultadoPositivo) victorias++; else derrotas++;
        }
        filas.push({ batalla, contribucion, saldoPrevio: saldo - contribucion.cambioActual });
    });

    document.getElementById('infoFiltroActual').hidden = false;
    const sinFecha = batallasUniverso.filter(b => !fechaEventoActual(b)).length;
    document.getElementById('infoFiltroActual').innerText = `Puntaje Actual derivado al ${fechaCorte}. Cada aporte conserva el 100% hasta 24 meses y pierde 10 puntos porcentuales por mes completo posterior.${sinFecha ? ` ${sinFecha} registros sin fecha excluidos.` : ''}`;
    document.getElementById('statEloLabel').innerText = 'Puntaje Actual';
    document.getElementById('statPeakLabel').innerText = 'Pico del corte';
    document.getElementById('statEloActual').innerText = Math.round(saldo);
    document.getElementById('statPeakElo').innerText = Math.round(pico);
    document.getElementById('statBatallas').innerText = eventos.filter(b => b.resultado !== 'bono' && contribucionActual(b, mcActualID, fechaCorte).peso > 0).length;
    document.getElementById('statWinRate').innerText = victorias + derrotas > 0 ? `${Math.round((victorias / (victorias + derrotas)) * 100)}%` : '0%';
    const posicion = ranking.findIndex(mc => mc.id == mcActualID);
    document.getElementById('statRank').innerText = posicion >= 0 ? `#${posicion + 1}` : '-';
    document.getElementById('cambioPrevioLabel').innerText = 'Puntaje previo';
    document.getElementById('cambioActualLabel').innerText = 'Original → Actual';

    let html = '';
    [...filas].reverse().forEach(({ batalla, contribucion, saldoPrevio }) => {
        const fecha = fechaEventoActual(batalla) || 'Sin fecha';
        const franquicia = batalla.torneos?.franquicia || '';
        const nombreTorneo = batalla.torneos?.nombre || 'Torneo eliminado';
        const evento = franquicia ? `<span style="color:#00d2d3">${franquicia}</span> ${nombreTorneo.replace(franquicia, '')}` : nombreTorneo;
        const pesoTxt = `${Math.round(contribucion.peso * 100)}%`;
        const originalTxt = contribucion.cambioOriginal > 0 ? `+${contribucion.cambioOriginal}` : `${contribucion.cambioOriginal}`;
        const actualTxt = contribucion.cambioActual > 0
            ? `+${contribucion.cambioActual.toFixed(2).replace(/\.00$/, '')}`
            : contribucion.cambioActual.toFixed(2).replace(/\.00$/, '');
        const color = contribucion.cambioActual > 0 ? '#2ed573' : (contribucion.cambioActual < 0 ? '#ff4757' : '#a4b0be');

        if (batalla.resultado === 'bono') {
            html += `<tr class="fila-bono"><td>${fecha}</td><td>${evento}</td><td colspan="4" style="text-align:center; color:var(--neon-green);">✨ ${batalla.fase || 'Bono'} · ${pesoTxt}</td><td style="color:${color}; font-weight:bold;" title="Original ${originalTxt}; peso ${pesoTxt}">${originalTxt} → ${actualTxt}</td></tr>`;
            return;
        }

        const esMC1 = batalla.mc1_id == mcActualID;
        const oponenteId = esMC1 ? batalla.mc2_id : batalla.mc1_id;
        const oponente = listaMCs.find(mc => mc.id == oponenteId)?.aka || 'Desconocido';
        const gano = esMC1
            ? ['victoria', 'victoria_replica', 'victoria_total'].includes(batalla.resultado)
            : ['derrota', 'derrota_replica', 'derrota_total'].includes(batalla.resultado);
        const resultado = gano ? 'Victoria' : 'Derrota';
        const colorResultado = gano ? 'var(--neon-green)' : 'var(--neon-red)';
        html += `<tr><td>${fecha}</td><td>${evento}</td><td>${batalla.fase || '-'}</td><td>${oponente}</td><td style="color:${colorResultado}; font-weight:bold;">${resultado}</td><td style="color:#a4b0be;">${saldoPrevio.toFixed(2)}</td><td style="color:${color}; font-weight:bold;" title="Original ${originalTxt}; peso ${pesoTxt}">${originalTxt} → ${actualTxt} (${pesoTxt})</td></tr>`;
    });
    document.getElementById('cuerpoHistorial').innerHTML = html || '<tr><td colspan="7" style="text-align:center; padding:30px; color:#a4b0be;">Sin batallas elegibles en el registro.</td></tr>';

    if (typeof Chart !== 'undefined') {
        if (miGrafico) miGrafico.destroy();
        const canvas = document.getElementById('eloChart');
        if (canvas) {
            miGrafico = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels: etiquetas, datasets: [{
                    label: `Puntaje Actual al ${fechaCorte}`,
                    data: puntos,
                    borderColor: '#eccc68',
                    backgroundColor: 'rgba(236, 204, 104, 0.12)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: ctx => etiquetas[ctx.dataIndex] === 'Bono' ? '#2ed573' : '#1e1e2f',
                    pointBorderColor: ctx => etiquetas[ctx.dataIndex] === 'Bono' ? '#2ed573' : '#eccc68',
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: '#a4b0be' } } },
                    scales: {
                        x: { ticks: { color: '#a4b0be', font: { family: 'Montserrat', size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#eccc68', font: { family: 'Rajdhani', size: 14, weight: 'bold' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            });
        }
    }
}

window.filtrarBuscador = filtrarBuscador; 
window.cargarPerfil = cargarPerfil; 
window.aplicarFiltroPerfil = aplicarFiltroPerfil; 
window.volverALista = volverALista;

inicializar();