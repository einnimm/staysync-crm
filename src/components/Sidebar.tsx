import { useRef } from 'react';
import type { Filters, Hotel, HotelStateMap, VisitStatus } from '../types';

const STATUS_LABELS: Record<VisitStatus, string> = {
  planned: '방문 예정',
  today: '오늘 방문',
  visited: '방문 완료',
  excluded: '영업 제외'
};

interface SidebarProps {
  hotels: Hotel[];
  state: HotelStateMap;
  filters: Filters;
  areas: string[];
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
  onLabelsChange: (visible: boolean) => void;
  onSelectHotel: (hotel: Hotel) => void;
  onTodayRoute: () => void;
  onToggleMobilePanel: () => void;
}

export function Sidebar({
  hotels,
  state,
  filters,
  areas,
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
  onLabelsChange,
  onSelectHotel,
  onTodayRoute,
  onToggleMobilePanel
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const counts = {
    total: hotels.length,
    planned: hotels.filter((hotel) => state[hotel.id]?.status === 'planned').length,
    today: hotels.filter((hotel) => state[hotel.id]?.status === 'today').length,
    visited: hotels.filter((hotel) => state[hotel.id]?.status === 'visited').length,
    excluded: hotels.filter((hotel) => state[hotel.id]?.status === 'excluded').length
  };

  const updateFilter = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`}>
      <div className="header">
        <h1>숙박업 영업지도</h1>
        <span className="version">v2.2.0</span>
      </div>
      <div className="sub">STAYSYNC Sales CRM · 대표 미팅과 방문일지를 현재 기기에 자동 저장</div>
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
        <button onClick={onExportAll}>전체 백업</button>
        <button className="file-label" onClick={() => importInputRef.current?.click()}>
          백업 복원
        </button>
        <button onClick={onExportHotels}>업장목록 내보내기</button>
        <button className="danger" onClick={onClear}>
          기록 초기화
        </button>
      </div>
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
      <div className="row">
        <div>
          <label className="field">시도</label>
          <select value={filters.area} onChange={(event) => updateFilter({ area: event.target.value })}>
            <option value="">전체 지역</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field">최소 객실</label>
          <input
            value={filters.minRooms}
            type="number"
            min="0"
            placeholder="0"
            onChange={(event) => updateFilter({ minRooms: event.target.value })}
          />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={labelsVisible} onChange={(event) => onLabelsChange(event.target.checked)} />핀 위
        업장명 표시
      </label>
      <button
        id="reset"
        onClick={() => onFiltersChange({ status: '', search: '', area: '', minRooms: '' })}
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
      <div className="list">
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
        {!hotels.length && <div className="empty">조건에 맞는 업장이 없어.</div>}
      </div>
      </div>
    </aside>
  );
}
