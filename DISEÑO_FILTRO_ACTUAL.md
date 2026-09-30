# Diseño de desarrollo: filtro «Actual»

## Estado

Implementación en curso. El filtro Actual es de solo lectura: no modifica el Elo oficial, el esquema SQL ni los cálculos de los modos Global y Aislado.

## Objetivo

Agregar un modo independiente llamado **Actual** para mostrar un ranking ponderado por vigencia. Conserva el valor completo de las contribuciones de los últimos 24 meses y reduce en 10 puntos porcentuales por cada mes completo posterior. El periodo máximo considerado es de 34 meses: 24 meses al 100% y hasta 10 meses en degradación.

El modo es una vista de cálculo, no una edición del Elo oficial almacenado ni del historial de batallas.

## Decisiones de cálculo propuestas

### Fecha de referencia

- Usar la fecha seleccionada en el control existente **Hasta** como fecha de corte cuando tenga valor.
- Si **Hasta** está vacío, usar la fecha actual en UTC.
- Tratar las fechas como fechas calendario (`YYYY-MM-DD`) y hacer aritmética de meses calendario, no aproximar cada mes como 30 días.
- El control **Desde**, cuando se use, restringe adicionalmente el conjunto de eventos, pero no cambia la edad ni la ponderación de las contribuciones.
- Los filtros de franquicia continúan aplicándose como intersección con este modo.

### Ventana y ponderación

Se propone una degradación lineal acumulativa: cada mes completo después de cumplir 24 meses resta 0.10 del peso original.

| Edad del evento a la fecha de corte | Peso |
|---|---:|
| Hasta 24 meses | 100% |
| 25 meses completos | 90% |
| 26 meses completos | 80% |
| 27 meses completos | 70% |
| 28 meses completos | 60% |
| 29 meses completos | 50% |
| 30 meses completos | 40% |
| 31 meses completos | 30% |
| 32 meses completos | 20% |
| 33 meses completos | 10% |
| 34 meses o más | 0%, fuera del ranking |

Fórmula conceptual para una contribución con `m` meses completos de antigüedad más allá de los primeros 24:

`peso = max(0, 1 - 0.10 * m)`

El mes se considera completo al alcanzar el mismo día calendario de cada mes; si el mes no tiene ese día, se usa el último día de ese mes. Antes de cumplir el siguiente mes completo se conserva el peso del tramo anterior.

> **Interpretación confirmada:** la degradación es lineal sobre el cambio Elo original de cada competencia, no compuesta sobre el saldo restante. Por ejemplo, una competencia que otorgó `+20` aporta `+20` hasta los 24 meses, `+18` al cumplir 25 meses, `+16` al cumplir 26, y así sucesivamente hasta aportar `0` al cumplir 34 meses. Una contribución negativa se acerca igualmente a cero: por ejemplo, `-20`, `-18`, `-16`, etc.

### Fuente de puntos

Usar las columnas ya existentes de cambios Elo de `batallas`, sin volver a simular el Elo:

- Batalla normal: `cambio_mc1` se atribuye a `mc1_id` y `cambio_mc2` a `mc2_id`, cada uno con el peso de la fecha del torneo.
- Premio `resultado = 'bono'`: atribuir una sola vez `cambio_mc1` a `mc1_id`. No contar `mc2_id` aunque repita al beneficiario.
- Excluir registros cuya ponderación sea cero.
- No modificar `competidores.elo_actual`, `competidores.batallas_totales` ni ninguna fila de `batallas`.

Para cada competidor:

`puntaje_actual = 1500 + suma(cambio_elo * peso)`

Redondear solo el resultado mostrado, una vez terminada la suma. El ranking se ordena por puntaje descendente y, en empate, por `aka` para obtener resultados deterministas. Este número es un **puntaje de vigencia derivado**, no un nuevo Elo histórico ni una predicción de Elo recalculado.

### Fecha del evento

- Prioridad: `torneos.fecha_evento`, que es una fecha calendario y corresponde a la fecha deportiva.
- Si esa fecha es nula y la batalla tiene `creado_en`, usar la fecha UTC de `batallas.creado_en` como alternativa explícita.
- Si ambas faltan, excluir la contribución del filtro Actual y contabilizarla como dato sin fecha para diagnóstico.

### Quién aparece y métricas

- Incluir solo competidores con al menos una batalla normal con peso mayor que cero dentro del universo seleccionado. Los bonos no cuentan como participación.
- Mostrar puntaje Actual y número de batallas normales consideradas. Opcionalmente presentar por separado los bonos ponderados para que su efecto sea auditable.
- Si no quedan registros tras franquicia, fechas y ventana de vigencia, mostrar un estado vacío; no completar el ranking con participantes sin actividad.

## Integración aislada en la aplicación

