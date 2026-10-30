# <Nombre del proyecto>
<!-- Máximo una página. Si Claude comete el mismo error dos veces, la corrección va acá. -->

## Comandos
<!-- /sdlc-setup completa con los comandos reales y verificados -->
- Build: `make build`
- Test: `make test`
- Lint: `make lint`
- Run: `make run`

## Verificar tu trabajo
- Corré build, test y lint antes de dar una tarea por terminada, y pegá la salida.
- Si un test falla, arreglá el código, no el test. Nunca saltees ni borres un test que falla.

## Cómo trabajamos (loop AI-native)
- Cada cambio vive en `changes/<slug>/` (intent.md → spec.md → plan.md) en la rama `change/<slug>`.
- Nada se implementa sin un `plan.md` aprobado. Si la implementación se desvía, actualizá `plan.md` en el mismo commit.
- Comandos: /sdlc-intent · /sdlc-spec · /sdlc-plan · /sdlc-build · /sdlc-fix · /sdlc-ship · /sdlc-status · /sdlc-incident

## Convenciones
<!-- /sdlc-setup completa según el stack y las respuestas del equipo -->

## Arquitectura
<!-- Carpetas principales y qué vive en cada una -->

## Cosas que Claude hace mal
<!-- Se completa con el uso. Regla: segundo error igual → entra acá. -->
