import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import type { Hotel, HotelStateMap, VisitStatus } from '../types';
import { HotelPopup } from './HotelPopup';

const STATUS_LABELS: Record<VisitStatus, string> = {
  planned: '방문 예정',
  today: '오늘 방문',
  visited: '방문 완료',
  excluded: '영업 제외'
};

const STATUS_COLORS: Record<VisitStatus, string> = {
  planned: '#22c55e',
  today: '#e9a800',
  visited: '#2563eb',
  excluded: '#ef4444'
};

interface MapProps {
  hotels: Hotel[];
  focusHotels: Hotel[];
  todayHotels: Hotel[];
  state: HotelStateMap;
  labelsVisible: boolean;
  selectedHotelId: string | null;
  todayRouteFocusKey: number;
  pickingLocation: boolean;
  onMapFocus: () => void;
  onViewportChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onSelectHotel: (hotel: Hotel) => void;
  onPickedLocation: (lat: number, lon: number) => void;
  onTodayRoute: () => void;
  onStatusChange: (id: string, status: VisitStatus) => void;
  onRouteRequest: (id: string) => void;
  onSaveProfile: (id: string, form: FormData) => void;
  onAddVisitLog: (id: string, form: FormData) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function MapFocus({
  hotels,
  todayHotels,
  selectedHotelId,
  todayRouteFocusKey
}: {
  hotels: Hotel[];
  todayHotels: Hotel[];
  selectedHotelId: string | null;
  todayRouteFocusKey: number;
}) {
  const map = useMap();
  const lastTodayRouteFocusKey = useRef(todayRouteFocusKey);

  useEffect(() => {
    if (lastTodayRouteFocusKey.current === todayRouteFocusKey) return;
    lastTodayRouteFocusKey.current = todayRouteFocusKey;

    if (todayHotels.length === 1) {
      const [hotel] = todayHotels;
      map.setView([hotel.lat, hotel.lon], 16, { animate: false });
      return;
    }

    if (todayHotels.length > 1) {
      const bounds = todayHotels.map((hotel) => [hotel.lat, hotel.lon] as [number, number]);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: false });
    }
  }, [map, todayHotels, todayRouteFocusKey]);

  useEffect(() => {
    if (selectedHotelId) {
      const hotel = hotels.find((item) => item.id === selectedHotelId);
      if (hotel) {
        const point: [number, number] = [hotel.lat, hotel.lon];
        if (!map.getBounds().pad(-0.18).contains(point) || map.getZoom() < 14) {
          map.setView(point, Math.max(map.getZoom(), 15), { animate: false });
        }
      }
      return;
    }
    if (hotels.length === 1) {
      const [hotel] = hotels;
      map.setView([hotel.lat, hotel.lon], 15, { animate: false });
      return;
    }

    if (hotels.length > 1) {
      const bounds = hotels.map((hotel) => [hotel.lat, hotel.lon] as [number, number]);
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13, animate: false });
    }
  }, [hotels, map, selectedHotelId]);

  return null;
}

function LocationPicker({ enabled, onPickedLocation }: { enabled: boolean; onPickedLocation: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onPickedLocation(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function MapInteraction({ enabled, onMapFocus }: { enabled: boolean; onMapFocus: () => void }) {
  useMapEvents({
    click() {
      if (enabled) onMapFocus();
    }
  });
  return null;
}

function ViewportTracker({ onViewportChange }: { onViewportChange: (bounds: { north: number; south: number; east: number; west: number }) => void }) {
  const map = useMap();

  const emitBounds = () => {
    const bounds = map.getBounds();
    onViewportChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    });
  };

  useEffect(() => {
    emitBounds();
  }, []);

  useMapEvents({
    moveend: emitBounds,
    zoomend: emitBounds
  });

  return null;
}

export function Map({
  hotels,
  focusHotels,
  todayHotels,
  state,
  labelsVisible,
  selectedHotelId,
  todayRouteFocusKey,
  pickingLocation,
  onMapFocus,
  onViewportChange,
  onSelectHotel,
  onPickedLocation,
  onTodayRoute,
  onStatusChange,
  onRouteRequest,
  onSaveProfile,
  onAddVisitLog,
  onEdit,
  onDelete
}: MapProps) {
  return (
    <div className="map-shell">
      {pickingLocation && <div className="pick-banner">지도에서 원하는 위치를 클릭해줘. 좌표가 자동 입력된다.</div>}
      <button className="map-today-route" onClick={onTodayRoute}>오늘 동선</button>
      <MapContainer center={[35.22, 128.82]} zoom={10} className="map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <MapFocus
          hotels={focusHotels}
          todayHotels={todayHotels}
          selectedHotelId={selectedHotelId}
          todayRouteFocusKey={todayRouteFocusKey}
        />
        <LocationPicker enabled={pickingLocation} onPickedLocation={onPickedLocation} />
        <MapInteraction enabled={!pickingLocation} onMapFocus={onMapFocus} />
        <ViewportTracker onViewportChange={onViewportChange} />
        {[...hotels].sort((a, b) => Number(state[a.id]?.status === 'today') - Number(state[b.id]?.status === 'today')).map((hotel) => {
          const hotelState = state[hotel.id];
          if (!hotelState) return null;
          return (
            <CircleMarker
              key={hotel.id}
              center={[hotel.lat, hotel.lon]}
              radius={hotelState.status === 'today' ? 11 : 7}
              pathOptions={{
                fillColor: STATUS_COLORS[hotelState.status],
                color: hotelState.status === 'today' ? '#172033' : '#fff',
                weight: hotelState.status === 'today' ? 4 : 1.5,
                fillOpacity: 0.95,
                className: hotelState.status === 'today' ? 'today-pin' : ''
              }}
              eventHandlers={{
                click: (event) => {
                  event.originalEvent.stopPropagation();
                  onSelectHotel(hotel);
                }
              }}
            >
              {labelsVisible && (
                <Tooltip permanent direction="top" className="hotel-label" offset={[0, -6]}>
                  {hotel.area} {hotel.name}
                </Tooltip>
              )}
              <Popup maxWidth={360}>
                <HotelPopup
                  hotel={hotel}
                  hotelState={hotelState}
                  statusLabel={STATUS_LABELS[hotelState.status]}
                  onStatusChange={onStatusChange}
                  onRouteRequest={onRouteRequest}
                  onSaveProfile={onSaveProfile}
                  onAddVisitLog={onAddVisitLog}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
