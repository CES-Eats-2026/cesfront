'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, OverlayView } from '@react-google-maps/api';
import { Store, StoreType, TimeOption } from '@/types';
import { getGoogleMapsDeepLink } from '@/lib/api';

interface GoogleMapProps {
  center: { lat: number; lng: number };
  radius?: number; // km 단위
  stores?: Store[];
  selectedStore?: Store | null;
  onMarkerClick?: (store: Store | null) => void;
  onMapLocationClick?: (location: { lat: number; lng: number; walkingTime: number; name?: string } | null) => void;
  onAddStore?: (store: Store) => void; // 새로운 장소를 stores 배열에 추가하는 콜백
  type?: StoreType; // 유형 필터
  radiusKm?: number; // 반경 (km)
  timeOption?: TimeOption; // 시간 옵션
  onTimeChange?: (time: TimeOption) => void; // 시간 변경 핸들러
  onTypeChange?: (type: StoreType) => void; // 유형 변경 핸들러
  autoCollapse?: boolean; // 자동 접기 여부
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

const libraries: ('places' | 'drawing' | 'geometry' | 'visualization')[] = ['places', 'geometry'];

type TravelMode = 'WALKING' | 'DRIVING' | 'TRANSIT';

export default function GoogleMapComponent({
  center,
  radius = 2,
  stores = [],
  selectedStore,
  onMarkerClick,
  onMapLocationClick,
  onAddStore,
  type = 'all',
  radiusKm = 2,
  timeOption = 24,
  onTimeChange,
  onTypeChange,
  autoCollapse = false,
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
  const [infoWindowPhotoIndex, setInfoWindowPhotoIndex] = useState(0); // InfoWindow 이미지 슬라이더 인덱스
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  
  // 거리 슬라이더 상태
  const [sliderValue, setSliderValue] = useState(1000); // 초기값 1km
  const typeScrollRef = useRef<HTMLDivElement | null>(null);
  
  // 실시간 급상승 슬라이드 상태
  const [trendingIndex, setTrendingIndex] = useState(0);
  const [isTrendingSliding, setIsTrendingSliding] = useState(false);
  
  // 접기/펼치기 상태 (3단계 순환)
  // 0: "실시간 급상승 조회 장소" 텍스트만 (최소화, 칸 작아짐)
  // 1: 거리, 유형 선택 UI 표시
  // 2: 실시간 급상승 장소 표시
  const [expandState, setExpandState] = useState(2); // 초기값: 실시간 급상승 표시
  const expandStateRef = useRef(expandState); // 최신 상태 참조용
  const isExpandedRef = useRef(expandState === 1 || expandState === 2); // 거리/유형이 보이는지 여부
  
  // 랜덤 메시지 표시 상태
  const [showRandomMessage, setShowRandomMessage] = useState(false);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // expandState 상태를 ref에 동기화
  useEffect(() => {
    expandStateRef.current = expandState;
    isExpandedRef.current = expandState === 1 || expandState === 2;
  }, [expandState]);
  
  // autoCollapse prop이 변경되면 자동으로 접기 (상태 0으로)
  useEffect(() => {
    if (autoCollapse) {
      setExpandState(0);
    }
  }, [autoCollapse]);
  
  // 접혀 있을 때 (상태 0 또는 상태 2) 메시지 표시 (2초마다 반복)
  useEffect(() => {
    if (expandState === 0 || expandState === 2) {
      let isActive = true;
      
      const showAndHideMessage = () => {
        const currentState = expandStateRef.current;
        if (!isActive || (currentState !== 0 && currentState !== 2)) {
          return;
        }
        
        // 메시지 표시
        setShowRandomMessage(true);
        
        // 2초 후 메시지 숨김
        setTimeout(() => {
          const currentStateAfter = expandStateRef.current;
          if (isActive && (currentStateAfter === 0 || currentStateAfter === 2)) {
            setShowRandomMessage(false);
            
            // 2초 후 다시 표시
            setTimeout(() => {
              const currentStateFinal = expandStateRef.current;
              if (isActive && (currentStateFinal === 0 || currentStateFinal === 2)) {
                showAndHideMessage();
              }
            }, 2000);
          }
        }, 2000);
      };
      
      // 첫 메시지 즉시 표시
      showAndHideMessage();
      
      return () => {
        isActive = false;
        setShowRandomMessage(false);
        if (messageTimeoutRef.current) {
          clearTimeout(messageTimeoutRef.current);
          messageTimeoutRef.current = null;
        }
      };
    } else {
      // 상태 1일 때만 메시지 숨김
      setShowRandomMessage(false);
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
    }
  }, [expandState]);
  
  // 사용자 방향 (heading) 상태
  const [userHeading, setUserHeading] = useState<number | null>(null);
  
  
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries,
  });

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: false,
      clickableIcons: true, // Google Maps 기본 마커 클릭 가능하게 설정
      scrollwheel: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy', // 한 손가락으로도 지도 드래그 가능
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

