# De un plan técnico a tickets

Opcional, unos 15 minutos más el tiempo de contestar las preguntas del agente. Cuando un proyecto entero, o una parte grande, ya está descrito en un plan técnico (un PDF, un Google Doc, un archivo Markdown), la herramienta lo convierte en épicas e historias en tu tracker. Después cada historia es un cambio del loop, desde su intent hasta su pull request.

| Paso | Quién | Qué pasa |
|---|---|---|
| 1. Darle el plan a la herramienta | vos | `npx sdlc roadmap new` guarda una copia del plan en el repo |
| 2. Armar la división | el agente | `/sdlc-roadmap` lee el plan, pregunta lo que no queda claro y escribe `roadmap.md`: épicas, historias, criterios de aceptación y dependencias |
| 3. Aprobar | vos | leés la división, cambiás lo que quieras y la aprobás, igual que una spec |
| 4. Crear los tickets | vos | `npx sdlc roadmap apply` crea las épicas, las historias debajo de cada una y los vínculos entre ellas en Jira, GitHub Issues o Linear |
| 5. Trabajar las historias | vos y el agente | `npx sdlc next` te dice qué historia empezar; cada una pasa por el loop con `/sdlc-intent <CLAVE>` |

El agente nunca crea tickets por su cuenta: nada llega al tracker hasta que una persona aprueba la división.

## Qué necesitás

- El proyecto ya configurado ([Instalar](./instalar.md)) y el [tutorial](./tutorial.md) hecho una vez, para conocer el loop.
- Un tracker conectado: [Jira](./jira.md), o GitHub Issues o Linear (ver [Trackers](../integraciones/trackers.md)). Sin tracker igual podés armar y aprobar la división, y empezar cada historia por su título.
- El plan como archivo: PDF, Markdown o texto, hasta 20 MB. Desde Word, exportalo como PDF.
- O el link a un Google Doc compartido con **Cualquier persona con el vínculo** (Compartir → Acceso general → Cualquier persona con el vínculo, Lector). La herramienta lo descarga como Markdown en `source.md` al lado del roadmap, así el agente lee un archivo local. Un documento privado falla con `share it with "Anyone with the link"`; en ese caso compartilo así, o descargalo (**Archivo** → **Descargar** → **PDF**) y subí el archivo. El dashboard no lee otros links (Notion, Confluence, una wiki): descargá la página y subila.

Los ejemplos de esta página usan la app de tareas del tutorial y un proyecto de Jira con la clave `PROJ`.

## Paso 1: Dale el plan a la herramienta

Ponele un nombre corto al roadmap (minúsculas, números y guiones) e indicá el plan:

```bash
npx sdlc roadmap new compartir-tareas --source ~/Downloads/plan.pdf
```

```text
created changes/_roadmaps/compartir-tareas/roadmap.md (source: changes/_roadmaps/compartir-tareas/source.pdf)
Next: /sdlc-roadmap compartir-tareas in your agent: it reads the document, asks what is missing and drafts the epics and stories.
```

La copia del plan queda al lado del roadmap, así quien lo revise después ve el mismo documento que vos.

## Paso 2: Dejá que el agente arme la división

En el chat del agente:

```text
/sdlc-roadmap compartir-tareas
```

El agente lee el plan y te hace de una a tres preguntas por vez, solo sobre lo que cambia la división: alcance, orden, quién es dueño de qué. Contestá en el chat. Cuando no queda nada abierto, escribe `changes/_roadmaps/compartir-tareas/roadmap.md`. Debajo de las líneas del encabezado, se ve así:

```markdown
# Roadmap: Compartir tareas

Fechas de vencimiento para las tareas, y compartir una lista con otra persona como archivo. Fuera de alcance: cuentas y sincronización.

## E1 · Fechas de vencimiento

Cada tarea puede tener una fecha de vencimiento, y las vencidas se destacan.

### E1.S1 · Agregar una fecha de vencimiento a una tarea
- risk: low
- depends: -
- source: §2.1

`add` acepta una fecha y `list` la muestra.

Criterios de aceptación:
- [ ] `add "Comprar leche" --due 2026-12-01` guarda la fecha
- [ ] `list` muestra la fecha al lado de la tarea
- [ ] Una fecha inválida se rechaza con un mensaje que dice por qué

### E1.S2 · Marcar las tareas vencidas
- risk: low
- depends: E1.S1
- source: §2.2

Criterios de aceptación:
- [ ] `list` pone `!` antes de las tareas pendientes cuya fecha ya pasó

## E2 · Compartir

Una lista viaja como un archivo JSON; no hay servidor.

### E2.S1 · Exportar una lista a un archivo
- risk: low
- depends: E1.S1
- source: §3.1

Criterios de aceptación:
- [ ] `export lista.json` escribe todas las tareas con su estado y su fecha

### E2.S2 · Importar una lista compartida
- risk: medium
- depends: E2.S1
- source: §3.2

Criterios de aceptación:
- [ ] `import lista.json` agrega las tareas que todavía no están en la lista
- [ ] Un archivo roto no cambia nada y el mensaje dice qué está mal

## Preguntas abiertas
- Q1: Al importar, ¿una tarea con el mismo texto es un duplicado?
  A: Sí, se saltea.
```

| Parte | Qué significa |
|---|---|
| `## E1 · …` | Una épica: algo que un usuario u otro equipo puede notar. Se convierte en una épica en el tracker |
| `### E1.S1 · …` | Una historia: un cambio del loop, lo bastante chico para un intent, una spec y un plan. Se convierte en un ticket debajo de su épica |
| `risk` | `low`, `medium` o `high`. Pasa al intent del cambio, y el trabajo de riesgo alto recibe las revisiones extra del loop |
| `depends` | Historias que tienen que estar mergeadas antes. Se convierten en vínculos "blocks" en el tracker, y `sdlc next` no sugiere una historia bloqueada |
| `source` | La sección del plan de donde sale la historia, para que quien revisa la pueda comprobar |
| `Criterios de aceptación` | Lo que tiene que ser cierto cuando la historia está terminada. El intent y la spec arrancan de acá |
| `Preguntas abiertas` | Lo que el plan no aclara, cada una con su respuesta (`A:`) |

Es un archivo normal: editalo en tu editor, o pedile cambios al agente ("uní E2.S1 y E2.S2", "E1.S2 es de riesgo alto").

## Paso 3: Revisalo y aprobalo

Comprobá que esté completo:

```bash
npx sdlc roadmap check compartir-tareas
```

```text
✓ changes/_roadmaps/compartir-tareas/roadmap.md: 2 epics, 4 stories, 0 open questions
```

El check falla cuando una pregunta no tiene respuesta, una historia no tiene criterios de aceptación, o una dependencia no existe o forma un círculo. Corregí lo que dice, o pedíselo al agente.

Después commitealo y aprobalo. Como con el intent, la spec y el plan, aprueba una persona, nunca el agente:

```bash
git add changes/_roadmaps && git commit -m "docs(roadmap): compartir-tareas"
npx sdlc roadmap approve compartir-tareas
```

```text
changes/_roadmaps/compartir-tareas/roadmap.md approved by Ana Dev (0dc19da)
Next: sdlc roadmap apply compartir-tareas creates 6 tickets (--dry-run shows them first).
```

Para devolverlo, `npx sdlc roadmap reject compartir-tareas -m "por qué"`. Si editás el roadmap después de aprobarlo, necesita una aprobación nueva antes de crear cualquier ticket.

## Paso 4: Creá los tickets

Primero mirá qué crearía, sin tocar el tracker:

```bash
npx sdlc roadmap apply compartir-tareas --dry-run
```

```text
would create epic     E1 Fechas de vencimiento
would create story    E1.S1 Agregar una fecha de vencimiento a una tarea
would create story    E1.S2 Marcar las tareas vencidas
would create epic     E2 Compartir
would create story    E2.S1 Exportar una lista a un archivo
would create story    E2.S2 Importar una lista compartida
would create link     E1.S1 blocks E1.S2
would create link     E1.S1 blocks E2.S1
would create link     E2.S1 blocks E2.S2
9 action(s); run without --dry-run to create them.
```

Después crealos:

```bash
npx sdlc roadmap apply compartir-tareas
```

```text
PROJ-2     epic     E1 Fechas de vencimiento
PROJ-3     story    E1.S1 Agregar una fecha de vencimiento a una tarea
PROJ-4     story    E1.S2 Marcar las tareas vencidas
PROJ-5     epic     E2 Compartir
PROJ-6     story    E2.S1 Exportar una lista a un archivo
PROJ-7     story    E2.S2 Importar una lista compartida
PROJ-4     link     E1.S1 blocks E1.S2
PROJ-6     link     E1.S1 blocks E2.S1
PROJ-7     link     E2.S1 blocks E2.S2
6 tickets created, 3 links (keys saved in 1fd0d31)
Next: sdlc next suggests the first story to start (/sdlc-intent <KEY>).
```

