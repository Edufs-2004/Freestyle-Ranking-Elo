// ==========================================
// CONFIGURACIÓN DE SUPABASE (La Nube)
// ==========================================
import { supabase } from './supabase.js';

// La constante K base para el sistema Elo
const K = 32;

// Nuestra lista temporal que se llenará con datos de la nube
let listaMCs = [];


// ==========================================
// 1. FUNCIONES DE CARGA Y RENDERIZADO
// ==========================================

// Función para descargar los datos desde Supabase
async function cargarRanking() {
    console.log("Cargando datos desde Supabase...");
    const { data, error } = await supabase
        .from('competidores')
        .select('*')
        .order('elo_actual', { ascending: false });

    if (error) {
        console.error("Error al cargar los datos:", error);
        return;
    }

    // Guardamos los datos de la nube en nuestra lista local
    listaMCs = data;
    dibujarInterfaz();
}

// Función para pintar el HTML con los datos descargados
function dibujarInterfaz() {
    let htmlSelects = '<option value="">Selecciona un MC...</option>';
    let htmlTabla = '';

    listaMCs.forEach((mc, index) => {
        // Llenamos los menús desplegables
        htmlSelects += `<option value="${mc.id}">${mc.aka} (${mc.elo_actual})</option>`;
        
        // Llenamos la tabla de posiciones
        htmlTabla += `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>${mc.aka}</td>
                <td><strong>${mc.elo_actual}</strong></td>
                <td>${mc.batallas_totales}</td>
            </tr>
        `;
    });

    // Actualizar todos los Selects de la página
    if(document.getElementById('selectMc1')) document.getElementById('selectMc1').innerHTML = htmlSelects;
    if(document.getElementById('selectMc2')) document.getElementById('selectMc2').innerHTML = htmlSelects;
    
    if(document.getElementById('selectCampeon')) {
        document.getElementById('selectCampeon').innerHTML = htmlSelects;
        document.getElementById('selectSub').innerHTML = htmlSelects;
        document.getElementById('selectSemi1').innerHTML = htmlSelects;
        document.getElementById('selectSemi2').innerHTML = htmlSelects;
    }
    
    // Actualizar la tabla
    if(document.getElementById('cuerpoRanking')) document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}


// ==========================================
// 2. FUNCIONES DE REGISTRO (CREAR MC)
// ==========================================

async function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    if (aka === "") return alert("Escribe un A.K.A válido");

    // Inyectar en Supabase
    const { error } = await supabase
        .from('competidores')
        .insert([
            { aka: aka, elo_actual: 1500, batallas_totales: 0 }
        ]);

    if (error) {
        console.error("Error al guardar:", error);
        return alert("Hubo un error guardando al competidor.");
    }

    document.getElementById('nuevoAka').value = ""; 
    cargarRanking(); // Recargar datos para ver al nuevo MC
}


// ==========================================
// 3. LA CALCULADORA DE BATALLAS (ELO)
// ==========================================

