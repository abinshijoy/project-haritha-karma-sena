import { useCallback, useMemo, useState } from 'react';
import type {
  AlertSettings,
  CollectionStatus,
  NotificationLogEntry,
  Toast,
  ViewMode,
  WasteType,
} from './types';
import { ALL_WARDS, COLLECTION_RULES, PANCHAYATS, WARD_BY_ID } from './data/mockData';
import { DEFAULT_SETTINGS, WASTE_TYPES } from './lib/constants';
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth, toISO } from './lib/date';
import { buildEvents } from './lib/schedule';
import { buildUpcomingAlerts, isValidIndianMobile } from './lib/alerts';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { CalendarView } from './components/CalendarView';
import { AgendaView } from './components/AgendaView';
import { DayDetail } from './components/DayDetail';
import { AlertPreferences } from './components/AlertPreferences';
import { UpcomingAlerts } from './components/UpcomingAlerts';
import { Toasts } from './components/Toasts';
import { Icon } from './components/Icon';

export default function App() {
  const [panchayatId, setPanchayatId] = useState('all');
  const [wardId, setWardId] = useState('all');
  const [wasteFilter, setWasteFilter] = useState<WasteType[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | CollectionStatus>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>('month');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [settings, setSettings] = useLocalStorage<AlertSettings>('hks:alert-settings', DEFAULT_SETTINGS);
  const [log, setLog] = useLocalStorage<NotificationLogEntry[]>('hks:notification-log', []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  );

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, message, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const allEvents = useMemo(() => {
    const from = addDays(startOfMonth(new Date()), -7);
    const to = endOfMonth(addMonths(new Date(), 2));
    return buildEvents(COLLECTION_RULES, from, to);
  }, []);

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allEvents.filter((event) => {
      if (panchayatId !== 'all' && event.panchayatId !== panchayatId) return false;
      if (wardId !== 'all' && event.wardId !== wardId) return false;
      if (wasteFilter.length && !event.wasteTypes.some((type) => wasteFilter.includes(type))) return false;
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;
      if (!needle) return true;

      const searchable = [
        WARD_BY_ID.get(event.wardId)?.name ?? '',
        event.panchayatId,
        event.crew,
        event.notes ?? '',
        ...event.wasteTypes.map((type) => WASTE_TYPES[type].label),
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [allEvents, panchayatId, wardId, wasteFilter, statusFilter, query]);

  const agendaEvents = useMemo(() => {
    const today = toISO(new Date());
    return filteredEvents.filter(
      (event) => event.date >= today && diffDays(new Date(), event.date) <= 30 && event.status !== 'completed',
    );
  }, [filteredEvents]);

  const upcomingAlerts = useMemo(() => buildUpcomingAlerts(allEvents, settings), [allEvents, settings]);

  const monthPrefix = toISO(month).slice(0, 7);
  const monthlyPickups = allEvents.filter(
    (event) => event.date.startsWith(monthPrefix) && event.status !== 'holiday',
  ).length;
  const visibleResultCount = view === 'month'
    ? filteredEvents.filter((event) => event.date.startsWith(monthPrefix)).length
    : agendaEvents.length;

  const clearFilters = () => {
    setPanchayatId('all');
    setWardId('all');
    setWasteFilter([]);
    setStatusFilter('all');
    setQuery('');
  };

  const changePanchayat = (value: string) => {
    setPanchayatId(value);
    if (wardId !== 'all') {
      const stillVisible = PANCHAYATS.find((p) => p.id === value)?.wards.some((w) => w.id === wardId);
      if (!stillVisible) setWardId('all');
    }
  };

  const toggleWasteFilter = (type: WasteType) => {
    setWasteFilter((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const toggleWard = (wardIdToToggle: string) => {
    const subscribed = settings.wards.includes(wardIdToToggle);
    setSettings({
      ...settings,
      wards: subscribed
        ? settings.wards.filter((id) => id !== wardIdToToggle)
        : [...settings.wards, wardIdToToggle],
    });
    const name = WARD_BY_ID.get(wardIdToToggle)?.name ?? wardIdToToggle;
    notify(
      subscribed ? `Alerts turned off for ${name}` : `Alerts turned on for ${name}`,
      subscribed ? 'info' : 'success',
    );
  };

  const enablePush = async () => {
    if (typeof Notification === 'undefined') {
      notify('Push notifications are not supported in this browser.', 'warning');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') notify('Push alerts enabled on this device');
      else notify('Permission not granted — in-app reminders still work.', 'warning');
    } catch {
      notify('Could not request notification permission.', 'warning');
    }
  };

  const sendTestAlert = () => {
    if (!settings.enabled) {
      notify('Turn on pickup alerts before sending a test.', 'warning');
      return;
    }

    const channels: Array<'push' | 'sms'> = [];
    if (settings.channels.push) channels.push('push');
    if (settings.channels.sms) {
      if (!isValidIndianMobile(settings.phone)) {
        notify('Enter a valid 10-digit mobile number for SMS alerts.', 'warning');
        return;
      }
      channels.push('sms');
    }
    if (channels.length === 0) {
      notify('Enable push or SMS first.', 'warning');
      return;
    }

    const title = 'Test alert · Haritha Karma Sena';
    const body = 'This is a test reminder. Your pickup alert setup is working.';
    const at = new Date().toISOString();
    setLog((prev) => [
      ...channels.map((channel) => ({
        id: `test-${Date.now()}-${channel}`,
        at,
        channel,
        title,
        body,
        kind: 'test' as const,
      })),
      ...prev,
    ]);

    if (settings.channels.push && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch {
        // Some browsers require a service worker; the in-app log still records it.
      }
    }

    notify(channels.length > 1 ? 'Test push and SMS alerts sent' : `Test ${channels[0]} alert sent`);
  };

  const scrollToAlerts = () => {
    document.getElementById('alerts-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedDateEvents = selectedDate
    ? filteredEvents.filter((event) => event.date === selectedDate)
    : [];

  return (
    <div className="app-shell">
      <Header alertCount={upcomingAlerts.length} onAlertsClick={scrollToAlerts} />

      <main className="app-main">
        <div className="main-column">
          <div className="page-intro">
            <div>
              <p className="page-intro__eyebrow">Waste collection desk</p>
              <h2>Know exactly when the truck comes.</h2>
              <p className="page-intro__lead">
                Check verified pickup dates for your ward, then switch on reminders so nothing is missed.
              </p>
            </div>
            <div className="stat-strip">
              <div className="stat">
                <strong>{PANCHAYATS.length}</strong>
                <span>Panchayats</span>
              </div>
              <div className="stat">
                <strong>{ALL_WARDS.length}</strong>
                <span>Wards</span>
              </div>
              <div className="stat">
                <strong>{monthlyPickups}</strong>
                <span>Pickups this month</span>
              </div>
            </div>
          </div>

          <FilterBar
            panchayats={PANCHAYATS}
            panchayatId={panchayatId}
            wardId={wardId}
            onPanchayatChange={changePanchayat}
            onWardChange={setWardId}
            wasteFilter={wasteFilter}
            onWasteToggle={toggleWasteFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            resultCount={visibleResultCount}
            onClear={clearFilters}
          />

          {view === 'month' ? (
            <CalendarView
              month={month}
              events={filteredEvents}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPrevMonth={() => setMonth((prev) => addMonths(prev, -1))}
              onNextMonth={() => setMonth((prev) => addMonths(prev, 1))}
              onToday={() => setMonth(startOfMonth(new Date()))}
            />
          ) : (
            <AgendaView events={agendaEvents} settings={settings} onToggleWard={toggleWard} />
          )}
        </div>

        <aside className="side-column" aria-label="Alert settings and notifications">
          <AlertPreferences
            settings={settings}
            onChange={setSettings}
            panchayats={PANCHAYATS}
            onTest={sendTestAlert}
            onEnablePush={enablePush}
            pushPermission={pushPermission}
          />
          <UpcomingAlerts alerts={upcomingAlerts} log={log} settings={settings} />

          <section className="info-card">
            <div className="panel__title">
              <span className="panel__icon panel__icon--blue">
                <Icon name="info" size={17} />
              </span>
              <div>
                <h2>How reminders work</h2>
                <p>Delivery rules at a glance</p>
              </div>
            </div>
            <ul>
              <li>Alerts are calculated from the exact pickup start time, minus your chosen lead time.</li>
              <li>Messages during quiet hours are held until the window ends.</li>
              <li>Holidays with no pickup never trigger a reminder.</li>
              <li>Preferences are saved on this device.</li>
            </ul>
          </section>
        </aside>
      </main>

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          events={selectedDateEvents}
          settings={settings}
          onToggleWard={toggleWard}
          onClose={() => setSelectedDate(null)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
