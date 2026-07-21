import { useRef } from 'react';
import type { AreaGroup, Filters, Hotel, HotelStateMap, VisitStatus } from '../types';

const STATUS_LABELS: Record<VisitStatus, string> = {
  planned: '방문 예정',
  today: '오늘 방문',
  visited: '방문 완료',
  excluded: '영업 제외'
};

interface SidebarProps {
  hotels: Hotel[];
  state: HotelStateMap;
  totalCounts: Record<VisitStatus | 'total', number>;
  filteredCount: number;
  filters: Filters;
  areaGroups: AreaGroup[];
  kioskVendors: string[];
  rmsVendors: string[];
  selectedRouteDate: string;
  routeCalendar: Array<{ date: string; routeCount: number; visitedCount: number }>;
  selectedHistoryDate: string;
  historyCalendar: Array<{ date: string; visitedCount: number }>;
  isLoadingHotels: boolean;
  labelsVisible: boolean;
  canInstall: boolean;
  isOnline: boolean;
  isMobileOpen: boolean;
  onInstall: () => void;
  onAdd: () => void;
  onExportAll: () => void;
  onExportHotels: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
  onFiltersChange: (filters: Filters) => void;
  onRouteDateChange: (date: string) => void;
  onHistoryDateChange: (date: string) => void;
  onLabelsChange: (visible: boolean) => void;
  onSelectHotel: (hotel: Hotel) => void;
  onTodayRoute: () => void;
  onToggleMobilePanel: () => void;
}

