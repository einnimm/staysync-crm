import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { HotelForm, type EditorDraft } from './components/HotelForm';
import { HotelPopup } from './components/HotelPopup';
import { Map } from './components/Map';
import { DEFAULT_HOTELS } from './lib/defaultHotels';
import { loadSavedHotels, loadSavedState, saveAll } from './lib/storage';
import type { ActionMap, Filters, Hotel, HotelState, HotelStateMap, SalesStage, VisitStatus } from './types';

const ACTIONS = ['명함 전달', '직원 설명 완료', '대표 미팅 완료', '견적 전달', '프로모션 안내', '계약서 전달', '도입 완료'];
const MAX_RENDERED_HOTELS = 500;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function newId(): string {
  return `hotel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultStage(hotel: Hotel): SalesStage {
  if (hotel.initialStatus === 'excluded') return '영업제외';
  if (hotel.initialStatus === 'visited') return '상담중';
  return '미접촉';
}

function normalizeHotel(hotel: Partial<Hotel>): Hotel {
  const rooms = hotel.rooms as number | string | null | undefined;
  return {
    id: hotel.id || newId(),
    area: hotel.area || '',
    name: hotel.name || '이름 없음',
    rooms: rooms === null || rooms === undefined || rooms === '' ? null : Number(rooms),
    note: hotel.note || '',
    vendor: hotel.vendor || '미확인',
    address: hotel.address || '정확한 주소 확인 필요',
    lat: Number(hotel.lat) || 35.22,
    lon: Number(hotel.lon) || 128.82,
    approx: hotel.approx !== false,
    legal: hotel.legal,
    excluded: hotel.excluded,
    kiosk: hotel.kiosk,
    initialStatus: hotel.initialStatus || 'planned',
    initialMemo: hotel.initialMemo || '',
    initialVisitCount: Number(hotel.initialVisitCount) || 0,
    initialLastVisit: hotel.initialLastVisit || '',
    initialNextVisit: hotel.initialNextVisit || '',
    initialMeeting: hotel.initialMeeting || '',
    initialSalesStage: hotel.initialSalesStage,
    initialTags: Array.isArray(hotel.initialTags) ? hotel.initialTags : []
  };
}

function createInitialState(hotel: Hotel, saved?: Partial<HotelState>): HotelState {
  const base: HotelState = {
    status: hotel.initialStatus,
    memo: hotel.initialMemo || '',
    visitCount: hotel.initialVisitCount || 0,
    lastVisit: hotel.initialLastVisit || '',
    nextVisit: hotel.initialNextVisit || '',
    meeting: hotel.initialMeeting || '',
    salesStage: hotel.initialSalesStage || defaultStage(hotel),
    actions: {},
    tags: hotel.initialTags || [],
    logs: []
  };

  const merged: HotelState = {
    ...base,
    ...saved,
    actions: saved?.actions && typeof saved.actions === 'object' ? saved.actions : base.actions,
    tags: Array.isArray(saved?.tags)
      ? saved.tags
      : String(saved?.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
    logs: Array.isArray(saved?.logs) ? saved.logs : []
  };

  if (!merged.logs.length && merged.memo && merged.lastVisit) {
    merged.logs = [
      {
        id: `migrated-${hotel.id}`,
        date: merged.lastVisit,
        type: '기존 방문기록',
        note: merged.memo,
        createdAt: new Date().toISOString()
      }
    ];
  }

  return merged;
}

function loadInitialHotels(): Hotel[] {
  const savedHotels = loadSavedHotels();
  if (!savedHotels) return DEFAULT_HOTELS.map(normalizeHotel);

  const normalizedSaved = savedHotels.map(normalizeHotel);
  return mergeDefaultHotels(normalizedSaved, DEFAULT_HOTELS);
}

function mergeDefaultHotels(savedHotels: Hotel[], defaultHotels: Hotel[]): Hotel[] {
  const savedIds = new Set(savedHotels.map((hotel) => hotel.id));
  return [
    ...savedHotels,
    ...defaultHotels.map(normalizeHotel).filter((hotel) => !savedIds.has(hotel.id))
  ];
}

async function loadDefaultHotels(): Promise<Hotel[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}default-hotels.json`);
  if (!response.ok) throw new Error('Default hotel data load failed');
  const hotels = (await response.json()) as Partial<Hotel>[];
  return hotels.map(normalizeHotel);
}

