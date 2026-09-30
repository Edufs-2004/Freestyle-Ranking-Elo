# Diseño técnico: Freestyle Power Ranking Elo

## 1. Propósito y alcance

Aplicación web para registrar competidores y torneos de freestyle, guardar resultados de batallas y calcular una clasificación Elo histórica. También ofrece consulta pública de leaderboard, perfiles e historial, además de herramientas administrativas para operar torneos y corregir el Elo.

Este documento describe la implementación presente y contrasta sus dependencias con el esquema SQL entregado. No propone cambios de tablas ni migraciones.

## 2. Arquitectura actual

### Componentes

- **Frontend multipágina estático:** páginas HTML independientes (`index.html`, `perfil.html`, `admin.html`, `roster.html`, `museo.html`, `login.html` y `batallas.html`). No hay framework de vistas ni proceso de compilación identificado. Los estilos están mayoritariamente embebidos en cada página; existe además `Css/style.css`.
- **Lógica cliente:** módulos ES en `js/`. Cada página importa el módulo que controla sus consultas y eventos. `calculadora.js` maneja la clasificación pública; `perfil.js`, las fichas públicas; `torneos.js`, creación y registro de resultados; `roster.js`, mantenimiento de competidores y ficha modal; `museo.js`, archivo, edición y recálculo; `login.js` y `auth.js`, sesión.
- **Persistencia y autenticación:** `js/supabase.js` crea el cliente con `@supabase/supabase-js` desde CDN y una clave publicable. La web consulta Supabase directamente desde el navegador mediante su API. Supabase Auth se usa para iniciar sesión administrativa.
- **Visualización:** Chart.js dibuja la progresión Elo en las fichas; `html2canvas` exporta fichas en el panel de roster y museo.

### Flujo de datos

1. El módulo compartido conecta el cliente a Supabase y centraliza la carga de franquicias.
2. La página pública consulta competidores y batallas. El leaderboard calcula universos filtrados en cliente; los filtros relacionan las batallas con `torneos` para aplicar franquicia y fecha.
3. El perfil se selecciona mediante `perfil.html?id=<competidor>`. El leaderboard y la búsqueda pública navegan a esa misma página. Al abrir una ficha, la grilla completa se oculta, la búsqueda queda compacta para cambiar de competidor y una acción permite volver al listado. La ficha incluye datos, métricas, gráfico e historial, sin controles de edición. El modal de ficha con acciones de exportación continúa siendo exclusivo de `roster.html`.
4. El área administrativa registra torneos, batallas, bonos y cambios de competidores. Los registros de Elo previo y cambio de puntos en cada batalla permiten reconstruir la historia; el museo ofrece un recálculo global.

## 3. Modelo relacional existente

| Tabla | Responsabilidad | Relaciones relevantes |
|---|---|---|
| `competidores` | Identidad pública, Elo actual, contador materializado, imagen y nacionalidad | Referenciada por batallas e inscripciones |
| `torneos` | Evento, estado, franquicia, formato y fecha; incluye valores calculados del torneo | Referenciada por batallas e inscripciones |
| `batallas` | Resultado, fase y snapshots de Elo/cambios | FK a torneo y a dos competidores |
| `inscripciones` | Asociación de participantes con torneos | FK a torneo y competidor |
| `franquicias` | Catálogo jerárquico de franquicias | `padre` referencia otra franquicia por nombre, no mediante FK |

La aplicación trata `batallas.resultado = 'bono'` como una fila de premio y no como un enfrentamiento. Esas filas usan `mc1_id` para el beneficiario y, en el flujo actual, repiten ese id en `mc2_id`. Por ello, no deben contar como batalla ni duplicar participación.

## 4. Comprobación de los requisitos

### Ficha pública desde leaderboard o búsqueda

La ruta está implementada. Las filas de `index.html` enlazan a `perfil.html?id=...`; las tarjetas y sugerencias de búsqueda en `perfil.html` llaman a `cargarPerfil(id)`. Al seleccionar, la página oculta la lista, conserva una búsqueda compacta y ofrece volver al listado; no abre un modal. La vista pública renderiza datos del competidor, Elo, posición, pico, total de batallas, porcentaje de victorias, gráfico e historial. No importa `roster.js` ni incluye controles de edición/borrado. El modal y las acciones administrativas están en `roster.html`.

### Leaderboard con al menos una batalla

El listado global ahora obtiene las filas de batalla no marcadas como `bono`, cuenta la participación de cada competidor y excluye a quienes no tengan registros. Esto usa `mc1_id`, `mc2_id` y `resultado`, existentes en el esquema. Los modos filtrados ya contaban participaciones a partir de las batallas del universo seleccionado. La columna de batallas muestra el conteo derivado del historial para el listado global, no el contador materializado, que puede quedar desactualizado.

## 5. Riesgos y problemas encontrados

### Prioridad alta: autorización de escritura

