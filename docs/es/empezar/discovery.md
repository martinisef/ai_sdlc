# De las reuniones al estado del proyecto

*Experimental.* Opcional, unos minutos por reunión. Cuando el proyecto se define en reuniones con el cliente (kickoffs, syncs semanales, reviews), la herramienta guarda en el repo lo que se pidió, lo que se acordó y lo que quedó abierto, con una cita de la reunión detrás de cada línea. Antes de anotar cada feature nueva, el agente la cruza con el tracker, con el código de la rama principal y con las ramas en curso, así nadie planifica dos veces lo que ya existe.

| Paso | Quién | Qué pasa |
|---|---|---|
| 1. Registrar la reunión | vos | `npx sdlc discovery add` copia la transcripción al repo y rechaza una ya procesada |
| 2. Integrarla | el agente | `/sdlc-discovery` lee la transcripción y actualiza los topics: features, accionables, decisiones, preguntas y riesgos |
| 3. Revisar y commitear | vos | `STATUS.md` dice qué está pendiente, qué sigue abierto y quién debe qué; leés el diff y lo commiteás |
| 4. Hacer el seguimiento | vos | `npx sdlc discovery followup` arma el borrador del mensaje al cliente con las preguntas abiertas |
| 5. Planificar el trabajo | vos y el agente | `npx sdlc roadmap new --from-discovery` convierte las features pedidas en un roadmap, que se vuelve tickets como en [De un plan técnico a tickets](./roadmap.md) |

Acá el agente nunca escribe en el tracker, nunca le manda nada al cliente y nunca cambia de rama: solo las lee.

## Qué necesitás

- El proyecto ya configurado ([Instalar](./instalar.md)).
- La transcripción de cada reunión como archivo: el PDF o texto que exportan Meet, Zoom o Teams, un subtítulo `.vtt` o `.srt`, o tu minuta en Markdown. Si el nombre del archivo tiene una fecha (`weekly-2026-09-14.vtt`), esa es la fecha de la reunión; si no, pasá `--date`.
- Opcional: un tracker conectado ([Jira](./jira.md), GitHub Issues o Linear). Sin tracker, los tickets quedan como `no verificado`.

Los ejemplos de esta página usan un cliente ficticio, Contoso, la librería de montos de `examples/typescript-lib` y `"locale": "es"` en `.sdlc/config.json`.

## Dónde vive

Todo está en `changes/_discovery/`, commiteado como el resto del proyecto:

| Ruta | Qué es |
|---|---|
| `_sources.md` | Una fila por reunión procesada: fecha, nombre, tipo, archivo y SHA-256. La evidencia cita estas etiquetas (`2026-09-01 Kickoff`) |
| `transcripts/` | Las copias de las transcripciones. Con `discovery.commit_transcripts: false` quedan fuera de git, y solo se commitean su nombre y su hash |
| `topics/<topic>.md` | Un archivo por cada área a la que las reuniones vuelven (facturación, onboarding, monedas), con cinco tablas y un historial de cambios |
| `STATUS.md` | El resumen, escrito por `sdlc discovery status`. No se edita |
| `followups/` | Los borradores de seguimiento que decidiste guardar |

Un topic se ve así:

```markdown
## Features
| ID | Feature | Estado | Repo | Ticket | Bloqueado por | Evidencia |
|---|---|---|---|---|---|---|
| F1 | Cuotas con allocate: el centavo sobrante sigue la regla contable de Contoso | pedido | parcial | sin ticket | Q1 | 2026-09-01 Kickoff · Paula: "el centavo que sobra tiene que seguir su regla contable" |
| F2 | Soportar el real brasileño (BRL) | pedido | no existe | sin ticket | | 2026-09-01 Kickoff · Iván: "la librería tiene que soportar el real" |

## Preguntas
| ID | Pregunta | Para | Estado | Desde | Respuesta | Evidencia |
|---|---|---|---|---|---|---|
| Q1 | ¿A qué cuota va el centavo sobrante cuando un monto no se divide exacto? | Cliente: Paula | abierta | 2026-09-01 | | 2026-09-01 Kickoff · Paula: "lo define finanzas" |

## Cambios
- 2026-09-01 Kickoff: F1, F2, A1, Q1 nuevas
```