Cada ticket lleva la descripción de la historia, sus criterios de aceptación y una referencia al roadmap. La clave de cada uno se escribe en `roadmap.md` (`- key: PROJ-3`) y se commitea, así que correr `apply` de nuevo no crea nada dos veces:

```text
nothing to do: every item has its ticket and every link exists
```

Si el tracker falla a mitad de camino, los tickets ya creados quedan guardados; corré `apply` de nuevo y sigue desde ahí.

## Paso 5: Trabajá las historias

Preguntale a la herramienta qué sigue:

```bash
npx sdlc next
```

```text
Próxima historia del roadmap compartir-tareas: E1.S1 Agregar una fecha de vencimiento a una tarea (PROJ-3) → /sdlc-intent PROJ-3
```

En el chat del agente, empezala como cualquier ticket:

```text
/sdlc-intent PROJ-3
```

El agente lee el ticket y también el roadmap del que sale: la sección del plan, los criterios de aceptación y las respuestas a las preguntas abiertas. Desde ahí, el loop es el mismo que en el [tutorial](./tutorial.md). Para ver el roadmap entero en cualquier momento:

```bash
npx sdlc roadmap status
```

```text
compartir-tareas
  E1.S1   PROJ-3     ready                    Agregar una fecha de vencimiento a una tarea
  E1.S2   PROJ-4     blocked by E1.S1         Marcar las tareas vencidas
  E2.S1   PROJ-6     blocked by E1.S1         Exportar una lista a un archivo
  E2.S2   PROJ-7     blocked by E2.S1         Importar una lista compartida
```

A medida que cada cambio avanza por el loop, su línea muestra la etapa, y las historias que bloqueaba quedan listas cuando se mergea.

## Desde el dashboard

Los mismos pasos funcionan sin la terminal. Abrí el dashboard (`npx sdlc ui`) y andá a **Roadmaps**:

1. **Nuevo roadmap**: ponele un nombre y subí el plan. El agente arma la división en segundo plano (necesita Claude Code, Codex o el CLI de Cursor instalado).
2. Cuando tiene preguntas, aparecen como un formulario. Contestalas y apretá **Enviar respuestas**; el agente actualiza la división.
3. Leé las épicas y las historias, y después **Aprobar** o **Rechazar**. Si sos el autor de un roadmap rechazado (su `author:` es tu nombre o email de git), **Eliminar roadmap** borra su carpeta en un commit; el historial de git la conserva. Un roadmap que ya tiene tickets creados no se puede eliminar, para que los tickets sigan vinculados.
4. **Ver tickets** muestra lo que se crearía; **Crear tickets** los crea.

## Si algo falla

| Ves | Qué significa | Cómo se arregla |
|---|---|---|
| `Q1 has no answer: …` | Una pregunta abierta tiene el `A:` vacío | Contestala en el chat del agente, o escribí la respuesta después de `A:` |
| `the roadmap does not pass the check; fix it first:` | Para aprobar, el roadmap tiene que pasar `npx sdlc roadmap check` | Corregí cada línea que aparece debajo de ese mensaje |
| `… is draft; a person approves it first (sdlc roadmap approve compartir-tareas)` | `apply` solo corre sobre un roadmap aprobado | Hacé el [paso 3](#paso-3-revisalo-y-aprobalo) |
| `… changed after it was approved; approve it again (sdlc roadmap approve compartir-tareas)` | Alguien editó el roadmap después de aprobarlo | Revisá el cambio y aprobalo de nuevo |
| `looks like an agent or bot; a person must approve` | Se intentó aprobar con la identidad de git del agente | Aprobá desde tu propia terminal |
| `tracker not configured (tracker.provider: jira \| github \| linear)` | No hay un tracker conectado | Conectá uno ([Jira](./jira.md)), o empezá cada historia por su título: `/sdlc-intent "Agregar una fecha de vencimiento a una tarea"` |
| `unsupported source …` | El plan no es un PDF, Markdown o texto | Exportalo como PDF |
