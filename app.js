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

// Al cargar la página, dibujar todo por primera vez
guardarYActualizar();