| Columna | Qué significa |
|---|---|
| `Estado` | Una lista cerrada: `pedido`, `en curso`, `hecho`, `reimplementar`, `fuera de alcance`, `descartado`. También se aceptan los nombres en inglés |
| `Repo` | Lo que tiene hoy la rama principal: `no existe`, `parcial`, `ya existe` o `no verificado` |
| `Ticket` | Una clave confirmada (`PROJ-12`), una probable sin confirmar (`~PROJ-12`), `sin ticket` o `no verificado` |
| `Bloqueado por` | Las preguntas abiertas que la feature espera, de este topic (`Q1`) o de otro (`facturacion#Q2`) |
| `Evidencia` | `<reunión> · [minuto ·] hablante: "cita"`, para que cualquiera pueda volver a lo que se dijo |

Las filas nunca se borran: una feature que el cliente ya no quiere pasa a `descartado`, y una pregunta respondida conserva su pregunta. `sdlc discovery validate` lo controla contra el último commit.

## Paso 1: Registrar la reunión

```bash
npx sdlc discovery add ~/Downloads/kickoff-2026-09-01.md --name Kickoff
```

```text
added '2026-09-01 Kickoff' → changes/_discovery/transcripts/2026-09-01-kickoff.md
Next: /sdlc-discovery in your agent merges it into the topics (evidence cites "2026-09-01 Kickoff").
```

El mismo archivo dos veces, aunque tenga otro nombre, no hace nada:

```text
✗ already processed as '2026-09-01 Kickoff': nothing to do
```

También se rechaza una reunión más vieja que la última procesada, porque los topics ya reflejan lo que vino después. Si de verdad falta, agregala con `--force`. `--type` dice qué tipo de reunión fue (`client`, el valor por defecto, `review`, `daily`, `internal` u `other`).

## Paso 2: Dejar que el agente la integre

En el chat del agente:

```text
/sdlc-discovery
```

El agente lee solo la transcripción nueva y los topics que toca, y para cada feature que agrega o reabre:

- busca en el tracker (`npx sdlc tracker search`), issues abiertos y cerrados. Un issue cerrado que ya lo resolvió deja la feature en `hecho`, salvo que el cliente la pida de nuevo: entonces es `reimplementar`, con el motivo en la evidencia.
- busca en el código de la rama principal con `git grep` (nunca hace checkout de otra rama) para completar `Repo`.
- lista las ramas sin mergear (`npx sdlc discovery branches`) y avisa si una trabaja sobre lo mismo.

Termina con diez líneas como máximo: qué cambió, los conflictos con reuniones anteriores o con trabajo en curso, y las preguntas para el cliente.

## Paso 3: Revisar y commitear

```bash
npx sdlc discovery validate
npx sdlc discovery status
```

```text
✓ 1 topics, 4 rows, 1 sources
wrote changes/_discovery/STATUS.md: 2 to do, 1 open question, 1 open action item
```

`STATUS.md` es la página para leer antes de la próxima reunión:

```markdown
## Pendiente

### Monedas y montos (`monedas`)
- monedas#F1 [pedido · parcial] Cuotas con allocate: el centavo sobrante sigue la regla contable de Contoso — bloqueado por Q1
- monedas#F2 [pedido · no existe] Soportar el real brasileño (BRL)

## Preguntas abiertas (más viejas primero)

- 2026-09-01 · monedas#Q1 ¿A qué cuota va el centavo sobrante cuando un monto no se divide exacto? → Cliente: Paula
```

Leé el diff como cualquier otro cambio, corregí lo que el agente entendió mal y commiteá la carpeta:

```bash
git add changes/_discovery && git commit -m "docs(discovery): 2026-09-01 Kickoff"
```

Para encontrar lo que se dijo sobre algo en todas las reuniones: `npx sdlc discovery search centavo sobrante`.

## Paso 4: Hacer el seguimiento con el cliente

```bash
npx sdlc discovery followup
```

