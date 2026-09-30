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