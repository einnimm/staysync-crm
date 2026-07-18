import { useMemo, useState } from 'react';
import type { ActionMap, Hotel, HotelState, SalesStage, VisitStatus } from '../types';

const ACTIONS = ['명함 전달', '직원 설명 완료', '대표 미팅 완료', '견적 전달', '프로모션 안내', '계약서 전달', '도입 완료'];

const SALES_STAGES: SalesStage[] = ['미접촉', '상담중', '대표미팅', '검토중', '보류', '도입완료', '영업제외'];

function defaultStage(hotel: Hotel): SalesStage {
  if (hotel.initialStatus === 'excluded') return '영업제외';
  if (hotel.initialStatus === 'visited') return '상담중';
  return '미접촉';
}

export interface EditorDraft {
  id?: string;
  area: string;
  name: string;
  rooms: number | null;
  status: VisitStatus;
  address: string;
  lat: number;
  lon: number;
  note: string;
  vendor: string;
  kiosk: boolean;
  kioskVendor: string;
  rms: boolean;
  rmsVendor: string;
  meeting: string;
  salesperson: string;
  routeDate: string;
  salesStage: SalesStage;
  tags: string[];
  actions: ActionMap;
}

interface HotelFormProps {
  hotel: Hotel | null;
  hotelState: HotelState | null;
  mapCenter: { lat: number; lon: number };
  pickedLocation: { lat: number; lon: number } | null;
  onSave: (draft: EditorDraft) => void;
  onClose: () => void;
  onPickLocation: () => void;
}

function createDraft(
  hotel: Hotel | null,
  hotelState: HotelState | null,
  mapCenter: { lat: number; lon: number },
  pickedLocation: { lat: number; lon: number } | null
): EditorDraft {
  return {
    id: hotel?.id,
    area: hotel?.area || '',
    name: hotel?.name || '',
    rooms: hotel?.rooms ?? null,
    status: hotelState?.status || 'planned',
    address: hotel?.address || '',
    lat: pickedLocation?.lat ?? hotel?.lat ?? mapCenter.lat,
    lon: pickedLocation?.lon ?? hotel?.lon ?? mapCenter.lon,
    note: hotel?.note || '',
    vendor: hotel?.vendor || '',
    kiosk: Boolean(hotel?.kiosk),
    kioskVendor: hotel?.kioskVendor || '',
    rms: Boolean(hotel?.rms),
    rmsVendor: hotel?.rmsVendor || '',
    meeting: hotelState?.meeting || '',
    salesperson: hotelState?.salesperson || '',
    routeDate: hotelState?.routeDate || hotelState?.nextVisit || '',
    salesStage: hotelState?.salesStage || (hotel ? defaultStage(hotel) : '미접촉'),
    tags: hotelState?.tags || [],
    actions: hotelState?.actions || {}
  };
}

