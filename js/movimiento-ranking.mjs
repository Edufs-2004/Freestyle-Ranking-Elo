export function crearMovimientosRanking(rankingPrevio, rankingActual) {
    const posicionesPrevias = new Map((rankingPrevio || []).map((competidor, index) => [String(competidor.id), index + 1]));
    const movimientos = new Map();

    (rankingActual || []).forEach((competidor, index) => {
        const posicionActual = index + 1;
        const posicionPrevia = posicionesPrevias.get(String(competidor.id));
        if (posicionPrevia === undefined) {
            movimientos.set(String(competidor.id), { tipo: 'new', puestos: 0 });
            return;
        }
        const puestos = posicionPrevia - posicionActual;
        movimientos.set(String(competidor.id), {
            tipo: puestos > 0 ? 'up' : puestos < 0 ? 'down' : 'same',
            puestos: Math.abs(puestos)
        });
    });

    return movimientos;
}

export function renderMovimientoRanking(movimiento) {
    if (!movimiento) return '';
    if (movimiento.tipo === 'new') return '<span title="Nuevo en el ranking" style="color:#eccc68; font-size:10px; margin-left:4px; white-space:nowrap;">NEW</span>';
    if (movimiento.tipo === 'up') return `<span title="Subió ${movimiento.puestos} puestos" style="color:#2ed573; font-size:11px; margin-left:4px; white-space:nowrap;">↑${movimiento.puestos}</span>`;
    if (movimiento.tipo === 'down') return `<span title="Bajó ${movimiento.puestos} puestos" style="color:#ff4757; font-size:11px; margin-left:4px; white-space:nowrap;">↓${movimiento.puestos}</span>`;
    return '<span title="Mantuvo su posición" style="color:#a4b0be; font-size:11px; margin-left:4px; white-space:nowrap;">-</span>';
}