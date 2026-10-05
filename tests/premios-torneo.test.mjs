import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarCierreTorneo, calcularMontosPremio, construirPremiosCierre, reconstruirPremiosCierre } from '../js/premios-torneo.mjs';

test('mantiene porcentajes actuales para 16, 8 y 4 participantes', () => {
    assert.deepEqual(calcularMontosPremio(16, 1000, false), {
        campeon: 400, subcampeon: 200, tercerLugar: 0, cuartoLugar: 0, semifinalista: 100, cuartofinalista: 50
    });
    assert.deepEqual(calcularMontosPremio(8, 1000, true), {
        campeon: 450, subcampeon: 250, tercerLugar: 180, cuartoLugar: 120, semifinalista: 0, cuartofinalista: 0
    });
    assert.deepEqual(calcularMontosPremio(4, 1000, false), {
        campeon: 600, subcampeon: 400, tercerLugar: 0, cuartoLugar: 0, semifinalista: 0, cuartofinalista: 0
    });
});

test('sin batalla de tercer puesto reparte consolación a los dos perdedores de semifinal', () => {
    const premios = construirPremiosCierre({
        tamanoCuadro: 8,
        pozo: 1000,
        final: { ganador: 1, perdedor: 2 },
        semifinales: [{ perdedor: 3 }, { perdedor: 4 }]
    });
    assert.deepEqual(premios.map(premio => [premio.competidorId, premio.puntos, premio.fase]), [
        [1, 450, '🏆 Campeón'], [2, 250, '🥈 Subcampeón'],
        [3, 150, '🎖️ Semifinalista'], [4, 150, '🎖️ Semifinalista']
    ]);
});

test('bloquea cierre de eliminación si falta final o fases requeridas de premios', () => {
    assert.throws(() => reconstruirPremiosCierre({ formato: '8 MCs', pozo_total: 100 }, [], []), /falta registrar la final/i);
    assert.throws(() => construirPremiosCierre({
        tamanoCuadro: 16, pozo: 100, final: { ganador: 1, perdedor: 2 }, semifinales: [{ perdedor: 3 }]
    }), /faltan resultados de semifinal/i);
});

test('detecta ligas como cierre sin premios', () => {
    assert.deepEqual(reconstruirPremiosCierre({ formato: 'Modo Liga (Jornadas)' }, [], []), { esLiga: true, premios: [] });
});

test('reconstruye reparto completo de 16 participantes desde resultados guardados', () => {
    const batallas = [
        { fase: 'C1', resultado: 'victoria', mc1_id: 1, mc2_id: 2 },
        { fase: 'C2', resultado: 'victoria', mc1_id: 3, mc2_id: 4 },
        { fase: 'C3', resultado: 'victoria', mc1_id: 5, mc2_id: 6 },
        { fase: 'C4', resultado: 'victoria', mc1_id: 7, mc2_id: 8 },
        { fase: 'S1', resultado: 'victoria', mc1_id: 1, mc2_id: 3 },
        { fase: 'S2', resultado: 'victoria', mc1_id: 5, mc2_id: 7 },
        { fase: 'F', resultado: 'victoria', mc1_id: 1, mc2_id: 5 }
    ];
    const inscripciones = Array.from({ length: 16 }, (_, index) => ({ competidor_id: index + 1 }));
    const cierre = reconstruirPremiosCierre({ formato: '16 MCs (Estándar)', pozo_total: 1000 }, inscripciones, batallas);
    assert.equal(cierre.esLiga, false);
    assert.deepEqual(cierre.premios.map(premio => [premio.competidorId, premio.puntos]), [
        [1, 400], [5, 200], [3, 100], [7, 100], [2, 50], [4, 50], [6, 50], [8, 50]
    ]);
});

test('un cierre reintentado no vuelve a sumar premios ya registrados', async () => {
    const estado = { elo: new Map([[1, 1500]]), bonos: [], torneo: 'En Curso' };
    const clienteSupabase = {
        from(tabla) {
            return {
                select() {
                    this.operacion = 'select';
                    this.tabla = tabla;
                    return this;
                },
                update(valores) {
                    this.operacion = 'update';
                    this.tabla = tabla;
                    this.valores = valores;
                    return this;
                },
                eq(columna, valor) {
                    this.filtros ||= {};
                    this.filtros[columna] = valor;
                    return this;
                },
                single: async function() {
                    return { data: { elo_actual: estado.elo.get(this.filtros.id) }, error: null };
                },
                insert: async function(filas) {
                    estado.bonos.push(...filas);
                    return { error: null };
                },
                then(resolve) {
                    if (this.operacion === 'update') {
                        if (tabla === 'competidores') estado.elo.set(this.filtros.id, this.valores.elo_actual);
                        if (tabla === 'torneos') estado.torneo = this.valores.estado;
                        return Promise.resolve({ error: null }).then(resolve);
                    }
                    const filas = tabla === 'batallas'
                        ? estado.bonos.filter(fila => String(fila.torneo_id) === String(this.filtros.torneo_id)
                            && fila.resultado === this.filtros.resultado)
                        : [];
                    return Promise.resolve({ data: filas, error: null }).then(resolve);
                }
            };
        }
    };
    const premios = [{ competidorId: 1, puntos: 100, fase: '🏆 Campeón' }];

    await aplicarCierreTorneo(clienteSupabase, 7, premios);
    await aplicarCierreTorneo(clienteSupabase, 7, premios);

    assert.equal(estado.elo.get(1), 1600);
    assert.equal(estado.bonos.length, 1);
    assert.equal(estado.torneo, 'Finalizado');
});

test('conserva el cierre legado de 32 sin inventar porcentajes nuevos', () => {
    const premios = construirPremiosCierre({
        tamanoCuadro: 32,
        pozo: 1000,
        final: { ganador: 1, perdedor: 2 },
        cuartos: [3, 4, 5, 6].map(perdedor => ({ perdedor }))
    });
    assert.deepEqual(premios.map(premio => premio.puntos), [0, 0, 0, 0, 0, 0]);
});