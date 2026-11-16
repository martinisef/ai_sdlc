---
name: sdlc-discovery
description: Etapa de discovery del loop AI-native (experimental). Lee la transcripción o el acta de una reunión (PDF, Markdown, texto, VTT, SRT) e integra lo que se pidió, acordó, decidió, preguntó y lo que preocupa al estado del proyecto en changes/_discovery/ (topics, STATUS.md, un borrador de seguimiento), cruzando cada pedido con el tracker, el código y las ramas en curso. Usar cuando alguien trae la transcripción de una reunión, dice "procesá esta reunión", "actualizá el estado del proyecto con esta llamada", o quiere saber qué pidió el cliente hasta ahora.
argument-hint: "<archivo de transcripción> [nombre de la reunión] | seed | status"
---

# /sdlc-discovery — de las reuniones al estado del proyecto

Objetivo: después de cada reunión, el estado del proyecto dice qué quiere el cliente, qué ya está hecho o en curso, qué sigue sin respuesta y quién debe qué, con la cita que respalda cada línea. Vos extraés e integrás; código común (`sdlc discovery`) revisa el formato y escribe STATUS.md. **Nunca escribís en el tracker**: ni tickets, ni comentarios, ni transiciones, ni con `sdlc tracker` ni con un MCP.

CLI del loop: `sdlc` ({{sdlc_hint}}). Configuración del proyecto: `.sdlc/config.json`. Carpeta de discovery: `changes/_discovery/` (o `discovery.dir`), `<dir>` de acá en adelante:
- `topics/<topic>.md`: uno por área, cinco tablas (features, accionables, decisiones, preguntas, riesgos) y un registro de Cambios. El formato y las listas cerradas de estados están en `templates/topic.md` al lado de esta skill: leelo una vez.
- `_sources.md`: las reuniones ya procesadas. `STATUS.md`: generado, nunca se edita a mano. `followups/`: borradores para el cliente. `transcripts/`: los archivos.

Regla de costo: leé `STATUS.md`, la transcripción **nueva** y solo los topics que vas a tocar. Nunca vuelvas a leer transcripciones viejas; para encontrar un pedido anterior usá `sdlc discovery search <palabras>` en vez de abrir todos los topics.

## 0. Entrada
- **Una transcripción** (pdf, md, txt, vtt, srt; Word o Google Docs: pedí un export a PDF o texto). Varias: de a una, la más vieja primero.
- **`seed`**, o la primera corrida en un proyecto que ya tiene código, tickets o cambios (todavía no existe `<dir>/topics/`): corré primero `sdlc discovery seed`. Escribe `topics/_baseline.md` con una fila por issue del tracker (abierto o cerrado), cambio, historia de roadmap y rama sin mergear, así nada de lo ya hecho se vuelve a pedir. Commitealo solo y seguí.
- **`status`** o sin argumento: corré `sdlc discovery status` y resumí STATUS.md. Terminá ahí.

## 1. Registrar la fuente
1. Nombrá la reunión como la llama la gente ("Weekly", "Kickoff"). La fecha sale del nombre del archivo, o pasá `--date AAAA-MM-DD` (del encabezado de la transcripción, o preguntá).
2. `sdlc discovery add <archivo> --name "<nombre>" --check`:
   - `already processed as '…'` → pará y decilo: la reunión ya está en el estado.
   - más vieja que la última fuente → preguntá si agregarla igual (`--force`); una reunión atrasada puede reabrir cosas ya cerradas, decí cuáles.
3. `sdlc discovery add <archivo> --name "<nombre>"`. Su etiqueta (`<fecha> <nombre>`) es cómo cada evidencia cita esta reunión. Un PDF queda con un `.txt` al lado: leé ese si no podés leer PDFs.

## 2. Extraer de la transcripción nueva
Leela una vez, de punta a punta, y anotá candidatos de cinco tipos:
- **Feature**: algo que el cliente quiere que haga el producto (o que ya no quiere).
- **Accionable**: alguien quedó en hacer algo (mandar un archivo, agendar una llamada, estimar). Quién y qué.
- **Decisión**: una elección que cierra una opción ("reintegros solo con tarjeta").
- **Pregunta**: algo que quedó abierto y alguien tiene que responder; quién. Dos personas diciendo cosas opuestas es una pregunta con estado `contradicción`.
- **Riesgo**: algo que puede salir mal (plazo, dependencia, una restricción legal).

Para cada uno, guardá la evidencia: el minuto si la transcripción lo tiene (`mm:ss`), quién habla y una cita literal corta (como mucho ~20 palabras, en el idioma de la reunión). Actas sin minutos ni hablantes: citá el acta (`<etiqueta> · acta: "…"`). Ignorá la charla y lo que nadie pidió.

