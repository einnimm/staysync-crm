import type { Hotel, HotelState, SalesStage, VisitStatus } from '../types';

const ACTIONS = ['명함 전달', '직원 설명 완료', '대표 미팅 완료', '견적 전달', '프로모션 안내', '계약서 전달', '도입 완료'];

const SALES_STAGES: SalesStage[] = ['미접촉', '상담중', '대표미팅', '검토중', '보류', '도입완료', '영업제외'];

const VISIT_LOG_TYPES = ['첫 방문', '재방문', '대표 미팅', '전화 상담', '계약 검토', '계약 완료', '부재'];

function naverUrl(hotel: Hotel): string {
  const destinationName = `${hotel.area} ${hotel.name}`;
  return `nmap://route/car?dlat=${hotel.lat}&dlng=${hotel.lon}&dname=${encodeURIComponent(destinationName)}&appname=staysync.crm`;
}

interface HotelPopupProps {
  hotel: Hotel;
  hotelState: HotelState;
  statusLabel: string;
  isSheet?: boolean;
  onClose?: () => void;
  onStatusChange: (id: string, status: VisitStatus) => void;
  onSaveProfile: (id: string, form: FormData) => void;
  onAddVisitLog: (id: string, form: FormData) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function HotelPopup({
  hotel,
  hotelState,
  statusLabel,
  isSheet = false,
  onClose,
  onStatusChange,
  onSaveProfile,
  onAddVisitLog,
  onEdit,
  onDelete
}: HotelPopupProps) {
  const sortedLogs = [...hotelState.logs].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  return (
    <div className={`popup ${isSheet ? 'sheet-popup' : ''}`}>
      <div className="popup-head">
        <div>
          <h3>
            {hotel.area} {hotel.name}
          </h3>
          <div className="meta">
            <span className={`badge ${hotelState.status}`}>{statusLabel}</span> ·{' '}
            {hotel.rooms ?? '객실 수 확인 필요'}
            {hotel.rooms !== null ? '객실' : ''}
          </div>
        </div>
        {isSheet && onClose && (
          <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        )}
      </div>
      {!isSheet && <table>
        <tbody>
          <tr>
            <td>대표 미팅</td>
            <td>{hotelState.meeting ? <span className="meeting-pill">{hotelState.meeting}</span> : '-'}</td>
          </tr>
          <tr>
            <td>계약상태</td>
            <td>
              <span className="sales-pill">{hotelState.salesStage || '미접촉'}</span>
            </td>
          </tr>
          <tr>
            <td>방문 횟수</td>
            <td>{hotelState.visitCount || 0}회</td>
          </tr>
          <tr>
            <td>최근 방문</td>
            <td>{hotelState.lastVisit || '-'}</td>
          </tr>
          <tr>
            <td>다음 방문</td>
            <td>{hotelState.nextVisit || '-'}</td>
          </tr>
          <tr>
            <td>동선일</td>
            <td>{hotelState.routeDate || '-'}</td>
          </tr>
          <tr>
            <td>영업자</td>
            <td>{hotelState.salesperson || '-'}</td>
          </tr>
          <tr>
            <td>키오스크</td>
            <td>{hotel.kiosk ? hotel.kioskVendor || hotel.vendor || '업체명 미입력' : '없음/미확인'}</td>
          </tr>
          <tr>
            <td>RMS</td>
            <td>{hotel.rms ? hotel.rmsVendor || '업체명 미입력' : '없음/미확인'}</td>
          </tr>
        </tbody>
      </table>}

      {!isSheet && (
        <>
          <div className="section-title">태그</div>
          <div>
            {hotelState.tags.length ? hotelState.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>) : <span className="meta">태그 없음</span>}
          </div>
        </>
      )}

      {isSheet && (
        <div className="sheet-primary-actions">
          <a className="naver sheet-nav" href={naverUrl(hotel)} target="_blank" rel="noopener noreferrer">
            네이버 길찾기
          </a>
          <button className="edit sheet-nav" type="button" onClick={() => onEdit(hotel.id)}>
            업장 수정
          </button>
        </div>
      )}

      <div className="statusbar">
        {(['planned', 'today', 'visited', 'excluded'] as VisitStatus[]).map((status) => (
          <button key={status} className={status} onClick={() => onStatusChange(hotel.id, status)}>
            {status === 'planned' ? '방문 예정' : status === 'today' ? '오늘 방문' : status === 'visited' ? '방문 완료' : '영업 제외'}
          </button>
        ))}
      </div>

      {!isSheet && (
        <form className="popup-form" onSubmit={(event) => {
          event.preventDefault();
          onSaveProfile(hotel.id, new FormData(event.currentTarget));
        }}>
          <div className="section-title">영업 정보 수정</div>
          <label className="field">대표 미팅</label>
          <input name="meeting" defaultValue={hotelState.meeting} placeholder="예: 월·수·금 16시 이후 / 전화 후 방문" />
          <div className="mini-grid">
            <div>
              <label className="field">동선일</label>
              <input name="routeDate" type="date" defaultValue={hotelState.routeDate} />
            </div>
            <div>
              <label className="field">영업자명</label>
              <input name="salesperson" defaultValue={hotelState.salesperson} placeholder="임봉현, 정민희" />
            </div>
          </div>
          <div className="mini-grid">
            <div>
              <label className="field">계약상태</label>
              <select name="salesStage" defaultValue={hotelState.salesStage}>
                {SALES_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
              </select>
            </div>
            <div>
              <label className="field">다음 방문일</label>
              <input name="nextVisit" type="date" defaultValue={hotelState.nextVisit} />
            </div>
          </div>
          <label className="field">진행 액션</label>
          <div className="action-grid">
            {ACTIONS.map((action) => (
              <label key={action} className="action-check">
                <input name="actions" type="checkbox" value={action} defaultChecked={Boolean(hotelState.actions[action])} />
                {action}
              </label>
            ))}
          </div>
          <label className="field">태그</label>
          <input name="tags" defaultValue={hotelState.tags.join(', ')} placeholder="벤디트, 대표미팅, 재방문" />
          <label className="field">요약 메모</label>
          <textarea name="memo" className="compact" defaultValue={hotelState.memo} placeholder="현재 핵심 상황만 간단히" />
          <button className="save full" type="submit">영업 정보 저장</button>
        </form>
      )}

      <form className="popup-form" onSubmit={(event) => {
        event.preventDefault();
        onAddVisitLog(hotel.id, new FormData(event.currentTarget));
        event.currentTarget.reset();
      }}>
        <div className="section-title">{isSheet ? '방문일지 간단 입력' : '방문일지 추가'}</div>
        <div className="mini-grid">
          <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <select name="type" defaultValue="첫 방문">
            {VISIT_LOG_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>
        <textarea name="note" className="compact" placeholder="오늘 대화 내용, 반응, 다음 액션" />
        <button className="visited full" type="submit">방문일지 누적 저장</button>
      </form>

      {(!isSheet || sortedLogs.length > 0) && (
        <details className={isSheet ? 'sheet-details' : ''} open={!isSheet}>
          <summary className={!isSheet ? 'desktop-summary' : ''}>방문 타임라인</summary>
          {sortedLogs.length ? (
            <div className="timeline">
              {sortedLogs.map((log) => (
                <div key={log.id} className="log">
                  <b>{log.date || '-'} · {log.type || '방문'}</b>
                  <p>{log.note || '내용 없음'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="meta">아직 방문일지가 없어.</div>
          )}
        </details>
      )}

      {!isSheet && (
        <div className="actions">
          <a className="naver" href={naverUrl(hotel)} target="_blank" rel="noopener noreferrer">네이버지도</a>
          <button className="edit" onClick={() => onEdit(hotel.id)}>업장 수정</button>
          <button className="delete" onClick={() => onDelete(hotel.id)}>업장 삭제</button>
        </div>
      )}
    </div>
  );
}
