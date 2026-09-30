export function calcularBonosDeUltimaBatalla(batallasTorneo, idBatallaObjetivo, mc1Id, mc2Id, ignorarBonos = false) {
    if (ignorarBonos) return { mc1: 0, mc2: 0 };

    const ultimasBatallas = new Map();
    batallasTorneo
        .filter(batalla => batalla.resultado !== 'bono')
        .sort((batallaIzquierda, batallaDerecha) => Number(batallaIzquierda.id) - Number(batallaDerecha.id))
        .forEach(batalla => {
            ultimasBatallas.set(String(batalla.mc1_id), String(batalla.id));
            ultimasBatallas.set(String(batalla.mc2_id), String(batalla.id));
        });

    const premios = new Map();
    batallasTorneo.filter(batalla => batalla.resultado === 'bono').forEach(batalla => {
        const idBeneficiario = String(batalla.mc1_id);
        premios.set(idBeneficiario, (premios.get(idBeneficiario) || 0) + (Number(batalla.cambio_mc1) || 0));
    });

    const obtenerPremio = idCompetidor => ultimasBatallas.get(String(idCompetidor)) === String(idBatallaObjetivo)
        ? premios.get(String(idCompetidor)) || 0
        : 0;

    return {
        mc1: obtenerPremio(mc1Id),
        mc2: obtenerPremio(mc2Id)
    };
}