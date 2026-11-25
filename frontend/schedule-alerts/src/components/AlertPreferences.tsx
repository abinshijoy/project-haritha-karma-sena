import type { AlertSettings, Panchayat, Ward, WasteType } from '../types';
import { LEAD_TIME_OPTIONS, WASTE_TYPE_KEYS } from '../lib/constants';
import { isValidIndianMobile } from '../lib/alerts';
import { Toggle, WastePill } from './Bits';
import { Icon } from './Icon';

interface AlertPreferencesProps {
  settings: AlertSettings;
  onChange: (settings: AlertSettings) => void;
  panchayats: Panchayat[];
  onTest: () => void;
  onEnablePush: () => void;
  pushPermission: NotificationPermission | 'unsupported';
}

export function AlertPreferences({
  settings,
  onChange,
  panchayats,
  onTest,
  onEnablePush,
  pushPermission,
}: AlertPreferencesProps) {
  const update = (patch: Partial<AlertSettings>) => onChange({ ...settings, ...patch });
  const phoneValid = isValidIndianMobile(settings.phone);
  const allWards = panchayats.flatMap((p) => p.wards);
  const allSelected = settings.wards.length === allWards.length;

  const toggleWard = (wardId: string) => {
    const exists = settings.wards.includes(wardId);
    update({
      wards: exists ? settings.wards.filter((id) => id !== wardId) : [...settings.wards, wardId],
    });
  };

  const toggleType = (type: WasteType) => {
    const exists = settings.wasteTypes.includes(type);
    update({
      wasteTypes: exists
        ? settings.wasteTypes.filter((t) => t !== type)
        : [...settings.wasteTypes, type],
    });
  };

  return (
    <section className={`panel preferences ${settings.enabled ? '' : 'panel--muted'}`} id="alert-preferences">
      <div className="panel__header">
        <div className="panel__title">
          <span className="panel__icon">
            <Icon name="sliders" size={17} />
          </span>
          <div>
            <h2>Alert preferences</h2>
            <p>Reminders before each pickup</p>
          </div>
        </div>
        <Toggle
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
          label="Enable pickup alerts"
        />
      </div>

      <div className="panel__body">
        <div className="pref-group">
          <p className="pref-label">Delivery channels</p>
          <div className="channel-row">
            <span className="channel-row__icon channel-row__icon--push">
              <Icon name="bell" size={16} />
            </span>
            <div className="channel-row__text">
              <strong>Push notification</strong>
              <span>
                {pushPermission === 'granted'
                  ? 'Enabled on this device'
                  : pushPermission === 'unsupported'
                    ? 'Not supported in this browser'
                    : 'Browser or app notification'}
              </span>
            </div>
            <Toggle
              checked={settings.channels.push}
              onChange={(push) => update({ channels: { ...settings.channels, push } })}
              label="Push notifications"
              disabled={!settings.enabled}
            />
          </div>
          {pushPermission !== 'granted' && pushPermission !== 'unsupported' && settings.channels.push && (
            <button type="button" className="text-button text-button--inline" onClick={onEnablePush}>
              Enable on this device
            </button>
          )}

          <div className="channel-row">
            <span className="channel-row__icon channel-row__icon--sms">
              <Icon name="message" size={16} />
            </span>
            <div className="channel-row__text">
              <strong>SMS</strong>
              <span>Text message to your mobile</span>
            </div>
            <Toggle
              checked={settings.channels.sms}
              onChange={(sms) => update({ channels: { ...settings.channels, sms } })}
              label="SMS alerts"
              disabled={!settings.enabled}
            />
          </div>

          {settings.channels.sms && (
            <label className="field field--full">
              <span className="field__label">Mobile number</span>
              <span className={`input-wrap ${settings.phone && !phoneValid ? 'input-wrap--error' : ''}`}>
                <Icon name="phone" size={15} />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={settings.phone}
                  onChange={(event) => update({ phone: event.target.value.replace(/[^\d\s-]/g, '') })}
                  placeholder="98765 43210"
                  aria-label="Mobile number for SMS alerts"
                  disabled={!settings.enabled}
                />
              </span>
              {settings.phone && !phoneValid && (
                <span className="field__hint field__hint--error">Enter a valid 10-digit Indian mobile number.</span>
              )}
            </label>
          )}
        </div>

        <div className="pref-group">
          <label className="field field--full">
            <span className="field__label">Remind me</span>
            <span className="select-wrap">
              <Icon name="clock" size={15} />
              <select
                value={settings.leadMinutes}
                onChange={(event) => update({ leadMinutes: Number(event.target.value) })}
                disabled={!settings.enabled}
                aria-label="Lead time before pickup"
              >
                {LEAD_TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.reminderOnDay}
              onChange={(event) => update({ reminderOnDay: event.target.checked })}
              disabled={!settings.enabled}
            />
            <span>Remind immediately if the lead time has passed</span>
          </label>
        </div>

        <div className="pref-group">
          <div className="pref-group__head">
            <p className="pref-label">
              <Icon name="moon" size={14} /> Quiet hours
            </p>
            <Toggle
              checked={settings.quietHours.enabled}
              onChange={(enabled) =>
                update({ quietHours: { ...settings.quietHours, enabled } })
              }
              label="Respect quiet hours"
              disabled={!settings.enabled}
            />
          </div>
          <div className="time-row">
            <label className="field">
              <span className="field__label">From</span>
              <input
                type="time"
                value={settings.quietHours.start}
                onChange={(event) =>
                  update({ quietHours: { ...settings.quietHours, start: event.target.value } })
                }
                disabled={!settings.enabled || !settings.quietHours.enabled}
                aria-label="Quiet hours start"
              />
            </label>
            <label className="field">
              <span className="field__label">To</span>
              <input
                type="time"
                value={settings.quietHours.end}
                onChange={(event) =>
                  update({ quietHours: { ...settings.quietHours, end: event.target.value } })
                }
                disabled={!settings.enabled || !settings.quietHours.enabled}
                aria-label="Quiet hours end"
              />
            </label>
          </div>
          <p className="pref-help">Alerts due during these hours move to the end of the window.</p>
        </div>

        <div className="pref-group">
          <div className="pref-group__head">
            <p className="pref-label">Waste types</p>
            <button
              type="button"
              className="text-button"
              onClick={() => update({ wasteTypes: [] })}
              disabled={!settings.enabled}
            >
              {settings.wasteTypes.length === 0 ? 'All selected' : 'Select all'}
            </button>
          </div>
          <div className="type-grid">
            {WASTE_TYPE_KEYS.map((type) => {
              const active = settings.wasteTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  className={`type-option ${active ? 'type-option--on' : ''}`}
                  aria-pressed={active}
                  disabled={!settings.enabled}
                  onClick={() => toggleType(type)}
                >
                  <WastePill type={type} compact />
                  <span className="type-option__check">
                    {active && <Icon name="check" size={12} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="pref-help">
            {settings.wasteTypes.length === 0
              ? 'You will be alerted for every waste type.'
              : `Only ${settings.wasteTypes.length} selected type${settings.wasteTypes.length > 1 ? 's' : ''}.`}
          </p>
        </div>

        <div className="pref-group">
          <div className="pref-group__head">
            <p className="pref-label">Subscribed wards</p>
            <button
              type="button"
              className="text-button"
              onClick={() => update({ wards: allSelected ? [] : allWards.map((w: Ward) => w.id) })}
              disabled={!settings.enabled}
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="ward-list">
            {panchayats.map((panchayat) => (
              <div key={panchayat.id} className="ward-list__group">
                <p className="ward-list__group-name">{panchayat.name}</p>
                {panchayat.wards.map((ward) => (
                  <label key={ward.id} className="ward-row">
                    <input
                      type="checkbox"
                      checked={settings.wards.includes(ward.id)}
                      onChange={() => toggleWard(ward.id)}
                      disabled={!settings.enabled}
                    />
                    <span>
                      Ward {ward.code.split('-')[1]} · {ward.name}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="button button--primary button--block" onClick={onTest}>
          <Icon name="send" size={16} /> Send test alert
        </button>
      </div>
    </section>
  );
}
