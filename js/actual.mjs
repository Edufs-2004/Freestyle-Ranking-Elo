const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function cargarTodasLasFilas(consulta, tamanoPagina = 1000) {
    const filas = [];
    for (let inicio = 0; ; inicio += tamanoPagina) {
        const { data, error } = await consulta.range(inicio, inicio + tamanoPagina - 1);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < tamanoPagina) return filas;
    }
}

export function fechaCalendario(valor) {
    if (typeof valor !== 'string') return null;
    const fecha = valor.slice(0, 10);
    if (!FORMATO_FECHA.test(fecha)) return null;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));
    return comprobacion.getUTCFullYear() === anio && comprobacion.getUTCMonth() === mes - 1 && comprobacion.getUTCDate() === dia
        ? fecha
        : null;
}

export function fechaEventoActual(batalla) {
    return fechaCalendario(batalla.torneos?.fecha_evento)
        || fechaCalendario(batalla.creado_en);
}

function sumarMesesCalendario(fecha, meses) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const primerDiaMesObjetivo = new Date(Date.UTC(anio, mes - 1 + meses, 1));
    const ultimoDiaMes = new Date(Date.UTC(primerDiaMesObjetivo.getUTCFullYear(), primerDiaMesObjetivo.getUTCMonth() + 1, 0)).getUTCDate();
    const diaObjetivo = Math.min(dia, ultimoDiaMes);
    return `${primerDiaMesObjetivo.getUTCFullYear()}-${String(primerDiaMesObjetivo.getUTCMonth() + 1).padStart(2, '0')}-${String(diaObjetivo).padStart(2, '0')}`;
}

export function calcularPesoActual(fechaEvento, fechaCorte) {
    const evento = fechaCalendario(fechaEvento);
    const corte = fechaCalendario(fechaCorte);
    if (!evento || !corte || evento > corte) return 0;

    const [anioEvento, mesEvento] = evento.split('-').map(Number);
    const [anioCorte, mesCorte] = corte.split('-').map(Number);
    let mesesCompletos = (anioCorte - anioEvento) * 12 + mesCorte - mesEvento;
    if (sumarMesesCalendario(evento, mesesCompletos) > corte) mesesCompletos -= 1;
    if (mesesCompletos <= 24) return 1;
    if (mesesCompletos >= 34) return 0;
    return (34 - mesesCompletos) / 10;
}

export function filtrarBatallasActuales(batallas, opciones = {}) {
    const { franquicia = 'TODAS', franquiciasPermitidas = [], desde = '', hasta = '' } = opciones;
    return batallas.flatMap(batalla => {
        const fecha = fechaEventoActual(batalla);
        if (!fecha || (desde && fecha < desde) || (hasta && fecha > hasta)) return [];
        if (franquicia !== 'TODAS' && !franquiciasPermitidas.includes(batalla.torneos?.franquicia)) return [];
        return [{ ...batalla, fecha_actual: fecha }];
    });
}

export function calcularRankingActual(competidores, batallas, fechaCorte) {
    const acumulados = new Map(competidores.map(competidor => [competidor.id, {
        ...competidor,
        puntaje_actual: 1500,
        batallas_actuales: 0,
        bonos_actuales: 0
    }]));

    batallas.forEach(batalla => {
        const fecha = batalla.fecha_actual || fechaEventoActual(batalla);
        const peso = calcularPesoActual(fecha, fechaCorte);
        if (peso <= 0) return;

        if (batalla.resultado === 'bono') {
            const competidor = acumulados.get(batalla.mc1_id);
            if (competidor) {
                const aporte = Number(batalla.cambio_mc1) || 0;
                competidor.puntaje_actual += aporte * peso;
                competidor.bonos_actuales += aporte * peso;
            }
            return;
        }

        const vistos = new Set();
        [[batalla.mc1_id, batalla.cambio_mc1], [batalla.mc2_id, batalla.cambio_mc2]].forEach(([id, cambio]) => {
            const competidor = acumulados.get(id);
            if (!competidor || id == null || vistos.has(id)) return;
            vistos.add(id);
            competidor.puntaje_actual += (Number(cambio) || 0) * peso;
            competidor.batallas_actuales += 1;
        });
    });

    return [...acumulados.values()]
        .filter(competidor => competidor.batallas_actuales > 0)
        .sort((a, b) => b.puntaje_actual - a.puntaje_actual
            || String(a.aka || '').localeCompare(String(b.aka || ''), 'es')
            || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
}

export function contribucionActual(batalla, idCompetidor, fechaCorte) {
    const esMC1 = batalla.mc1_id == idCompetidor;
    if (!esMC1 && batalla.mc2_id != idCompetidor) return null;
    if (batalla.resultado === 'bono' && !esMC1) return null;
    const cambioOriginal = Number(esMC1 ? batalla.cambio_mc1 : batalla.cambio_mc2) || 0;
    const peso = calcularPesoActual(batalla.fecha_actual || fechaEventoActual(batalla), fechaCorte);
    return { cambioOriginal, peso, cambioActual: cambioOriginal * peso };
}