export function HotelForm({ hotel, hotelState, mapCenter, pickedLocation, onSave, onClose, onPickLocation }: HotelFormProps) {
  const initialDraft = useMemo(
    () => createDraft(hotel, hotelState, mapCenter, pickedLocation),
    [hotel, hotelState, mapCenter, pickedLocation]
  );
  const [draft, setDraft] = useState(initialDraft);
  const [tagText, setTagText] = useState(initialDraft.tags.join(', '));

  const update = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-wrap show" aria-hidden="false">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.area.trim() || !draft.name.trim()) {
            alert('지역과 업장명은 꼭 입력해줘.');
            return;
          }
          if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lon)) {
            alert('위도와 경도를 확인해줘.');
            return;
          }
          onSave({
            ...draft,
            area: draft.area.trim(),
            name: draft.name.trim(),
            address: draft.address.trim() || '정확한 주소 확인 필요',
            note: draft.note.trim(),
            vendor: draft.vendor.trim() || '미확인',
            kioskVendor: draft.kiosk ? draft.kioskVendor.trim() : '',
            rmsVendor: draft.rms ? draft.rmsVendor.trim() : '',
            meeting: draft.meeting.trim(),
            salesperson: draft.salesperson.trim(),
            tags: tagText.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
          });
        }}
      >
        <h2>{hotel ? '업장 수정' : '업장 추가'}</h2>
        <div className="hint">
          주소는 표시·검색용이고, 지도 핀은 위도·경도로 결정돼. 아래 ‘지도에서 위치 선택’을 누른 뒤 지도를 클릭하면 좌표가 자동 입력된다.
        </div>
        <div className="row">
          <div>
            <label className="field">지역</label>
            <input value={draft.area} placeholder="예: 상남" onChange={(event) => update('area', event.target.value)} />
          </div>
          <div>
            <label className="field">업장명</label>
            <input value={draft.name} placeholder="예: 호텔 아이콘" onChange={(event) => update('name', event.target.value)} />
          </div>
        </div>
        <div className="row">
          <div>
            <label className="field">객실 수</label>
            <input
              value={draft.rooms ?? ''}
              type="number"
              min="0"
              onChange={(event) => update('rooms', event.target.value === '' ? null : Number(event.target.value))}
            />
          </div>
          <div>
            <label className="field">초기 상태</label>
            <select value={draft.status} onChange={(event) => update('status', event.target.value as VisitStatus)}>
              <option value="planned">방문 예정</option>
              <option value="today">오늘 방문</option>
              <option value="visited">방문 완료</option>
              <option value="excluded">영업 제외</option>
            </select>
          </div>
        </div>
        <label className="field">주소 또는 위치 설명</label>
        <input value={draft.address} placeholder="정확한 주소 또는 위치 메모" onChange={(event) => update('address', event.target.value)} />
        <div className="row">
          <div>
            <label className="field">위도</label>
            <input value={draft.lat} type="number" step="any" onChange={(event) => update('lat', Number(event.target.value))} />
          </div>
          <div>
            <label className="field">경도</label>
            <input value={draft.lon} type="number" step="any" onChange={(event) => update('lon', Number(event.target.value))} />
          </div>
        </div>
        <button className="pick-button" type="button" onClick={onPickLocation}>지도에서 위치 선택</button>
        <label className="field">운영 특징·기존 정보</label>
        <textarea value={draft.note} onChange={(event) => update('note', event.target.value)} />
        <div className="equipment-grid">
          <label className="equipment-check">
            <input type="checkbox" checked={draft.kiosk} onChange={(event) => update('kiosk', event.target.checked)} />
            키오스크 있음
          </label>
          <input
            value={draft.kioskVendor}
            placeholder="키오스크 회사명"
            onChange={(event) => {
              update('kioskVendor', event.target.value);
              if (event.target.value.trim()) update('kiosk', true);
            }}
          />
          <label className="equipment-check">
            <input type="checkbox" checked={draft.rms} onChange={(event) => update('rms', event.target.checked)} />
            RMS 있음
          </label>
          <input
            value={draft.rmsVendor}
            placeholder="RMS 업체명"
            onChange={(event) => {
              update('rmsVendor', event.target.value);
              if (event.target.value.trim()) update('rms', true);
            }}
          />
        </div>
        <div className="row">
          <div>
            <label className="field">대표 미팅</label>
            <input value={draft.meeting} placeholder="예: 월·수·금 16시 이후 / 전화 후 방문" onChange={(event) => update('meeting', event.target.value)} />
          </div>
          <div>
            <label className="field">영업자명</label>
            <input value={draft.salesperson} placeholder="예: 임봉현, 정민희" onChange={(event) => update('salesperson', event.target.value)} />
          </div>
        </div>
        <label className="field">동선일</label>
        <input value={draft.routeDate} type="date" onChange={(event) => update('routeDate', event.target.value)} />
        <div className="row">
          <div>
            <label className="field">계약상태</label>
            <select value={draft.salesStage} onChange={(event) => update('salesStage', event.target.value as SalesStage)}>
              {SALES_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
            </select>
          </div>
          <div>
            <label className="field">태그</label>
            <input value={tagText} placeholder="벤디트, 재방문, AI예약관심" onChange={(event) => setTagText(event.target.value)} />
          </div>
        </div>
        <label className="field">진행 액션</label>
        <div className="action-grid">
          {ACTIONS.map((action) => (
            <label key={action} className="action-check">
              <input
                type="checkbox"
                checked={Boolean(draft.actions[action])}
                onChange={(event) => update('actions', { ...draft.actions, [action]: event.target.checked })}
              />
              {action}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={onClose}>취소</button>
          <button type="submit" className="confirm">저장</button>
        </div>
      </form>
    </div>
  );
}