async function procesarBatalla() {
    let id1 = parseInt(document.getElementById('selectMc1').value);
    let id2 = parseInt(document.getElementById('selectMc2').value);
    let tipoResultado = document.getElementById('resultadoBatalla').value;

    if (id1 === id2) return alert("Un MC no puede batallar contra sí mismo");
    if (!id1 || !id2) return alert("Selecciona a los dos competidores");

    // Buscar a los MCs en nuestra lista descargada
    let mc1 = listaMCs.find(mc => mc.id === id1);
    let mc2 = listaMCs.find(mc => mc.id === id2);

    let R1 = mc1.elo_actual;
    let R2 = mc2.elo_actual;

    // Calcular probabilidad de victoria (E)
    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
    let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

    // Definir multiplicadores S
    let S1 = 0, S2 = 0;
    let esVictoriaTotalC1 = false, esVictoriaTotalC2 = false;

    if (tipoResultado === "victoria_total") { S1 = 1.0; S2 = 0.0; esVictoriaTotalC1 = true; } 
    else if (tipoResultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
    else if (tipoResultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
    else if (tipoResultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
    else if (tipoResultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
    else if (tipoResultado === "derrota_total") { S1 = 0.0; S2 = 1.0; esVictoriaTotalC2 = true; }

    // Calcular puntos en juego
    let puntosCambio1 = K * (S1 - E1);
    let puntosCambio2 = K * (S2 - E2);

    // Multiplicador especial 1.2
    if (esVictoriaTotalC1) puntosCambio1 *= 1.2; 
    if (esVictoriaTotalC2) puntosCambio2 *= 1.2; 

    // Resultados finales
    let nuevoR1 = Math.round(R1 + puntosCambio1);
    let nuevoR2 = Math.round(R2 + puntosCambio2);
    let nuevasBatallas1 = mc1.batallas_totales + 1;
    let nuevasBatallas2 = mc2.batallas_totales + 1;

    // --- ACTUALIZAR EN SUPABASE ---
    const { error: error1 } = await supabase.from('competidores').update({ elo_actual: nuevoR1, batallas_totales: nuevasBatallas1 }).eq('id', id1);
    const { error: error2 } = await supabase.from('competidores').update({ elo_actual: nuevoR2, batallas_totales: nuevasBatallas2 }).eq('id', id2);

    if (error1 || error2) return alert("Error actualizando puntajes en la base de datos.");

    // Mostrar en pantalla
    document.getElementById('textoResultado').innerHTML = `
        ${mc1.aka}: ${nuevoR1} pts (${puntosCambio1 > 0 ? '+' : ''}${Math.round(puntosCambio1)}) <br>
        ${mc2.aka}: ${nuevoR2} pts (${puntosCambio2 > 0 ? '+' : ''}${Math.round(puntosCambio2)})
    `;

    cargarRanking(); // Recargar la tabla con los nuevos puntos
}


// ==========================================
// 4. LÓGICA DEL POZO DE PREMIOS (TORNEOS)
// ==========================================

async function repartirPozo() {
    let idCampeon = parseInt(document.getElementById('selectCampeon').value);
    let idSub = parseInt(document.getElementById('selectSub').value);
    let idSemi1 = parseInt(document.getElementById('selectSemi1').value);
    let idSemi2 = parseInt(document.getElementById('selectSemi2').value);

    let idsSeleccionados = [idCampeon, idSub, idSemi1, idSemi2];
    let idsUnicos = new Set(idsSeleccionados);
    
    if (idsSeleccionados.includes(NaN)) return alert("Faltan competidores por seleccionar.");
    if (idsUnicos.size !== 4) return alert("Un MC no puede ocupar dos puestos al mismo tiempo.");

    let campeon = listaMCs.find(mc => mc.id === idCampeon);
    let sub = listaMCs.find(mc => mc.id === idSub);
    let semi1 = listaMCs.find(mc => mc.id === idSemi1);
    let semi2 = listaMCs.find(mc => mc.id === idSemi2);

    // Matemáticas del pozo (Calculado sobre el Elo actual del Top 4)
    let mediaElo = (campeon.elo_actual + sub.elo_actual + semi1.elo_actual + semi2.elo_actual) / 4;
    let pozoTotal = Math.round(mediaElo * 0.05);

    let bonoCampeon = Math.round(pozoTotal * 0.40);
    let bonoSub = Math.round(pozoTotal * 0.20);     
    let bonoSemi = Math.round(pozoTotal * 0.10);    

    // Calcular nuevos totales
    let nuevoEloCampeon = campeon.elo_actual + bonoCampeon;
    let nuevoEloSub = sub.elo_actual + bonoSub;
    let nuevoEloSemi1 = semi1.elo_actual + bonoSemi;
    let nuevoEloSemi2 = semi2.elo_actual + bonoSemi;

    // --- ACTUALIZAR EN SUPABASE EN LOTE ---
    // (Por ahora lo hacemos uno por uno para asegurar que funcione)
    await supabase.from('competidores').update({ elo_actual: nuevoEloCampeon }).eq('id', idCampeon);
    await supabase.from('competidores').update({ elo_actual: nuevoEloSub }).eq('id', idSub);
    await supabase.from('competidores').update({ elo_actual: nuevoEloSemi1 }).eq('id', idSemi1);
    await supabase.from('competidores').update({ elo_actual: nuevoEloSemi2 }).eq('id', idSemi2);

    document.getElementById('resultadoPozo').innerHTML = `
        Pozo Total Generado: ${pozoTotal} pts (Media del Top 4: ${Math.round(mediaElo)})<br><br>
        👑 ${campeon.aka}: +${bonoCampeon} pts<br>
        🥈 ${sub.aka}: +${bonoSub} pts<br>
        🥉 ${semi1.aka} y ${semi2.aka}: +${bonoSemi} pts c/u
    `;

    cargarRanking(); // Recargar la tabla final
}


// ==========================================
// 5. EXPORTAR FUNCIONES AL HTML (Necesario al usar type="module")
// ==========================================
window.agregarMC = agregarMC;
window.procesarBatalla = procesarBatalla;
window.repartirPozo = repartirPozo;

// ==========================================
// 6. INICIO DE LA APLICACIÓN
// ==========================================
// Al cargar la página, ejecutar la descarga inicial
cargarRanking();