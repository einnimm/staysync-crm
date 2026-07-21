import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { HotelForm, type EditorDraft } from './components/HotelForm';
import { HotelPopup } from './components/HotelPopup';
import { Map } from './components/Map';
import { DEFAULT_HOTELS } from './lib/defaultHotels';
import { loadSavedHotels, loadSavedState, saveAll } from './lib/storage';
import type { ActionMap, AreaGroup, Filters, Hotel, HotelState, HotelStateMap, SalesStage, VisitStatus } from './types';

const ACTIONS = ['명함 전달', '직원 설명 완료', '대표 미팅 완료', '견적 전달', '프로모션 안내', '계약서 전달', '도입 완료'];
const MAX_RENDERED_HOTELS = 300;
const ROUTE_DAYS = 14;
const EMPTY_FILTERS: Filters = { status: '', search: '', area: '', kioskVendor: '', rmsVendor: '' };
const SALESPEOPLE_2026_07_20 = '임봉현, 정민희';
const NON_LODGING_IDS = new Set(['flg-27655', 'flg-27981']);
const NON_LODGING_KEYWORDS = ['오피스텔', '도시형생활주택', '메종드테라스', '여관', '여인숙'];
const MANUAL_ROUTE_TAG = '동선추가';
const VISIT_RECORDS_2026_07_20: Record<string, {
  note: string;
  memo: string;
  nextVisit?: string;
  meeting?: string;
  tags?: string[];
}> = {
  'hotel-016': {
    note: '7/20 영업 방문. 수요일 15시 이후 재방문 가능.',
    memo: '[2026-07-20]\n방문자: 임봉현, 정민희\n수요일 15시 이후 재방문 가능.',
    nextVisit: '2026-07-22',
    meeting: '수요일 15시 이후',
    tags: ['재방문']
  },
  'hotel-20260720-gung': {
    note: '7/20 영업 방문. 수요일 15시 재방문 가능.',
    memo: '[2026-07-20]\n방문자: 임봉현, 정민희\n수요일 15시 재방문 가능.',
    nextVisit: '2026-07-22',
    meeting: '수요일 15시',
    tags: ['재방문']
  },
  'hotel-004': {
    note: '7/20 영업 방문. 오전 11시쯤 방문 가능.',
    memo: '[2026-07-20]\n방문자: 임봉현, 정민희\n오전 11시쯤 방문 가능.',
    meeting: '오전 11시쯤',
    tags: ['재방문']
  },
  'hotel-179': {
    note: '7/20 영업 방문. 아고다 관리가 힘들어 후회 중이라고 함. 프로그램 관심은 크지 않으나 해외채널 관리 설명은 남자 대표에게 한 번 진행하면 좋겠음. 남자 대표는 저녁 시간대.',
    memo: '[2026-07-20]\n방문자: 임봉현, 정민희\n아고다 관리가 힘들어 후회 중이라고 함.\n프로그램 관심은 크지 않지만 해외채널 관리 설명은 남자 대표에게 한 번 진행하면 좋겠음.\n남자 대표는 저녁 시간대.',
    meeting: '남자 대표 저녁 시간대',
    tags: ['해외채널', '아고다', '재방문']
  },
  'hotel-027': {
    note: '7/20 영업 방문. 미리 연락 후 방문 필요.',
    memo: '[2026-07-20]\n방문자: 임봉현, 정민희\n미리 연락 후 방문 필요.',
    meeting: '미리 연락 후 방문',
    tags: ['재방문']
  }
};

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

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

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeHotel(hotel: Partial<Hotel>): Hotel {
  const rooms = hotel.rooms as number | string | null | undefined;
  const vendor = hotel.vendor || '미확인';
  const kioskVendor = hotel.kioskVendor || inferVendor(vendor, ['벤디트', '야놀', '시리얼', '아이크루']);
  return {
    id: hotel.id || newId(),
    area: hotel.area || '',
    name: hotel.name || '이름 없음',
    rooms: rooms === null || rooms === undefined || rooms === '' ? null : Number(rooms),
    note: hotel.note || '',
    vendor,
    kiosk: Boolean(hotel.kiosk || kioskVendor),
    kioskVendor,
    rms: Boolean(hotel.rms || hotel.rmsVendor),
    rmsVendor: hotel.rmsVendor || '',
    address: hotel.address || '정확한 주소 확인 필요',
    lat: Number(hotel.lat) || 35.22,
    lon: Number(hotel.lon) || 128.82,
    approx: hotel.approx !== false,
    legal: hotel.legal,
    excluded: hotel.excluded,
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

function isLodgingSalesTarget(hotel: Partial<Hotel>): boolean {
  if (hotel.id && NON_LODGING_IDS.has(hotel.id)) return false;
  const text = `${hotel.name || ''} ${hotel.address || ''}`.replace(/\s/g, '').toLowerCase();
  return !NON_LODGING_KEYWORDS.some((keyword) => text.includes(keyword.replace(/\s/g, '').toLowerCase()));
}

function inferVendor(value: string, candidates: string[]): string {
  const normalized = value.replace(/\s/g, '').toLowerCase();
  return candidates.find((candidate) => normalized.includes(candidate.replace(/\s/g, '').toLowerCase())) || '';
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·ㆍ.,/()［\][\]{}_-]/g, '');
}

