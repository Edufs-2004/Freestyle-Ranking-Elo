const K = 32;

// Intentamos cargar la lista de MCs desde la memoria del navegador. Si no hay nada, iniciamos una lista vacía.
let listaMCs = JSON.parse(localStorage.getItem('rankingFreestyle')) || [];

// 1. Función para agregar un nuevo MC
function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    if (aka === "") return alert("Escribe un A.K.A válido");

    // Creamos el "molde" del competidor
    let nuevoCompetidor = {
        id: Date.now(), // Un ID único
        nombre: aka,
        elo: 1500, // Todos empiezan aquí
        batallasJugadas: 0
    };

    listaMCs.push(nuevoCompetidor); // Lo metemos a la lista
    guardarYActualizar(); // Guardamos y refrescamos la pantalla
    document.getElementById('nuevoAka').value = ""; // Limpiamos el cuadro
}

// 2. La lógica de la batalla adaptada a los IDs
function procesarBatalla() {
    let id1 = parseInt(document.getElementById('selectMc1').value);
    let id2 = parseInt(document.getElementById('selectMc2').value);
    let tipoResultado = document.getElementById('resultadoBatalla').value;

    if (id1 === id2) return alert("Un MC no puede batallar contra sí mismo");
    if (!id1 || !id2) return alert("Selecciona a los dos competidores");

    // Buscamos a los MCs en nuestra lista
    let mc1 = listaMCs.find(mc => mc.id === id1);
    let mc2 = listaMCs.find(mc => mc.id === id2);

    let R1 = mc1.elo;
    let R2 = mc2.elo;

    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
    let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

    let S1 = 0, S2 = 0;
    let esVictoriaTotalC1 = false, esVictoriaTotalC2 = false;

    if (tipoResultado === "victoria_total") { S1 = 1.0; S2 = 0.0; esVictoriaTotalC1 = true; } 
    else if (tipoResultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
    else if (tipoResultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
    else if (tipoResultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
    else if (tipoResultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
    else if (tipoResultado === "derrota_total") { S1 = 0.0; S2 = 1.0; esVictoriaTotalC2 = true; }

    let puntosCambio1 = K * (S1 - E1);
    let puntosCambio2 = K * (S2 - E2);

    if (esVictoriaTotalC1) puntosCambio1 *= 1.2; 
    if (esVictoriaTotalC2) puntosCambio2 *= 1.2; 

    // Actualizamos los datos de los MCs en la lista
    mc1.elo = Math.round(R1 + puntosCambio1);
    mc2.elo = Math.round(R2 + puntosCambio2);
    mc1.batallasJugadas += 1;
    mc2.batallasJugadas += 1;

    // Mostramos qué pasó
    document.getElementById('textoResultado').innerHTML = `
        ${mc1.nombre}: ${mc1.elo} pts (${puntosCambio1 > 0 ? '+' : ''}${Math.round(puntosCambio1)}) <br>
        ${mc2.nombre}: ${mc2.elo} pts (${puntosCambio2 > 0 ? '+' : ''}${Math.round(puntosCambio2)})
    `;

    guardarYActualizar();
}

// 3. Función maestra que guarda en memoria y dibuja la interfaz
function guardarYActualizar() {
    // Guardar en el navegador
    localStorage.setItem('rankingFreestyle', JSON.stringify(listaMCs));

    // Ordenar de mayor a menor Elo para el ranking
    listaMCs.sort((a, b) => b.elo - a.elo);

    // Llenar los desplegables de las batallas y la tabla
    let htmlSelects = '<option value="">Selecciona un MC...</option>';
    let htmlTabla = '';

    listaMCs.forEach((mc, index) => {
        htmlSelects += `<option value="${mc.id}">${mc.nombre} (${mc.elo})</option>`;
        htmlTabla += `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>${mc.nombre}</td>
                <td><strong>${mc.elo}</strong></td>
                <td>${mc.batallasJugadas}</td>
            </tr>
        `;
    });

document.getElementById('selectMc1').innerHTML = htmlSelects;
    document.getElementById('selectMc2').innerHTML = htmlSelects;
    
    // Llenar selectores del torneo si existen en el HTML
    if(document.getElementById('selectCampeon')) {
        document.getElementById('selectCampeon').innerHTML = htmlSelects;
        document.getElementById('selectSub').innerHTML = htmlSelects;
        document.getElementById('selectSemi1').innerHTML = htmlSelects;
        document.getElementById('selectSemi2').innerHTML = htmlSelects;
    }
    document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

// Para limpiar pruebas
function borrarDatos() {
    if(confirm("¿Seguro que quieres borrar todo el ranking?")) {
        localStorage.removeItem('rankingFreestyle');
        listaMCs = [];
        guardarYActualizar();
        document.getElementById('textoResultado').innerHTML = "";
    }
}

// --- NUEVA LÓGICA: POZO DE PREMIOS DEL TORNEO ---

function repartirPozo() {
    let idCampeon = parseInt(document.getElementById('selectCampeon').value);
    let idSub = parseInt(document.getElementById('selectSub').value);
    let idSemi1 = parseInt(document.getElementById('selectSemi1').value);
    let idSemi2 = parseInt(document.getElementById('selectSemi2').value);

    // Validar que se seleccionaron los 4 y que no hay repetidos
    let idsSeleccionados = [idCampeon, idSub, idSemi1, idSemi2];
    let idsUnicos = new Set(idsSeleccionados);
    
    if (idsSeleccionados.includes(NaN)) return alert("Faltan competidores por seleccionar.");
    if (idsUnicos.size !== 4) return alert("Un MC no puede ocupar dos puestos al mismo tiempo.");

    // Traer a los objetos MC de la memoria
    let campeon = listaMCs.find(mc => mc.id === idCampeon);
    let sub = listaMCs.find(mc => mc.id === idSub);
    let semi1 = listaMCs.find(mc => mc.id === idSemi1);
    let semi2 = listaMCs.find(mc => mc.id === idSemi2);

    // 1. Calcular la Media de Elo del Top 4 (Esto define el peso del torneo)
    let mediaElo = (campeon.elo + sub.elo + semi1.elo + semi2.elo) / 4;

    // 2. Calcular el Pozo Total (5% de la media)
    let pozoTotal = Math.round(mediaElo * 0.05);

    // 3. Definir los porcentajes de repartición
    let bonoCampeon = Math.round(pozoTotal * 0.40); // 40%
    let bonoSub = Math.round(pozoTotal * 0.20);     // 20%
    let bonoSemi = Math.round(pozoTotal * 0.10);    // 10% para cada semi

    // 4. Sumar los puntos
    campeon.elo += bonoCampeon;
    sub.elo += bonoSub;
    semi1.elo += bonoSemi;
    semi2.elo += bonoSemi;

    // 5. Mostrar el resumen en pantalla
    document.getElementById('resultadoPozo').innerHTML = `
        Pozo Total Generado: ${pozoTotal} pts (Media: ${Math.round(mediaElo)})<br><br>
        👑 ${campeon.nombre}: +${bonoCampeon} pts<br>
        🥈 ${sub.nombre}: +${bonoSub} pts<br>
        🥉 ${semi1.nombre} y ${semi2.nombre}: +${bonoSemi} pts c/u
    `;

    // 6. Guardar y refrescar tabla
    guardarYActualizar();
}
// Al cargar la página, dibujar todo por primera vez
guardarYActualizar();