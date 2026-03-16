import { supabase } from './supabase.js';
const K = 32;

// Carga Inicial (Global Crudo de la Base de Datos)
async function cargarRankingNormal() {
    document.getElementById('tituloTabla').innerText = "3. Tabla de Posiciones Global (Histórica)";
    const { data, error } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    if (error) return console.error("Error:", error);
    
    let htmlTabla = '';
    data.forEach((mc, index) => {
        htmlTabla += `<tr><td><strong>#${index + 1}</strong></td><td>${mc.aka}</td><td><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
    });
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

// Agregar Nuevo MC
async function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    if (aka === "") return alert("Escribe un A.K.A");
    const { error } = await supabase.from('competidores').insert([{ aka: aka, elo_actual: 1500, batallas_totales: 0 }]);
    if (error) return alert("Error guardando.");
    document.getElementById('nuevoAka').value = ""; 
    cargarRankingNormal(); 
}

// ==========================================
// EL MOTOR DE VIAJE EN EL TIEMPO
// ==========================================
async function aplicarFiltros() {
    let franquicia = document.getElementById('filtroFranquicia').value;
    let desde = document.getElementById('filtroDesde').value;
    let hasta = document.getElementById('filtroHasta').value;

    // Si todo está vacío, mostramos el global normal
    if (franquicia === "TODAS" && !desde && !hasta) return cargarRankingNormal();

    document.getElementById('tituloTabla').innerText = `Estadísticas Aisladas (${franquicia})`;
    document.getElementById('cuerpoRanking').innerHTML = "<tr><td colspan='4' style='text-align: center; color: #ff4757;'><strong>⏳ Viajando en el tiempo y recalculando batallas...</strong></td></tr>";

    // 1. Obtener a todos los MCs y "Resetearlos" mentalmente a 1500
    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingTemp = {};
    mcs.forEach(mc => {
        rankingTemp[mc.id] = { aka: mc.aka, elo_actual: 1500, batallas_totales: 0 };
    });

    // 2. Traer TODAS las batallas fusionadas con la fecha de su torneo
    const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(franquicia, fecha_evento)`);
    if(error) return alert("Error al buscar el historial.");

    // 3. Filtrar las batallas según lo que pidió el usuario
    let batallasValidas = batallas.filter(b => {
        if(!b.torneos) return false; 
        let okFranquicia = franquicia === "TODAS" ? true : b.torneos.franquicia === franquicia;
        let okDesde = !desde ? true : b.torneos.fecha_evento >= desde;
        let okHasta = !hasta ? true : b.torneos.fecha_evento <= hasta;
        return okFranquicia && okDesde && okHasta;
    });

    // 4. Ordenar Cronológicamente (De más antigua a más nueva)
    batallasValidas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    // 5. Aplicar Matemática en Cascada a las batallas filtradas
    batallasValidas.forEach(b => {
        let R1 = rankingTemp[b.mc1_id].elo_actual;
        let R2 = rankingTemp[b.mc2_id].elo_actual;
        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
        let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
        
        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } 
        else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
        else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
        else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
        else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
        else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }

        let p1 = K * (S1 - E1); let p2 = K * (S2 - E2);
        if (bono1) p1 *= 1.2; if (bono2) p2 *= 1.2;

        rankingTemp[b.mc1_id].elo_actual = Math.round(R1 + p1);
        rankingTemp[b.mc2_id].elo_actual = Math.round(R2 + p2);
        rankingTemp[b.mc1_id].batallas_totales += 1;
        rankingTemp[b.mc2_id].batallas_totales += 1;
    });

    // 6. Ordenar a los MCs por sus nuevos puntos temporales
    let listaFinal = Object.values(rankingTemp).sort((a, b) => b.elo_actual - a.elo_actual);
    
    let htmlTabla = '';
    let posicion = 1;
    listaFinal.forEach(mc => {
        // Solo mostrar a los MCs que jugaron al menos 1 batalla en este universo filtrado
        if(mc.batallas_totales > 0) { 
            htmlTabla += `<tr><td><strong>#${posicion}</strong></td><td>${mc.aka}</td><td style='color: #ff4757;'><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
            posicion++;
        }
    });

    if(htmlTabla === "") htmlTabla = "<tr><td colspan='4' style='text-align:center;'>No hay registros para este filtro.</td></tr>";
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

window.agregarMC = agregarMC;
window.aplicarFiltros = aplicarFiltros;
cargarRankingNormal();