function createInitialState(hotel: Hotel, saved?: Partial<HotelState>): HotelState {
  const base: HotelState = {
    status: hotel.initialStatus,
    memo: hotel.initialMemo || '',
    visitCount: hotel.initialVisitCount || 0,
    lastVisit: hotel.initialLastVisit || '',
    nextVisit: hotel.initialNextVisit || '',
    routeDate: '',
    meeting: hotel.initialMeeting || '',
    salesperson: '',
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

  if (
    merged.routeDate &&
    hotel.initialNextVisit &&
    merged.routeDate === hotel.initialNextVisit &&
    !merged.tags.includes(MANUAL_ROUTE_TAG)
  ) {
    merged.routeDate = '';
  }

  return applyVisitRecords(hotel, merged);
}

function applyVisitRecords(hotel: Hotel, state: HotelState): HotelState {
  const record = VISIT_RECORDS_2026_07_20[hotel.id];
  if (!record) return state;

  const logId = `visit-2026-07-20-${hotel.id}`;
  const logs = state.logs.some((log) => log.id === logId)
    ? state.logs
    : [
        ...state.logs,
        {
          id: logId,
          date: '2026-07-20',
          type: '영업 방문',
          note: record.note,
          createdAt: '2026-07-20T09:00:00.000+09:00'
        }
      ];

  const tags = [...new Set([...(state.tags || []), ...(record.tags || [])])];
  const routeDate =
    state.routeDate && (!hotel.initialNextVisit || state.routeDate !== hotel.initialNextVisit || tags.includes(MANUAL_ROUTE_TAG))
      ? state.routeDate
      : '';
  return {
    ...state,
    status: state.status === 'excluded' ? state.status : 'visited',
    memo: record.memo,
    visitCount: Math.max(state.visitCount || 0, logs.length),
    lastVisit: ['2026-07-20', state.lastVisit].filter(Boolean).sort().pop() || '2026-07-20',
    nextVisit: record.nextVisit || state.nextVisit,
    routeDate,
    meeting: record.meeting || state.meeting,
    salesperson: state.salesperson || SALESPEOPLE_2026_07_20,
    salesStage: state.salesStage === '미접촉' ? '상담중' : state.salesStage,
    tags,
    logs
  };
}

function loadInitialHotels(): Hotel[] {
  const savedHotels = loadSavedHotels();
  if (!savedHotels) return DEFAULT_HOTELS.filter(isLodgingSalesTarget).map(normalizeHotel);

  const normalizedSaved = savedHotels.filter(isLodgingSalesTarget).map(normalizeHotel);
  return mergeDefaultHotels(normalizedSaved, DEFAULT_HOTELS.filter(isLodgingSalesTarget));
}

function mergeDefaultHotels(savedHotels: Hotel[], defaultHotels: Hotel[]): Hotel[] {
  const savedIds = new Set(savedHotels.map((hotel) => hotel.id));
  return [
    ...savedHotels,
    ...defaultHotels.filter(isLodgingSalesTarget).map(normalizeHotel).filter((hotel) => !savedIds.has(hotel.id))
  ];
}

async function loadDefaultHotels(): Promise<Hotel[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}default-hotels.json`);
  if (!response.ok) throw new Error('Default hotel data load failed');
  const hotels = (await response.json()) as Partial<Hotel>[];
  return hotels.filter(isLodgingSalesTarget).map(normalizeHotel);
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
  const salesRegion = getSalesRegion(hotel);
  const logText = hotelState.logs.map((log) => `${log.date} ${log.type} ${log.note}`).join(' ');
  const haystack = [
    hotel.area,
    salesRegion,
    hotel.name,
    hotel.note,
    hotel.vendor,
    hotel.kioskVendor,
    hotel.rmsVendor,
    hotel.address,
    hotelState.memo,
    hotelState.meeting,
    hotelState.salesperson,
    hotelState.salesStage,
    Object.keys(hotelState.actions).filter((action) => hotelState.actions[action]).join(' '),
    hotelState.tags.join(' '),
    logText
  ]
    .join(' ')
    .toLowerCase();
  const compactHaystack = normalizeSearchText(haystack);
  const search = filters.search.trim().toLowerCase();
  const compactSearch = normalizeSearchText(search);

  return (
    (!search || haystack.includes(search) || compactHaystack.includes(compactSearch)) &&
    (!filters.area || salesRegion === filters.area) &&
    (!filters.kioskVendor || (filters.kioskVendor === '없음/미확인' ? !hotel.kioskVendor : hotel.kioskVendor === filters.kioskVendor)) &&
    (!filters.rmsVendor || (filters.rmsVendor === '미확인' ? !hotel.rmsVendor : hotel.rmsVendor === filters.rmsVendor))
  );
}

function shortProvince(value: string): string {
  const province = value.replace(/특별자치도|특별자치시|광역시|특별시|자치도/g, '');
  const aliases: Record<string, string> = {
    서울: '서울',
    부산: '부산',
    대구: '대구',
    인천: '인천',
    광주: '광주',
    대전: '대전',
    울산: '울산',
    세종: '세종',
    경기: '경기',
    강원: '강원',
    충청북도: '충북',
    충청남도: '충남',
    전라북도: '전북',
    전라남도: '전남',
    경상북도: '경북',
    경상남도: '경남',
    제주: '제주'
  };
  return aliases[province] || province.replace(/[도시]$/, '') || value;
}

function compactDistrict(value: string): string {
  return value.replace(/(특례시|시|군|구)$/g, '');
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
  if (regionMap[first]) return regionMap[first];

  const addressParts = hotel.address.trim().split(/\s+/).filter(Boolean);
  if (addressParts.length >= 2) {
    const province = shortProvince(addressParts[0]);
    const city = addressParts[1];
    const district = addressParts[2] || '';
    if (province === '부산') return district ? `부산 ${compactDistrict(city)}` : `부산 ${compactDistrict(city)}`;
    if (['서울', '대구', '인천', '광주', '대전', '울산'].includes(province)) return `${province} ${compactDistrict(city)}`;
    if (district.endsWith('구') && city.endsWith('시')) return `${compactDistrict(city)} ${compactDistrict(district)}`;
    return `${province} ${compactDistrict(city)}`;
  }

  if (area.includes(' ')) {
    const [province, city] = area.split(/\s+/);
    return `${shortProvince(province)} ${compactDistrict(city)}`;
  }

  return first || '기타';
}

function getProvinceGroup(region: string): string {
  const first = region.split(/\s+/)[0];
  if (['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'].includes(first)) return first;
  if (['김해', '장유', '창원', '마산', '진해', '경남'].includes(first)) return '경남';
  if (['경주', '포항', '경북'].includes(first)) return '경북';
  if (['수원', '성남', '고양', '용인', '부천', '안산', '안양', '평택', '화성', '경기'].includes(first)) return '경기';
  if (['춘천', '원주', '강릉', '속초', '강원'].includes(first)) return '강원';
  if (['청주', '충주', '제천', '충북'].includes(first)) return '충북';
  if (['천안', '아산', '공주', '보령', '서산', '논산', '충남'].includes(first)) return '충남';
  if (['전주', '군산', '익산', '정읍', '남원', '전북'].includes(first)) return '전북';
  if (['목포', '여수', '순천', '나주', '광양', '전남'].includes(first)) return '전남';
  if (['제주', '서귀포'].includes(first)) return '제주';
  return first || '기타';
}

function buildAreaGroups(regions: string[]): AreaGroup[] {
  const order = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '기타'];
  const grouped = regions.reduce<Record<string, string[]>>((acc, region) => {
    const province = getProvinceGroup(region);
    acc[province] = [...(acc[province] || []), region];
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([province, items]) => ({
      province,
      regions: [...new Set(items)].sort((a, b) => a.localeCompare(b, 'ko'))
    }))
    .sort((a, b) => {
      const aIndex = order.indexOf(a.province);
      const bIndex = order.indexOf(b.province);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      return a.province.localeCompare(b.province, 'ko');
    });
}

function isInsideBounds(hotel: Hotel, bounds: ViewportBounds): boolean {
  return hotel.lat <= bounds.north && hotel.lat >= bounds.south && hotel.lon <= bounds.east && hotel.lon >= bounds.west;
}

export default function App() {
  const [hotels, setHotels] = useState<Hotel[]>(() => loadInitialHotels());
  const [state, setState] = useState<HotelStateMap>(() => buildState(loadInitialHotels()));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedRouteDate, setSelectedRouteDate] = useState(() => toLocalDateString(new Date()));
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [pendingRouteHotelId, setPendingRouteHotelId] = useState<string | null>(null);
  const [todayRouteFocusKey, setTodayRouteFocusKey] = useState(0);
  const [mapFocusKey, setMapFocusKey] = useState(0);
  const [routeFocusActive, setRouteFocusActive] = useState(false);
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
        const savedHotels = (loadSavedHotels() || []).filter(isLodgingSalesTarget).map(normalizeHotel);
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

  const shouldShowFilteredResults = useMemo(
    () =>
      Boolean(filters.search.trim() || filters.area || filters.kioskVendor || filters.rmsVendor) ||
      filters.status === 'planned' ||
      filters.status === 'today' ||
      filters.status === 'visited' ||
      filters.status === 'excluded',
    [filters]
  );

  const visibleHotels = useMemo(() => {
    if (!shouldShowFilteredResults) return [];
    return hotels
      .filter((hotel) => matchesFilters(hotel, state, filters))
      .sort((a, b) => a.area.localeCompare(b.area, 'ko') || a.name.localeCompare(b.name, 'ko'));
  }, [filters, hotels, shouldShowFilteredResults, state]);

  const areaGroups = useMemo(
    () => buildAreaGroups([...new Set(hotels.map((hotel) => getSalesRegion(hotel)).filter(Boolean))]),
    [hotels]
  );

  const kioskVendors = useMemo(
    () => [...new Set(hotels.map((hotel) => hotel.kioskVendor).filter(isPresent))].sort((a, b) => a.localeCompare(b, 'ko')),
    [hotels]
  );

  const rmsVendors = useMemo(
    () => [...new Set(hotels.map((hotel) => hotel.rmsVendor).filter(isPresent))].sort((a, b) => a.localeCompare(b, 'ko')),
    [hotels]
  );

  const todayDate = useMemo(() => toLocalDateString(new Date()), []);

  const routeHotels = useMemo(
    () =>
      hotels.filter((hotel) => {
        const hotelState = state[hotel.id];
        if (!hotelState) return false;
        return hotelState.routeDate === selectedRouteDate || (selectedRouteDate === todayDate && hotelState.status === 'today');
      }),
    [hotels, selectedRouteDate, state, todayDate]
  );

  const historyHotels = useMemo(
    () =>
      selectedHistoryDate
        ? hotels.filter((hotel) => {
            const hotelState = state[hotel.id];
            if (!hotelState) return false;
            return hotelState.lastVisit === selectedHistoryDate || hotelState.logs.some((log) => log.date === selectedHistoryDate);
          })
        : [],
    [hotels, selectedHistoryDate, state]
  );

  const renderedHotels = useMemo(() => {
    if (routeFocusActive) {
      const routeIds = new Set([
        ...routeHotels.map((hotel) => hotel.id),
        ...(selectedHotelId ? [selectedHotelId] : [])
      ]);
      return hotels.filter((hotel) => routeIds.has(hotel.id));
    }

    const pinnedIds = new Set([
      ...routeHotels.map((hotel) => hotel.id),
      ...historyHotels.map((hotel) => hotel.id),
      ...(selectedHotelId ? [selectedHotelId] : [])
    ]);
    const pinnedHotels = hotels.filter((hotel) => pinnedIds.has(hotel.id));
    const visibleIds = new Set(pinnedHotels.map((hotel) => hotel.id));
    const viewportHotels =
      viewportBounds && !shouldShowFilteredResults
        ? hotels
            .filter((hotel) => !visibleIds.has(hotel.id) && isInsideBounds(hotel, viewportBounds))
            .sort((a, b) => a.area.localeCompare(b.area, 'ko') || a.name.localeCompare(b.name, 'ko'))
        : [];
    for (const hotel of viewportHotels.slice(0, Math.max(0, MAX_RENDERED_HOTELS - pinnedHotels.length))) {
      visibleIds.add(hotel.id);
    }
    const limitedVisibleHotels = visibleHotels
      .filter((hotel) => !visibleIds.has(hotel.id))
      .slice(0, Math.max(0, MAX_RENDERED_HOTELS - pinnedHotels.length - viewportHotels.length));

    return [
      ...pinnedHotels,
      ...viewportHotels.slice(0, Math.max(0, MAX_RENDERED_HOTELS - pinnedHotels.length)),
      ...limitedVisibleHotels
    ];
  }, [historyHotels, hotels, selectedHotelId, routeFocusActive, routeHotels, shouldShowFilteredResults, viewportBounds, visibleHotels]);

  const mapFocusHotels = useMemo(() => {
    if (selectedHotelId) return renderedHotels.filter((hotel) => hotel.id === selectedHotelId);
    if (routeFocusActive) return routeHotels;
    if (visibleHotels.length) return visibleHotels.slice(0, MAX_RENDERED_HOTELS);
    if (historyHotels.length) return historyHotels;
    return [];
  }, [historyHotels, renderedHotels, routeFocusActive, routeHotels, selectedHotelId, visibleHotels]);

  const totalCounts = useMemo(() => {
    const counts: Record<VisitStatus | 'total', number> = { total: hotels.length, planned: 0, today: 0, visited: 0, excluded: 0 };
    for (const hotel of hotels) {
      const status = state[hotel.id]?.status || hotel.initialStatus || 'planned';
      counts[status] += 1;
    }
    return counts;
  }, [hotels, state]);

  const routeCalendar = useMemo(
    () =>
      Array.from({ length: ROUTE_DAYS }, (_, index) => {
        const date = toLocalDateString(addDays(new Date(), index));
        let routeCount = 0;
        let visitedCount = 0;
        for (const hotel of hotels) {
          const hotelState = state[hotel.id];
          if (!hotelState) continue;
          if (hotelState.routeDate === date || (date === todayDate && hotelState.status === 'today')) routeCount += 1;
          if (hotelState.logs.some((log) => log.date === date) || hotelState.lastVisit === date) visitedCount += 1;
        }
        return { date, routeCount, visitedCount };
      }),
    [hotels, state, todayDate]
  );

  const historyCalendar = useMemo(() => {
    const byDate = new globalThis.Map<string, Set<string>>();
    for (const hotel of hotels) {
      const hotelState = state[hotel.id];
      if (!hotelState) continue;
      const dates = new Set([
        hotelState.lastVisit,
        ...hotelState.logs.map((log) => log.date)
      ].filter(Boolean));
      for (const date of dates) {
        if (!byDate.has(date)) byDate.set(date, new Set());
        byDate.get(date)?.add(hotel.id);
      }
    }
    return [...byDate.entries()]
      .map(([date, ids]) => ({ date, visitedCount: ids.size }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [hotels, state]);

  const selectedHotel = selectedHotelId ? hotels.find((hotel) => hotel.id === selectedHotelId) || null : null;
  const editingHotel = editingHotelId ? hotels.find((hotel) => hotel.id === editingHotelId) || null : null;
  const pendingRouteHotel = pendingRouteHotelId ? hotels.find((hotel) => hotel.id === pendingRouteHotelId) || null : null;
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
    updateStateForHotel(id, (current) => ({
      ...current,
      status,
      routeDate: status === 'today' ? todayDate : current.routeDate
    }));
    if (status === 'planned') {
      setPendingRouteHotelId(id);
      setSelectedHotelId(id);
      setRouteFocusActive(false);
      setSelectedHistoryDate('');
      return;
    }
    if (status === 'today') {
      setFilters({ ...EMPTY_FILTERS, status: 'today' });
      setSelectedHotelId(id);
      setMobileMapExpanded(false);
      setRouteFocusActive(false);
      setSelectedRouteDate(todayDate);
      setSelectedHistoryDate('');
      setMobilePanelOpen(false);
    }
  };

  const handleRouteRequest = (id: string) => {
    setPendingRouteHotelId(id);
  };

  const handleRouteDateAssign = (id: string, date: string) => {
    updateStateForHotel(id, (current) => ({
      ...current,
      status: 'planned',
      routeDate: date,
      nextVisit: date,
      tags: [...new Set([...(current.tags || []), MANUAL_ROUTE_TAG])]
    }));
    setPendingRouteHotelId(null);
    setSelectedRouteDate(date);
    setSelectedHistoryDate('');
    setFilters(EMPTY_FILTERS);
    setSelectedHotelId(null);
    setRouteFocusActive(true);
    setMobileMapExpanded(true);
    setMobilePanelOpen(false);
    setTodayRouteFocusKey((current) => current + 1);
    setMapFocusKey((current) => current + 1);
  };

  const handleTodayRoute = () => {
    setSelectedRouteDate(todayDate);
    setSelectedHistoryDate('');
    const todaysRoute = hotels.filter((hotel) => {
      const hotelState = state[hotel.id];
      return hotelState?.routeDate === todayDate || hotelState?.status === 'today';
    });
    if (!todaysRoute.length) {
      alert('오늘 동선으로 지정한 업장이 없어.');
      return;
    }
    setFilters(EMPTY_FILTERS);
    setSelectedHotelId(null);
    setRouteFocusActive(true);
    setMobileMapExpanded(true);
    setMobilePanelOpen(false);
    setTodayRouteFocusKey((current) => current + 1);
    setMapFocusKey((current) => current + 1);
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
        const nextRouteDate = form.has('routeDate') ? String(form.get('routeDate') || '') : current.routeDate;
        const formTags = form.has('tags')
          ? String(form.get('tags') || '').split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
          : current.tags;
        const tags = nextRouteDate ? [...new Set([...formTags, MANUAL_ROUTE_TAG])] : formTags.filter((tag) => tag !== MANUAL_ROUTE_TAG);

        return {
          meeting: form.has('meeting') ? String(form.get('meeting') || '').trim() : current.meeting,
          salesperson: form.has('salesperson') ? String(form.get('salesperson') || '').trim() : current.salesperson,
          salesStage,
          nextVisit: form.has('nextVisit') ? String(form.get('nextVisit') || '') : current.nextVisit,
          routeDate: nextRouteDate,
          actions: form.has('actions') && salesStage === '도입완료' ? { ...actions, '도입 완료': true } : actions,
          tags,
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
          ? {
              ...hotel,
              area: draft.area,
              name: draft.name,
              rooms: draft.rooms,
              address: draft.address,
              lat: draft.lat,
              lon: draft.lon,
              approx: false,
              note: draft.note,
              vendor: draft.vendor,
              kiosk: draft.kiosk,
              kioskVendor: draft.kioskVendor,
              rms: Boolean(draft.rmsVendor),
              rmsVendor: draft.rmsVendor
            }
          : hotel
      );
      const nextState = {
        ...state,
        [draft.id]: {
          ...state[draft.id],
          status: draft.status,
          meeting: draft.meeting,
          salesperson: draft.salesperson,
          routeDate: draft.routeDate,
          nextVisit: draft.routeDate || state[draft.id].nextVisit,
          salesStage: draft.salesStage,
          tags: draft.tags,
          ...(draft.routeDate ? { tags: [...new Set([...draft.tags, MANUAL_ROUTE_TAG])] } : {}),
          actions: draft.actions
        }
      };
      commit(nextHotels, nextState);
    } else {
      const id = newId();
      const hotel = normalizeHotel({ ...draft, id, initialStatus: draft.status, initialNextVisit: draft.routeDate, approx: false });
      const nextHotels = [...hotels, hotel];
      const nextState = {
        ...state,
        [id]: {
          ...createInitialState(hotel),
          status: draft.status,
          meeting: draft.meeting,
          salesperson: draft.salesperson,
          routeDate: draft.routeDate,
          nextVisit: draft.routeDate,
          salesStage: draft.salesStage,
          tags: draft.routeDate ? [...new Set([...draft.tags, MANUAL_ROUTE_TAG])] : draft.tags,
          actions: draft.actions
        }
      };
      commit(nextHotels, nextState);
      setSelectedHotelId(id);
      setMobileMapExpanded(false);
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
      setFilters(EMPTY_FILTERS);
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
        filters={filters}
        areaGroups={areaGroups}
        kioskVendors={kioskVendors}
        rmsVendors={rmsVendors}
        selectedRouteDate={selectedRouteDate}
        routeCalendar={routeCalendar}
        selectedHistoryDate={selectedHistoryDate}
        historyCalendar={historyCalendar}
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
        onFiltersChange={(nextFilters) => {
          setFilters(nextFilters);
          setSelectedHotelId(null);
          setRouteFocusActive(false);
          setMobileMapExpanded(true);
          setMapFocusKey((current) => current + 1);
        }}
        onRouteDateChange={(date) => {
          setSelectedRouteDate(date);
          setSelectedHistoryDate('');
          setFilters(EMPTY_FILTERS);
          setSelectedHotelId(null);
          setRouteFocusActive(true);
          setMobileMapExpanded(true);
          setMobilePanelOpen(false);
          setTodayRouteFocusKey((current) => current + 1);
          setMapFocusKey((current) => current + 1);
        }}
        onHistoryDateChange={(date) => {
          setSelectedHistoryDate(date);
          setFilters(EMPTY_FILTERS);
          setSelectedHotelId(null);
          setRouteFocusActive(false);
          setMobileMapExpanded(true);
          setMobilePanelOpen(false);
          setTodayRouteFocusKey((current) => current + 1);
          setMapFocusKey((current) => current + 1);
        }}
        onLabelsChange={setLabelsVisible}
        onSelectHotel={(hotel) => {
          setSelectedHotelId(hotel.id);
          setMobileMapExpanded(false);
          setMobilePanelOpen(false);
        }}
        onTodayRoute={handleTodayRoute}
        onToggleMobilePanel={() => setMobilePanelOpen((current) => !current)}
      />
      <Map
        hotels={renderedHotels}
        focusHotels={mapFocusHotels}
        todayHotels={routeHotels}
        state={state}
        labelsVisible={labelsVisible}
        selectedHotelId={selectedHotelId}
        todayRouteFocusKey={todayRouteFocusKey}
        mapFocusKey={mapFocusKey}
        pickingLocation={pickingLocation}
        onMapFocus={() => setMobileMapExpanded(true)}
        onViewportChange={setViewportBounds}
        onSelectHotel={(hotel) => {
          setSelectedHotelId(hotel.id);
          setMobileMapExpanded(false);
        }}
        onTodayRoute={handleTodayRoute}
        onPickedLocation={(lat, lon) => {
          setPickedLocation({ lat, lon });
          setPickingLocation(false);
          setIsAdding((current) => current || !editingHotelId);
        }}
        onStatusChange={handleStatusChange}
        onRouteRequest={handleRouteRequest}
        onSaveProfile={handleSaveProfile}
        onAddVisitLog={handleAddVisitLog}
        onEdit={(id) => {
          setEditingHotelId(id);
          setIsAdding(false);
          setPickedLocation(null);
          setSelectedHotelId(null);
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
      {pendingRouteHotel && (
        <div className="modal-wrap" role="dialog" aria-label="방문 예정 동선일 선택">
          <div className="modal route-modal">
            <h2>방문 예정일 선택</h2>
            <div className="hint">
              {pendingRouteHotel.area} {pendingRouteHotel.name}을(를) 넣을 동선 날짜를 골라줘.
            </div>
            <div className="route-pick-grid">
              {routeCalendar.map((day) => {
                const label = new Date(`${day.date}T00:00:00`).toLocaleDateString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  weekday: 'short'
                });
                return (
                  <button
                    key={day.date}
                    className="route-pick-day"
                    type="button"
                    onClick={() => handleRouteDateAssign(pendingRouteHotel.id, day.date)}
                  >
                    <b>{label}</b>
                    <span>동선 {day.routeCount} · 방문 {day.visitedCount}</span>
                  </button>
                );
              })}
            </div>
            <div className="modal-actions single">
              <button className="cancel" type="button" onClick={() => setPendingRouteHotelId(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedHotel && state[selectedHotel.id] && (
        <div
          className={`mobile-sheet ${mobileMapExpanded ? 'map-expanded' : 'info-expanded'}`}
          role="dialog"
          aria-label="업장 상세"
          onClick={() => setMobileMapExpanded(false)}
        >
          <div className="sheet-size-controls" onClick={(event) => event.stopPropagation()}>
            <button
              className={mobileMapExpanded ? 'active' : ''}
              type="button"
              onClick={() => setMobileMapExpanded(true)}
            >
              지도 크게
            </button>
            <button
              className={!mobileMapExpanded ? 'active' : ''}
              type="button"
              onClick={() => setMobileMapExpanded(false)}
            >
              정보 크게
            </button>
          </div>
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
            onRouteRequest={handleRouteRequest}
            onSaveProfile={handleSaveProfile}
            onAddVisitLog={handleAddVisitLog}
            onEdit={(id) => {
              setEditingHotelId(id);
              setIsAdding(false);
              setPickedLocation(null);
              setSelectedHotelId(null);
            }}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
