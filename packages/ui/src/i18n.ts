import { createContext, useContext } from 'react';

const es: Record<string, string> = {
  Board: 'Tablero',
  Inbox: 'Aprobaciones',
  Metrics: 'Métricas',
  Activity: 'Actividad',
  Settings: 'Configuración',
  Health: 'Salud',
  Intent: 'Intent',
  Spec: 'Spec',
  Plan: 'Plan',
  Build: 'Build',
  Review: 'Review',
  Merged: 'Mergeado',
  Rejected: 'Rechazado',
  'waiting for': 'espera',
  Approve: 'Aprobar',
  Accept: 'Aceptar',
  Reject: 'Rechazar',
  'Comment (optional)': 'Comentario (opcional)',
  'Next step': 'Siguiente paso',
  Timeline: 'Historial',
  'No changes yet': 'Todavía no hay cambios',
  'Start one with': 'Empezá uno con',
  'Nothing waiting for you': 'Nada esperando tu aprobación',
  'You can approve': 'Podés aprobar',
  'Not yours to approve': 'No te corresponde aprobar',
  Save: 'Guardar',
  'Preview changes': 'Ver cambios',
  'Saved and synced': 'Guardado y sincronizado',
  Sync: 'Sincronizar',
  'Not configured': 'Sin configurar',
  'Run sdlc init in this repo': 'Corré sdlc init en este repo',
  agent: 'agente',
  'Median intent → spec': 'Mediana intent → spec',
  'Median spec → plan': 'Mediana spec → plan',
  'Spec rework after plan': 'Rework de spec post-plan',
  'Guardrail blocks': 'Bloqueos de guardrails',
  'Gate decisions': 'Decisiones de gates',
  'Changes by stage': 'Cambios por etapa',
  'Changes by origin': 'Cambios por origen',
  Change: 'Cambio',
  'No activity yet': 'Sin actividad todavía',
  Enforcement: 'Enforcement',
  Checks: 'Chequeos',
  'Add workspace': 'Agregar repo',
  'Raw JSON': 'JSON',
  Form: 'Formulario',
  'one per line': 'uno por línea',
};

export type Lang = 'en' | 'es';
export const LangContext = createContext<Lang>('en');
export function useT() {
  const lang = useContext(LangContext);
  return (s: string) => (lang === 'es' ? (es[s] ?? s) : s);
}
