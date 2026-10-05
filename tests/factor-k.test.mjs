import test from 'node:test';
import assert from 'node:assert/strict';
import { obtenerFactorK } from '../js/factor-k.mjs';

test('reduce a la mitad el factor K para batallas de tercer y cuarto puesto', () => {
    assert.equal(obtenerFactorK('3er Puesto'), 16);
    assert.equal(obtenerFactorK('Tercer Puesto'), 16);
    assert.equal(obtenerFactorK('4to Puesto'), 16);
    assert.equal(obtenerFactorK('Cuarto Puesto'), 16);
});

test('mantiene el factor K normal en el resto de fases', () => {
    assert.equal(obtenerFactorK('Semifinal 1'), 32);
    assert.equal(obtenerFactorK('Final', 40), 40);
});