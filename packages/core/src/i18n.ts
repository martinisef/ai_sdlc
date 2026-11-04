// User/agent-facing messages. Spanish strings are the original plugin texts.
export type Locale = 'en' | 'es';

type Params = Record<string, string | number>;
type Messages = Record<string, (p: Params) => string>;

const es: Messages = {
  'protected.deny': (p) =>
    `Bloqueado por ai-sdlc: '${p.path}' es una ruta protegida ('${p.glob}' en ${p.config} → protected_paths).
Estos archivos no se editan desde una sesión del agente (código generado, paquetes congelados, migraciones o infra).
Si el cambio es necesario: dejalo anotado en plan.md como riesgo y pedile a un code owner que lo haga o que apruebe sacar la ruta de protected_paths.`,
  'appendonly.deny': (p) =>
    `Bloqueado por ai-sdlc: '${p.path}' ya existe y es de solo agregar ('${p.glob}' en ${p.config} → append_only_paths).
Una migración aplicada no se edita: el cambio va en un archivo nuevo (por ejemplo, una migración nueva que corrija la anterior).`,
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
  'next.building': () => '/sdlc-build para terminar, después /sdlc-ship',
  'next.quick-ready': () => '/sdlc-quick para implementar el cambio chico con tests, después /sdlc-ship',
  'prepush.quick': (p) => `Bloqueado por ai-sdlc: ${p.change} va por el carril rápido pero ${p.reason}. Promovelo al loop completo (sdlc promote ${p.change}) y seguí con /sdlc-intent, o achicá el cambio.`,
  'quick.disabled': () => 'El carril rápido está deshabilitado en este proyecto (quick_lane.enabled: false): usá sdlc new.',
  'next.rejected': () => 'cambio rechazado: archivarlo o reabrir el intent',
  'nx.init': () => 'Este repo no está configurado para el loop',
  'nx.new': () => 'No hay cambios en curso: empezá uno',
  'nx.switch': (p) => `Sin cambio activo en esta rama; ${p.change} está en ${p.stage}`,
  'nx.approve': (p) => `Te toca decidir el ${p.artifact} de ${p.change}`,
  'nx.wait': (p) => `${p.change} espera la aprobación del ${p.artifact} por ${p.who}`,
  'nx.someone': () => 'otra persona',
  'nx.agent': (p) => `Siguiente: ${p.next}`,
  'nx.done': (p) => `${p.change} está mergeado; empezá el próximo`,
  'nx.roadmap.approve': (p) => `Te toca decidir el roadmap ${p.roadmap} (${p.stories} historias)`,
  'nx.roadmap.draft': (p) => `El roadmap ${p.roadmap} sigue en borrador (${p.problems})`,
  'nx.roadmap.apply': (p) => `El roadmap ${p.roadmap} está aprobado: faltan crear ${p.missing} tickets`,
  'nx.story': (p) => `Próxima historia del roadmap ${p.roadmap}: ${p.id} ${p.title} (${p.key})`,
  'nt.gate.pending': (p) => `${p.change}: el ${p.artifact} espera aprobación`,
  'nt.gate.decided': (p) => `${p.change}: ${p.artifact} ${p.decision} por ${p.by}`,
  'nt.spec.ready': (p) => `${p.change}: la spec está lista para revisar`,
  'nt.review.done': (p) => `${p.change}: terminó la revisión automática`,
  'nt.change.merged': (p) => `${p.change}: mergeado`,
  'nt.risk.raised': () => 'Circuit breaker: sube el nivel de riesgo mínimo',
  'nt.approved': () => 'aprobado',
  'nt.rejected': () => 'rechazado',
  'nt.stage': (p) => `Etapa: ${p.stage}`,
  'nt.who': (p) => `Le toca a: ${p.who}`,
  'git.override': (p) => `Si sos una persona y el cambio es intencional: SDLC_OVERRIDE=${p.policy} git commit … (queda registrado en .sdlc/events.jsonl).`,
  'prepush.noplan': (p) => `Bloqueado por ai-sdlc: la rama ${p.branch} tiene cambios de código pero ${p.change}/plan.md no está aprobado (etapa: ${p.stage}). Plan antes que código: aprobá el plan (sdlc approve ${p.change} plan) o mové el trabajo fuera de la rama del cambio.`,
};

