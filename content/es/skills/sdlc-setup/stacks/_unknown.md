# Stack sin referencia de la org

No hay decisiones de la org para este stack. Procedé así:

1. **Avisá** al usuario que no hay referencia y que vas a elegir herramientas estándar del ecosistema.
2. Elegí, para el lenguaje detectado o indicado, la opción más establecida para: gestor de paquetes, formatter, linter, test runner. Preferí las que ya estén en el repo.
3. Generá igual las mismas piezas que un stack con referencia:
   - Makefile con `build`, `test`, `lint`, `format`, `run` (un comando cada uno, exit ≠ 0 si falla).
   - `sdlc.json`: `stack`, `format_on_edit` (solo si el formatter es rápido por archivo), `test_globs`, `protected_paths` típicos (migraciones, código generado).
   - `permissions.allow` para los comandos del Makefile y los de test/lint/format del ecosistema. Nunca instalar dependencias.
   - Setup del lenguaje para el CI del proveedor.
4. **Verificá** igual que siempre: build/test/lint verdes.
5. En `SETUP.md`, sección "Propuesta para el plugin", dejá un borrador de `stacks/<lenguaje>.md` con el mismo formato que `python.md` (herramientas, Makefile, sdlc.json, permisos, convenciones, CI) para que plataforma lo revise y lo sume. Así el catálogo crece con el uso.
