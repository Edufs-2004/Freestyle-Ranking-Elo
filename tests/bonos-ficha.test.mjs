import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularBonosDeUltimaBatalla } from '../js/bonos-ficha.mjs';

test('asigna el bono al semifinalista en su última batalla normal', () => {
    const batallas = [
        { id: 10, resultado: 'victoria', mc1_id: 1, mc2_id: 2 },
        { id: 11, resultado: 'victoria', mc1_id: 3, mc2_id: 4 },
        { id: 12, resultado: 'victoria', mc1_id: 1, mc2_id: 3 },
        { id: 13, resultado: 'victoria', mc1_id: 2, mc2_id: 4 },
        { id: 14, resultado: 'victoria', mc1_id: 1, mc2_id: 2 },
        { id: 15, resultado: 'bono', mc1_id: 3, mc2_id: 3, cambio_mc1: 12 },
        { id: 16, resultado: 'bono', mc1_id: 4, mc2_id: 4, cambio_mc1: 12 }
    ];
    assert.deepEqual(calcularBonosDeUltimaBatalla(batallas, 12, 3, 1), { mc1: 12, mc2: 0 });
});

test('no asigna el bono a una batalla anterior ni duplica mc2 del registro bono', () => {
    const batallas = [
        { id: 1, resultado: 'victoria', mc1_id: 1, mc2_id: 2 },
        { id: 2, resultado: 'victoria', mc1_id: 1, mc2_id: 3 },
        { id: 3, resultado: 'bono', mc1_id: 1, mc2_id: 1, cambio_mc1: 8, cambio_mc2: 8 }
    ];
    assert.deepEqual(calcularBonosDeUltimaBatalla(batallas, 1, 1, 2), { mc1: 0, mc2: 0 });
    assert.deepEqual(calcularBonosDeUltimaBatalla(batallas, 2, 1, 3), { mc1: 8, mc2: 0 });
});

test('el universo aislado mantiene su regla de ignorar bonos', () => {
    const batallas = [
        { id: 1, resultado: 'victoria', mc1_id: 1, mc2_id: 2 },
        { id: 2, resultado: 'bono', mc1_id: 1, mc2_id: 1, cambio_mc1: 8 }
    ];
    assert.deepEqual(calcularBonosDeUltimaBatalla(batallas, 1, 1, 2, true), { mc1: 0, mc2: 0 });
});