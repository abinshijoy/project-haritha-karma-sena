import { formatLongDate } from '../lib/date';
import { Icon } from './Icon';

interface HeaderProps {
  alertCount: number;
  onAlertsClick: () => void;
}

export function Header({ alertCount, onAlertsClick }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand__mark">
          <Icon name="leaf" size={22} />
        </div>
        <div>
          <p className="brand__eyebrow">Haritha Karma Sena</p>
          <h1 className="brand__title">Collection Schedule &amp; Notifications</h1>
        </div>
      </div>

      <div className="header-actions">
        <div className="header-date">
          <Icon name="calendar" size={16} />
          <span>{formatLongDate(new Date())}</span>
        </div>
        <button
          type="button"
          className="icon-button icon-button--bell"
          onClick={onAlertsClick}
          aria-label={`View upcoming alerts${alertCount ? `, ${alertCount} scheduled` : ''}`}
        >
          <Icon name="bell" size={20} />
          {alertCount > 0 && <span className="icon-button__badge">{alertCount}</span>}
        </button>
        <div className="avatar" title="Resident account">
          KS
        </div>
      </div>
    </header>
  );
}
