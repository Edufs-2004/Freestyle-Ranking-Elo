# Hoja de ruta: auditoría de fichas de batalla

## Alcance

La ficha pública de análisis de batalla se genera desde el Museo (`abrirAnalisisBatalla`). El historial público del perfil y el modal de roster son superficies relacionadas, pero no comparten exactamente las mismas métricas. La primera corrección se limita a posiciones históricas; no modifica resultados, cambios Elo almacenados, simulación aislada ni escrituras a Supabase.

## Hallazgos

1. **Posiciones infladas por perfiles sin actividad:** el ledger inicializa todos los competidores en 1500 y las tablas de ranking previo/posterior los ordenan a todos. El leaderboard visible excluye a quienes no han disputado una batalla normal, por lo que las posiciones de la ficha no coinciden con el leaderboard. El mismo problema afecta al cálculo de mejor posición histórica.
2. **Sin ranking antes del debut:** un competidor con cero batallas puede recibir un puesto artificial aunque su Elo previo sea 1500. La posición debe ser `-` hasta que tenga al menos una batalla normal anterior; no debe inferirse solo por el valor Elo, porque un atleta activo puede volver a 1500.
3. **Empates no deterministas:** las listas internas ordenan solo por Elo. Un segundo criterio estable, A.K.A. y luego ID, evita que la posición cambie entre ejecuciones.
4. **Dos momentos distintos en una misma ficha:** “Ranking Previo” se toma justo antes de la batalla objetivo, mientras “Ranking al Finalizar” se toma al cierre de la fase. La variación mostrada puede incluir otras batallas de esa fase. Debe conservarse el significado actual o acordarse una métrica estrictamente posterior a la batalla antes de cambiar esa etiqueta/cálculo.
5. **Historial potencialmente incompleto:** las lecturas del análisis no verifican todos los errores y no implementan paginación. Si PostgREST limita el número de filas, la ficha puede calcular posiciones con un universo parcial sin avisar.
6. **Orden histórico implícito:** los torneos se ordenan por fecha, y las batallas por ID dentro del torneo; fechas nulas o torneos en la misma fecha pueden dejar ambiguo el orden cronológico entre torneos.
7. **Cifras con fuentes diferentes:** en el modo histórico se muestran los cambios Elo guardados, mientras el ledger vuelve a sumar cambios para construir rangos. Una reparación/recalculo incompleto puede hacer que el Elo mostrado y la posición reconstruida no correspondan al mismo estado. Conviene diagnosticar diferencias, no corregirlas automáticamente al abrir una ficha.

## Fases

**Estado:** fase 1 implementada y probada; fases 2 a 5 quedan como hoja de ruta.

1. **Corrección acotada de ranking:** incluir únicamente participantes con batallas normales anteriores en posiciones previa, posterior y mejor histórica; mostrar `-` antes del debut; ordenar empates por A.K.A. e ID. Mantener igual la fase y las reglas de Elo. Implementada en la ficha del Museo.
2. **Contrato de momentos:** decidir y documentar si el movimiento compara pre-batalla contra post-batalla, o pre-batalla contra cierre de fase. Añadir pruebas para fases con varias batallas y no mezclar ambos conceptos en una misma etiqueta.
3. **Integridad de lecturas y orden:** revisar errores de Supabase, paginar torneos/batallas, no renderizar fichas parciales, y fijar un orden cronológico total con política explícita para fechas nulas y eventos simultáneos.
4. **Consistencia entre superficies:** comparar ficha del Museo, historial del perfil y modal de roster; acordar cuáles muestran Elo, posición y métricas históricas. Reutilizar el helper de posiciones solo donde el contrato sea idéntico, sin introducir el filtro Actual en fichas oficiales.
5. **Regresión y optimización:** probar debutantes, Elo 1500 con actividad, empates, bonos, varias batallas por fase, registros tardíos, universo aislado y errores de lectura. Optimizar/compartir simulación solo tras fijar resultados de referencia.

## Criterios de aceptación de la fase 1

- Un competidor con cero batallas normales anteriores muestra `-` como ranking previo, aunque su Elo previo sea 1500.
- Solo participantes con al menos una batalla normal previa ocupan posiciones; las posiciones son consecutivas.
- Competidores activos empatados ordenan por A.K.A. y luego ID de manera reproducible.
- La posición posterior y la mejor posición usan el mismo universo activo que el leaderboard.
- Los cambios Elo, la simulación aislada, la ficha pública de perfil y los datos almacenados permanecen intactos.