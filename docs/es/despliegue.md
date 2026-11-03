# Mergear y hacerse cargo

El review cuesta menos cuando el agente y los reviewers hacen más parte del trabajo, pero alguien tiene que hacerse cargo de lo que llega a producción. En este loop es la persona que dirigió al agente: **lo mergeás, es tuyo**. Los reviewers revisaron el cambio; no siguen su despliegue ni lo revierten.

## Qué dice cada PR

`/sdlc-ship` escribe tres secciones en la descripción, y `sdlc/gates` queda en rojo sin ellas:

| Sección | Qué lleva |
|---|---|
| `## Pruebas` | Qué se corrió y cómo: salida de build, test y lint, el veredicto del verifier, pruebas manuales. |
| `## Riesgo` | El nivel de `sdlc risk` (low, medium o high) y por qué. Nunca menor que el calculado. |
| `## Cómo revertir` | Revertir el PR, apagar un flag, correr el paso down de una migración. Decilo cuando algo no se puede deshacer. |

También valen los títulos en inglés (`## Testing`, `## Risk`, `## How to revert`). `ci.pr_sections` cambia la lista; `[]` apaga el control. Solo se evalúa cuando todo lo demás de `sdlc/gates` está en verde, así que nunca tapa un gate pendiente.

## Desplegar por etapas

Mergear no es liberar. Para cualquier cosa por encima de low, separá las dos:

- **Feature flags.** Poné el comportamiento nuevo detrás de un flag apagado por defecto, mergeá, prendelo para pocos usuarios y después para todos. "Cómo revertir" pasa a ser "apagar el flag": tarda segundos y no necesita deploy. Sacá el flag en un cambio posterior, cuando ya esté prendido para todos.
- **Release escalonado.** Desplegá primero a un canary o a un porcentaje chico, compará su tasa de errores y su latencia con el resto, y después ampliá. Las [control bands](../reference/bands) (`sdlc bands check`) miran las mismas métricas después del merge.
- **Pasos irreversibles.** Las migraciones de datos, las llamadas externas y los contratos publicados no se revierten con el PR. Separalos: primero una migración aditiva, después el código que la usa, al final la limpieza.

## Merge queue

Con muchas PRs de agentes, una [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) prueba cada PR encima de las que tiene adelante, así dos PRs en verde no pueden romper `main` juntas.

1. Activala en la regla de branch protection (o el ruleset) de la rama principal.
2. Las plantillas ya corren en `merge_group`: `ci.yml` buildea y testea el commit de la cola, y el job `queue` de `sdlc-gates.yml` corre `sdlc ci merge-queue`, que pone `sdlc/gates` y `sdlc/review` en el commit de la cola cuando todas las PRs del grupo los tienen en verde.
3. Dejá requeridos `sdlc/gates`, `sdlc/review` y el build. Una PR entra a la cola solo cuando están en verde en su último commit.

GitLab tiene merge trains y Bitbucket merge checks; los dos corren el pipeline sobre el resultado mergeado, donde `sdlc/gates` y `sdlc/review` se ponen como siempre.

## Después del merge

- Seguí el despliegue hasta que el cambio esté prendido para todos. Si se porta mal, primero seguí "Cómo revertir" y después investigá.
- Un incidente pasa por `/sdlc-incident`: abre un cambio con la línea de tiempo, y el fix viene con un test que lo reproduce.
- Un revert es una señal, no un fracaso. Las [métricas](../reference/telemetry) cuentan los reverts por cambio; si son frecuentes, el nivel o el review se están perdiendo algo.