const en: Messages = {
  'protected.deny': (p) =>
    `Blocked by ai-sdlc: '${p.path}' is a protected path ('${p.glob}' in ${p.config} → protected_paths).
These files are not edited from an agent session (generated code, frozen packages, migrations or infra).
If the change is needed: record it in plan.md as a risk and ask a code owner to make it or to approve removing the path from protected_paths.`,
  'appendonly.deny': (p) =>
    `Blocked by ai-sdlc: '${p.path}' already exists and is append-only ('${p.glob}' in ${p.config} → append_only_paths).
An applied migration is not edited: the change goes in a new file (for example, a new migration that corrects the previous one).`,
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
  'next.building': () => '/sdlc-build to finish, then /sdlc-ship',
  'next.quick-ready': () => '/sdlc-quick to implement the small change with tests, then /sdlc-ship',
  'prepush.quick': (p) => `Blocked by ai-sdlc: ${p.change} is in the quick lane but ${p.reason}. Promote it to the full loop (sdlc promote ${p.change}) and continue with /sdlc-intent, or make the change smaller.`,
  'quick.disabled': () => 'The quick lane is disabled in this project (quick_lane.enabled: false): use sdlc new.',
  'next.rejected': () => 'change rejected: archive it or reopen the intent',
  'nx.init': () => 'This repo is not set up for the loop',
  'nx.new': () => 'No change in progress: start one',
  'nx.switch': (p) => `No active change on this branch; ${p.change} is at ${p.stage}`,
  'nx.approve': (p) => `Your call: the ${p.artifact} of ${p.change}`,
  'nx.wait': (p) => `${p.change} is waiting for ${p.who} to approve the ${p.artifact}`,
  'nx.someone': () => 'another person',
  'nx.agent': (p) => `Next: ${p.next}`,
  'nx.done': (p) => `${p.change} is merged; start the next one`,
  'nx.roadmap.approve': (p) => `Your call: the roadmap ${p.roadmap} (${p.stories} stories)`,
  'nx.roadmap.draft': (p) => `The roadmap ${p.roadmap} is still a draft (${p.problems})`,
  'nx.roadmap.apply': (p) => `The roadmap ${p.roadmap} is approved: ${p.missing} tickets still to create`,
  'nx.story': (p) => `Next story of the roadmap ${p.roadmap}: ${p.id} ${p.title} (${p.key})`,
  'nt.gate.pending': (p) => `${p.change}: the ${p.artifact} is waiting for approval`,
  'nt.gate.decided': (p) => `${p.change}: ${p.artifact} ${p.decision} by ${p.by}`,
  'nt.spec.ready': (p) => `${p.change}: the spec is ready for review`,
  'nt.review.done': (p) => `${p.change}: the automated review is done`,
  'nt.change.merged': (p) => `${p.change}: merged`,
  'nt.risk.raised': () => 'Circuit breaker: the minimum risk tier goes up',
  'nt.approved': () => 'approved',
  'nt.rejected': () => 'rejected',
  'nt.stage': (p) => `Stage: ${p.stage}`,
  'nt.who': (p) => `Who acts: ${p.who}`,
  'git.override': (p) => `If you are a person and the change is intentional: SDLC_OVERRIDE=${p.policy} git commit … (recorded in .sdlc/events.jsonl).`,
  'prepush.noplan': (p) => `Blocked by ai-sdlc: branch ${p.branch} has code changes but ${p.change}/plan.md is not approved (stage: ${p.stage}). Plan before code: approve the plan (sdlc approve ${p.change} plan) or move the work off the change branch.`,
};

const catalogs: Record<Locale, Messages> = { en, es };

export function t(locale: Locale, key: string, params: Params = {}): string {
  const fn = catalogs[locale][key] ?? catalogs.en[key];
  return fn ? fn(params) : key;
}
