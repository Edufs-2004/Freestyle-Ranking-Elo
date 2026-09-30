export function construirRankingHistorico(competidores, ledger) {
    return competidores
        .map(competidor => {
            const estado = ledger[competidor.id];
            return estado ? {
                id: competidor.id,
                aka: competidor.aka || '',
                elo: Number(estado.elo) || 0,
                batallas: Number(estado.batallas) || 0
            } : null;
        })
        .filter(competidor => competidor && competidor.batallas > 0)
        .sort((a, b) => b.elo - a.elo
            || a.aka.localeCompare(b.aka, 'es', { sensitivity: 'base' })
            || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
}

export function posicionRankingHistorico(ranking, idCompetidor) {
    const indice = ranking.findIndex(competidor => String(competidor.id) === String(idCompetidor));
    return indice === -1 ? '-' : indice + 1;
}

export function capturarRankingsPorEvento(competidores, batallas) {
    const ledger = Object.fromEntries(competidores.map(competidor => [competidor.id, { elo: 1500, batallas: 0 }]));
    const eventos = new Map();

    batallas.forEach(batalla => {
        const eventoId = batalla.torneo_id ?? `batalla-${batalla.id}`;
        if (!eventos.has(eventoId)) {
            eventos.set(eventoId, {
                id: eventoId,
                fecha: batalla.torneos?.fecha_evento || batalla.creado_en?.slice(0, 10) || '',
                batallas: []
            });
        }
        eventos.get(eventoId).batallas.push(batalla);
    });

    const eventosOrdenados = [...eventos.values()].sort((eventoIzquierdo, eventoDerecho) =>
        eventoIzquierdo.fecha.localeCompare(eventoDerecho.fecha)
        || String(eventoIzquierdo.id).localeCompare(String(eventoDerecho.id), 'en', { numeric: true }));

    return eventosOrdenados.map(evento => {
        evento.batallas.sort((batallaIzquierda, batallaDerecha) => Number(batallaIzquierda.id) - Number(batallaDerecha.id));
        evento.batallas.forEach(batalla => {
            const competidor1 = ledger[batalla.mc1_id];
            const competidor2 = ledger[batalla.mc2_id];
            if (competidor1) {
                const eloPrevio = Number(batalla.elo_previo_mc1);
                const cambio = Number(batalla.cambio_mc1) || 0;
                competidor1.elo = batalla.elo_previo_mc1 != null && Number.isFinite(eloPrevio) ? eloPrevio + cambio : competidor1.elo + cambio;
                if (batalla.resultado !== 'bono') competidor1.batallas += 1;
            }
            if (batalla.resultado !== 'bono' && competidor2) {
                const eloPrevio = Number(batalla.elo_previo_mc2);
                const cambio = Number(batalla.cambio_mc2) || 0;
                competidor2.elo = batalla.elo_previo_mc2 != null && Number.isFinite(eloPrevio) ? eloPrevio + cambio : competidor2.elo + cambio;
                competidor2.batallas += 1;
            }
        });
        return {
            eventoId: evento.id,
            fecha: evento.fecha,
            ranking: construirRankingHistorico(competidores, ledger)
        };
    });
}