  // 지도 중심은 항상 원래 center prop을 사용 (현재 위치 고정)
  // selectedStore가 있어도 지도는 현재 위치를 중심으로 유지
  const mapCenter = useMemo(() => {
    return center;
  }, [center]);

  const mapZoom = useMemo(() => {
    return zoom;
  }, [zoom]);

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
        suppressMarkers: false, // 기본 마커 표시 (Google Maps 기본 마커 사용)
      });
    }
    
    // Places Service 초기화
    if (typeof google !== 'undefined' && google.maps && google.maps.places && google.maps.places.PlacesService) {
      placesServiceRef.current = new google.maps.places.PlacesService(map);
    }
    
    // 지도 로드 시 초기 Circle 생성
    // Circle의 중심은 항상 원래 center prop을 사용 (현재 위치)
    if (radius > 0 && typeof google !== 'undefined' && google.maps && google.maps.Circle) {
      const radiusInMeters = Math.max(radius * 1000, 10);
      if (!circleRef.current) {
        circleRef.current = new google.maps.Circle({
          center: center, // 원래 center prop 사용 (현재 위치)
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

  // mapCenter나 mapZoom이 변경되면 지도 업데이트
  // 단, selectedStore가 있을 때는 지도를 이동하지 않음 (현재 위치 고정)
  useEffect(() => {
    if (mapRef.current && mapCenter && !selectedStore) {
      mapRef.current.panTo(mapCenter);
      mapRef.current.setZoom(mapZoom);
    }
  }, [mapCenter, mapZoom, selectedStore]);

  // selectedStore가 변경되면 해당 위치로 지도 이동 및 줌 인
  useEffect(() => {
    if (!mapRef.current || !isLoaded || !selectedStore) return;

    const storePosition = { lat: selectedStore.latitude, lng: selectedStore.longitude };
    
    // 지도 중심을 아래쪽으로 보이도록 약간 위쪽으로 offset (lat를 증가시켜서 마커가 아래쪽에 보이게)
    // 약 0.002도 위로 이동하면 화면에서 마커가 아래쪽에 위치하게 됨
    const offsetLat = storePosition.lat + 0.002;
    const offsetPosition = { lat: offsetLat, lng: storePosition.lng };
    
    // 지도가 해당 위치로 이동 및 줌 인
    mapRef.current.panTo(offsetPosition);
    mapRef.current.setZoom(17); // 더 가까운 줌 레벨
  }, [selectedStore, isLoaded]);

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

  // 거리(미터)를 시간으로 변환: 도보 속도 5km/h 기준
  const distanceToTime = (meters: number): number => {
    return Math.round((meters / 5000) * 60);
  };
  
  // 시간을 거리(미터)로 변환
  const timeToDistance = (minutes: number): number => {
    return Math.round((minutes / 60) * 5000);
  };

  // 실시간 급상승 상위 3개 계산
  const trendingStores = useMemo(() => {
    const storesWithIncrease = stores.map(store => {
      const viewCountIncrease = store.viewCountIncrease ?? 0;
      return { ...store, viewCountIncrease };
    });
    
    // 조회수 증가량이 있는 것 우선, 없으면 전체 조회수 기준으로 정렬
    return storesWithIncrease
      .sort((a, b) => {
        // 먼저 조회수 증가량으로 정렬 (증가량이 있는 것 우선)
        if (b.viewCountIncrease !== a.viewCountIncrease) {
          return b.viewCountIncrease - a.viewCountIncrease;
        }
        // 증가량이 같으면 전체 조회수로 정렬
        const aCount = a.viewCount ?? 0;
        const bCount = b.viewCount ?? 0;
        return bCount - aCount;
      })
      .slice(0, 3); // 상위 3개만 선택 (필터 제거)
  }, [stores]);

  // timeOption이 변경되면 슬라이더 값 업데이트
  useEffect(() => {
    if (timeOption) {
      const distance = Math.max(100, Math.min(2000, timeToDistance(timeOption)));
      setSliderValue(distance);
    }
  }, [timeOption]);

  // 실시간 급상승 자동 슬라이드 (3초마다 전환)
  useEffect(() => {
    if (trendingStores.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTrendingSliding(true);
      setTimeout(() => {
        setTrendingIndex((prev) => (prev + 1) % trendingStores.length);
        requestAnimationFrame(() => {
          setTimeout(() => {
            setIsTrendingSliding(false);
          }, 10);
        });
      }, 350);
    }, 3000); // 3초마다 전환
    
    return () => clearInterval(interval);
  }, [trendingStores.length]);
  
  // trendingStores가 변경되면 인덱스 리셋
  useEffect(() => {
    setTrendingIndex(0);
  }, [trendingStores.length]);

  // 사용자 방향(나침반) 감지
  useEffect(() => {
    if (!isLoaded || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    // Geolocation API로 방향 정보 가져오기
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        // heading 속성이 있으면 사용 (0-360도, 북쪽이 0도)
        if (position.coords.heading !== null && position.coords.heading !== undefined) {
          setUserHeading(position.coords.heading);
        }
      },
      (error) => {
        // 방향 정보를 가져올 수 없어도 계속 진행 (선택적 기능)
        console.log('Heading not available:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isLoaded]);

  // 슬라이더 변경 핸들러
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const distanceMeters = parseInt(e.target.value);
    setSliderValue(distanceMeters);
    const timeMinutes = distanceToTime(distanceMeters);
    onTimeChange?.(timeMinutes);
  };

  // 유형 옵션
  const typeOptions: { value: StoreType; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'restaurant', label: '레스토랑' },
    { value: 'cafe', label: '카페' },
    { value: 'fastfood', label: '패스트푸드' },
    { value: 'bar', label: '바' },
    { value: 'food', label: '음식점' },
    { value: 'bakery', label: '베이커리' },
    { value: 'meal_delivery', label: '배달음식' },
    { value: 'night_club', label: '나이트클럽' },
    { value: 'liquor_store', label: '주류판매점' },
    { value: 'store', label: '상점' },
    { value: 'shopping_mall', label: '쇼핑몰' },
    { value: 'supermarket', label: '슈퍼마켓' },
    { value: 'convenience_store', label: '편의점' },
    { value: 'other', label: '기타' },
  ];

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
          if (e.latLng) {
            const clickedLat = e.latLng.lat();
            const clickedLng = e.latLng.lng();
            
            // 클릭한 위치의 장소 정보 가져오기
            setClickedLocation({ lat: clickedLat, lng: clickedLng });
            setShowDirectionsPanel(false); // 패널 닫기
            onMarkerClick?.(null as any); // 추천된 장소 선택 해제
            
            // onMapLocationClick도 호출 (도보 시간 표시용)
            if (onMapLocationClick) {
              const distance = calculateDistance(center.lat, center.lng, clickedLat, clickedLng);
              const walkingTime = Math.round(distance * 20); // 3km/h = 20분/km
              
              onMapLocationClick({
                lat: clickedLat,
                lng: clickedLng,
                walkingTime: walkingTime,
              });
            }
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
    }, [isLoaded, selectedStore, showDirectionsPanel, onMarkerClick, onMapLocationClick, center, calculateDistance, stores]);

  // Circle 업데이트 (중복 방지)
  // Circle의 중심은 항상 원래 center prop을 사용 (현재 위치 고정)
  // selectedStore가 있어도 Circle은 현재 위치에 고정되어야 함
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
      // 중요: Circle의 중심은 항상 원래 center prop을 사용 (selectedStore와 무관)
      if (circleRef.current) {
        // 항상 원래 center로 강제 설정 (다른 곳에서 변경되었을 수 있으므로)
        circleRef.current.setCenter(center);
        circleRef.current.setRadius(radiusInMeters);
      } else {
        circleRef.current = new google.maps.Circle({
          center: center, // 원래 center prop 사용 (현재 위치)
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
    // selectedStore는 의존성에 포함하지 않음 (Circle은 항상 원래 center를 사용)
  }, [center.lat, center.lng, radius, isLoaded]);

  // selectedStore가 변경될 때마다 Circle의 중심을 원래 center로 강제 고정
  // 주기적으로도 체크하여 다른 곳에서 변경되었을 경우 원래 center로 복원
  useEffect(() => {
    if (!circleRef.current || !center) {
      return;
    }

    // Circle의 중심이 원래 center와 다른지 확인하고 강제로 원래 center로 설정
    const currentCenter = circleRef.current.getCenter();
    if (currentCenter) {
      const latDiff = Math.abs(currentCenter.lat() - center.lat);
      const lngDiff = Math.abs(currentCenter.lng() - center.lng);
      // 중심이 다르면 원래 center로 강제 설정
      if (latDiff > 0.0001 || lngDiff > 0.0001) {
        circleRef.current.setCenter(center);
      }
    } else {
      circleRef.current.setCenter(center);
    }
  }, [selectedStore, center]);

  // 주기적으로 Circle의 중심을 확인하고 원래 center로 고정
  useEffect(() => {
    if (!circleRef.current || !center || !isLoaded) {
      return;
    }

    const intervalId = setInterval(() => {
      if (circleRef.current && center) {
        const currentCenter = circleRef.current.getCenter();
        if (currentCenter) {
          const latDiff = Math.abs(currentCenter.lat() - center.lat);
          const lngDiff = Math.abs(currentCenter.lng() - center.lng);
          // 중심이 다르면 원래 center로 강제 설정
          if (latDiff > 0.0001 || lngDiff > 0.0001) {
            circleRef.current.setCenter(center);
          }
        }
      }
    }, 100); // 100ms마다 체크

    return () => {
      clearInterval(intervalId);
    };
  }, [center, isLoaded]);

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
          
          // 클릭한 장소가 추천된 장소인지 확인
          const matchingStore = stores?.find(store => 
            Math.abs(store.latitude - lat) < 0.0001 && 
            Math.abs(store.longitude - lng) < 0.0001
          );
          
          if (matchingStore) {
            // 추천된 장소이면 selectedStore로 설정
            onMarkerClick?.(matchingStore);
            setClickedLocation(null);
          } else {
            // 추천된 장소가 아니면 Store 객체로 변환하여 stores 배열에 추가
            // 타입 결정 로직 (백엔드와 동일)
            const determinePlaceType = (types: string[] | undefined): StoreType => {
              if (!types || types.length === 0) {
                return 'other';
              }
              
              // meal_takeaway -> fastfood로 매핑
              if (types.includes('meal_takeaway') || types.includes('fast_food')) {
                return 'fastfood';
              }
              
              // 지원하는 타입 확인
              const supportedTypes = ['restaurant', 'cafe', 'bar', 'food', 'bakery', 'meal_delivery',
                'night_club', 'liquor_store', 'store', 'shopping_mall', 'supermarket', 'convenience_store'];
              
              for (const type of types) {
                if (supportedTypes.includes(type)) {
                  return type as StoreType;
                }
              }
              
              return 'other';
            };
            
            const placeType = determinePlaceType(placeDetails.types);
            
            // 도보 시간 계산
            const distance = calculateDistance(center.lat, center.lng, lat, lng);
            const walkingTime = Math.round(distance * 20); // 3km/h = 20분/km
            
            // 사진 URL 생성
            const photoUrls: string[] = [];
            if (placeDetails.photos && placeDetails.photos.length > 0) {
              placeDetails.photos.slice(0, 5).forEach((photo: any) => {
                if (photo.getUrl) {
                  photoUrls.push(photo.getUrl({ maxWidth: 400, maxHeight: 400 }));
                }
              });
            }
            
            // 리뷰 변환
            const reviews = placeDetails.reviews?.map((review: any) => ({
              authorName: review.author_name || '',
              rating: review.rating || 0,
              text: review.text || '',
              time: review.time || 0,
              relativeTimeDescription: review.relative_time_description || undefined,
            })) || [];
            
            // Store 객체 생성
            const newStore: Store = {
              id: placeId,
              name: placeDetails.name || '알 수 없는 장소',
              type: placeType,
              walkingTime: walkingTime,
              estimatedDuration: walkingTime,
              priceLevel: (placeDetails.price_level !== undefined && placeDetails.price_level !== null) 
                ? Math.min(3, Math.max(1, placeDetails.price_level + 1)) as 1 | 2 | 3
                : 2,
              cesReason: '',
              latitude: lat,
              longitude: lng,
              address: placeDetails.formatted_address,
              photos: photoUrls,
              reviews: reviews,
            };
            
            // stores 배열에 추가
            if (onAddStore) {
              onAddStore(newStore);
            }
            
            // selectedStore로 설정하여 카드 목록에서 표시되도록 함
            onMarkerClick?.(newStore);
            setClickedLocation(null);
          }
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
  }, [isLoaded, stores, onMarkerClick, onAddStore, center, calculateDistance]);

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
          
          // 클릭한 장소가 추천된 장소인지 확인
          const matchingStore = stores?.find(store => 
            Math.abs(store.latitude - location.lat) < 0.0001 && 
            Math.abs(store.longitude - location.lng) < 0.0001
          );
          
          if (matchingStore) {
            // 추천된 장소이면 selectedStore로 설정
            onMarkerClick?.(matchingStore);
            setClickedLocation(null);
          } else {
            // 추천된 장소가 아니면 Place Details 가져오기
            fetchPlaceDetailsById(place.place_id!, location);
          }
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
  }, [isLoaded, fetchPlaceDetailsById, stores, onMarkerClick]);

  // selectedStore가 변경되면 장소 정보 가져오기
  useEffect(() => {
    if (selectedStore && isLoaded && showDirectionsPanel) {
      fetchPlaceDetails({ lat: selectedStore.latitude, lng: selectedStore.longitude });
    }
  }, [selectedStore, isLoaded, showDirectionsPanel, fetchPlaceDetails]);

  // clickedLocation이 변경되면 (추천된 장소가 아닌 경우) 장소 정보 가져오기
  useEffect(() => {
    if (clickedLocation && !selectedStore && isLoaded && !showDirectionsPanel) {
      // 추천된 장소가 아닌 경우에만 장소 정보 가져오기
      const isRecommendedStore = stores?.some(store => 
        Math.abs(store.latitude - clickedLocation.lat) < 0.0001 && 
        Math.abs(store.longitude - clickedLocation.lng) < 0.0001
      );
      
      if (!isRecommendedStore) {
        fetchPlaceDetails({ lat: clickedLocation.lat, lng: clickedLocation.lng });
      }
    }
  }, [clickedLocation, selectedStore, isLoaded, showDirectionsPanel, stores, fetchPlaceDetails]);

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

  // selectedStore 또는 clickedLocation이 변경되면 이미지 인덱스 초기화
  useEffect(() => {
    if (selectedStore || clickedLocation) {
      setInfoWindowPhotoIndex(0);
    }
  }, [selectedStore, clickedLocation]);

  // InfoWindow 이미지 슬라이더 자동 이동
  useEffect(() => {
    let photoCount = 0;
    if (selectedStore?.photos) {
      photoCount = selectedStore.photos.length;
    } else if (placeDetails?.photos && Array.isArray(placeDetails.photos)) {
      photoCount = Math.min(5, placeDetails.photos.length);
    }
    
    if ((selectedStore || (clickedLocation && placeDetails)) && !showDirectionsPanel && photoCount > 1) {
      // InfoWindow가 열려있고 이미지가 여러 개일 때 자동으로 순환
      const interval = setInterval(() => {
        setInfoWindowPhotoIndex((prev) => {
          return (prev + 1) % photoCount;
        });
      }, 2000); // 2초마다 다음 이미지로

      return () => clearInterval(interval);
    } else if ((!selectedStore && !clickedLocation) || showDirectionsPanel) {
      // InfoWindow가 닫히거나 패널이 열리면 첫 번째 이미지로 리셋
      setInfoWindowPhotoIndex(0);
    }
  }, [selectedStore, clickedLocation, placeDetails, showDirectionsPanel]);

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
        center={mapCenter}
        zoom={mapZoom}
        options={mapOptions}
        onLoad={onLoad}
      >

        {/* 현재 위치 마커 - 방향 표시 포함 */}
        <Marker
          position={center}
          title={userHeading !== null ? `현재 위치 (방향: ${Math.round(userHeading)}°)` : '현재 위치'}
          icon={{
            // 방향이 있으면 화살표 모양, 없으면 원형
            path: userHeading !== null 
              ? google.maps.SymbolPath.FORWARD_CLOSED_ARROW
              : google.maps.SymbolPath.CIRCLE,
            scale: userHeading !== null ? 7 : 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: userHeading !== null ? userHeading : undefined, // 방향 회전 (0-360도)
            anchor: userHeading !== null 
              ? new google.maps.Point(0, 0) // 화살표는 중심에서 회전
              : undefined, // 원형은 anchor 불필요
          }}
        />

        {/* stores 배열의 각 장소에 대한 마커 - 유형 필터 및 거리 필터 적용 */}
        {stores
          ?.filter((store) => {
            // 유형 필터링
            const typeMatch = type === 'all' || store.type === type || (type === 'other' && (!store.type || store.type === 'other'));
            
            if (!typeMatch) return false;
            
            // 거리 필터링 (Circle 내부에 있는지 확인)
            const distance = calculateDistance(center.lat, center.lng, store.latitude, store.longitude);
            const isWithinCircle = distance <= radiusKm;
            
            return isWithinCircle;
          })
          .map((store) => (
            <Marker
              key={store.id}
              position={{ lat: store.latitude, lng: store.longitude }}
              title={store.name}
              icon={{
                path: 'M -6,-6 L 6,-6 L 6,6 L -6,6 Z', // 사각형 (중심 기준, 크기 증가)
                fillColor: '#EA4335',
                fillOpacity: 0.85,
                strokeColor: '#FFFFFF',
                strokeWeight: 1.5,
                scale: 1,
              }}
              onClick={() => {
                console.log('Marker clicked:', store.name, 'type:', store.type);
                isMarkerClickRef.current = true;
                onMarkerClick?.(store);
                setTimeout(() => {
                  isMarkerClickRef.current = false;
                }, 200);
              }}
            />
          ))}

        {/* 선택된 장소 정보창 - 간단한 정보만 표시 (패널이 열려있지 않을 때만) */}
        {selectedStore && !showDirectionsPanel && (
          <>
            <InfoWindow
              position={{ lat: selectedStore.latitude, lng: selectedStore.longitude }}
              options={{
                pixelOffset: new google.maps.Size(0, -40), // 마커 위로 40px 이동하여 마커를 가리지 않도록
              }}
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
              <div className="p-3" style={{ maxWidth: '300px' }}>
                {/* 장소명 */}
                <h3 className="font-bold text-base mb-3">{selectedStore.name}</h3>
                
                {/* 버튼 그룹 */}
                <div className="flex gap-2">
                  {/* 구글지도 길찾기 링크 */}
                  <a
                    href={getGoogleMapsDeepLink(selectedStore.latitude, selectedStore.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    길찾기
                  </a>
                  
                  {/* 카드로 이동 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // 카드로 스크롤하기 위해 onMarkerClick을 다시 호출
                      // 이미 selectedStore가 설정되어 있으므로 스크롤 로직이 실행됨
                      if (onMarkerClick) {
                        onMarkerClick(selectedStore);
                      }
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    카드로 이동
                  </button>
                </div>
              </div>
            </InfoWindow>
          </>
        )}

        {/* 클릭한 일반 장소 정보창 (추천된 장소가 아닌 경우) */}
        {clickedLocation && !selectedStore && !showDirectionsPanel && placeDetails && (
          <>
            <InfoWindow
              position={{ lat: clickedLocation.lat, lng: clickedLocation.lng }}
              options={{
                pixelOffset: new google.maps.Size(0, -40), // 마커 위로 40px 이동하여 마커를 가리지 않도록
              }}
              onCloseClick={() => {
                setClickedLocation(null);
                setPlaceDetails(null);
              }}
            >
              <div className="p-0" style={{ maxWidth: '300px' }}>
                {/* 이미지 슬라이더 */}
                {placeDetails.photos && placeDetails.photos.length > 0 && (
                  <div className="relative w-full h-40 bg-gray-200 overflow-hidden group">
                    {/* 이미지 컨테이너 */}
                    <div 
                      className="flex transition-transform duration-300 ease-in-out h-full"
                      style={{ transform: `translateX(-${infoWindowPhotoIndex * 100}%)` }}
                    >
                      {placeDetails.photos.slice(0, 5).map((photo, index) => (
                        <div key={index} className="min-w-full h-full flex-shrink-0 relative">
                          <img
                            src={photo.getUrl({ maxWidth: 400, maxHeight: 300 })}
                            alt={`${placeDetails.name} - 사진 ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* 이전/다음 버튼 (여러 사진이 있을 때만 표시) */}
                    {placeDetails.photos.length > 1 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const maxIndex = Math.min(4, placeDetails.photos!.length - 1);
                            setInfoWindowPhotoIndex((prev) => 
                              prev === 0 ? maxIndex : prev - 1
                            );
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50"
                          aria-label="이전 사진"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const maxIndex = Math.min(4, placeDetails.photos!.length - 1);
                            setInfoWindowPhotoIndex((prev) => 
                              prev >= maxIndex ? 0 : prev + 1
                            );
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50"
                          aria-label="다음 사진"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {/* 사진 인디케이터 */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-50">
                          {placeDetails.photos.slice(0, 5).map((_, index) => (
                            <button
                              key={index}
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoWindowPhotoIndex(index);
                              }}
                              className={`w-1.5 h-1.5 rounded-full transition-all ${
                                index === infoWindowPhotoIndex 
                                  ? 'bg-white w-4' 
                                  : 'bg-white/50 hover:bg-white/75'
                              }`}
                              aria-label={`사진 ${index + 1}로 이동`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                
                {/* 텍스트 정보 */}
                <div className="p-3">
                  <h3 className="font-bold text-base mb-1">{placeDetails.name || '선택한 위치'}</h3>
                  {placeDetails.formattedAddress && (
                    <p className="text-xs text-gray-500 mb-2">{placeDetails.formattedAddress}</p>
                  )}
                  {placeDetails.rating && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-600">⭐ {placeDetails.rating}</span>
                      {placeDetails.userRatingsTotal && (
                        <span className="text-xs text-gray-500">({placeDetails.userRatingsTotal}개 리뷰)</span>
                      )}
                    </div>
                  )}
                  {placeDetails.priceLevel !== undefined && (
                    <p className="text-xs text-gray-600 mb-1">
                      가격: {'$'.repeat(placeDetails.priceLevel + 1)}
                    </p>
                  )}
                  {placeDetails.openingHours?.openNow !== undefined && (
                    <p className="text-xs text-gray-600">
                      {placeDetails.openingHours.openNow ? '🟢 영업 중' : '🔴 영업 종료'}
                    </p>
                  )}
                </div>
              </div>
            </InfoWindow>
          </>
        )}

      </GoogleMap>

      {/* 거리 및 유형 선택 플로팅 UI - 오른쪽 상단 */}
      <div className={`absolute top-4 right-4 bg-white rounded-xl shadow-lg z-10 p-4 ${expandState === 0 ? 'min-w-[200px] max-w-[240px]' : 'min-w-[280px] max-w-[320px]'}`}>
        {/* 상태 0: "실시간 급상승 조회 장소" 텍스트만 (최소화, 칸 작아짐) */}
        {expandState === 0 && (
          <div className="py-2">
            <p className="text-xs text-gray-600 text-center">실시간 급상승 조회 장소</p>
          </div>
        )}
        
        {/* 상태 2: 실시간 급상승 장소 표시 */}
        {expandState === 2 && trendingStores.length > 0 && (() => {
          const currentStore = trendingStores[trendingIndex % trendingStores.length];
          const rank = (trendingIndex % trendingStores.length) + 1;
          
          return (
            <div className="relative overflow-hidden mb-2" style={{ minHeight: '60px' }}>
              <div 
                className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-all ease-in-out"
                style={{
                  transform: isTrendingSliding ? 'translateX(-100%)' : 'translateX(0)',
                  opacity: isTrendingSliding ? 0 : 1,
                  transitionDuration: '350ms',
                }}
                onClick={() => onMarkerClick?.(currentStore)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0"></div>
                  <span className="text-xs font-semibold text-blue-600">#{rank}</span>
                  <span className="text-sm font-medium text-gray-900 truncate flex-1">{currentStore.name}</span>
                </div>
                <div className="text-xs text-gray-600">
                  {currentStore.viewCountIncrease >= 5
                    ? `급상승! 10분 동안 ${currentStore.viewCountIncrease}명이 더 봤어요!`
                    : currentStore.viewCountIncrease > 0
                    ? `인기 상승 중! ${currentStore.viewCountIncrease}명이 더 봤어요!`
                    : '많은 사람들이 찾고 있어요!'}
                </div>
              </div>
            </div>
          );
        })()}
        
        {expandState === 2 && stores.length > 0 && trendingStores.length === 0 && (
          <div className="mb-2">
            <div className="text-xs text-gray-500 text-center py-2">인기 장소 정보를 불러오는 중...</div>
          </div>
        )}
        
        {/* 상태 1: 거리, 유형 선택 UI 표시 */}
        {expandState === 1 && (
          <>
            {/* 거리 선택 */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  거리
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-600">
                    {sliderValue >= 1000 
                      ? `${(sliderValue / 1000).toFixed(1)}km`
                      : `${sliderValue}m`}
                  </span>
                  <span className="text-xs text-gray-500">
                    {distanceToTime(sliderValue)}분
                  </span>
                </div>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  value={sliderValue}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer smooth-slider"
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((sliderValue - 100) / (2000 - 100)) * 100}%, #e5e7eb ${((sliderValue - 100) / (2000 - 100)) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500">100m</span>
                <span className="text-xs text-gray-500">500m</span>
                <span className="text-xs text-gray-500">1km</span>
                <span className="text-xs text-gray-500">1.5km</span>
                <span className="text-xs text-gray-500">2km</span>
              </div>
            </div>

            {/* 유형 선택 - 가로 스크롤 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                유형
              </label>
              <div 
                ref={typeScrollRef}
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                style={{
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onTypeChange?.(option.value)}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                      type === option.value
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 접기/펼치기 버튼 (^) - 3단계 순환 */}
        <div className="relative mt-2">
          <button
            onClick={() => {
              // 0 -> 1 -> 2 -> 0 순환
              setExpandState((prev) => (prev + 1) % 3);
            }}
            className="w-full py-1.5 flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${expandState === 0 ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          
          {/* 랜덤 메시지 - 상태 0 또는 상태 2일 때 표시 */}
          {(expandState === 0 || expandState === 2) && showRandomMessage && (
            <div 
              className="absolute bg-white rounded-lg shadow-lg px-4 py-2 border border-blue-200 z-50 animate-fade-in-out"
              style={{ 
                top: 'calc(100% + 12px)',
                right: '-20px',
                transform: 'none'
              }}
            >
              <p className="text-sm text-gray-700 font-medium whitespace-nowrap">
                거리, 유형을 선택할 수 있어요!
              </p>
            </div>
          )}
        </div>
      </div>


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
