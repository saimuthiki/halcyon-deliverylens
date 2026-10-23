import { Database, ListChecks, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { DeskActor } from '../api/types';

export interface ActorMeta {
  label: DeskActor;
  icon: LucideIcon;
  /** Badge colours (text + tint + border). */
  badge: string;
  /** Solid colour for dots and timeline markers. */
  solid: string;
  why: string;
}

/** Who does the work at a step. One colour and one icon per kind, used on How it works and the Order desk. */
export const ACTORS: Record<DeskActor, ActorMeta> = {
  'AI agent': {
    label: 'AI agent',
    icon: Sparkles,
    badge: 'bg-ai-tint text-ai border-ai/30',
    solid: 'bg-ai',
    why: 'Reads and writes language: messy emails in, a clear order or a polite reply out. Used only where text has to be understood.',
  },
  Rule: {
    label: 'Rule',
    icon: ListChecks,
    badge: 'bg-route-tint text-route-dark border-route/30',
    solid: 'bg-route',
    why: 'A fixed check written in code, such as "same-day after 08:00 cannot make today’s pick list". Same input, same answer, easy to audit.',
  },
  'Data lookup': {
    label: 'Data lookup',
    icon: Database,
    badge: 'bg-data-tint text-data border-data/30',
    solid: 'bg-data',
    why: 'Looks up a fact in Halcyon’s data: which client sent it, which warehouse has stock, how a carrier performs on a lane.',
  },
  Guardrail: {
    label: 'Guardrail',
    icon: ShieldCheck,
    badge: 'bg-guard-tint text-guard border-guard/30',
    solid: 'bg-guard',
    why: 'Safety check before the AI sees anything: masks personal data and stops emails that try to give the AI instructions.',
  },
};

export const ACTOR_ORDER: DeskActor[] = ['AI agent', 'Rule', 'Data lookup', 'Guardrail'];

export function ActorBadge({ actor, name, className = '' }: { actor: DeskActor; name?: string; className?: string }) {
  const m = ACTORS[actor] ?? ACTORS.Rule;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium ${m.badge} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{name ? `${name}` : m.label}</span>
      {name && <span className="sr-only">({m.label})</span>}
    </span>
  );
}
