import type { ReactNode } from 'react';
import type { AlertSettings, NotificationLogEntry, ScheduledAlert } from '../types';
import { formatClock, relativeDayLabel, toISO } from '../lib/date';
import { Icon } from './Icon';

interface UpcomingAlertsProps {
  alerts: ScheduledAlert[];
  log: NotificationLogEntry[];
  settings: AlertSettings;
}

function EmptyState({ icon, title, hint }: { icon: 'bell' | 'alert' | 'moon'; title: string; hint: string }) {
  return (
    <div className="panel-empty">
      <Icon name={icon} size={22} />
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
}

export function UpcomingAlerts({ alerts, log, settings }: UpcomingAlertsProps) {
  const channelsOn = settings.channels.push || settings.channels.sms;

  let content: ReactNode;
  if (!settings.enabled) {
    content = <EmptyState icon="bell" title="Alerts are paused" hint="Turn the switch on above to plan reminders." />;
  } else if (!channelsOn) {
    content = <EmptyState icon="alert" title="No channel selected" hint="Enable push or SMS to receive reminders." />;
  } else if (settings.wards.length === 0) {
    content = <EmptyState icon="bell" title="No wards subscribed" hint="Choose at least one ward in preferences." />;
  } else if (alerts.length === 0) {
    content = <EmptyState icon="moon" title="Nothing due soon" hint="No qualifying pickups in the next two weeks." />;
  } else {
    content = (
      <ul className="alert-list">
        {alerts.slice(0, 6).map((alert) => (
          <li key={alert.id} className="alert-list__item">
            <span className={`alert-list__icon alert-list__icon--${alert.channel}`}>
              <Icon name={alert.channel === 'push' ? 'bell' : 'message'} size={15} />
            </span>
            <div className="alert-list__content">
              <div className="alert-list__top">
                <strong>{alert.title}</strong>
                <span className="alert-list__channel">{alert.channel.toUpperCase()}</span>
              </div>
              <p>{alert.body}</p>
              <span className="alert-list__time">
                <Icon name="clock" size={12} />
                {relativeDayLabel(toISO(alert.sendAt))} at {formatClock(alert.sendAt)}
                {alert.delayedForQuietHours && ' · moved past quiet hours'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="panel upcoming" id="alerts-panel">
      <div className="panel__header">
        <div className="panel__title">
          <span className="panel__icon panel__icon--amber">
            <Icon name="bell" size={17} />
          </span>
          <div>
            <h2>Upcoming alerts</h2>
            <p>Next 14 days of pickups</p>
          </div>
        </div>
        {alerts.length > 0 && settings.enabled && <span className="count-badge">{alerts.length}</span>}
      </div>
      <div className="panel__body panel__body--tight">{content}</div>

      <div className="delivery-log">
        <div className="delivery-log__head">
          <h3>Delivery log</h3>
          <span>Recent</span>
        </div>
        {log.length === 0 ? (
          <p className="muted">No messages sent yet. Try a test alert.</p>
        ) : (
          <ul>
            {log.slice(0, 4).map((entry) => (
              <li key={entry.id}>
                <span className={`log-dot log-dot--${entry.channel}`} />
                <div>
                  <strong>{entry.title}</strong>
                  <time>{new Date(entry.at).toLocaleString('en-IN')}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
