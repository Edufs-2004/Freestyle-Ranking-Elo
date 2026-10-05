function agregarPremio(premios, competidorId, puntos, fase) {
    if (competidorId == null) throw new Error(`Falta el beneficiario del premio: ${fase}.`);
    premios.push({ competidorId, puntos, fase });
}

export function calcularMontosPremio(tamanoCuadro, pozo, hayTercero) {
    const montoPozo = Number(pozo) || 0;
    let campeon = 0;
    let subcampeon = 0;
    let tercerLugar = 0;
    let cuartoLugar = 0;
    let semifinalista = 0;
    let cuartofinalista = 0;

    if (tamanoCuadro === 16) {
        campeon = Math.round(montoPozo * 0.40);
        subcampeon = Math.round(montoPozo * 0.20);
        if (hayTercero) {
            tercerLugar = Math.round(montoPozo * 0.12);
            cuartoLugar = Math.round(montoPozo * 0.08);
        } else {
            semifinalista = Math.round(montoPozo * 0.10);
        }
        cuartofinalista = Math.round(montoPozo * 0.05);
    } else if (tamanoCuadro === 8) {
        campeon = Math.round(montoPozo * 0.45);
        subcampeon = Math.round(montoPozo * 0.25);
        if (hayTercero) {
            tercerLugar = Math.round(montoPozo * 0.18);
            cuartoLugar = Math.round(montoPozo * 0.12);
        } else {
            semifinalista = Math.round(montoPozo * 0.15);
        }
    } else if (tamanoCuadro === 4) {
        if (hayTercero) {
            campeon = Math.round(montoPozo * 0.50);
            subcampeon = Math.round(montoPozo * 0.30);
            tercerLugar = Math.round(montoPozo * 0.20);
        } else {
            campeon = Math.round(montoPozo * 0.60);
            subcampeon = Math.round(montoPozo * 0.40);
        }
    } else if (tamanoCuadro !== 32) {
        throw new Error(`El cierre con reparto de premios no admite un cuadro de ${tamanoCuadro} participantes.`);
    }

    return { campeon, subcampeon, tercerLugar, cuartoLugar, semifinalista, cuartofinalista };
}

export function construirPremiosCierre(datos) {
    const {
        tamanoCuadro,
        pozo,
        final,
        tercerPuesto = null,
        semifinales = [],
        cuartos = []
    } = datos;
    if (!final?.ganador || !final?.perdedor) throw new Error('Registra la batalla final antes de cerrar el torneo.');

    const montos = calcularMontosPremio(tamanoCuadro, pozo, Boolean(tercerPuesto));
    const premios = [];
    agregarPremio(premios, final.ganador, montos.campeon, '🏆 Campeón');
    agregarPremio(premios, final.perdedor, montos.subcampeon, '🥈 Subcampeón');

    if (tercerPuesto) {
        if (montos.tercerLugar > 0) agregarPremio(premios, tercerPuesto.ganador, montos.tercerLugar, '🥉 Tercer Lugar');
        if (montos.cuartoLugar > 0) agregarPremio(premios, tercerPuesto.perdedor, montos.cuartoLugar, '🎖️ Cuarto Lugar');
    } else if (montos.semifinalista > 0) {
        if (semifinales.length !== 2) throw new Error('Faltan resultados de semifinal para repartir el premio de semifinalista.');
        semifinales.forEach(semifinal => agregarPremio(premios, semifinal.perdedor, montos.semifinalista, '🎖️ Semifinalista'));
    }

    if (tamanoCuadro >= 16) {
        if (cuartos.length !== 4) throw new Error('Faltan resultados de cuartos de final para repartir esos premios.');
        cuartos.forEach(cuarto => agregarPremio(premios, cuarto.perdedor, montos.cuartofinalista, '🏅 Cuartofinalista'));
    }

    return premios;
}

function resultadoBatalla(batalla) {
    if (['victoria', 'victoria_replica', 'victoria_total'].includes(batalla.resultado)) {
        return { ganador: batalla.mc1_id, perdedor: batalla.mc2_id };
    }
    if (['derrota', 'derrota_replica', 'derrota_total'].includes(batalla.resultado)) {
        return { ganador: batalla.mc2_id, perdedor: batalla.mc1_id };
    }
    return null;
}

