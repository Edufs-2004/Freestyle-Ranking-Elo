import { supabase } from './supabase.js';
const K = 32;

// Carga Inicial
async function cargarRankingNormal() {
    document.getElementById('tituloTabla').innerText = "3. Tabla de Posiciones Global (Histórica)";
    const { data, error } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    if (error) return console.error("Error:", error);
    
    let htmlTabla = '';
    data.forEach((mc, index) => {
        // Le agregamos la bandera a la tabla principal para que se vea más profesional
        let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "";
        htmlTabla += `<tr><td><strong>#${index + 1}</strong></td><td>${bandera}${mc.aka}</td><td><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
    });
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

// Agregar Nuevo MC (ACTUALIZADO PARA V1.4.0)
async function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    let nacionalidad = document.getElementById('nuevaNacionalidad').value.trim();
    let foto = document.getElementById('nuevaFoto').value.trim();

    if (aka === "") return alert("Escribe un A.K.A");

    // Enviamos los 5 datos a Supabase
    const { error } = await supabase.from('competidores').insert([{ 
        aka: aka, 
        nacionalidad: nacionalidad || '🌍', // Si lo deja vacío, pone el planeta por defecto
        foto: foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC', // Foto por defecto si está vacío
        elo_actual: 1500, 
        batallas_totales: 0 
    }]);

    if (error) {
        console.error(error);
        return alert("Error guardando en la base de datos.");
    }

    // Limpiamos las casillas
    document.getElementById('nuevoAka').value = ""; 
    document.getElementById('nuevaNacionalidad').value = ""; 
    document.getElementById('nuevaFoto').value = ""; 
    
    cargarRankingNormal(); 
}

// ==========================================
// EL MOTOR DE VIAJE EN EL TIEMPO
// ==========================================
async function aplicarFiltros() {
    let franquicia = document.getElementById('filtroFranquicia').value;
    let desde = document.getElementById('filtroDesde').value;
    let hasta = document.getElementById('filtroHasta').value;

    if (franquicia === "TODAS" && !desde && !hasta) return cargarRankingNormal();

    document.getElementById('tituloTabla').innerText = `Estadísticas Aisladas (${franquicia})`;
    document.getElementById('cuerpoRanking').innerHTML = "<tr><td colspan='4' style='text-align: center; color: #ff4757;'><strong>⏳ Viajando en el tiempo y recalculando batallas...</strong></td></tr>";

    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingTemp = {};
    mcs.forEach(mc => {
        // Guardamos también la bandera para mostrarla en el ranking filtrado
        rankingTemp[mc.id] = { aka: mc.aka, nacionalidad: mc.nacionalidad, elo_actual: 1500, batallas_totales: 0 };
    });

    const { data: batallas, error } = await supabase.from('batallas').select(`*, torneos(franquicia, fecha_evento)`);
    if(error) return alert("Error al buscar el historial.");

    let batallasValidas = batallas.filter(b => {
        if(!b.torneos) return false; 
        let okFranquicia = franquicia === "TODAS" ? true : b.torneos.franquicia === franquicia;
        let okDesde = !desde ? true : b.torneos.fecha_evento >= desde;
        let okHasta = !hasta ? true : b.torneos.fecha_evento <= hasta;
        return okFranquicia && okDesde && okHasta;
    });

    batallasValidas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

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

    let listaFinal = Object.values(rankingTemp).sort((a, b) => b.elo_actual - a.elo_actual);
    
    let htmlTabla = '';
    let posicion = 1;
    listaFinal.forEach(mc => {
        if(mc.batallas_totales > 0) { 
            let bandera = mc.nacionalidad ? mc.nacionalidad + " " : "";
            htmlTabla += `<tr><td><strong>#${posicion}</strong></td><td>${bandera}${mc.aka}</td><td style='color: #ff4757;'><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
            posicion++;
        }
    });

    if(htmlTabla === "") htmlTabla = "<tr><td colspan='4' style='text-align:center;'>No hay registros para este filtro.</td></tr>";
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

window.agregarMC = agregarMC;
window.aplicarFiltros = aplicarFiltros;
cargarRankingNormal();