1. Añadir la opción **Actual** al selector de modo del leaderboard; no reemplazar ni renombrar **Línea Temporal (Global)** ni **Universo Aislado**.
2. Implementar el cálculo como una función independiente y pura, que reciba competidores, batallas, fecha de corte y filtros y devuelva filas ordenadas. No alterar el cálculo ni los datos usados por los otros dos modos.
3. Resolver el modo Actual en una rama nueva del manejador del leaderboard. Mantener intactos los caminos existentes de modo histórico y aislado.
4. Conservar la navegación por fila hacia `perfil.html?id=...`. El modo Actual no debe cambiar los filtros, gráficas ni cálculos existentes de la ficha.
5. Mantener lectura solamente. No añadir tablas, columnas, RPC ni escrituras a Supabase para esta funcionalidad.
6. Asegurar que las consultas recuperen todas las batallas de la ventana mediante paginación; no asumir que una única respuesta de PostgREST contiene el historial completo.
7. Mostrar en el encabezado la fecha de corte efectiva para que el usuario entienda por qué el resultado puede cambiar con el tiempo.

## Hoja de ruta de implementación

La implementación se divide en fases pequeñas. Cada fase debe conservar los modos y datos oficiales existentes; no se cambia el Elo almacenado ni se amplía a herramientas administrativas.

**Estado actual:** fases 1 a 4 implementadas. La fase 5 verificó las siete pruebas automatizadas, el cálculo del 90% en leaderboard y perfil, y el retorno a Global/Aislado. Queda pendiente confirmar visualmente el trazado del gráfico en un entorno que cargue Chart.js: el navegador de esta sesión bloqueó su CDN y el canvas quedó vacío también en Global, por lo que no es una regresión exclusiva de Actual.

1. **Contrato y cálculo puro:** implementar fechas calendario, degradación lineal, filtro de universo y ranking a partir de `cambio_mc1`/`cambio_mc2`. Cubrir límites de 24 a 34 meses, meses cortos, fechas alternativas y bonos con pruebas automatizadas.
2. **Leaderboard Actual:** agregar la opción sin reemplazar Global ni Aislado; aplicar franquicia, Desde y Hasta; descargar el historial paginado; presentar puntaje, batallas normales, fecha de corte y estados separados de error y conjunto vacío.
3. **Perfil Actual:** ofrecer el modo Actual dentro de los filtros del perfil público; graficar el saldo de contribuciones ponderadas a la misma fecha de corte y mostrar en el historial cambio original, peso y cambio degradado. Mantener intactas las ramas Global y Aislado y la ficha/modal administrativa.
4. **Integridad de la experiencia:** comprobar fallback de fecha, navegación a perfiles, filtros combinados, participantes sin batallas elegibles, empate determinista y ausencia de escrituras.
5. **Verificación final de regresión:** probar Global y Aislado con los mismos casos antes/después y confirmar que mantienen sus resultados; ejecutar pruebas del cálculo Actual, revisar los estados de lectura/error/vacío y comprobar manualmente leaderboard, gráfica e historial del perfil en navegador.

La fase 5 es una puerta de cierre: no se considera terminado el filtro hasta que los dos modos anteriores sigan funcionando y el nuevo modo cumpla su contrato de ponderación en leaderboard y perfil.

## Pruebas de aceptación

- Con contribuciones de 24 meses o menos, cada cambio conserva el 100% de su valor.
- En la fecha exacta de cada mes completo posterior, el peso baja 10 puntos porcentuales y el puntaje coincide con la tabla de pesos.
- Una contribución con 34 meses completos o más no aparece ni afecta el puntaje.
- Un bono suma su cambio una sola vez y no incrementa el total de batallas normales.
- Una fecha **Hasta** seleccionada determina la referencia; sin ella, se usa la fecha UTC actual.
- **Desde** y franquicia reducen el universo sin alterar la ponderación por antigüedad.
- Participantes sin batallas elegibles y resultados con peso cero no aparecen.
- Empates producen el mismo orden en recargas sucesivas.
- El resultado de Global e Isolated es idéntico antes y después de incorporar Actual para los mismos datos y filtros.
- La ficha pública conserva su navegación y no recibe controles administrativos.
- Error de lectura y conjunto vacío se muestran como estados distintos; ninguno debe producir una tabla parcial silenciosamente.

## Riesgos y preguntas antes de implementar

- La degradación lineal del cambio original está confirmada: resta 10 puntos porcentuales del cambio original por cada mes completo posterior a los primeros 24 y llega a cero al cumplir 34 meses.
- Confirmar si los bonos deben integrar el puntaje. La propuesta los incluye porque son cambios Elo registrados, pero los excluye del conteo de batallas.
- Confirmar la regla de fecha nula. La propuesta usa `batallas.creado_en` solo como fallback, no `torneos.creado_en`.
- El puntaje propuesto suma cambios históricos ponderados desde una base fija de 1500. Si el producto espera conservar el Elo inicial real de cada competidor, se debe definir ese dato antes de implementar; el esquema no contiene una columna de Elo inicial.
- El cálculo en navegador depende de descargas completas y paginadas. Si el historial crece, convendrá mover el cálculo a una función de lectura del servidor, manteniendo exactamente este contrato y sin mezclarlo con la escritura/transacción del Elo oficial.
