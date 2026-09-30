import test from 'node:test';
import assert from 'node:assert/strict';
import { construirRankingHistorico, posicionRankingHistorico } from '../js/ranking-historico.mjs';

test('excluye perfiles sin batallas aunque tengan elo inicial de 1500', () => {
    const competidores = [
        { id: 1, aka: 'Primero' },
        { id: 2, aka: 'Nuevo' },
        { id: 3, aka: 'Segundo' }
    ];
    const ledger = {
        1: { elo: 1510, batallas: 1 },
        2: { elo: 1500, batallas: 0 },
        3: { elo: 1490, batallas: 1 }
    };
    const ranking = construirRankingHistorico(competidores, ledger);
    assert.deepEqual(ranking.map(mc => mc.id), [1, 3]);
    assert.equal(posicionRankingHistorico(ranking, 2), '-');
});

test('asigna posiciones consecutivas según el leaderboard previo activo', () => {
    const competidores = [
        { id: 1, aka: 'Atleta A' },
        { id: 2, aka: 'Atleta B' },
        { id: 3, aka: 'Atleta Nuevo' }
    ];
    const ledger = {
        1: { elo: 1500, batallas: 3 },
        2: { elo: 1510, batallas: 2 },
        3: { elo: 1500, batallas: 0 }
    };
    const ranking = construirRankingHistorico(competidores, ledger);
    assert.equal(posicionRankingHistorico(ranking, 2), 1);
    assert.equal(posicionRankingHistorico(ranking, 1), 2);
});

test('resuelve empates de elo de forma estable por AKA', () => {
    const competidores = [{ id: 1, aka: 'Zeta' }, { id: 2, aka: 'alfa' }];
    const ledger = { 1: { elo: 1500, batallas: 1 }, 2: { elo: 1500, batallas: 1 } };
    assert.deepEqual(construirRankingHistorico(competidores, ledger).map(mc => mc.aka), ['alfa', 'Zeta']);
});