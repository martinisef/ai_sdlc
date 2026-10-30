// User/agent-facing messages. Spanish strings are the original plugin texts.
export type Locale = 'en' | 'es';

type Params = Record<string, string | number>;
type Messages = Record<string, (p: Params) => string>;

const es: Messages = {
  'protected.deny': (p) =>
    `Bloqueado por ai-sdlc: '${p.path}' es una ruta protegida ('${p.glob}' en ${p.config} → protected_paths).
Estos archivos no se editan desde una sesión del agente (código generado, paquetes congelados, migraciones o infra).
Si el cambio es necesario: dejalo anotado en plan.md como riesgo y pedile a un code owner que lo haga o que apruebe sacar la ruta de protected_paths.`,
  'secret.deny': (p) =>
    `Bloqueado por ai-sdlc: el contenido parece incluir una credencial (match: '${p.preview}…', patrón: ${p.pattern}).
Las credenciales no van al código ni al diff. Leela de una variable de entorno o del secret manager del proyecto.
Si es un falso positivo (dato de test, ejemplo de documentación), usá un valor que no tenga forma de credencial real.`,
  'testlock.deny': (p) =>
    `Bloqueado por ai-sdlc: hay un fix en curso (test-lock activo) y '${p.path}' es un archivo de test ('${p.glob}').
El test que reproduce el bug ya está commiteado: el fix tiene que hacerlo pasar sin modificarlo. Cambiá el código, no el test.
Si el test está mal escrito, decíselo al engineer: él decide si se libera el lock (sdlc lock off).`,
  'prodgate.deny': (p) =>
    `Bloqueado por ai-sdlc: el comando coincide con el gate de producción ('${p.pattern}') y falta la autorización de release.
El agente prepara el release pero no lo autoriza. Pasos: abrir/actualizar el PR con el release listo y pedirle al release manager que autorice.
La autorización se da exportando ${p.env} (por ejemplo el ID del change ticket aprobado) en el entorno de la sesión o del pipeline.`,
  'format.fail': (p) => `ai-sdlc: el formatter falló sobre ${p.path} (${p.cmd}):\n${p.out}`,
  'plansync.remind': (p) =>
    `ai-sdlc: hay cambios de código sin commitear y ${p.change}/plan.md no se modificó.
Si la implementación se desvió del plan (archivos, orden, riesgos o prueba), actualizá plan.md para que vaya en el mismo commit.
Si sigue exactamente el plan, no hace falta hacer nada: respondé brevemente y terminá.`,
  'session.noconfig': () =>
    'ai-sdlc: este repo no tiene configuración del loop. Si es un proyecto que va a trabajar en el loop AI-native, sugerile al usuario correr `sdlc init` (o /sdlc-setup).',
  'session.config': (p) => `ai-sdlc: proyecto configurado para el loop AI-native (${p.config}).`,
  'session.active': (p) => `- Cambio activo (por la rama ${p.branch}): ${p.change} — etapa: ${p.stage}${p.ticket ? ` — ticket: ${p.ticket}` : ''}.`,
  'session.next': (p) => `- Siguiente paso sugerido: ${p.next}.`,
  'session.noactive': () =>
    '- No hay cambio activo (la rama no es change/<slug>). Para empezar uno: /sdlc-intent. Para ver el estado de todos: /sdlc-status.',
  'session.lock': () => '- test-lock ACTIVO: hay un fix en curso; los archivos de test no se pueden editar.',
  'session.setup': (p) => `- SETUP.md tiene ${p.n} paso(s) pendiente(s). Mencionáselo al usuario una vez; /sdlc-setup retoma desde ahí.`,
  'status.empty': () => 'No hay cambios en changes/. Para empezar uno: /sdlc-intent',
  'next.no-intent': () => '/sdlc-intent para capturar la idea',
  'next.intent-draft': () => 'revisión del Product Owner sobre intent.md (status: accepted para avanzar)',
  'next.intent-accepted': () => '/sdlc-spec para generar spec.md',
  'next.spec-draft': () => 'revisión del PO sobre spec.md y sus Areas of concern (status: approved para avanzar)',
  'next.spec-approved': () => '/sdlc-plan para armar plan.md en plan mode',
  'next.plan-draft': () => 'terminar de iterar plan.md y aceptarlo (status: approved)',
  'next.plan-approved': () => '/sdlc-build para implementar, después /sdlc-ship',
  'next.rejected': () => 'cambio rechazado: archivarlo o reabrir el intent',
  'git.override': (p) => `Si sos una persona y el cambio es intencional: SDLC_OVERRIDE=${p.policy} git commit … (queda registrado en .sdlc/events.jsonl).`,
  'prepush.noplan': (p) => `Bloqueado por ai-sdlc: la rama ${p.branch} tiene cambios de código pero ${p.change}/plan.md no está aprobado (etapa: ${p.stage}). Plan antes que código: aprobá el plan (sdlc approve ${p.change} plan) o mové el trabajo fuera de la rama del cambio.`,
};

