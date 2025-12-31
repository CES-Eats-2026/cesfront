'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, OverlayView } from '@react-google-maps/api';
import { Store } from '@/types';

interface GoogleMapProps {
  center: { lat: number; lng: number };
  radius?: number; // km 단위
  stores?: Store[];
  selectedStore?: Store | null;
  onMarkerClick?: (store: Store | null) => void;
  onMapLocationClick?: (location: { lat: number; lng: number; walkingTime: number; name?: string } | null) => void;
}

interface ClickedLocation {
  lat: number;
  lng: number;
  name?: string;
  placeId?: string;
}

interface PlaceDetails {
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  photos?: Array<{ getUrl: (options?: { maxWidth?: number; maxHeight?: number }) => string }>;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  website?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  priceLevel?: number;
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
}

const libraries: ('places' | 'drawing' | 'geometry' | 'visualization')[] = ['places'];

type TravelMode = 'WALKING' | 'DRIVING' | 'TRANSIT';

export default function GoogleMapComponent({
  center,
  radius = 2,
  stores = [],
  selectedStore,
  onMarkerClick,
  onMapLocationClick,
}: GoogleMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const isMarkerClickRef = useRef(false); // 마커 클릭 여부 추적
  const [travelMode, setTravelMode] = useState<TravelMode>('WALKING');
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [showDirectionsPanel, setShowDirectionsPanel] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<ClickedLocation | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'about'>('overview');
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries,
  });

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: false,
      clickableIcons: false, // Google Maps 기본 마커 숨기기 (우리가 직접 마커를 표시)
      scrollwheel: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    }),
    []
  );

  // 반경을 zoom 레벨로 변환
  const radiusToZoom = (km: number): number => {
    if (km <= 1) return 15;
    if (km <= 2) return 14;
    if (km <= 5) return 13;
    if (km <= 10) return 12;
    return 11;
  };

  const zoom = useMemo(() => radiusToZoom(radius), [radius]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    
    // Directions Service 초기화
    if (typeof google !== 'undefined' && google.maps && google.maps.DirectionsService) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }
    
    // Directions Renderer 초기화
    if (typeof google !== 'undefined' && google.maps && google.maps.DirectionsRenderer) {
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true, // 기본 마커 숨기기 (우리가 직접 마커를 표시)
      });
    }
    
    // Places Service 초기화
    if (typeof google !== 'undefined' && google.maps && google.maps.places && google.maps.places.PlacesService) {
      placesServiceRef.current = new google.maps.places.PlacesService(map);
    }
    
    // 지도 로드 시 초기 Circle 생성
    if (radius > 0 && typeof google !== 'undefined' && google.maps && google.maps.Circle) {
      const radiusInMeters = Math.max(radius * 1000, 10);
      if (!circleRef.current) {
        circleRef.current = new google.maps.Circle({
          center: center,
          radius: radiusInMeters,
          fillColor: '#4285F4',
          fillOpacity: 0.1,
          strokeColor: '#4285F4',
          strokeOpacity: 0.5,
          strokeWeight: 2,
          clickable: false, // 마커 클릭을 방해하지 않도록
          map: map,
        });
      }
    }
  }, [center, radius]);

  // center나 radius가 변경되면 지도 업데이트
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(zoom);
    }
  }, [center, zoom]);

  // 거리 계산 함수 (Haversine formula)
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 거리 (km)
  }, []);

  // 지도 클릭 시 InfoWindow 닫기 및 Google Maps 기본 마커 클릭 처리 (직접 리스너 등록)
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    const map = mapRef.current;
    const clickListener = google.maps.event.addListener(map, 'click', (e: google.maps.MapMouseEvent) => {
      // 약간의 지연을 두어 마커 클릭 이벤트가 먼저 처리되도록 함
      setTimeout(() => {
        // 마커 클릭이 아닌 경우
        if (!isMarkerClickRef.current) {
          // InfoWindow 닫기
          if (selectedStore && !showDirectionsPanel) {
            onMarkerClick?.(null as any);
          }
          
          // Google Maps 기본 마커(장소) 클릭 처리
          if (e.latLng && onMapLocationClick) {
            const clickedLat = e.latLng.lat();
            const clickedLng = e.latLng.lng();
            const distance = calculateDistance(center.lat, center.lng, clickedLat, clickedLng);
            const walkingTime = Math.round(distance * 20); // 3km/h = 20분/km
            
            onMapLocationClick({
              lat: clickedLat,
              lng: clickedLng,
              walkingTime: walkingTime,
            });
          }
        }
        // 플래그 리셋
        isMarkerClickRef.current = false;
      }, 100);
    });

    return () => {
      if (clickListener) {
        google.maps.event.removeListener(clickListener);
      }
    };
  }, [isLoaded, selectedStore, showDirectionsPanel, onMarkerClick, onMapLocationClick, center, calculateDistance]);

  // Circle 업데이트 (중복 방지)
  useEffect(() => {
    if (!mapRef.current || !isLoaded || typeof google === 'undefined' || !google.maps || !google.maps.Circle) {
      return;
    }

    // radius가 0이거나 유효하지 않으면 Circle 제거
    if (!radius || radius <= 0) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    // 새 Circle 생성
    const radiusInMeters = Math.max(radius * 1000, 10); // 최소 10m
    try {
      // 기존 Circle이 있으면 업데이트, 없으면 새로 생성
      if (circleRef.current) {
        circleRef.current.setCenter(center);
        circleRef.current.setRadius(radiusInMeters);
      } else {
        circleRef.current = new google.maps.Circle({
          center: center,
          radius: radiusInMeters,
          fillColor: '#4285F4',
          fillOpacity: 0.1,
          strokeColor: '#4285F4',
          strokeOpacity: 0.5,
          strokeWeight: 2,
          clickable: false, // 마커 클릭을 방해하지 않도록
          map: mapRef.current,
        });
      }
    } catch (error) {
      console.error('Error creating/updating circle:', error);
    }

    // cleanup은 컴포넌트 언마운트 시에만 실행
    // 의존성 변경 시에는 Circle을 업데이트하므로 제거하지 않음
  }, [center.lat, center.lng, radius, isLoaded]);

  // 경로 계산
  const calculateRoute = useCallback((mode: TravelMode) => {
    const destination = selectedStore 
      ? { lat: selectedStore.latitude, lng: selectedStore.longitude }
      : clickedLocation;
    
    if (!destination || !directionsServiceRef.current || !directionsRendererRef.current) {
      return;
    }

    setDirectionsLoading(true);
    const request: google.maps.DirectionsRequest = {
      origin: center,
      destination: destination,
      travelMode: google.maps.TravelMode[mode],
    };

    directionsServiceRef.current.route(request, (result, status) => {
      setDirectionsLoading(false);
      if (status === google.maps.DirectionsStatus.OK && result) {
        setDirections(result);
        directionsRendererRef.current?.setDirections(result);
      } else {
        console.error('Directions request failed:', status);
        setDirections(null);
        if (directionsRendererRef.current && mapRef.current) {
          directionsRendererRef.current.setMap(null);
          directionsRendererRef.current.setMap(mapRef.current);
        }
      }
    });
  }, [selectedStore, clickedLocation, center]);

  // Google Maps URL에서 place_id 추출
  const extractPlaceIdFromUrl = (url: string): string | null => {
    try {
      // URL에서 place_id 추출 시도
      const placeIdMatch = url.match(/place_id=([^&]+)/);
      if (placeIdMatch) {
        return placeIdMatch[1];
      }
      // 또는 /place/ 다음의 정보에서 추출
      const placeMatch = url.match(/\/place\/([^/]+)/);
      if (placeMatch) {
        return placeMatch[1];
      }
    } catch (error) {
      console.error('Error extracting place_id from URL:', error);
    }
    return null;
  };

  // place_id로 직접 장소 정보 가져오기
  const fetchPlaceDetailsById = useCallback((placeId: string, location?: { lat: number; lng: number }) => {
    if (!placesServiceRef.current || !isLoaded || typeof google === 'undefined' || !google.maps || !google.maps.places) {
      console.warn('Places Service not available');
      if (location) {
        setPlaceDetails({
          name: '선택한 위치',
        });
        setClickedLocation({
          lat: location.lat,
          lng: location.lng,
        });
      }
      return;
    }
    
    setPlaceDetailsLoading(true);
    try {
      const detailsRequest: google.maps.places.PlaceDetailsRequest = {
        placeId: placeId,
        fields: ['name', 'rating', 'user_ratings_total', 'types', 'photos', 'formatted_address', 
                 'geometry', 'international_phone_number', 'website', 'opening_hours', 'price_level', 'reviews'],
      };
      
      placesServiceRef.current.getDetails(detailsRequest, (placeDetails, detailsStatus) => {
        setPlaceDetailsLoading(false);
        if (detailsStatus === google.maps.places.PlacesServiceStatus.OK && placeDetails) {
          const lat = placeDetails.geometry?.location?.lat() || location?.lat || 0;
          const lng = placeDetails.geometry?.location?.lng() || location?.lng || 0;
          
          setPlaceDetails({
            name: placeDetails.name || '',
            rating: placeDetails.rating,
            userRatingsTotal: placeDetails.user_ratings_total,
            types: placeDetails.types,
            photos: placeDetails.photos,
            formattedAddress: placeDetails.formatted_address,
            internationalPhoneNumber: placeDetails.international_phone_number,
            website: placeDetails.website,
            openingHours: placeDetails.opening_hours ? {
              openNow: placeDetails.opening_hours.open_now,
              weekdayText: placeDetails.opening_hours.weekday_text,
            } : undefined,
            priceLevel: placeDetails.price_level,
            reviews: placeDetails.reviews?.map(review => ({
              authorName: review.author_name || '',
              rating: review.rating || 0,
              text: review.text || '',
              time: review.time || 0,
            })),
          });
          setClickedLocation({
            lat,
            lng,
            name: placeDetails.name || undefined,
            placeId: placeId,
          });
        } else {
          console.error('Failed to get place details:', detailsStatus);
          if (location) {
            setPlaceDetails({
              name: '선택한 위치',
            });
            setClickedLocation({
              lat: location.lat,
              lng: location.lng,
            });
          }
        }
      });
    } catch (error) {
      console.error('Error fetching place details by ID:', error);
      setPlaceDetailsLoading(false);
      if (location) {
        setPlaceDetails({
          name: '선택한 위치',
        });
        setClickedLocation({
          lat: location.lat,
          lng: location.lng,
        });
      }
    }
  }, [isLoaded]);

  // 장소 정보 가져오기 (좌표 기반)
  const fetchPlaceDetails = useCallback((location: { lat: number; lng: number }, placeId?: string) => {
    // place_id가 있으면 직접 사용
    if (placeId) {
      fetchPlaceDetailsById(placeId, location);
      return;
    }

    if (!placesServiceRef.current || !isLoaded || typeof google === 'undefined' || !google.maps || !google.maps.places) {
      console.warn('Places Service not available');
      setPlaceDetails({
        name: '선택한 위치',
      });
      setClickedLocation({
        lat: location.lat,
        lng: location.lng,
      });
      return;
    }
    
    setPlaceDetailsLoading(true);
    try {
      const request: google.maps.places.PlaceSearchRequest = {
        location: new google.maps.LatLng(location.lat, location.lng),
        radius: 50, // 50m 반경 내의 장소 찾기
        rankBy: google.maps.places.RankBy.DISTANCE,
      };

      placesServiceRef.current.nearbySearch(request, (results, status) => {
        setPlaceDetailsLoading(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          // Place Details 가져오기
          fetchPlaceDetailsById(place.place_id!, location);
        } else {
          // 장소를 찾을 수 없으면 좌표만 사용
          console.warn('Place not found, status:', status);
          setPlaceDetails({
            name: '선택한 위치',
          });
          setClickedLocation({
            lat: location.lat,
            lng: location.lng,
          });
        }
      });
    } catch (error) {
      console.error('Error fetching place details:', error);
      setPlaceDetailsLoading(false);
      setPlaceDetails({
        name: '선택한 위치',
      });
      setClickedLocation({
        lat: location.lat,
        lng: location.lng,
      });
    }
  }, [isLoaded, fetchPlaceDetailsById]);

  // selectedStore가 변경되면 장소 정보 가져오기
  useEffect(() => {
    if (selectedStore && isLoaded && showDirectionsPanel) {
      fetchPlaceDetails({ lat: selectedStore.latitude, lng: selectedStore.longitude });
    }
  }, [selectedStore, isLoaded, showDirectionsPanel, fetchPlaceDetails]);

  // 선택된 장소나 이동 수단이 변경되면 경로 재계산
  useEffect(() => {
    const destination = selectedStore 
      ? { lat: selectedStore.latitude, lng: selectedStore.longitude }
      : clickedLocation;
      
    if (destination && isLoaded && showDirectionsPanel) {
      calculateRoute(travelMode);
    } else {
      // 선택 해제 시 경로 제거
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current.setMap(mapRef.current);
      }
      setDirections(null);
    }
  }, [selectedStore, clickedLocation, travelMode, isLoaded, showDirectionsPanel, calculateRoute]);

  // 지도 클릭 이벤트 핸들러
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    // 마커 클릭이 아닌 경우에만 InfoWindow 닫기
    setTimeout(() => {
      if (!isMarkerClickRef.current && selectedStore && !showDirectionsPanel) {
        onMarkerClick?.(null as any);
      }
      // 플래그 리셋
      isMarkerClickRef.current = false;
    }, 10);
    // 클릭 시 패널 표시 비활성화
    // if (e.latLng) {
    //   const lat = e.latLng.lat();
    //   const lng = e.latLng.lng();
    //   setClickedLocation({ lat, lng });
    //   setShowDirectionsPanel(true);
    //   fetchPlaceDetails({ lat, lng });
    // }
  }, [selectedStore, showDirectionsPanel, onMarkerClick]);

  // API 키가 없을 때
  if (!apiKey) {
    return (
      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
        <div className="text-center p-4">
          <p className="text-red-600 font-semibold mb-2">Google Maps API 키가 필요합니다</p>
          <p className="text-sm text-gray-600 mb-2">
            front/.env.local 파일에 다음을 추가하세요:
          </p>
          <code className="text-xs bg-gray-100 p-2 rounded block">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
          </code>
        </div>
      </div>
    );
  }

  // 로딩 중
  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">지도를 불러오는 중...</p>
          <p className="text-xs text-gray-500">
            Maps JavaScript API를 로딩 중입니다
          </p>
          {loadError && (
            <p className="text-xs text-red-500 mt-2">
              에러: {loadError.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 에러 발생 시
  if (loadError) {
    return (
      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
        <div className="text-center p-4 max-w-md">
          <p className="text-red-600 font-semibold mb-2">지도를 불러올 수 없습니다</p>
          <p className="text-xs text-gray-600 mb-2">
            에러: {loadError.message || 'Unknown error'}
          </p>
          <p className="text-xs text-gray-500 mb-2">
            가능한 원인:
          </p>
          <ul className="text-xs text-gray-500 text-left mb-3 space-y-1">
            <li>• Maps JavaScript API 활성화 확인</li>
            <li>• API 키 제한 설정 확인 (HTTP 리퍼러)</li>
            <li>• 브라우저 콘솔(F12)에서 상세 에러 확인</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ minHeight: '400px' }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%', minHeight: '400px' }}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
      >

        {/* 현재 위치 마커 */}
        <Marker
          position={center}
          title="현재 위치"
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }}
        />

        {/* 추천 장소 마커 */}
        {stores.map((store) => (
          <Marker
            key={store.id}
            position={{ lat: store.latitude, lng: store.longitude }}
            onClick={(e) => {
              e.stop(); // 이벤트 전파 방지 - 지도 클릭 이벤트가 발생하지 않도록
              isMarkerClickRef.current = true; // 마커 클릭 플래그 설정
              
              // 이미 선택된 마커를 다시 클릭하면 닫기
              if (selectedStore?.id === store.id) {
                onMarkerClick?.(null as any);
              } else {
                onMarkerClick?.(store);
              }
              
              // 플래그를 충분한 시간 후 리셋 (지도 클릭 이벤트가 처리되기 전까지)
              setTimeout(() => {
                isMarkerClickRef.current = false;
              }, 200);
              // 패널 표시 비활성화
              // setShowDirectionsPanel(true);
              // 장소 정보 가져오기 (place_id가 있으면 직접 사용)
              if (isLoaded) {
                // Store에 place_id가 있으면 직접 사용, 없으면 좌표로 검색
                const storeWithPlaceId = store as any;
                if (storeWithPlaceId.placeId) {
                  fetchPlaceDetailsById(storeWithPlaceId.placeId, { lat: store.latitude, lng: store.longitude });
                } else {
                  fetchPlaceDetails({ lat: store.latitude, lng: store.longitude });
                }
              }
            }}
            title={store.name}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#EA4335',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        ))}

        {/* 선택된 장소 정보창 - 간단한 정보만 표시 (패널이 열려있지 않을 때만) */}
        {selectedStore && !showDirectionsPanel && (
          <>
            <InfoWindow
              position={{ lat: selectedStore.latitude, lng: selectedStore.longitude }}
              onCloseClick={() => {
                onMarkerClick?.(null as any);
                setShowDirectionsPanel(false);
                if (directionsRendererRef.current && mapRef.current) {
                  directionsRendererRef.current.setMap(null);
                  directionsRendererRef.current.setMap(mapRef.current);
                }
                setDirections(null);
              }}
            >
              <div className="p-3">
                <h3 className="font-bold text-base mb-1">{selectedStore.name}</h3>
                <p className="text-xs text-gray-600 mb-2">{selectedStore.cesReason}</p>
                {selectedStore.address && (
                  <p className="text-xs text-gray-500">{selectedStore.address}</p>
                )}
              </div>
            </InfoWindow>
            {/* 도보 시간 표시 오버레이 - InfoWindow 위 모서리에 표시 */}
            <OverlayView
              position={{ lat: selectedStore.latitude, lng: selectedStore.longitude }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div style={{ 
                position: 'absolute',
                top: '-60px',
                left: '50%',
                transform: 'translateX(-50%)',
                pointerEvents: 'none'
              }}>
                <div className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap relative">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span className="text-sm font-semibold">도보 {selectedStore.walkingTime}분</span>
                  </div>
                  {/* 말풍선 꼬리 */}
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                    <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-blue-600"></div>
                  </div>
                </div>
              </div>
            </OverlayView>
          </>
        )}

      </GoogleMap>

      {/* 반경 표시 오버레이 */}
      {radius && (
        <div className="absolute top-4 right-4 bg-white px-3 py-2 rounded-lg shadow-md z-10">
          <p className="text-sm font-semibold text-gray-700">
            반경: {radius.toFixed(1)}km
          </p>
        </div>
      )}

      {/* 왼쪽에서 슬라이드되는 Google Maps 스타일 패널 */}
      {showDirectionsPanel && (selectedStore || clickedLocation) && (
        <div 
          className="fixed top-0 left-0 h-full w-full sm:w-96 bg-white shadow-2xl z-[100] transform transition-transform duration-300 ease-out overflow-hidden"
          style={{ maxWidth: '384px' }}
        >
          <div className="h-full flex flex-col overflow-y-auto">
            {/* 닫기 버튼 (상단 고정) */}
            <button
              onClick={() => {
                setShowDirectionsPanel(false);
                setClickedLocation(null);
                setPlaceDetails(null);
              if (directionsRendererRef.current && mapRef.current) {
                directionsRendererRef.current.setMap(null);
                directionsRendererRef.current.setMap(mapRef.current);
              }
              setDirections(null);
              }}
              className="absolute top-4 left-4 z-30 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl font-bold">×</span>
            </button>

            {/* 장소 이미지 */}
            {placeDetails?.photos && placeDetails.photos.length > 0 && (
              <div className="relative w-full h-48 bg-gray-200">
                <img
                  src={placeDetails.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 })}
                  alt={placeDetails.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
            )}

            {/* 장소 정보 카드 */}
            <div className="bg-white rounded-t-3xl -mt-6 relative z-10 flex-1">
              <div className="p-4">
                {/* 제목 및 평점 */}
                <div className="mb-3">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    {selectedStore?.name || placeDetails?.name || clickedLocation?.name || '선택한 위치'}
                  </h2>
                  {placeDetails?.rating && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center">
                        <span className="text-yellow-400 text-lg">★</span>
                        <span className="text-base font-semibold text-gray-900 ml-1">
                          {placeDetails.rating.toFixed(1)}
                        </span>
                      </div>
                      {placeDetails.userRatingsTotal && (
                        <span className="text-sm text-gray-600">
                          ({placeDetails.userRatingsTotal})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 카테고리 및 접근성 */}
                <div className="mb-4 flex items-center gap-2">
                  {placeDetails?.types && placeDetails.types.length > 0 && (
                    <span className="text-sm text-gray-600">
                      {placeDetails.types[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  )}
                  <span className="text-gray-400">•</span>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                {/* 탭 메뉴 */}
                <div className="flex gap-4 mb-4 border-b border-gray-200">
                  <button 
                    onClick={() => setActiveTab('overview')}
                    className={`pb-2 px-1 font-medium text-sm transition-colors ${
                      activeTab === 'overview'
                        ? 'border-b-2 border-teal-500 text-teal-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Overview
                  </button>
                  <button 
                    onClick={() => setActiveTab('reviews')}
                    className={`pb-2 px-1 font-medium text-sm transition-colors ${
                      activeTab === 'reviews'
                        ? 'border-b-2 border-teal-500 text-teal-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Reviews
                  </button>
                  <button 
                    onClick={() => setActiveTab('about')}
                    className={`pb-2 px-1 font-medium text-sm transition-colors ${
                      activeTab === 'about'
                        ? 'border-b-2 border-teal-500 text-teal-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    About
                  </button>
                </div>

                {/* 액션 버튼들 */}
                <div className="flex items-center justify-around py-3 border-y border-gray-200 mb-4">
                  <button
                    onClick={() => {
                      if (travelMode) {
                        calculateRoute(travelMode);
                      }
                    }}
                    className="flex flex-col items-center gap-1 text-teal-600 hover:text-teal-700"
                  >
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium">Directions</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-gray-600 hover:text-gray-700">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium">Save</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-gray-600 hover:text-gray-700">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium">Nearby</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-gray-600 hover:text-gray-700">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium">Send to phone</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-gray-600 hover:text-gray-700">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium">Share</span>
                  </button>
                </div>

                {/* 탭 내용 */}
                {activeTab === 'overview' && (
                  <>
                    {/* 위치 정보 */}
                    {placeDetails?.formattedAddress && (
                      <div className="mb-4 text-sm text-gray-600 flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{placeDetails.formattedAddress}</span>
                      </div>
                    )}

                    {/* 이동 수단 선택 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        이동 수단
                      </label>
                      <div className="flex gap-2">
                        {(['WALKING', 'DRIVING', 'TRANSIT'] as TravelMode[]).map((mode) => {
                          const labels = {
                            WALKING: '🚶 도보',
                            DRIVING: '🚗 자동차',
                            TRANSIT: '🚌 대중교통',
                          };
                          const isActive = travelMode === mode;
                          return (
                            <button
                              key={mode}
                              onClick={() => setTravelMode(mode)}
                              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {labels[mode]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 경로 정보 */}
                    {directionsLoading && (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-500">경로 계산 중...</p>
                      </div>
                    )}

                    {directions && directions.routes[0] && (
                      <div className="space-y-3 mb-4">
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">거리</span>
                            <span className="text-lg font-bold text-blue-600">
                              {directions.routes[0].legs[0].distance?.text || '계산 중...'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">소요 시간</span>
                            <span className="text-lg font-bold text-blue-600">
                              {directions.routes[0].legs[0].duration?.text || '계산 중...'}
                            </span>
                          </div>
                        </div>

                        {/* 경로 단계 표시 */}
                        {directions.routes[0].legs[0].steps && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">경로 안내</h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {directions.routes[0].legs[0].steps.slice(0, 8).map((step, index) => (
                                <div key={index} className="flex items-start gap-3 text-sm text-gray-600">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                                    {index + 1}
                                  </span>
                                  <span className="flex-1" dangerouslySetInnerHTML={{ __html: step.instructions }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!directionsLoading && !directions && (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-500">이동 수단을 선택하면 경로가 표시됩니다.</p>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'reviews' && (
                  <div className="space-y-4">
                    {placeDetails?.reviews && placeDetails.reviews.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900">리뷰</h3>
                          <span className="text-sm text-gray-600">
                            {placeDetails.userRatingsTotal?.toLocaleString()}개 리뷰
                          </span>
                        </div>
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {placeDetails.reviews.map((review, index) => (
                            <div key={index} className="border-b border-gray-200 pb-4 last:border-0">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-600 font-medium text-sm">
                                    {review.authorName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-gray-900">{review.authorName}</span>
                                    <div className="flex items-center">
                                      {[...Array(5)].map((_, i) => (
                                        <span
                                          key={i}
                                          className={`text-sm ${
                                            i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                                          }`}
                                        >
                                          ★
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    {new Date(review.time * 1000).toLocaleDateString('ko-KR')}
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed">{review.text}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500">리뷰가 없습니다.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'about' && (
                  <div className="space-y-4">
                    {/* 주소 */}
                    {placeDetails?.formattedAddress && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">주소</p>
                          <p className="text-sm text-gray-600">{placeDetails.formattedAddress}</p>
                        </div>
                      </div>
                    )}

                    {/* 전화번호 */}
                    {placeDetails?.internationalPhoneNumber && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">전화번호</p>
                          <a 
                            href={`tel:${placeDetails.internationalPhoneNumber}`}
                            className="text-sm text-blue-600 hover:text-blue-700"
                          >
                            {placeDetails.internationalPhoneNumber}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* 웹사이트 */}
                    {placeDetails?.website && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">웹사이트</p>
                          <a 
                            href={placeDetails.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-700 break-all"
                          >
                            {placeDetails.website}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* 영업시간 */}
                    {placeDetails?.openingHours?.weekdayText && placeDetails.openingHours.weekdayText.length > 0 && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm font-medium text-gray-700">영업시간</p>
                            {placeDetails.openingHours.openNow !== undefined && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                placeDetails.openingHours.openNow
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {placeDetails.openingHours.openNow ? '영업 중' : '영업 종료'}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {placeDetails.openingHours.weekdayText.map((hours, index) => (
                              <p key={index} className="text-sm text-gray-600">{hours}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 가격 수준 */}
                    {placeDetails?.priceLevel !== undefined && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">가격 수준</p>
                          <p className="text-sm text-gray-600">
                            {placeDetails.priceLevel === 0 ? '무료' : '$'.repeat(placeDetails.priceLevel)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 카테고리 */}
                    {placeDetails?.types && placeDetails.types.length > 0 && (
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">카테고리</p>
                          <div className="flex flex-wrap gap-2">
                            {placeDetails.types.slice(0, 5).map((type, index) => (
                              <span
                                key={index}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                              >
                                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {!placeDetails?.formattedAddress && !placeDetails?.internationalPhoneNumber && 
                     !placeDetails?.website && !placeDetails?.openingHours && (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500">상세 정보가 없습니다.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