```markdown
# Seguimiento — 2026-09-01 Kickoff

## Para Cliente: Paula

**Preguntas nuevas**

1. ¿A qué cuota va el centavo sobrante cuando un monto no se divide exacto? (monedas#Q1)
```

Primero van las preguntas de la última reunión y después las que siguen pendientes de antes, con la fecha en que se plantearon. `--write` guarda el borrador en `followups/`. Pulilo y mandalo vos; `discovery.followup_locale` elige su idioma.

## Paso 5: Convertirlo en un roadmap

```bash
npx sdlc roadmap new monedas --from-discovery monedas --title "Monedas"
```

```text
created changes/_roadmaps/monedas/roadmap.md: 1 epic, 1 story from changes/_discovery; 1 open question for the blocked monedas#F1
Next: /sdlc-roadmap monedas in your agent completes the acceptance criteria, risk and dependencies.
```

Cada feature pedida sin ticket se vuelve una historia con sus citas y `source: monedas#F2`; cada una bloqueada se vuelve una pregunta abierta del roadmap, que no se puede aprobar hasta que tenga respuesta. Sin nombres de topics, entran todos. Desde ahí es igual que en [De un plan técnico a tickets](./roadmap.md).

## Un proyecto ya empezado

Si el proyecto arrancó antes que la herramienta, armá primero una base, así la primera reunión se compara con lo que ya existe:

```bash
npx sdlc discovery seed --dry-run
npx sdlc discovery seed
```

```text
wrote changes/_discovery/topics/_baseline.md: 1 added, 0 updated, 0 unchanged (from 0 tickets, 0 changes, 0 roadmap stories, 1 branch)
Next: sdlc discovery status, then commit the discovery folder.
```

Lee los issues del tracker (hasta `--limit`, los más nuevos primero), los cambios de `changes/`, las historias de los roadmaps y las ramas sin mergear, y escribe una feature por cada uno con `seed · …` como evidencia. Volver a correrlo actualiza esas filas y conserva lo que una persona cambió a mano (`reimplementar`, `fuera de alcance`, un motivo).

## Configuración

En `.sdlc/config.json`, todo opcional:

```json
{
  "discovery": {
    "base_branch": "main",
    "team": ["Ada", "sam@northwind.dev"],
    "followup_locale": "es",
    "commit_transcripts": true
  }
}
```

`team` es quién cuenta como tu lado (`Equipo: …`) en accionables y preguntas; sin él, todos los de `roles`. `base_branch` es por defecto `vcs.default_branch`. Ver [Configuración](../../reference/config.md).

## Desde el dashboard

Abrí el dashboard (`npx sdlc ui`) y andá a **Discovery**. En **Agregar una reunión**, subí la transcripción, ponele un nombre y apretá **Subir y procesar**; el agente arranca en segundo plano (necesita Claude Code, Codex o el CLI de Cursor instalado). Cuando termina, la página muestra lo pendiente por topic, las preguntas abiertas, los accionables, los riesgos y el borrador de seguimiento. **Armar desde el tracker y git** escribe la base.

## Si algo falla

| Ves | Qué significa | Cómo se arregla |
|---|---|---|
| `meeting date unknown: pass --date YYYY-MM-DD` | El nombre del archivo no tiene fecha | Agregá `--date 2026-09-14` |
| `already processed as '…': nothing to do` | Ese archivo, o una reunión con la misma fecha y nombre, ya está en `_sources.md` | Nada; ya está integrada |
| `… is older than the last source (…): --force adds it anyway` | Ya se procesó una reunión posterior | Agregá `--force` si de verdad falta; el agente marca lo que cambiaron las reuniones más nuevas |
| `F1 cites '…', which is not in _sources.md (or 'seed')` | Una fila cita una reunión que nunca se registró | Registrala con `sdlc discovery add`, o corregí la etiqueta |
| `F2 was deleted (rows are never deleted: change its status)` | Falta una fila que está en el último commit (también un topic, una fuente o una línea de Cambios) | Restaurala y cambiale el estado (`descartado`, `respondida`…) |
| `STATUS.md is out of date: run sdlc discovery status` | Un topic cambió después del último `status` | Corré `npx sdlc discovery status` |
