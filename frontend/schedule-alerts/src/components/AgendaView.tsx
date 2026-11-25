import type { AlertSettings, CollectionEvent } from '../types';
import { PANCHAYAT_BY_ID, WARD_BY_ID } from '../data/mockData';
import { formatLongDate, relativeDayLabel } from '../lib/date';
import { groupEventsByDate } from '../lib/schedule';
import { Icon } from './Icon';
import { StatusBadge, WastePill } from './Bits';

interface AgendaViewProps {
  events: CollectionEvent[];
  settings: AlertSettings;
  onToggleWard: (wardId: string) => void;
}

export function AgendaView({ events, settings, onToggleWard }: AgendaViewProps) {
  const grouped = groupEventsByDate(events);

  if (grouped.size === 0) {
    return (
      <section className="agenda agenda--empty">
        <Icon name="calendar" size={32} />
        <h2>No pickups in the next 30 days</h2>
        <p>Try clearing a filter or choosing another panchayat or ward.</p>
      </section>
    );
  }

  return (
    <section className="agenda" aria-label="Upcoming collection agenda">
      <div className="agenda__intro">
        <h2 className="section-title">Upcoming pickups</h2>
        <p className="section-subtitle">Next 30 days · tap the bell to get alerts for a ward</p>
      </div>

      {[...grouped.entries()].map(([date, dayEvents]) => (
        <div key={date} className="agenda__day">
          <div className="agenda__date">
            <span className="agenda__date-main">{relativeDayLabel(date)}</span>
            <span className="agenda__date-sub">{formatLongDate(date)}</span>
          </div>
          <div className="agenda__items">
            {dayEvents.map((event) => {
              const ward = WARD_BY_ID.get(event.wardId);
              const panchayat = PANCHAYAT_BY_ID.get(event.panchayatId);
              const subscribed = settings.wards.includes(event.wardId);

              return (
                <article key={event.id} className="agenda-card">
                  <div className="agenda-card__time">
                    <strong>{event.startTime}</strong>
                    <span>to {event.endTime}</span>
                  </div>
                  <div className="agenda-card__body">
                    <div className="agenda-card__heading">
                      <h3>{ward?.name ?? event.wardId}</h3>
                      <span className="agenda-card__panchayat">
                        <Icon name="mapPin" size={13} /> {panchayat?.name ?? '—'}
                      </span>
                      <StatusBadge status={event.status} />
                    </div>
                    <div className="agenda-card__types">
                      {event.wasteTypes.map((type) => (
                        <WastePill key={type} type={type} />
                      ))}
                    </div>
                    <p className="agenda-card__meta">
                      <Icon name="users" size={13} /> {event.crew}
                      {event.notes && <span> · {event.notes}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`subscribe-button ${subscribed ? 'subscribe-button--on' : ''}`}
                    onClick={() => onToggleWard(event.wardId)}
                    aria-label={`${subscribed ? 'Unsubscribe from' : 'Subscribe to'} alerts for ${ward?.name ?? event.wardId}`}
                    title={subscribed ? 'Alerts on for this ward' : 'Turn on alerts for this ward'}
                  >
                    <Icon name="bell" size={17} />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