export function Sidebar({
  hotels,
  state,
  totalCounts,
  filteredCount,
  filters,
  areaGroups,
  kioskVendors,
  rmsVendors,
  selectedRouteDate,
  routeCalendar,
  selectedHistoryDate,
  historyCalendar,
  isLoadingHotels,
  labelsVisible,
  canInstall,
  isOnline,
  isMobileOpen,
  onInstall,
  onAdd,
  onExportAll,
  onExportHotels,
  onImport,
  onClear,
  onFiltersChange,
  onRouteDateChange,
  onHistoryDateChange,
  onLabelsChange,
  onSelectHotel,
  onTodayRoute,
  onToggleMobilePanel
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const counts = {
    total: totalCounts.total,
    planned: totalCounts.planned,
    today: totalCounts.today,
    visited: totalCounts.visited,
    excluded: totalCounts.excluded
  };

  const updateFilter = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`}>
      <div className="header">
        <h1>숙박업 영업지도</h1>
        <span className="version">v2.2.2</span>
      </div>
      <div className="sub">STAYSYNC Sales CRM · 대표 미팅과 방문일지를 현재 기기에 자동 저장</div>
      {isLoadingHotels && <div className="sub">전국 숙소 DB 불러오는 중...</div>}
      <div className="mobile-panel-bar">
        <button className="today-route" onClick={onTodayRoute}>오늘 동선</button>
        <button className="panel-toggle" onClick={onToggleMobilePanel}>
          {isMobileOpen ? '필터 접기' : '필터 펼치기'}
        </button>
      </div>
      <div className="desktop-route">
        <button className="today-route" onClick={onTodayRoute}>오늘 동선</button>
      </div>
      <div className="sidebar-body">
      {!isOnline && (
        <div className="offline show">
          오프라인 상태야. 저장된 기록은 쓸 수 있지만 지도 타일과 네이버지도는 인터넷이 필요해.
        </div>
      )}
      <div className="toolbar">
        {canInstall && (
          <button className="primary" onClick={onInstall}>
            앱 설치
          </button>
        )}
        <button className="add" onClick={onAdd}>
          업장 추가
        </button>
      </div>
      <details className="calendar-panel utility-panel">
        <summary>백업·관리</summary>
        <div className="toolbar">
          <button onClick={onExportAll}>전체 백업</button>
          <button className="file-label" onClick={() => importInputRef.current?.click()}>
            백업 복원
          </button>
          <button onClick={onExportHotels}>업장목록 내보내기</button>
          <button className="danger" onClick={onClear}>
            기록 초기화
          </button>
        </div>
      </details>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onImport(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="stats">
        <button className={`stat total ${filters.status === '' ? 'active' : ''}`} onClick={() => updateFilter({ status: '' })}>
          <strong>{counts.total}</strong>
          <span>전체 업장</span>
        </button>
        {(['planned', 'today', 'visited', 'excluded'] as VisitStatus[]).map((status) => (
          <button
            key={status}
            className={`stat ${filters.status === status ? 'active' : ''}`}
            onClick={() => updateFilter({ status })}
          >
            <strong>{counts[status]}</strong>
            <span>{STATUS_LABELS[status]}</span>
          </button>
        ))}
      </div>

      <label className="field">업장 검색</label>
      <input
        value={filters.search}
        placeholder="업장명, 지역, 대표 미팅, 계약상태, 태그, 방문일지"
        onChange={(event) => updateFilter({ search: event.target.value })}
      />
      <label className="field">영업권역</label>
      <select value={filters.area} onChange={(event) => updateFilter({ area: event.target.value })}>
        <option value="">전체 권역</option>
        {areaGroups.map((group) => (
          <optgroup key={group.province} label={group.province}>
            {group.regions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="row">
        <div>
          <label className="field">키오스크 업체</label>
          <select value={filters.kioskVendor} onChange={(event) => updateFilter({ kioskVendor: event.target.value })}>
            <option value="">전체</option>
            <option value="없음/미확인">없음/미확인</option>
            {kioskVendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field">RMS 업체</label>
          <select value={filters.rmsVendor} onChange={(event) => updateFilter({ rmsVendor: event.target.value })}>
            <option value="">전체</option>
            <option value="미확인">미확인</option>
            {rmsVendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={labelsVisible} onChange={(event) => onLabelsChange(event.target.checked)} />핀 위
        업장명 표시
      </label>
      <button
        id="reset"
        onClick={() => onFiltersChange({ status: '', search: '', area: '', kioskVendor: '', rmsVendor: '' })}
      >
        필터 초기화
      </button>
      <div className="legend">
        {(['planned', 'today', 'visited', 'excluded'] as VisitStatus[]).map((status) => (
          <span key={status}>
            <i className={status} />
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>
      <details className="calendar-panel">
        <summary>2주 동선 달력</summary>
        <div className="route-days">
          {routeCalendar.map((day) => {
            const label = new Date(`${day.date}T00:00:00`).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
            return (
              <button
                key={day.date}
                className={`route-day ${selectedRouteDate === day.date ? 'active' : ''}`}
                onClick={() => onRouteDateChange(day.date)}
              >
                <b>{label}</b>
                <span>동선 {day.routeCount} · 방문 {day.visitedCount}</span>
              </button>
            );
          })}
        </div>
      </details>
      <details className="calendar-panel" open={Boolean(selectedHistoryDate)}>
        <summary>영업 기록 달력</summary>
        <div className="history-days">
          {historyCalendar.length ? historyCalendar.map((day) => {
            const label = new Date(`${day.date}T00:00:00`).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', weekday: 'short' });
            return (
              <button
                key={day.date}
                className={`history-day ${selectedHistoryDate === day.date ? 'active' : ''}`}
                onClick={() => onHistoryDateChange(day.date)}
              >
                <b>{label}</b>
                <span>영업 {day.visitedCount}</span>
              </button>
            );
          }) : <div className="empty compact">아직 저장된 방문일지가 없어.</div>}
        </div>
      </details>
      <div className="list">
        {filteredCount > hotels.length && (
          <div className="empty">
            조건에 맞는 업장 {filteredCount.toLocaleString('ko-KR')}개 중 {hotels.length.toLocaleString('ko-KR')}개만 표시 중이야. 검색어나 권역으로 좁히면 더 정확히 볼 수 있어.
          </div>
        )}
        {hotels.map((hotel) => {
          const hotelState = state[hotel.id];
          const latest = [...(hotelState?.logs || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
          return (
            <button key={hotel.id} className="item" onClick={() => onSelectHotel(hotel)}>
              <b>{hotel.area} {hotel.name}</b>
              <small>
                {hotelState?.salesStage || '미접촉'} · {hotelState?.meeting || '대표 미팅 정보 없음'}
                {latest ? ` · ${latest.note}` : hotelState?.memo ? ` · ${hotelState.memo}` : ''}
                {hotelState?.nextVisit ? ` · 다음 ${hotelState.nextVisit}` : ''}
              </small>
            </button>
          );
        })}
        {!hotels.length && (
          <div className="empty">
            {isLoadingHotels
              ? '전국 숙소 DB를 불러오는 중이야.'
              : filters.status === '' || filters.status === 'planned'
                ? '검색어나 권역으로 좁히면 업장 목록과 지도 핀이 표시돼.'
                : '조건에 맞는 업장이 없어.'}
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}
