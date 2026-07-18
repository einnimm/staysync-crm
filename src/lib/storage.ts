import type { Hotel, HotelStateMap } from '../types';

const DB_KEY = 'staysync-sales-map-hotels-v1';
const STATE_KEY = 'staysync-sales-map-state-v4';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.error('저장 데이터 읽기 오류', key, error);
    return fallback;
  }
}

export function loadSavedHotels(): Hotel[] | null {
  return readStorage<Hotel[] | null>(DB_KEY, null);
}

export function loadSavedState(): Partial<HotelStateMap> {
  return readStorage<Partial<HotelStateMap>>(STATE_KEY, {});
}

export function saveHotels(hotels: Hotel[]): void {
  const userManagedHotels = hotels.filter(
    (hotel) => !hotel.id.startsWith('flg-') || hotel.note !== '전국 숙소지도 등록 숙소'
  );
  localStorage.setItem(DB_KEY, JSON.stringify(userManagedHotels));
}

export function saveState(state: HotelStateMap): void {
  const activeState = Object.fromEntries(
    Object.entries(state).filter(([, value]) => {
      const hasAction = Object.values(value.actions || {}).some(Boolean);
      return (
        value.status !== 'planned' ||
        value.memo ||
        value.visitCount ||
        value.lastVisit ||
        value.nextVisit ||
        value.meeting ||
        value.salesStage !== '미접촉' ||
        hasAction ||
        value.tags.length ||
        value.logs.length
      );
    })
  );
  localStorage.setItem(STATE_KEY, JSON.stringify(activeState));
}

export function saveAll(hotels: Hotel[], state: HotelStateMap): void {
  saveHotels(hotels);
  saveState(state);
}