const en: Messages = {
  'protected.deny': (p) =>
    `Blocked by ai-sdlc: '${p.path}' is a protected path ('${p.glob}' in ${p.config} → protected_paths).
These files are not edited from an agent session (generated code, frozen packages, migrations or infra).
If the change is needed: record it in plan.md as a risk and ask a code owner to make it or to approve removing the path from protected_paths.`,
  'secret.deny': (p) =>
    `Blocked by ai-sdlc: the content looks like it contains a credential (match: '${p.preview}…', pattern: ${p.pattern}).
Credentials do not go into code or diffs. Read it from an environment variable or the project's secret manager.
If this is a false positive (test data, documentation example), use a value that does not look like a real credential.`,
  'testlock.deny': (p) =>
    `Blocked by ai-sdlc: a fix is in progress (test-lock active) and '${p.path}' is a test file ('${p.glob}').
The test reproducing the bug is already committed: the fix must make it pass without modifying it. Change the code, not the test.
If the test is wrong, tell the engineer: they decide whether to release the lock (sdlc lock off).`,
  'prodgate.deny': (p) =>
    `Blocked by ai-sdlc: the command matches the production gate ('${p.pattern}') and the release authorization is missing.
The agent prepares the release but does not authorize it. Open/update the PR with the release ready and ask the release manager to authorize it.
Authorization is given by exporting ${p.env} (e.g. the approved change ticket ID) in the session or pipeline environment.`,
  'format.fail': (p) => `ai-sdlc: the formatter failed on ${p.path} (${p.cmd}):\n${p.out}`,
  'plansync.remind': (p) =>
    `ai-sdlc: there are uncommitted code changes and ${p.change}/plan.md was not modified.
If the implementation deviated from the plan (files, order, risks or verification), update plan.md so it goes in the same commit.
If it follows the plan exactly, nothing to do: answer briefly and finish.`,
  'session.noconfig': () =>
    'ai-sdlc: this repo has no loop configuration. If the project will work in the AI-native loop, suggest running `sdlc init` (or /sdlc-setup).',
  'session.config': (p) => `ai-sdlc: project configured for the AI-native loop (${p.config}).`,
  'session.active': (p) => `- Active change (from branch ${p.branch}): ${p.change} — stage: ${p.stage}${p.ticket ? ` — ticket: ${p.ticket}` : ''}.`,
  'session.next': (p) => `- Suggested next step: ${p.next}.`,
  'session.noactive': () => '- No active change (branch is not change/<slug>). To start one: /sdlc-intent. To see all: /sdlc-status.',
  'session.lock': () => '- test-lock ACTIVE: a fix is in progress; test files cannot be edited.',
  'session.setup': (p) => `- SETUP.md has ${p.n} pending step(s). Mention it to the user once; /sdlc-setup resumes from there.`,
  'status.empty': () => 'No changes in changes/. To start one: /sdlc-intent',
  'next.no-intent': () => '/sdlc-intent to capture the idea',
  'next.intent-draft': () => 'Product Owner review of intent.md (status: accepted to move on)',
  'next.intent-accepted': () => '/sdlc-spec to write spec.md',
  'next.spec-draft': () => 'PO review of spec.md and its Areas of concern (status: approved to move on)',
  'next.spec-approved': () => '/sdlc-plan to write plan.md in plan mode',
  'next.plan-draft': () => 'finish iterating plan.md and approve it (status: approved)',
  'next.plan-approved': () => '/sdlc-build to implement, then /sdlc-ship',
  'next.rejected': () => 'change rejected: archive it or reopen the intent',
  'git.override': (p) => `If you are a person and the change is intentional: SDLC_OVERRIDE=${p.policy} git commit … (recorded in .sdlc/events.jsonl).`,
  'prepush.noplan': (p) => `Blocked by ai-sdlc: branch ${p.branch} has code changes but ${p.change}/plan.md is not approved (stage: ${p.stage}). Plan before code: approve the plan (sdlc approve ${p.change} plan) or move the work off the change branch.`,
};

const catalogs: Record<Locale, Messages> = { en, es };

export function t(locale: Locale, key: string, params: Params = {}): string {
  const fn = catalogs[locale][key] ?? catalogs.en[key];
  return fn ? fn(params) : key;
}
