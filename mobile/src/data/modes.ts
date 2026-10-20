import type { OperatorMode } from './types';

export interface ModeSpec {
  id: OperatorMode;
  label: string;
  blurb: string;
  /** Warm or cool tint of the light bloom behind the screen. */
  glow: string;
  /** Where the bloom sits, as fractions of the screen. */
  glowAt: { x: number; y: number };
}

export const MODES: ModeSpec[] = [
  {
    id: 'on_site',
    label: 'On Site',
    blurb: 'On Site mode keeps the job in front of you. Timer running, photos, notes and materials a tap away.',
    glow: '#E6D7BD',
    glowAt: { x: 0.78, y: 0.58 },
  },
  {
    id: 'en_route',
    label: 'En Route',
    blurb: 'En Route mode puts the next address, the customer’s number and your arrival time on one screen.',
    glow: '#C9D3D6',
    glowAt: { x: 0.25, y: 0.42 },
  },
  {
    id: 'on_call',
    label: 'On Call',
    blurb: 'On Call mode keeps you reachable for emergency call-outs, with the job sheet ready the moment you accept.',
    glow: '#E7B98C',
    glowAt: { x: 0.7, y: 0.32 },
  },
  {
    id: 'workshop',
    label: 'Workshop',
    blurb: 'Workshop mode is for quotes, stock and the admin you keep putting off. Nothing slips past you.',
    glow: '#D8D2C4',
    glowAt: { x: 0.5, y: 0.66 },
  },
  {
    id: 'off_shift',
    label: 'Off Shift',
    blurb: 'Off Shift mode mutes the noise. Only emergencies from your regulars get through.',
    glow: '#8E9AA6',
    glowAt: { x: 0.35, y: 0.75 },
  },
];

export const modeById = (id: OperatorMode) => MODES.find((m) => m.id === id) ?? MODES[0];
