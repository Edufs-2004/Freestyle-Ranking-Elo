export function obtenerFactorK(fase, factorBase = 32) {
    const faseNormalizada = String(fase || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const esPuestoMedallero = /\b(?:3(?:er|ro)|tercer|4to|cuarto)\s*(?:º|°)?\s*puesto\b/.test(faseNormalizada);
    return esPuestoMedallero ? factorBase / 2 : factorBase;
}