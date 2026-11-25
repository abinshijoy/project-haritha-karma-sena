import { useEffect } from 'react';
import type { AlertSettings, CollectionEvent } from '../types';
import { PANCHAYAT_BY_ID, WARD_BY_ID } from '../data/mockData';
import { formatLongDate, formatTime } from '../lib/date';
import { Icon } from './Icon';
import { StatusBadge, WastePill } from './Bits';

interface DayDetailProps {
  date: string;
  events: CollectionEvent[];
  settings: AlertSettings;
  onToggleWard: (wardId: string) => void;
  onClose: () => void;
}

export function DayDetail({ date, events, settings, onToggleWard, onClose }: DayDetailProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Pickups on ${date}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <h2 className="section-title">{formatLongDate(date)}</h2>
            <p className="section-subtitle">
              {events.length} {events.length === 1 ? 'pickup' : 'pickups'} scheduled
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal__body">
          {events.length === 0 && <p className="muted">No collections are scheduled for this date.</p>}
          {events.map((event) => {
            const ward = WARD_BY_ID.get(event.wardId);
            const panchayat = PANCHAYAT_BY_ID.get(event.panchayatId);
            const subscribed = settings.wards.includes(event.wardId);
            return (
              <article key={event.id} className="detail-card">
                <div className="detail-card__row">
                  <span className="detail-card__time">
                    <Icon name="clock" size={15} />
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                  </span>
                  <StatusBadge status={event.status} />
                </div>
                <h3>
                  Ward {ward?.code.split('-')[1]} · {ward?.name ?? event.wardId}
                </h3>
                <p className="detail-card__place">
                  <Icon name="mapPin" size={14} /> {panchayat?.name ?? '—'}
                </p>
                <div className="agenda-card__types">
                  {event.wasteTypes.map((type) => (
                    <WastePill key={type} type={type} compact />
                  ))}
                </div>
                <p className="detail-card__crew">
                  <Icon name="users" size={14} /> {event.crew}
                </p>
                {event.notes && <p className="detail-card__note">{event.notes}</p>}
                <button
                  type="button"
                  className={`button ${subscribed ? 'button--outline' : 'button--primary'} detail-card__cta`}
                  onClick={() => onToggleWard(event.wardId)}
                >
                  <Icon name="bell" size={15} />
                  {subscribed ? 'Alerts on for this ward' : 'Get alerts for this ward'}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