function buildState(hotels: Hotel[], savedState: Partial<HotelStateMap> = loadSavedState()): HotelStateMap {
  return hotels.reduce<HotelStateMap>((acc, hotel) => {
    acc[hotel.id] = createInitialState(hotel, savedState[hotel.id]);
    return acc;
  }, {});
}

function downloadJSON(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

function matchesFilters(hotel: Hotel, state: HotelStateMap, filters: Filters) {
  const hotelState = state[hotel.id];
  if (!hotelState || (filters.status && hotelState.status !== filters.status)) return false;
  const minRooms = Number(filters.minRooms || 0);
  const salesRegion = getSalesRegion(hotel);
  const logText = hotelState.logs.map((log) => `${log.date} ${log.type} ${log.note}`).join(' ');
  const haystack = [
    hotel.area,
    salesRegion,
    hotel.name,
    hotel.note,
    hotel.vendor,
    hotel.address,
    hotelState.memo,
    hotelState.meeting,
    hotelState.salesStage,
    Object.keys(hotelState.actions).filter((action) => hotelState.actions[action]).join(' '),
    hotelState.tags.join(' '),
    logText
  ]
    .join(' ')
    .toLowerCase();

  return (
    (!filters.search.trim() || haystack.includes(filters.search.trim().toLowerCase())) &&
    (!filters.area || salesRegion === filters.area) &&
    (!minRooms || (hotel.rooms || 0) >= minRooms)
  );
}

function getSalesRegion(hotel: Hotel): string {
  const area = hotel.area.trim();
  const first = area.split(/\s+/)[0];
  const regionMap: Record<string, string> = {
    부원동: '김해',
    주촌: '김해',
    삼계: '김해',
    내외동: '김해',
    어방동: '김해',
    외동: '김해',
    율하: '장유',
    장유: '장유',
    명서: '창원',
    봉곡: '창원',
    상남: '창원',
    용호: '창원',
    가포: '마산',
    내서: '마산',
    댓거리: '마산',
    오동동: '마산',
    합성: '마산',
    중앙: '마산',
    진동: '마산',
    진북: '마산',
    진해: '진해',
    중앙동: '진해',
    두동: '진해',
    신호동: '부산 강서/신항',
    신항: '부산 강서/신항',
    용원: '부산 강서/신항',
    명지: '부산 강서/신항',
    지사동: '부산 강서/신항',
    하단: '부산 사하',
    다대포: '부산 사하',
    남포: '부산 중구·남포',
    송도: '부산 서구·송도',
    영도: '부산 영도',
    경주: '경주'
  };

  if (first === '두동') return '진해';
  return regionMap[first] || first || '기타';
}

export default function App() {
  const [hotels, setHotels] = useState<Hotel[]>(() => loadInitialHotels());
  const [state, setState] = useState<HotelStateMap>(() => buildState(loadInitialHotels()));
  const [filters, setFilters] = useState<Filters>({ status: '', search: '', area: '', minRooms: '' });
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [todayRouteFocusKey, setTodayRouteFocusKey] = useState(0);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isLoadingHotels, setIsLoadingHotels] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadDefaultHotels()
      .then((defaultHotels) => {
        if (cancelled) return;
        const savedHotels = (loadSavedHotels() || []).map(normalizeHotel);
        const nextHotels = mergeDefaultHotels(savedHotels, defaultHotels);
        setHotels(nextHotels);
        setState(buildState(nextHotels, loadSavedState()));
      })
      .catch((error) => {
        console.error('기본 숙소 데이터 로드 오류', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHotels(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const visibleHotels = useMemo(
    () =>
      hotels
        .filter((hotel) => matchesFilters(hotel, state, filters))
        .sort((a, b) => a.area.localeCompare(b.area, 'ko') || a.name.localeCompare(b.name, 'ko')),
    [filters, hotels, state]
  );

  const areas = useMemo(
    () => [...new Set(hotels.map((hotel) => getSalesRegion(hotel)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [hotels]
  );

  const todayHotels = useMemo(
    () => hotels.filter((hotel) => state[hotel.id]?.status === 'today'),
    [hotels, state]
  );

  const renderedHotels = useMemo(() => {
    const pinnedIds = new Set([
      ...todayHotels.map((hotel) => hotel.id),
      ...(selectedHotelId ? [selectedHotelId] : [])
    ]);
    const pinnedHotels = hotels.filter((hotel) => pinnedIds.has(hotel.id));
    const visibleIds = new Set(pinnedHotels.map((hotel) => hotel.id));
    const limitedVisibleHotels = visibleHotels
      .filter((hotel) => !visibleIds.has(hotel.id))
      .slice(0, Math.max(0, MAX_RENDERED_HOTELS - pinnedHotels.length));

    return [...pinnedHotels, ...limitedVisibleHotels];
  }, [hotels, selectedHotelId, todayHotels, visibleHotels]);

  const totalCounts = useMemo(
    () => ({
      total: hotels.length,
      planned: hotels.filter((hotel) => state[hotel.id]?.status === 'planned').length,
      today: hotels.filter((hotel) => state[hotel.id]?.status === 'today').length,
      visited: hotels.filter((hotel) => state[hotel.id]?.status === 'visited').length,
      excluded: hotels.filter((hotel) => state[hotel.id]?.status === 'excluded').length
    }),
    [hotels, state]
  );

  const selectedHotel = selectedHotelId ? hotels.find((hotel) => hotel.id === selectedHotelId) || null : null;
  const editingHotel = editingHotelId ? hotels.find((hotel) => hotel.id === editingHotelId) || null : null;
  const showEditor = (isAdding || Boolean(editingHotel)) && !pickingLocation;

  const commit = (nextHotels: Hotel[], nextState: HotelStateMap) => {
    setHotels(nextHotels);
    setState(nextState);
    saveAll(nextHotels, nextState);
  };

  const updateStateForHotel = (id: string, updater: (current: HotelStateMap[string]) => HotelStateMap[string]) => {
    const nextState = { ...state, [id]: updater(state[id]) };
    commit(hotels, nextState);
  };

  const handleStatusChange = (id: string, status: VisitStatus) => {
    updateStateForHotel(id, (current) => ({ ...current, status }));
    if (status === 'today') {
      setFilters({ status: 'today', search: '', area: '', minRooms: '' });
      setSelectedHotelId(id);
      setMobilePanelOpen(false);
    }
  };

  const handleTodayRoute = () => {
    if (!todayHotels.length) {
      alert('오늘 방문으로 지정한 업장이 없어.');
      return;
    }
    setFilters({ status: 'today', search: '', area: '', minRooms: '' });
    setSelectedHotelId(null);
    setMobilePanelOpen(false);
    setTodayRouteFocusKey((current) => current + 1);
  };

  const handleSaveProfile = (id: string, form: FormData) => {
    const selectedActions = new Set(form.getAll('actions').map(String));

    updateStateForHotel(id, (current) => ({
      ...current,
      ...(() => {
        const salesStage = form.has('salesStage')
          ? (String(form.get('salesStage') || '미접촉') as SalesStage)
          : current.salesStage;
        const actions = form.has('actions')
          ? ACTIONS.reduce<ActionMap>((acc, action) => {
              acc[action] = selectedActions.has(action);
              return acc;
            }, {})
          : current.actions;

        return {
          meeting: form.has('meeting') ? String(form.get('meeting') || '').trim() : current.meeting,
          salesStage,
          nextVisit: form.has('nextVisit') ? String(form.get('nextVisit') || '') : current.nextVisit,
          actions: form.has('actions') && salesStage === '도입완료' ? { ...actions, '도입 완료': true } : actions,
          tags: form.has('tags')
            ? String(form.get('tags') || '').split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
            : current.tags,
          memo: form.has('memo') ? String(form.get('memo') || '').trim() : current.memo,
          status: form.has('salesStage') && salesStage === '영업제외' ? 'excluded' : current.status
        };
      })()
    }));
  };

  const handleAddVisitLog = (id: string, form: FormData) => {
    const date = String(form.get('date') || '');
    const type = String(form.get('type') || '방문');
    const note = String(form.get('note') || '').trim();
    if (!date || !note) {
      alert('방문 날짜와 내용을 입력해줘.');
      return;
    }

    updateStateForHotel(id, (current) => {
      const logs = [...current.logs, { id: `log-${Date.now()}`, date, type, note, createdAt: new Date().toISOString() }];
      return {
        ...current,
        logs,
        visitCount: logs.length,
        lastVisit: logs.map((log) => log.date).filter(Boolean).sort().pop() || date,
        status: type === '계약 완료' ? 'visited' : current.status === 'excluded' ? 'excluded' : 'visited',
        memo: note
      };
    });
  };

  const handleSaveEditor = (draft: EditorDraft) => {
    if (draft.id) {
      const nextHotels = hotels.map((hotel) =>
        hotel.id === draft.id
          ? { ...hotel, area: draft.area, name: draft.name, rooms: draft.rooms, address: draft.address, lat: draft.lat, lon: draft.lon, approx: false, note: draft.note, vendor: draft.vendor }
          : hotel
      );
      const nextState = {
        ...state,
        [draft.id]: { ...state[draft.id], status: draft.status, meeting: draft.meeting, salesStage: draft.salesStage, tags: draft.tags, actions: draft.actions }
      };
      commit(nextHotels, nextState);
    } else {
      const id = newId();
      const hotel = normalizeHotel({ ...draft, id, initialStatus: draft.status, approx: false });
      const nextHotels = [...hotels, hotel];
      const nextState = {
        ...state,
        [id]: { ...createInitialState(hotel), status: draft.status, meeting: draft.meeting, salesStage: draft.salesStage, tags: draft.tags, actions: draft.actions }
      };
      commit(nextHotels, nextState);
      setSelectedHotelId(id);
    }
    setIsAdding(false);
    setEditingHotelId(null);
    setPickingLocation(false);
    setPickedLocation(null);
  };

  const handleDelete = (id: string) => {
    const hotel = hotels.find((item) => item.id === id);
    if (!hotel || !confirm(`${hotel.area} ${hotel.name}을(를) 목록에서 삭제할까? 방문기록도 함께 삭제돼.`)) return;
    const nextHotels = hotels.filter((item) => item.id !== id);
    const nextState = { ...state };
    delete nextState[id];
    commit(nextHotels, nextState);
    setSelectedHotelId(null);
  };

  const handleImport = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text()) as { hotels?: Hotel[]; state?: HotelStateMap; data?: HotelStateMap };
      if (!confirm('현재 목록과 기록을 백업 파일로 교체할까? 교체 전에 현재 데이터를 내보내는 것을 권장해.')) return;
      if (Array.isArray(payload.hotels)) {
        const nextHotels = payload.hotels.map(normalizeHotel);
        const nextState = buildState(nextHotels, payload.state || {});
        commit(nextHotels, nextState);
      } else if (payload.data) {
        commit(hotels, payload.data);
      } else {
        throw new Error('Invalid backup format');
      }
      setFilters({ status: '', search: '', area: '', minRooms: '' });
      alert('백업을 복원했어.');
    } catch {
      alert('올바른 영업지도 백업 파일이 아니야.');
    }
  };

  const handleClear = () => {
    if (!confirm('방문상태와 메모를 초기값으로 되돌릴까? 업장 목록은 유지돼.')) return;
    const nextState = buildState(hotels, {});
    commit(hotels, nextState);
    alert('기록을 초기화했어.');
  };

  return (
    <div className="app">
      <Sidebar
        hotels={renderedHotels}
        state={state}
        totalCounts={totalCounts}
        filteredCount={visibleHotels.length}
        renderedLimit={MAX_RENDERED_HOTELS}
        filters={filters}
        areas={areas}
        isLoadingHotels={isLoadingHotels}
        labelsVisible={labelsVisible}
        canInstall={Boolean(installPrompt)}
        isOnline={isOnline}
        isMobileOpen={mobilePanelOpen}
        onInstall={async () => {
          if (!installPrompt) {
            alert('iPhone은 Safari 공유 버튼에서 “홈 화면에 추가”를 선택해줘.');
            return;
          }
          await installPrompt.prompt();
          await installPrompt.userChoice;
          setInstallPrompt(null);
        }}
        onAdd={() => {
          setIsAdding(true);
          setEditingHotelId(null);
          setPickedLocation(null);
        }}
        onExportAll={() => downloadJSON(`숙박업_영업지도_전체백업_${new Date().toISOString().slice(0, 10)}.json`, { app: 'staysync-sales-map', version: 4, exportedAt: new Date().toISOString(), hotels, state })}
        onExportHotels={() => downloadJSON(`숙박업_영업지도_업장목록_${new Date().toISOString().slice(0, 10)}.json`, { app: 'staysync-sales-map-hotels', version: 1, hotels })}
        onImport={handleImport}
        onClear={handleClear}
        onFiltersChange={setFilters}
        onLabelsChange={setLabelsVisible}
        onSelectHotel={(hotel) => {
          setSelectedHotelId(hotel.id);
          setMobilePanelOpen(false);
        }}
        onTodayRoute={handleTodayRoute}
        onToggleMobilePanel={() => setMobilePanelOpen((current) => !current)}
      />
      <Map
        hotels={renderedHotels}
        todayHotels={todayHotels}
        state={state}
        labelsVisible={labelsVisible}
        selectedHotelId={selectedHotelId}
        todayRouteFocusKey={todayRouteFocusKey}
        pickingLocation={pickingLocation}
        onSelectHotel={(hotel) => setSelectedHotelId(hotel.id)}
        onTodayRoute={handleTodayRoute}
        onPickedLocation={(lat, lon) => {
          setPickedLocation({ lat, lon });
          setPickingLocation(false);
          setIsAdding((current) => current || !editingHotelId);
        }}
        onStatusChange={handleStatusChange}
        onSaveProfile={handleSaveProfile}
        onAddVisitLog={handleAddVisitLog}
        onEdit={(id) => {
          setEditingHotelId(id);
          setIsAdding(false);
          setPickedLocation(null);
        }}
        onDelete={handleDelete}
      />
      {showEditor && (
        <HotelForm
          hotel={editingHotel}
          hotelState={editingHotel ? state[editingHotel.id] : null}
          mapCenter={{ lat: 35.22, lon: 128.82 }}
          pickedLocation={pickedLocation}
          onSave={handleSaveEditor}
          onClose={() => {
            setIsAdding(false);
            setEditingHotelId(null);
            setPickingLocation(false);
            setPickedLocation(null);
          }}
          onPickLocation={() => setPickingLocation(true)}
          key={`${editingHotel?.id || 'new'}-${pickedLocation?.lat || 'x'}-${pickedLocation?.lon || 'x'}`}
        />
      )}
      {selectedHotel && state[selectedHotel.id] && (
        <div className="mobile-sheet" role="dialog" aria-label="업장 상세">
          <HotelPopup
            hotel={selectedHotel}
            hotelState={state[selectedHotel.id]}
            statusLabel={
              state[selectedHotel.id].status === 'planned'
                ? '방문 예정'
                : state[selectedHotel.id].status === 'today'
                  ? '오늘 방문'
                  : state[selectedHotel.id].status === 'visited'
                    ? '방문 완료'
                    : '영업 제외'
            }
            isSheet
            onClose={() => setSelectedHotelId(null)}
            onStatusChange={handleStatusChange}
            onSaveProfile={handleSaveProfile}
            onAddVisitLog={handleAddVisitLog}
            onEdit={(id) => {
              setEditingHotelId(id);
              setIsAdding(false);
              setPickedLocation(null);
            }}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
