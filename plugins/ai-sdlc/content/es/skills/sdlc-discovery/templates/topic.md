---
topic: <topic>
title: <Título>
created: <AAAA-MM-DD>
---
# <Título>

<!--
Un topic por cada área a la que las reuniones vuelven (facturación, onboarding, reportes…). El nombre del archivo es el topic: minúsculas, dígitos y guiones.
`sdlc discovery validate` revisa este archivo; `sdlc discovery status` lo lee para escribir STATUS.md. Nunca se borra una fila: se cambia su estado.

Evidencia, en cada fila: `<fuente> · [mm:ss ·] hablante: "cita"`. <fuente> es una etiqueta de ../_sources.md (`2026-03-02 Review semanal`)
o `seed`. Varias piezas: separarlas con <br>. Una feature a reimplementar agrega `motivo: por qué` como un segmento más.

Listas cerradas (también se aceptan los nombres en inglés):
  Estado feature    pedido · en curso · hecho · reimplementar · fuera de alcance · descartado
                    hecho necesita Repo `ya existe` o un ticket confirmado; reimplementar necesita `motivo:` en la evidencia
  Repo              no existe · parcial · ya existe · no verificado   (lo que tiene hoy el código en la rama base)
  Ticket            KEY-12, #12 (confirmado) · ~KEY-12 (coincidencia probable, sin confirmar) · sin ticket · no verificado
  Bloqueado por     preguntas abiertas de este topic (Q1) o de otro (facturacion#Q2); vacío si nada lo bloquea
  Estado accionable abierto · agendado · verificar · hecho · cancelado
  Responsable/Para  `Equipo: nombre` o `Cliente: nombre`
  Estado decisión   vigente · reemplazada por D3
  Estado pregunta   abierta · contradicción · respondida · descartada   (Desde: fecha de la primera fuente que la planteó)
  Estado riesgo     activo · mitigado · ocurrido
-->

## Features
| ID | Feature | Estado | Repo | Ticket | Bloqueado por | Evidencia |
|---|---|---|---|---|---|---|

## Accionables
| ID | Accionable | Responsable | Estado | Evidencia |
|---|---|---|---|---|

## Decisiones
| ID | Decisión | Estado | Evidencia |
|---|---|---|---|

## Preguntas
| ID | Pregunta | Para | Estado | Desde | Respuesta | Evidencia |
|---|---|---|---|---|---|---|

## Riesgos
| ID | Riesgo | Estado | Evidencia |
|---|---|---|---|

## Cambios
<!-- Solo se agrega, una línea por fuente que tocó este topic: `- <fuente>: F2 nueva, Q1 respondida (F3 desbloqueada)` -->