`auth.js` oculta ciertos elementos de interfaz cuando no hay sesión, pero eso no es un control de acceso. El navegador contiene la clave publicable y puede invocar directamente la API. La protección efectiva debe estar en políticas RLS de Supabase: lectura pública solo donde corresponda y escrituras limitadas a usuarios autorizados para todas las tablas modificables. El SQL entregado no incluye políticas RLS, por lo que no es posible confirmar que las escrituras estén protegidas. No publicar nunca una clave `service_role` en este frontend.

### Prioridad alta: HTML generado con datos sin escape

Algunas vistas construyen HTML con interpolación de valores provenientes de Supabase, como A.K.A., nombres de torneos y franquicias. Si alguno contiene marcado o atributos maliciosos, el navegador podría ejecutarlos al renderizar la página (XSS persistente). Renderizar texto con `textContent`/nodos DOM y validar URLs de imágenes; cuando se requiera HTML dinámico, escapar todos los valores o usar una plantilla segura.

### Prioridad alta: operaciones no transaccionales

El registro de una batalla actualiza dos competidores y luego inserta la batalla como solicitudes separadas; varios resultados de error no se comprueban. Un fallo intermedio puede dejar Elo, contador e historial discordantes. El cierre de torneo reparte varios bonos y actualiza el estado en pasos independientes. A futuro conviene mover cada operación lógica a una función RPC transaccional en PostgreSQL y comprobar su resultado.

### Prioridad alta: eliminaciones y valores materializados

Al borrar un torneo, `museo.js` elimina batallas e inscripciones y el torneo, pero no recalcula automáticamente Elo ni `batallas_totales`. El ranking basado únicamente en esos contadores podría conservar participantes y puntos que ya no corresponden. El leaderboard global se protegió contando las batallas existentes; el Elo global todavía puede permanecer obsoleto hasta ejecutar el recálculo del museo.

### Prioridad media: límites y orden de consultas

Las consultas de historial no paginan explícitamente y PostgREST puede limitar el número de filas devueltas. Con suficiente volumen, un cálculo hecho solo con el subconjunto descargado daría conteos o rankings parciales. Debe paginarse o trasladarse el cálculo a una vista/RPC cuando el volumen se acerque al límite configurado.

El orden histórico en varios perfiles se basa en la fecha del torneo, que puede repetirse o ser nula. Para resultados reproducibles, ordenar también por `batallas.id` (y definir una regla para torneos sin fecha).

### Prioridad media: columnas históricas anulables

El esquema permite `NULL` en Elo previo y cambios de batalla. En el modo histórico, expresiones como `elo_previo_mc1 + cambio_mc1` pueden producir valores nulos/incorrectos si hay filas incompletas. Se necesita validar/reparar los datos existentes y, a futuro, restricciones `NOT NULL` tras una migración controlada.

### Prioridad media: restricciones del dominio

Las FKs no impiden que una batalla normal tenga el mismo competidor en ambos lados, ni definen validación del conjunto de resultados. Las filas `bono` requieren una excepción de dominio. Validar esos casos en la escritura y en PostgreSQL reduciría datos incoherentes. `inscripciones` tampoco declara unicidad para `(torneo_id, competidor_id)`, de modo que el mismo competidor podría inscribirse dos veces.

### Prioridad baja: consultas acopladas al modelo

`franquicias.padre` guarda un nombre y no una FK; renombrar una franquicia padre puede dejar relaciones huérfanas. Una clave autorreferente sería más robusta, pero requeriría una migración y actualización de la lógica existente.

## 6. Recomendaciones de evolución

1. Verificar RLS y probar como anónimo y como administrador; proteger la escritura en la base, no solo en la interfaz.
2. Crear operaciones RPC transaccionales para registrar resultados, repartir premios, borrar/recalcular eventos y persistir cambios derivados.
3. Definir una única fuente de verdad para Elo y participaciones. Si se conservan campos materializados, mantenerlos dentro de la misma transacción y recalcularlos después de cualquier edición o eliminación.
4. Añadir paginación a lecturas históricas y orden determinista por fecha e id.
5. Tras corregir datos existentes, añadir restricciones e índices compatibles con el tráfico real, incluyendo FKs de `batallas` y la pareja única de inscripciones.
6. Incorporar pruebas de cálculo Elo, resultados invertidos por lado, bonos, filtros de fecha/franquicia y cero/una batalla.

## 7. Validación realizada

- Inspección estática de los puntos de entrada públicos, administrativos y módulos JavaScript relacionados.
- Prueba de navegador de solo lectura contra Supabase: 11 filas visibles en el leaderboard y todas con más de cero batallas; el click de una fila abre una ficha con métricas e historial.
- Prueba de búsqueda pública de `Elmenor`: abre la misma ficha y se encontraron cero controles de edición/borrado.
- `node --check js/calculadora.js` y diagnóstico del editor: sin errores.
- Algunas imágenes remotas devolvieron 403/bloqueos en el navegador integrado; los datos y la ficha cargaron correctamente.
- No se ejecutaron consultas de escritura ni se modificó el esquema de Supabase.
