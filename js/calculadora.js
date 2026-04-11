import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

let listaMCsGlobal = [];

async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    listaMCsGlobal = data || [];
    cargarRankingNormal();
}

function cargarRankingNormal() {
    document.getElementById('tituloTabla').innerText = "3. Tabla de Posiciones Global (Histórica)";
    let htmlTabla = '';
    listaMCsGlobal.forEach((mc, index) => {
        let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "";
        htmlTabla += `<tr><td><strong>#${index + 1}</strong></td><td>${bandera}${mc.aka}</td><td><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
    });
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

async function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    let nacionalidad = document.getElementById('nuevaNacionalidad').value.trim();
    let foto = document.getElementById('nuevaFoto').value.trim();

    if (aka === "") return alert("Escribe un A.K.A");

    const { error } = await supabase.from('competidores').insert([{ 
        aka: aka, nacionalidad: nacionalidad || '🌍', foto: foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC', elo_actual: 1500, batallas_totales: 0 
    }]);

    if (error) return alert("Error guardando en la base de datos.");

    document.getElementById('nuevoAka').value = ""; document.getElementById('nuevaNacionalidad').value = ""; document.getElementById('nuevaFoto').value = ""; 
    await inicializar(); 
}

async function aplicarFiltros() {
    let franquicia = document.getElementById('filtroFranquicia').value;
    let modo = document.getElementById('modoAnalisisCalc').value;
    let desde = document.getElementById('filtroDesde').value;
    let hasta = document.getElementById('filtroHasta').value;

    if (franquicia === "TODAS" && !desde && !hasta && modo === 'historico') {
        return cargarRankingNormal();
    }

    document.getElementById('tituloTabla').innerText = modo === 'aislado' ? `Estadísticas Aisladas (${franquicia})` : `Estadísticas Históricas (${franquicia})`;
    document.getElementById('cuerpoRanking').innerHTML = "<tr><td colspan='4' style='text-align: center; color: #eccc68;'><strong>⏳ Procesando Datos...</strong></td></tr>";

    const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(franquicia, fecha_evento)`);
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
    
    // INICIAMOS A TODOS LOS MCs EN EL SISTEMA
    listaMCsGlobal.forEach(mc => { rankingTemp[mc.id] = { aka: mc.aka, nacionalidad: mc.nacionalidad, elo_actual: 1500, batallas_totales: 0 }; });

    if (modo === 'aislado') {
        // MATEMÁTICA PURA DESDE CERO
        batallasValidas.forEach(b => {
            let R1 = rankingTemp[b.mc1_id].elo_actual; let R2 = rankingTemp[b.mc2_id] ? rankingTemp[b.mc2_id].elo_actual : 1500;
            let c1 = 0, c2 = 0;
            
            if (b.resultado === 'bono') { c1 = b.cambio_mc1; } 
            else {
                let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
                let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
                if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
                else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
                else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }
                c1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); c2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));
            }

            rankingTemp[b.mc1_id].elo_actual = R1 + c1; rankingTemp[b.mc1_id].batallas_totales += 1;
            if(b.resultado !== 'bono' && rankingTemp[b.mc2_id]) { rankingTemp[b.mc2_id].elo_actual = R2 + c2; rankingTemp[b.mc2_id].batallas_totales += 1; }
        });
    } else {
        // LECTURA DE PUNTOS HISTÓRICOS (MÁSCARA)
        batallasValidas.forEach(b => {
            rankingTemp[b.mc1_id].elo_actual = b.elo_previo_mc1 + b.cambio_mc1;
            rankingTemp[b.mc1_id].batallas_totales += 1;
            if(b.resultado !== 'bono' && rankingTemp[b.mc2_id]) {
                rankingTemp[b.mc2_id].elo_actual = b.elo_previo_mc2 + b.cambio_mc2;
                rankingTemp[b.mc2_id].batallas_totales += 1;
            }
        });
    }

    let listaFinal = Object.values(rankingTemp).sort((a, b) => b.elo_actual - a.elo_actual);
    let htmlTabla = ''; let posicion = 1;
    
    listaFinal.forEach(mc => {
        if(mc.batallas_totales > 0) { 
            let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "";
            let colorPuntos = modo === 'aislado' ? '#eccc68' : '#ff4757'; // Amarillo para aislado, Rojo para global
            htmlTabla += `<tr><td><strong>#${posicion}</strong></td><td>${bandera}${mc.aka}</td><td style='color: ${colorPuntos};'><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
            posicion++;
        }
    });

    if(htmlTabla === "") htmlTabla = "<tr><td colspan='4' style='text-align:center;'>No hay registros para este filtro.</td></tr>";
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

window.agregarMC = agregarMC; window.aplicarFiltros = aplicarFiltros;

(async () => {
    try {
        await configurarSesion();
        await inicializar();
        await cargarFranquiciasSelect('filtroFranquicia', true);
    } catch (error) {
        console.error("Error al inicializar la calculadora:", error);
    }
})();