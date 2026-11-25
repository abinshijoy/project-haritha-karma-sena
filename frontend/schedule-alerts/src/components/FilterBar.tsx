import type { CollectionStatus, Panchayat, ViewMode, WasteType } from '../types';
import { STATUS_LABELS, WASTE_TYPE_KEYS, WASTE_TYPES } from '../lib/constants';
import { Icon } from './Icon';

interface FilterBarProps {
  panchayats: Panchayat[];
  panchayatId: string;
  wardId: string;
  onPanchayatChange: (value: string) => void;
  onWardChange: (value: string) => void;
  wasteFilter: WasteType[];
  onWasteToggle: (type: WasteType) => void;
  statusFilter: 'all' | CollectionStatus;
  onStatusChange: (value: 'all' | CollectionStatus) => void;
  query: string;
  onQueryChange: (value: string) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  resultCount: number;
  onClear: () => void;
}

const STATUSES: CollectionStatus[] = ['scheduled', 'in-progress', 'completed', 'holiday'];

export function FilterBar({
  panchayats,
  panchayatId,
  wardId,
  onPanchayatChange,
  onWardChange,
  wasteFilter,
  onWasteToggle,
  statusFilter,
  onStatusChange,
  query,
  onQueryChange,
  view,
  onViewChange,
  resultCount,
  onClear,
}: FilterBarProps) {
  const visibleWards = panchayatId === 'all' ? panchayats.flatMap((p) => p.wards) : panchayats.find((p) => p.id === panchayatId)?.wards ?? [];
  const hasFilters =
    panchayatId !== 'all' ||
    wardId !== 'all' ||
    wasteFilter.length > 0 ||
    statusFilter !== 'all' ||
    query.trim() !== '';

  return (
    <section className="filter-bar" aria-label="Schedule filters">
      <div className="filter-bar__row">
        <label className="field">
          <span className="field__label">Panchayat</span>
          <span className="select-wrap">
            <Icon name="mapPin" size={15} />
            <select
              value={panchayatId}
              onChange={(event) => onPanchayatChange(event.target.value)}
              aria-label="Filter by panchayat"
            >
              <option value="all">All panchayats</option>
              {panchayats.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className="field">
          <span className="field__label">Ward</span>
          <span className="select-wrap">
            <Icon name="users" size={15} />
            <select
              value={wardId}
              onChange={(event) => onWardChange(event.target.value)}
              aria-label="Filter by ward"
            >
              <option value="all">All wards</option>
              {panchayatId === 'all' &&
                panchayats.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        Ward {w.code.split('-')[1]} · {w.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              {panchayatId !== 'all' &&
                visibleWards.map((w) => (
                  <option key={w.id} value={w.id}>
                    Ward {w.code.split('-')[1]} · {w.name}
                  </option>
                ))}
            </select>
          </span>
        </label>

        <label className="field field--grow">
          <span className="field__label">Search</span>
          <span className="input-wrap">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Ward, crew or waste type…"
              aria-label="Search pickups"
            />
          </span>
        </label>

        <label className="field">
          <span className="field__label">Status</span>
          <span className="select-wrap">
            <select
              value={statusFilter}
              onChange={(event) => onStatusChange(event.target.value as 'all' | CollectionStatus)}
              aria-label="Filter by status"
            >
              <option value="all">Any status</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>

      <div className="filter-bar__row filter-bar__row--secondary">
        <div className="waste-filters" role="group" aria-label="Filter by waste type">
          <span className="filter-caption">Waste type</span>
          {WASTE_TYPE_KEYS.map((type) => {
            const active = wasteFilter.includes(type);
            return (
              <button
                key={type}
                type="button"
                className={`filter-chip ${active ? 'filter-chip--active' : ''}`}
                style={active ? { borderColor: WASTE_TYPES[type].color, color: WASTE_TYPES[type].color } : undefined}
                aria-pressed={active}
                onClick={() => onWasteToggle(type)}
              >
                <span className="filter-chip__dot" style={{ backgroundColor: WASTE_TYPES[type].color }} />
                {WASTE_TYPES[type].short}
              </button>
            );
          })}
        </div>

        <div className="filter-bar__end">
          <span className="result-count">{resultCount} pickups</span>
          {hasFilters && (
            <button type="button" className="text-button" onClick={onClear}>
              Clear filters
            </button>
          )}
          <div className="view-toggle" role="group" aria-label="Schedule view">
            <button
              type="button"
              className={view === 'month' ? 'is-active' : ''}
              aria-pressed={view === 'month'}
              onClick={() => onViewChange('month')}
            >
              <Icon name="grid" size={15} /> Month
            </button>
            <button
              type="button"
              className={view === 'agenda' ? 'is-active' : ''}
              aria-pressed={view === 'agenda'}
              onClick={() => onViewChange('agenda')}
            >
              <Icon name="list" size={15} /> Agenda
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
