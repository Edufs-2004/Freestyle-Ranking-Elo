import test from 'node:test';
import assert from 'node:assert/strict';
import { crearMovimientosRanking, renderMovimientoRanking } from '../js/movimiento-ranking.mjs';

test('identifica subida, bajada, estabilidad y nuevo competidor', () => {
    const anterior = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const actual = [{ id: 2 }, { id: 1 }, { id: 3 }, { id: 4 }];
    const cambios = crearMovimientosRanking(anterior, actual);
    assert.deepEqual(cambios.get('2'), { tipo: 'up', puestos: 1 });
    assert.deepEqual(cambios.get('1'), { tipo: 'down', puestos: 1 });
    assert.deepEqual(cambios.get('3'), { tipo: 'same', puestos: 0 });
    assert.deepEqual(cambios.get('4'), { tipo: 'new', puestos: 0 });
});

test('renderiza movimiento compacto y con color semántico', () => {
    assert.match(renderMovimientoRanking({ tipo: 'up', puestos: 2 }), /color:#2ed573/);
    assert.match(renderMovimientoRanking({ tipo: 'down', puestos: 1 }), /color:#ff4757/);
    assert.match(renderMovimientoRanking({ tipo: 'same', puestos: 0 }), />-<\/span>/);
    assert.match(renderMovimientoRanking({ tipo: 'new', puestos: 0 }), />NEW<\/span>/);
});