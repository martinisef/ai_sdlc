# Actualizar desde 0.x

La 1.0 no rompe comandos, configuración ni artefactos: un proyecto configurado con la 0.7 sigue funcionando. Lo que agrega la 1.0 es el [contrato de estabilidad](./estabilidad.md), la promesa de que nada de eso se rompe hasta la 2.0.

## Pasos

```bash
npm i -D @morsadev/sdlc@1
npx sdlc sync          # regenera las skills, los archivos de los agentes y los git hooks
npx sdlc doctor --fix  # mueve un .claude/sdlc.json heredado, repara hooks
git add -A && git commit -m "chore: sdlc 1.0"
```

¿Usás el plugin de Claude Code? Corré `/plugin marketplace update ai-native-sdlc`. La extensión del editor es el `.vsix` de la [release](https://github.com/martinisef/ai_sdlc/releases).

## Qué se comporta distinto

| Antes | En la 1.0 |
|---|---|
| Los trabajos del agente en el dashboard (roadmaps) usaban Claude Code salvo que `ci.agent` dijera otra cosa | Usan `ci.agent` o `SDLC_CI_AGENT` si están, y si no el primero de tus `agents` que tenga el CLI instalado. La página de Roadmaps muestra cuál. Un proyecto solo con Cursor ahora corre `cursor-agent` sin configurar nada. |
| El HTML dentro de los artefactos se mostraba renderizado en el dashboard | Se muestra como texto, y los links que no son http(s), mailto o relativos se descartan. Los artefactos pueden venir del pull request de cualquiera. |
| `sdlc hosted` escuchaba en todas las interfaces | Sin `SDLC_HOSTED_TOKEN` escucha solo en 127.0.0.1; detrás de tu proxy de SSO, poné `HOST=0.0.0.0`. |
| `sdlc status --metrics` | Sigue andando, con un aviso de deprecación; usá `sdlc metrics`. Se quita en la 2.0. |
| El PDF de un roadmap solo se copiaba | Si `pdftotext` está instalado, también se escribe un `source.txt` al lado, para los agentes que no leen PDFs. |

## Deprecado, se quita en la 2.0

- `.claude/sdlc.json`: se sigue leyendo en toda la 1.x. `sdlc doctor` avisa, y `sdlc migrate` lo mueve a `.sdlc/config.json`.
- `sdlc status --metrics`: usá `sdlc metrics`.

## Probar un release candidate

Antes de una versión major se publican release candidates con el tag `rc`:

```bash
npm i -D @morsadev/sdlc@rc
```

`npm i -D @morsadev/sdlc` sigue instalando la versión estable.
