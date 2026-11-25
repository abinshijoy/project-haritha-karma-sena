import type { CollectionEvent } from '../types';
import { WASTE_TYPE_KEYS, WASTE_TYPES } from '../lib/constants';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatMonth,
  startOfMonth,
  startOfWeek,
  toISO,
} from '../lib/date';
import { groupEventsByDate } from '../lib/schedule';
import { Icon } from './Icon';

interface CalendarViewProps {
  month: Date;
  events: CollectionEvent[];
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export function CalendarView({
  month,
  events,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
}: CalendarViewProps) {
  const firstCell = startOfWeek(startOfMonth(month));
  const lastCell = endOfWeek(endOfMonth(month));
  const byDate = groupEventsByDate(events);
  const monthISO = formatMonth(month);
  const today = toISO(new Date());

  const cells: Date[] = [];
  for (let cursor = firstCell; cursor <= lastCell; cursor = addDays(cursor, 1)) {
    cells.push(cursor);
  }

  return (
    <section className="calendar" aria-label={`Collection calendar for ${monthISO}`}>
      <div className="calendar__header">
        <div>
          <h2 className="section-title">{monthISO}</h2>
          <p className="section-subtitle">Exact pickup dates for the selected filters</p>
        </div>
        <div className="calendar__nav">
          <button type="button" className="button button--ghost" onClick={onToday}>
            Today
          </button>
          <button type="button" className="icon-button" onClick={onPrevMonth} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="icon-button" onClick={onNextMonth} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>

      <div className="calendar__weekdays" aria-hidden="true">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar__grid">
        {cells.map((cell) => {
          const iso = toISO(cell);
          const dayEvents = byDate.get(iso) ?? [];
          const outside = cell.getMonth() !== month.getMonth();
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const hasHoliday = dayEvents.some((event) => event.status === 'holiday');

          return (
            <div
              key={iso}
              className={`day-cell ${outside ? 'day-cell--outside' : ''} ${isToday ? 'day-cell--today' : ''} ${isSelected ? 'day-cell--selected' : ''}`}
            >
              <div className="day-cell__top">
                <button
                  type="button"
                  className="day-cell__date"
                  onClick={() => onSelectDate(iso)}
                  aria-label={`${dayEvents.length} ${dayEvents.length === 1 ? 'pickup' : 'pickups'} on ${iso}${isToday ? ', today' : ''}`}
                >
                  {cell.getDate()}
                </button>
                {isToday && <span className="today-tag">Today</span>}
                {hasHoliday && !isToday && <span className="holiday-tag">Holiday</span>}
              </div>

              <div className="day-cell__events">
                {dayEvents.slice(0, 3).map((event) => {
                  const color = WASTE_TYPES[event.wasteTypes[0]].color;
                  const tint = WASTE_TYPES[event.wasteTypes[0]].tint;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`event-chip ${event.status === 'holiday' ? 'event-chip--holiday' : ''} ${event.status === 'completed' ? 'event-chip--past' : ''}`}
                      style={{ color, backgroundColor: tint, borderLeftColor: color }}
                      onClick={() => onSelectDate(iso)}
                      title={`${event.startTime}–${event.endTime} · ${event.wasteTypes.map((t) => WASTE_TYPES[t].label).join(', ')}`}
                    >
                      <span className="event-chip__time">{event.startTime}</span>
                      <span className="event-chip__type">{WASTE_TYPES[event.wasteTypes[0]].short}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <button type="button" className="more-button" onClick={() => onSelectDate(iso)}>
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="calendar__legend">
        <span className="legend-caption">Legend</span>
        {WASTE_TYPE_KEYS.slice(0, 4).map((type) => (
          <span key={type} className="legend-item">
            <span style={{ backgroundColor: WASTE_TYPES[type].color }} />
            {WASTE_TYPES[type].short}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-item__holiday" /> Holiday
        </span>
      </div>
    </section>
  );
}
