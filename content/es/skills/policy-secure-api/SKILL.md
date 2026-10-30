---
name: policy-secure-api
description: Aplica el estándar de seguridad de APIs de la organización. Usar siempre que se cree o modifique un endpoint expuesto, se revise código de API, se genere una spec OpenAPI, o se escriba una spec.md que incluya endpoints.
---

# Política: seguridad de APIs
<!-- EJEMPLO. Reemplazar por la política real, escrita desde la fuente de verdad de su owner.
     Owner de la política: <nombre/equipo> · Fuente de verdad: <link> · Versión: 0.1
     Cada cambio a esta skill lo aprueba el policy owner en el PR. -->

Al crear o cambiar un endpoint:
1. **Autenticación**: todo endpoint requiere el token del gateway; no hay rutas anónimas fuera de `/health`.
2. **Validación de entrada**: validar el body contra el schema (OpenAPI/Pydantic/Zod/Bean Validation) y rechazar campos desconocidos.
3. **Auditoría**: todo endpoint que cambia estado emite un evento de auditoría con actor, acción, entidad y timestamp.
4. **Clasificación de datos**: los campos marcados como PII nunca aparecen en logs ni en mensajes de error.
5. **Rate limiting**: endpoints públicos declaran su límite.

En una spec.md: agregá estos puntos a "Políticas aplicadas" y cualquier conflicto con el intent como concern con owner = owner de esta política.
En código: verificá los 5 puntos y mencioná en el resumen cómo se cumple cada uno.

> Esta skill es un control *advisory*: hace raras las violaciones. Lo que tenga que cumplirse siempre necesita además un check determinístico (hook, test o pass de review en REVIEW.md).
