// La constante K base para el sistema Elo
const K = 32;

function procesarBatalla() {
    // 1. Obtener los valores del HTML
    let R1 = parseFloat(document.getElementById('elo1').value);
    let R2 = parseFloat(document.getElementById('elo2').value);
    let tipoResultado = document.getElementById('resultadoBatalla').value;

    // 2. Calcular la probabilidad de victoria (Resultado Esperado E)
    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
    let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

    // 3. Definir multiplicadores S y banderas para bonos
    let S1 = 0;
    let S2 = 0;
    let esVictoriaTotalC1 = false;
    let esVictoriaTotalC2 = false;

    if (tipoResultado === "victoria_total") {
        S1 = 1.0; S2 = 0.0;
        esVictoriaTotalC1 = true; // Bono para Competidor 1
    } else if (tipoResultado === "victoria") {
        S1 = 1.0; S2 = 0.0;
    } else if (tipoResultado === "victoria_replica") {
        S1 = 0.75; S2 = 0.25;
    } else if (tipoResultado === "derrota_replica") {
        S1 = 0.25; S2 = 0.75;
    } else if (tipoResultado === "derrota") {
        S1 = 0.0; S2 = 1.0;
    } else if (tipoResultado === "derrota_total") {
        S1 = 0.0; S2 = 1.0;
        esVictoriaTotalC2 = true; // Bono para Competidor 2
    }

    // 4. Calcular cuántos puntos base se ganan/pierden
    let puntosCambio1 = K * (S1 - E1);
    let puntosCambio2 = K * (S2 - E2);

    // 5. Aplicar la regla especial del Multiplicador 1.2
    if (esVictoriaTotalC1) {
        puntosCambio1 = puntosCambio1 * 1.2; 
    }
    if (esVictoriaTotalC2) {
        puntosCambio2 = puntosCambio2 * 1.2; 
    }

    // 6. Calcular el Elo final (redondeado)
    let nuevoR1 = Math.round(R1 + puntosCambio1);
    let nuevoR2 = Math.round(R2 + puntosCambio2);

    // 7. Mostrar el resultado en la pantalla
    let texto = `
        Competidor 1: ${nuevoR1} puntos (${puntosCambio1 > 0 ? '+' : ''}${Math.round(puntosCambio1)}) <br>
        Competidor 2: ${nuevoR2} puntos (${puntosCambio2 > 0 ? '+' : ''}${Math.round(puntosCambio2)})
    `;
    document.getElementById('textoResultado').innerHTML = texto;
}