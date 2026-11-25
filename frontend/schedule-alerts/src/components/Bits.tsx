import type { CollectionStatus, WasteType } from '../types';
import { STATUS_LABELS, WASTE_TYPES } from '../lib/constants';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'toggle--on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

interface WastePillProps {
  type: WasteType;
  compact?: boolean;
}

export function WastePill({ type, compact = false }: WastePillProps) {
  const meta = WASTE_TYPES[type];
  return (
    <span
      className={`waste-pill ${compact ? 'waste-pill--compact' : ''}`}
      style={{ color: meta.color, backgroundColor: meta.tint }}
    >
      <span className="waste-pill__dot" style={{ backgroundColor: meta.color }} />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: CollectionStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {status === 'completed' && <span aria-hidden="true">✓</span>}
      {STATUS_LABELS[status]}
    </span>
  );
}
