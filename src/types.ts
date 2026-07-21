export type VisitStatus = 'planned' | 'today' | 'visited' | 'excluded';

export type ActionMap = Record<string, boolean>;

export interface Hotel {
  id: string;
  area: string;
  name: string;
  rooms: number | null;
  note: string;
  legal?: boolean;
  excluded?: boolean;
  kiosk?: boolean;
  kioskVendor?: string;
  rms?: boolean;
  rmsVendor?: string;
  vendor: string;
  lat: number;
  lon: number;
  address: string;
  approx: boolean;
  initialStatus: VisitStatus;
  initialMemo?: string;
  initialVisitCount?: number;
  initialLastVisit?: string;
  initialNextVisit?: string;
  initialMeeting?: string;
  initialSalesStage?: SalesStage;
  initialTags?: string[];
}

export type SalesStage =
  | '미접촉'
  | '상담중'
  | '대표미팅'
  | '검토중'
  | '보류'
  | '도입완료'
  | '영업제외';

export interface VisitLog {
  id: string;
  date: string;
  type: string;
  note: string;
  createdAt: string;
}

export interface HotelState {
  status: VisitStatus;
  memo: string;
  visitCount: number;
  lastVisit: string;
  nextVisit: string;
  routeDate: string;
  meeting: string;
  salesperson: string;
  salesStage: SalesStage;
  actions: ActionMap;
  tags: string[];
  logs: VisitLog[];
}

export type HotelStateMap = Record<string, HotelState>;

export interface Filters {
  status: VisitStatus | '';
  search: string;
  area: string;
  kioskVendor: string;
  rmsVendor: string;
}

export interface AreaGroup {
  province: string;
  regions: string[];
}