export function reconstruirPremiosCierre(torneo, inscripciones, batallas) {
    const formato = String(torneo.formato || '');
    if (formato.toLocaleLowerCase().includes('liga')) return { esLiga: true, premios: [] };

    const tamanoGuardado = formato.match(/\b(4|8|16)\b/);
    const tamanoCuadro = inscripciones?.length || (tamanoGuardado ? Number(tamanoGuardado[1]) : 0);
    if (![4, 8, 16].includes(tamanoCuadro)) {
        throw new Error('No se pudo determinar un formato de eliminación compatible (4, 8 o 16 participantes).');
    }

    const batallasNormales = batallas.filter(batalla => batalla.resultado !== 'bono');
    const porFase = new Map(batallasNormales.map(batalla => [String(batalla.fase || '').trim().toLocaleUpperCase(), batalla]));
    const convertirResultado = fase => {
        const batalla = porFase.get(fase);
        return batalla ? resultadoBatalla(batalla) : null;
    };
    const final = convertirResultado('F');
    if (!final) throw new Error('No se puede cerrar el torneo todavía: falta registrar la final.');

    const batallaTercerPuesto = batallasNormales.find(batalla => {
        const fase = String(batalla.fase || '').trim().toLocaleLowerCase();
        return fase === '3p' || fase.includes('3er puesto') || fase.includes('tercer puesto');
    });
    const premios = construirPremiosCierre({
        tamanoCuadro,
        pozo: torneo.pozo_total,
        final,
        tercerPuesto: batallaTercerPuesto ? resultadoBatalla(batallaTercerPuesto) : null,
        semifinales: [convertirResultado('S1'), convertirResultado('S2')].filter(Boolean),
        cuartos: [1, 2, 3, 4].map(numero => convertirResultado(`C${numero}`)).filter(Boolean)
    });
    return { esLiga: false, premios };
}

export async function aplicarCierreTorneo(supabase, torneoId, premios) {
    const { data: bonosExistentes, error: errorBonos } = await supabase
        .from('batallas')
        .select('mc1_id, fase')
        .eq('torneo_id', torneoId)
        .eq('resultado', 'bono');
    if (errorBonos) throw errorBonos;

    const bonosRegistrados = bonosExistentes || [];
    let aplicados = 0;
    for (const premio of premios) {
        const yaAplicado = bonosRegistrados.some(bono =>
            String(bono.mc1_id) === String(premio.competidorId) && bono.fase === premio.fase);
        if (yaAplicado) continue;

        const { data: competidor, error: errorCompetidor } = await supabase
            .from('competidores')
            .select('elo_actual')
            .eq('id', premio.competidorId)
            .single();
        if (errorCompetidor || !competidor) throw errorCompetidor || new Error('No se encontró al beneficiario del premio.');

        const eloPrevio = Number(competidor.elo_actual) || 0;
        const { error: errorActualizacion } = await supabase
            .from('competidores')
            .update({ elo_actual: eloPrevio + premio.puntos })
            .eq('id', premio.competidorId);
        if (errorActualizacion) throw errorActualizacion;

        const { error: errorInsercion } = await supabase.from('batallas').insert([{
            torneo_id: torneoId,
            fase: premio.fase,
            mc1_id: premio.competidorId,
            mc2_id: premio.competidorId,
            resultado: 'bono',
            elo_previo_mc1: eloPrevio,
            elo_previo_mc2: eloPrevio,
            cambio_mc1: premio.puntos,
            cambio_mc2: 0
        }]);
        if (errorInsercion) {
            await supabase.from('competidores').update({ elo_actual: eloPrevio }).eq('id', premio.competidorId);
            throw errorInsercion;
        }
        bonosRegistrados.push({ mc1_id: premio.competidorId, fase: premio.fase });
        aplicados += 1;
    }

    const { error: errorEstado } = await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', torneoId);
    if (errorEstado) throw errorEstado;
    return { aplicados, omitidos: premios.length - aplicados };
}