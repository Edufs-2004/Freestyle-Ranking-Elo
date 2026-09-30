import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarTodasLasFilas, calcularPesoActual, calcularRankingActual, fechaEventoActual } from '../js/actual.mjs';

test('aplica el peso lineal desde los 24 hasta los 34 meses', () => {
    const pesos = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
    const evento = new Date(Date.UTC(2024, 0, 15));
    pesos.forEach((peso, edadMeses) => {
        const corte = new Date(Date.UTC(2026, 0 + edadMeses, 15)).toISOString().slice(0, 10);
        assert.equal(calcularPesoActual(evento.toISOString().slice(0, 10), corte), peso);
    });
});

test('completa meses calendario al último día cuando no existe el mismo día', () => {
    assert.equal(calcularPesoActual('2024-01-31', '2026-02-27'), 1);
    assert.equal(calcularPesoActual('2024-01-31', '2026-02-28'), 0.9);
});

test('usa fecha de torneo primero y creado_en como alternativa', () => {
    assert.equal(fechaEventoActual({ torneos: { fecha_evento: '2024-04-05' }, creado_en: '2024-04-06T01:00:00Z' }), '2024-04-05');
    assert.equal(fechaEventoActual({ torneos: { fecha_evento: null }, creado_en: '2024-04-06T01:00:00Z' }), '2024-04-06');
    assert.equal(fechaEventoActual({ torneos: null, creado_en: null }), null);
});

test('pondera cambios y bonos una vez, sin contar bonos como batallas', () => {
    const competidores = [{ id: 1, aka: 'Alpha' }, { id: 2, aka: 'Beta' }];
    const batallas = [
        { mc1_id: 1, mc2_id: 2, resultado: 'victoria', cambio_mc1: 20, cambio_mc2: -20, fecha_actual: '2024-02-15' },
        { mc1_id: 1, mc2_id: 1, resultado: 'bono', cambio_mc1: 5, cambio_mc2: 5, fecha_actual: '2024-02-15' }
    ];
    const ranking = calcularRankingActual(competidores, batallas, '2026-03-15');
    assert.deepEqual(ranking.map(mc => [mc.aka, mc.puntaje_actual, mc.batallas_actuales, mc.bonos_actuales]), [
        ['Alpha', 1522.5, 1, 4.5],
        ['Beta', 1482, 1, 0]
    ]);
});

test('página el historial hasta recibir un lote incompleto', async () => {
    const rangos = [];
    const filas = await cargarTodasLasFilas({
        range: async (inicio, fin) => {
            rangos.push([inicio, fin]);
            return { data: inicio === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], error: null };
        }
    }, 2);
    assert.deepEqual(rangos, [[0, 1], [2, 3]]);
    assert.deepEqual(filas.map(fila => fila.id), [1, 2, 3]);
});

test('no devuelve páginas parciales cuando una página falla', async () => {
    await assert.rejects(cargarTodasLasFilas({
        range: async inicio => inicio === 0
            ? { data: [{ id: 1 }, { id: 2 }], error: null }
            : { data: null, error: new Error('fallo de lectura') }
    }, 2), /fallo de lectura/);
});

test('excluye batallas con peso cero y desempata por AKA', () => {
    const competidores = [{ id: 1, aka: 'Beta' }, { id: 2, aka: 'Alpha' }, { id: 3, aka: 'Fuera' }];
    const batallas = [
        { mc1_id: 1, mc2_id: 2, resultado: 'victoria', cambio_mc1: 0, cambio_mc2: 0, fecha_actual: '2024-11-15' },
        { mc1_id: 3, mc2_id: 3, resultado: 'victoria', cambio_mc1: 20, cambio_mc2: -20, fecha_actual: '2024-01-15' }
    ];
    assert.deepEqual(calcularRankingActual(competidores, batallas, '2026-11-15').map(mc => mc.aka), ['Alpha', 'Beta']);
});