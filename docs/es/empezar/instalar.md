# Instalar

Unos 10 minutos la primera vez. Los comandos se escriben en una **terminal**: Terminal en macOS, tu aplicación de terminal en Linux, o Ubuntu (WSL) en Windows.

![Instalar y verificar la configuración](../../media/install-es.gif)

## 1. Fijate qué ya tenés

Corré cada comando. Si imprime una versión como la que se muestra, ese ítem está listo.

| Necesitás | Verificalo con | Deberías ver | Si no |
|---|---|---|---|
| Node.js 22.18 o más nuevo | `node -v` | `v22.18.0` o más (`v24.x` también sirve) | Instalá la versión LTS desde [nodejs.org](https://nodejs.org) |
| git | `git --version` | `git version 2.x` | macOS: `xcode-select --install` · Linux: `sudo apt install git` |
| Tu nombre en git | `git config user.name` | tu nombre | `git config --global user.name "Tu Nombre"` y `git config --global user.email vos@ejemplo.com` |
| Un agente | `claude --version`, o Cursor abierto | una versión | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) o [Cursor](https://cursor.com) |

Tu nombre en git importa: cada aprobación queda registrada con él, y la herramienta rechaza aprobaciones de nombres que parecen un agente o un bot.

### En Windows

Usá WSL (Windows Subsystem for Linux): abrí PowerShell como administrador, corré `wsl --install`, reiniciá y abrí "Ubuntu" desde el menú Inicio. A partir de ahí seguí las instrucciones de Linux dentro de Ubuntu.

## 2. Conseguí un proyecto para probar

Para aprender, usá la app de ejemplo. Es una lista de tareas con tres tests y nada más.

```bash
git clone --depth 1 https://github.com/martinisef/ai_sdlc.git
cp -r ai_sdlc/examples/starter-todo ~/mi-todo
cd ~/mi-todo
git init -b main
git add -A && git commit -m "initial"
npm test
```

`npm test` debería terminar con `pass 3`. Tu propio proyecto funciona igual: salteá este paso y entrá a su carpeta con `cd`.

## 3. Instalá la herramienta

```bash
npm i -D @morsadev/sdlc
npx sdlc init --locale es --preset solo
```

- `npm i -D` agrega la herramienta solo a este proyecto (en `node_modules/`). No se instala nada en el sistema.
- `npx sdlc` la ejecuta. Todos los comandos de estas páginas empiezan con `npx sdlc`.
- `--locale es` deja las plantillas y los mensajes del loop en español.
- `init` pregunta qué agentes usás. Apretá Enter para aceptar la sugerencia, o escribí `claude`, `cursor` o los dos (`claude,cursor`).
- `--preset solo` significa que trabajás solo: aprobás tus propios cambios. Para un equipo, usá `--preset team-github`; pregunta quién aprueba qué.

Cuando termina vas a ver algo así:

```text
✓ ai-sdlc ready · preset solo · typescript · agents: claude
  config   .sdlc/config.json (10 scaffold files, 57 agent files; --verbose lists them)
  gates    any person (never an agent)
  CI       no remote detected: `sdlc ci install --provider github|gitlab|bitbucket` later
Next: sdlc next (it always tells you what to do), or sdlc new <slug> to start a change.
```

Línea por línea:

| Línea | Qué significa |
|---|---|
| `✓ ai-sdlc ready · preset solo · typescript · agents: claude` | Funcionó. Detectó un proyecto JavaScript/TypeScript y lo configuró para Claude Code. |
| `config .sdlc/config.json` | Tu configuración. La podés editar después, a mano o en el dashboard. |
| `10 scaffold files` | `changes/` (donde viven los cambios), `CLAUDE.md` (notas para el agente), `REVIEW.md`, `lessons/`, `evals/`, `ops/`. |
| `57 agent files` | Las skills y los hooks de tu agente, en `.claude/` (Claude Code) o en `.cursor/` y `.agents/` (Cursor). |
| `gates any person (never an agent)` | Quién puede aprobar: cualquier persona, incluido vos. Nunca una IA. |
| `CI no remote detected` | No encontró GitHub ni GitLab. Para aprender está bien; lo podés agregar después. |

## 4. Guardalo en git

```bash
git add -A && git commit -m "chore: ai-sdlc"
```

## 5. Verificá que funciona

```bash
npx sdlc doctor
```

Cada línea debería empezar con `✓`. Un `!` es una advertencia, no un error; por ejemplo `! VCS provider unknown` solo significa que todavía no hay un remoto de GitHub o GitLab. `npx sdlc doctor --fix` arregla lo que puede. Si algo sigue mal, mirá [Problemas frecuentes](./problemas.md).

Siguiente: [Tutorial: tu primer cambio](./tutorial.md).
