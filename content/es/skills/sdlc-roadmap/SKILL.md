---
name: sdlc-roadmap
description: Etapa 0 del loop AI-native. Lee un plan técnico (PDF, Markdown o un Google Doc), le pregunta a la persona lo que el documento no aclara y lo divide en épicas e historias en changes/_roadmaps/<slug>/roadmap.md, listo para que una persona lo apruebe y `sdlc roadmap apply` cree los tickets. Usar cuando alguien trae un plan técnico, un documento de diseño o un RFC y quiere convertirlo en tickets, o dice "planificá todo el proyecto desde este documento".
argument-hint: "<ruta del documento | URL de Google Doc | slug de un roadmap existente>"
---

# /sdlc-roadmap — de un plan técnico a épicas e historias

Objetivo: una división que una persona pueda aprobar leyéndola una vez, donde cada historia es un cambio del loop. Vos redactás y preguntás; una persona aprueba; `sdlc roadmap apply` (código común) crea los tickets. **Nunca creás tickets vos.**

CLI del loop: `sdlc` ({{sdlc_hint}}). Configuración del proyecto: `.sdlc/config.json`.

## 0. Entrada
- **Un archivo** (`plan.pdf`, `diseño.md`): `sdlc roadmap new <slug> --source <archivo>` lo copia en `changes/_roadmaps/<slug>/` y escribe la plantilla. Slug: kebab-case corto a partir del título del plan.
- **Una URL de Google Doc**: `sdlc roadmap new <slug> --source <url>` lo descarga como `source.md` (el documento tiene que estar compartido con "Cualquier persona con el vínculo"). Leé ese archivo, no el link. Si la descarga falla, leelo con el MCP de Google Drive si la sesión lo tiene; si no, pedí una exportación a PDF o Markdown (Archivo → Descargar) y usá ese archivo.
- **Un slug existente** (existe `changes/_roadmaps/<slug>/roadmap.md`): seguí ese borrador. Leelo primero; las preguntas respondidas son decisiones, conservalas.
- Archivos de Word: pedí una exportación a PDF.

## 1. Leer el documento
- Leé la fuente completa (PDF: la herramienta Read lo lee página por página; si no podés leer PDFs, leé `source.txt` al lado, o crealo con `pdftotext -layout source.pdf source.txt`). Si es largo, andá por secciones y anotá: objetivos, alcance y lo que queda afuera, componentes, datos, integraciones, restricciones (seguridad, datos personales, rendimiento, fechas), hitos y todo lo que diga que está sin decidir.
- Si el repo tiene código, miralo para nombrar los módulos que toca el plan, pero no diseñes la solución: eso es la spec y el plan de cada historia.

## 2. Redactar la división
Escribí `changes/_roadmaps/<slug>/roadmap.md`, conservando el frontmatter:

```markdown
# Roadmap: <título del plan>

<dos o tres líneas: el objetivo, qué entra, qué no>

## E1 · <épica: algo que un usuario u otro equipo puede notar>

<una o dos líneas>

### E1.S1 · <historia: un cambio, empezando por el verbo>
- risk: low | medium | high
- depends: E1.S2, E2.S1        (o -)
- source: §<sección del documento>
- labels: <opcional, separadas por coma>

<qué y por qué, dos o tres líneas>

Criterios de aceptación:
- [ ] <comportamiento observable, que se pueda probar>

## Preguntas abiertas
- Q1: <lo que el documento no aclara y cambia la división>
  A:
```

Reglas:
- **Una historia es un cambio**: un intent → spec → plan → PR. Si necesita más de ~8 criterios de aceptación o toca módulos que no tienen relación, dividila.
- Los ids son estables: `E<n>` para épicas, `E<n>.S<m>` para sus historias. No renumeres después de que la persona los vio; agregá los nuevos al final.
- `depends` solo para un orden real (una tabla antes del endpoint que la usa), no para "mejor primero".
- `risk` sigue los niveles del proyecto (`.sdlc/config.json → risk`): high para autenticación, pagos, migraciones de datos, `risk.high_risk_paths`.
- `source` apunta a la sección del documento, para poder rastrear cada historia.
- No escribas líneas `key:` ni `links:`: las escribe `sdlc roadmap apply`.
- En **Preguntas abiertas** va solo lo que cambia la división (alcance, orden, quién es dueño de qué), no detalles de implementación.

## 3. Preguntar
Hacele las preguntas abiertas a la persona **de a pocas** (una a tres por turno, con AskUserQuestion cuando hay opciones claras). Escribí cada respuesta en su línea `A:` y actualizá las épicas e historias que cambian. Repetí hasta que no queden preguntas sin respuesta.

**Sin una persona** (el prompt dice que corrés sin interacción, por ejemplo desde el dashboard): no preguntes. Escribí el borrador y las preguntas, dejá las líneas `A:` vacías y pará. Cuando te vuelvan a correr con respuestas, aplicalas a la división.

## 4. Revisar y commitear
1. `sdlc roadmap check <slug>` tiene que pasar (exit 0). Corregí cada `✗`; leé las advertencias `!` y corregilas salvo que haya un motivo.
2. Mostrale a la persona el esquema (épicas, historias, dependencias, riesgo) y ajustá lo que pida.
3. Commiteá la carpeta: `git add changes/_roadmaps/<slug> && git commit -m "roadmap(<slug>): <título>"`.

## 5. Entregar
- **Una persona aprueba** con `sdlc roadmap approve <slug>` (o en el dashboard). Nunca lo apruebes vos, y nunca edites `status:`.
- Después de la aprobación: `sdlc roadmap apply <slug> --dry-run` muestra lo que se va a crear; `sdlc roadmap apply <slug>` crea las épicas, las historias debajo y los vínculos "blocks" en el tracker (Jira, GitHub Issues o Linear). Lo corre la persona, o te lo pide.
- Sin tracker (`tracker.provider: none`) el roadmap es el plan: cada historia empieza con `/sdlc-intent "<título de la historia>"`.

## Cierre
Una línea: la ruta del roadmap, cuántas épicas e historias, preguntas abiertas que quedan, y **el siguiente paso**: "Una persona lo aprueba → `sdlc roadmap approve <slug>`; después `sdlc roadmap apply <slug>`; cada historia empieza con `/sdlc-intent <KEY>` (`sdlc next` dice cuál)."
