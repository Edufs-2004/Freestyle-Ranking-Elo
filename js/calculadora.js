import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';

const K = 32;
let listaMCsGlobal = [];

async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    listaMCsGlobal = data || [];
    cargarRankingNormal();
}

function cargarRankingNormal() {
    document.getElementById('tituloTabla').innerText = "Clasificación Histórica Global";
    let htmlTabla = '';
    listaMCsGlobal.forEach((mc, index) => {
        let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "🌍 ";
        htmlTabla += `<tr onclick="window.location.href='perfil.html?id=${mc.id}'" title="Ver Perfil de Atleta">
            <td><strong>#${index + 1}</strong></td>
            <td>${bandera}${mc.aka}</td>
            <td style="color: #00d2d3;"><strong>${mc.elo_actual}</strong></td>
            <td>${mc.batallas_totales}</td>
        </tr>`;
    });
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

async function aplicarFiltros() {
    let franquicia = document.getElementById('filtroFranquicia').value;
    let modo = document.getElementById('modoAnalisisCalc').value;
    let desde = document.getElementById('filtroDesde').value;
    let hasta = document.getElementById('filtroHasta').value;

    if (franquicia === "TODAS" && !desde && !hasta && modo === 'historico') {
        return cargarRankingNormal();
    }

    document.getElementById('tituloTabla').innerText = modo === 'aislado' ? `Universo Aislado (${franquicia})` : `Línea Temporal Filtrada (${franquicia})`;
    document.getElementById('cuerpoRanking').innerHTML = "<tr><td colspan='4' style='text-align: center; color: #eccc68; padding: 40px;'><strong>⏳ Procesando Algoritmos Temporales...</strong></td></tr>";

    const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(franquicia, fecha_evento, formato)`);
    if(error) return alert("Error al buscar el historial.");

    let franquiciasPermitidas = obtenerFranquiciasValidas(franquicia);
    let batallasValidas = batallas.filter(b => {
        if(!b.torneos) return false; 
        let okF = franquicia === "TODAS" ? true : franquiciasPermitidas.includes(b.torneos.franquicia);
        let okD = !desde ? true : b.torneos.fecha_evento >= desde;
        let okH = !hasta ? true : b.torneos.fecha_evento <= hasta;
        return okF && okD && okH;
    });

    batallasValidas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    let rankingTemp = {};
    listaMCsGlobal.forEach(mc => { rankingTemp[mc.id] = { id: mc.id, aka: mc.aka, nacionalidad: mc.nacionalidad, elo_actual: 1500, batallas_totales: 0 }; });

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
                let eloPromedio = sumaElo / sizeReal;
                pozoLocal = Math.round(eloPromedio * (sizeReal * 0.003)); 
            }

            let formatoOficial = sizeReal > 16 ? 32 : (sizeReal > 8 ? 16 : (sizeReal > 4 ? 8 : 4));

            for (let b of batallasT) {
                if (b.resultado === 'bono') {
                    let bono = 0;
                    if (!isLiga && pozoLocal > 0) {
                        let f = b.fase || '';
                        let hayTercero = batallasT.some(bx => bx.resultado === 'bono' && (bx.fase || '').includes('Tercer'));

                        if (formatoOficial === 32) { 
                            if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.35); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.18); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.10); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.07); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.085); else if (f.includes('Cuartofinalista')) bono = Math.round(pozoLocal * 0.05); else if (f.includes('Octavofinalista')) bono = Math.round(pozoLocal * 0.0125);
                        } else if (formatoOficial === 16) { 
                            if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.40); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.20); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.12); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.08); else if (f.includes('Cuartofinalista')) bono = Math.round(pozoLocal * 0.05); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.10); 
                        } else if (formatoOficial === 8) { 
                            if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.45); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.25); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.18); else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoLocal * 0.12); else if (f.includes('Semifinalista')) bono = Math.round(pozoLocal * 0.15); 
                        } else if (formatoOficial === 4) { 
                            if (hayTercero) { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.50); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.30); else if (f.includes('Tercer')) bono = Math.round(pozoLocal * 0.20); } else { if (f.includes('Campeón')) bono = Math.round(pozoLocal * 0.60); else if (f.includes('Subcampeón')) bono = Math.round(pozoLocal * 0.40); }
                        }
                    }

                    if (bono === 0 && b.cambio_mc1 > 0 && isLiga) bono = b.cambio_mc1; 
                    if (rankingTemp[b.mc1_id]) { rankingTemp[b.mc1_id].elo_actual += bono; }
                } else {
                    let R1 = rankingTemp[b.mc1_id].elo_actual; let R2 = rankingTemp[b.mc2_id] ? rankingTemp[b.mc2_id].elo_actual : 1500;
                    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
                    let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
                    if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }
                    let c1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); let c2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));

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

    let listaFinal = Object.values(rankingTemp).sort((a, b) => b.elo_actual - a.elo_actual);
    let htmlTabla = ''; let posicion = 1;
    
    listaFinal.forEach(mc => {
        if(mc.batallas_totales > 0) { 
            let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "🌍 ";
            let colorPuntos = modo === 'aislado' ? '#eccc68' : '#00d2d3'; 
            htmlTabla += `<tr onclick="window.location.href='perfil.html?id=${mc.id}'" title="Ver Perfil de Atleta" style="cursor: pointer;">
                <td><strong>#${posicion}</strong></td>
                <td>${bandera}${mc.aka}</td>
                <td style='color: ${colorPuntos};'><strong>${mc.elo_actual}</strong></td>
                <td>${mc.batallas_totales}</td>
            </tr>`;
            posicion++;
        }
    });

    if(htmlTabla === "") htmlTabla = "<tr><td colspan='4' style='text-align:center; padding: 40px; color: #a4b0be;'>No hay registros en esta línea de tiempo.</td></tr>";
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

window.aplicarFiltros = aplicarFiltros;

(async () => {
    try {
        await inicializar();
        await cargarFranquiciasSelect('filtroFranquicia', true);
    } catch (error) { console.error("Error:", error); }
})();