## 3. Planificar la integración
1. Leé `<dir>/STATUS.md` (topics, preguntas abiertas, trabajo abierto).
2. Para cada candidato, `sdlc discovery search <dos o tres palabras clave>`: ¿ya es una fila (acá o en `_baseline`)? Entonces es una **actualización**, no una fila nueva.
3. Decidí por candidato: fila nueva · evidencia nueva en una fila existente · cambio de estado (pregunta respondida, decisión reemplazada, accionable hecho) · respuesta que desbloquea features (limpiá su Bloqueado por) · nada.
4. Topic: el existente que corresponda; un topic nuevo solo para un área con al menos dos ítems; si no, `_unsorted`.
5. Leé solo los archivos de topic que vas a tocar.

## 4. Cruzar las features nuevas o reabiertas
Para cada feature que agregás o que vuelve a `pedido`/`reimplementar`:
- **Tracker** (solo si `sdlc tracker enabled` sale con 0): `sdlc tracker search "<palabras clave>" --limit 20`, una búsqueda por feature. Un issue que claramente es lo mismo → su clave en Ticket; uno probable → `~CLAVE`; ninguno → `sin ticket`; tracker inaccesible → `no verificado`. Un issue **cerrado** que ya lo resolvió: la feature está `hecho` salvo que el cliente lo pida de nuevo claramente; entonces `reimplementar`, con `motivo: …` en la evidencia (qué cambió).
- **Código en la rama base** (`discovery.base_branch`, si no `vcs.default_branch`): `git grep -n -i "<palabra>" <base> -- <rutas probables>`. Nunca hagas checkout ni cambies de rama. Repo: `no existe`, `parcial` o `ya existe`. `hecho` necesita `ya existe` o un ticket confirmado.
- **Trabajo en curso**: `sdlc discovery branches --json`, una vez por corrida. Una rama que toca la misma área o lleva el mismo ticket es un conflicto para reportar (paso 7); poné su ticket en Ticket si tiene.
- **Roadmaps**: una story en `changes/_roadmaps/*/roadmap.md` con `- source: <topic>#F<n>` ya cubre esa feature; cuando tenga `- key:`, poné esa clave en Ticket, así `sdlc roadmap new --from-discovery` no la planifica dos veces.

## 5. Escribir
- Editá las filas en el lugar. Los IDs nuevos siguen la numeración del topic (`F4` después de `F3`); nunca renumeres ni borres una fila: cambiá su estado.
- La evidencia nueva va después de la anterior, separada por `<br>`: `<etiqueta> · 12:40 · Laura: "que cancelen solos"`.
- Responsable y Para empiezan con `Equipo:` o `Cliente:`. El lado del equipo es `discovery.team` en la configuración (o la gente de `roles`); cualquier otra persona que habla es del lado del cliente salvo que la transcripción diga otra cosa.
- `Desde` de una pregunta es la fecha de la fuente que la planteó primero; cuando se responde, escribí la Respuesta, pasala a `respondida` y sacala de todo Bloqueado por.
- Una línea por topic tocado al final de su registro de Cambios: `- <etiqueta>: F4 nueva, Q1 respondida (F2 desbloqueada)`.
- Un topic nuevo: copiá `templates/topic.md` a `<dir>/topics/<topic>.md` (nombre en kebab-case) y completá el frontmatter.

## 6. Revisar, estado, seguimiento, commit
1. `sdlc discovery validate` hasta que no muestre ningún `✗`. Leé las advertencias `!` y corregilas salvo que haya un motivo.
2. `sdlc discovery status` reescribe STATUS.md.
3. `sdlc discovery followup --write` arma el borrador de seguimiento en `followups/`; reescribilo para que se lea bien, en el idioma de `discovery.followup_locale` (o el del proyecto), manteniendo las referencias `topic#ID`. No se envía nada.
4. Commiteá solo la carpeta de discovery: `git add <dir> && git commit -m "discovery: <etiqueta>"`. Si `discovery.commit_transcripts` es false las transcripciones quedan locales (en el gitignore); `_sources.md` igual registra su hash.

**Sin una persona** (el prompt dice que corrés headless, por ejemplo desde el dashboard): no preguntes. Fecha desconocida o una fuente más vieja que la última → pará y reportalo. Si no está claro de quién es un ítem → escribí tu mejor suposición y agregá una pregunta para el equipo.

## 7. Reporte (10 líneas como mucho)
La fuente; cuántas filas nuevas, actualizadas, preguntas respondidas; los **conflictos** (pedido pero ya hecho, un ticket cerrado que se vuelve a pedir, una rama que ya lo está haciendo, contradicciones); las preguntas que esperan al cliente; y el próximo paso: "features listas para construir (sin ticket, sin bloqueo) → `sdlc roadmap new <slug> --from-discovery <topic>`; el borrador de seguimiento está en `<dir>/followups/…`."
