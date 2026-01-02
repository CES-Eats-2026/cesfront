'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import OptionSelector from '@/components/OptionSelector';
import GoogleMapComponent from '@/components/GoogleMap';
import StoreCard from '@/components/StoreCard';
import FeedbackModal from '@/components/FeedbackModal';
import SplashScreen from '@/components/SplashScreen';
import { getRecommendations, sendFeedbackToDiscord, incrementPlaceView } from '@/lib/api';
import { StoreType, TimeOption, Store } from '@/types';

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [timeOption, setTimeOption] = useState<TimeOption>(24); // 2km = 24분 (초기값)
  const [type, setType] = useState<StoreType>('all');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [optionsHeight, setOptionsHeight] = useState(250); // 옵션 영역 높이 (px)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  const [panelOffset, setPanelOffset] = useState(0); // 패널 오프셋 (위아래 이동)
  const [dragDirection, setDragDirection] = useState<'up' | 'down' | null>(null); // 드래그 방향
  const [maxPanelOffset, setMaxPanelOffset] = useState(64); // 패널의 최대 오프셋 (회색 영역과 지도가 만나는 부분까지)
  const headerRef = useRef<HTMLDivElement | null>(null); // 헤더 ref
  const storeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({}); // 각 상점 카드의 ref
  const optionsContainerRef = useRef<HTMLDivElement | null>(null); // 옵션 컨테이너 ref
  const stickyOptionsRef = useRef<HTMLDivElement | null>(null); // sticky 옵션 영역 ref
  const [radiusKm, setRadiusKm] = useState(Math.max(0.05, Math.min(1.5, Math.round((timeOption / 12) * 1000) / 1000))); // 지도에 표시할 반경 (km, 1m 단위, 최소 0.05km, 최대 1.5km)
  const [clickedMapLocation, setClickedMapLocation] = useState<{ lat: number; lng: number; walkingTime: number; name?: string } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(10); // 표시할 아이템 수
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [inputText, setInputText] = useState(''); // 입력 텍스트
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [shouldCollapseOptions, setShouldCollapseOptions] = useState(false); // 거리/유형 UI 자동 접기

  // 고정 위치: The Venetian Expo
  const fixedLocation = { lat: 36.1215699, lng: -115.1651093 };

  // 거리 계산 함수 (Haversine formula) - Circle 내부 장소 필터링용
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

  useEffect(() => {
    // The Venetian Expo 위치를 고정으로 사용
    setLocation(fixedLocation);
    setMapCenter(fixedLocation);
    
    // 클라이언트 사이드에서만 화면 크기 확인
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkIsDesktop();
    window.addEventListener('resize', checkIsDesktop);
    
    // 패널의 최대 오프셋 계산 (회색 영역과 지도가 만나는 부분까지만)
    const updateMaxPanelOffset = () => {
      if (headerRef.current) {
        const headerHeight = headerRef.current.offsetHeight;
        // 패널이 헤더 아래까지만 내려가도록 제한 (회색과 지도가 만나는 부분)
        setMaxPanelOffset(headerHeight);
      } else {
        // 헤더가 아직 마운트되지 않았으면 기본값 사용
        setMaxPanelOffset(64);
      }
    };
    // 초기 설정 (다음 틱에 실행하여 헤더가 마운트된 후 측정)
    setTimeout(updateMaxPanelOffset, 0);
    window.addEventListener('resize', updateMaxPanelOffset);
    
    return () => {
      window.removeEventListener('resize', checkIsDesktop);
      window.removeEventListener('resize', updateMaxPanelOffset);
    };
  }, []);

  const fetchRecommendations = useCallback(async () => {
    const currentLocation = location || fixedLocation;
    
    setLoading(true);
    setError(null);
    setSelectedStore(null);

    try {
      // type을 'all'로 전송하여 원 안의 모든 장소를 가져옴
      // 타입 필터링은 프론트엔드에서 수행
      const response = await getRecommendations({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        timeOption: timeOption,
        type: 'all', // 항상 'all'로 전송하여 모든 장소 가져오기
      });
      setStores(response.stores);
      setDisplayedCount(10); // 새 검색 시 초기화
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '장소 정보를 가져오는데 실패했습니다.';
      setError(errorMessage);
      console.error('Error fetching recommendations:', err);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [location, timeOption]); // type 제거 - 프론트엔드에서 필터링

  // timeOption이 변경되면 반경도 업데이트
  // 도보 속도 5km/h 기준: timeOption 분 동안 걸을 수 있는 거리 = (timeOption / 60) * 5km
  useEffect(() => {
    let km = (timeOption / 60) * 5; // km 단위
    // 최소 0.1km (100m), 최대 2km
    if (km < 0.1) km = 0.1;
    if (km > 2.0) km = 2.0;
    setRadiusKm(km);
  }, [timeOption]);

  // 반경 변경 핸들러
  const handleRadiusChange = useCallback((newRadiusKm: number) => {
    setRadiusKm(newRadiusKm);
  }, []);

  // 선택된 상점이 변경되면 해당 카드로 스크롤
  useEffect(() => {
    if (selectedStore) {
      console.log('selectedStore changed, attempting to scroll to:', selectedStore.name, 'type:', selectedStore.type, 'current filter type:', type);
      
      // Circle 내부에 있는 필터링된 stores에 선택된 상점이 있는지 확인
      const currentLocation = location || fixedLocation;
      const filteredStores = stores.filter(store => {
        const typeMatch = type === 'all' || store.type === type || (type === 'other' && (!store.type || store.type === 'other'));
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          store.latitude,
          store.longitude
        );
        const isWithinCircle = distance <= radiusKm;
        return typeMatch && isWithinCircle;
      });
      
      console.log('Filtered stores count:', filteredStores.length, 'selectedStore id:', selectedStore.id);
      const isStoreVisible = filteredStores.some(s => s.id === selectedStore.id);
      console.log('Is store visible in filtered list:', isStoreVisible);
      
      if (!isStoreVisible) {
        // 상점이 필터링되어 보이지 않으면 스크롤하지 않음
        console.log('Store not visible, skipping scroll');
        return;
      }
      
      // DOM 업데이트와 타입 필터 적용을 기다리기 위해 더 긴 지연
      const scrollToCard = () => {
        const element = storeRefs.current[selectedStore.id];
        const scrollContainer = optionsContainerRef.current;
        const stickyOptions = stickyOptionsRef.current;
        
        console.log('scrollToCard attempt - element:', !!element, 'scrollContainer:', !!scrollContainer, 'stickyOptions:', !!stickyOptions, 'storeId:', selectedStore.id);
        
        if (element && scrollContainer) {
          // sticky 옵션 영역의 실제 높이 측정
          const stickyHeight = stickyOptions ? stickyOptions.offsetHeight : 180;
          
          // 요소의 위치 계산
          const elementRect = element.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          
          // 요소가 컨테이너 내에서의 상대적 위치
          const elementTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
          
          // sticky 영역을 고려한 스크롤 위치 계산
          // 이미지가 보이도록 약간의 여유 공간 추가 (50px)
          const targetScrollTop = elementTop - stickyHeight - 50;
          
          console.log('Scrolling to:', targetScrollTop, 'elementTop:', elementTop, 'stickyHeight:', stickyHeight);
          
          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
          return true;
        }
        console.log('scrollToCard failed - missing element or container');
        return false;
      };
      
      // 스크롤 시도 함수 - 여러 번 재시도
      const attemptScroll = (retryCount: number = 0) => {
        const maxRetries = 15;
        const delays = [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600];
        
        if (retryCount < maxRetries) {
          setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!scrollToCard() && retryCount < maxRetries - 1) {
                  attemptScroll(retryCount + 1);
                }
              });
            });
          }, delays[retryCount] || 200);
        }
      };
      
      // 타입 변경 후 필터링이 완료될 때까지 충분한 시간 대기
      // 첫 번째 시도 (200ms 후) - 타입 변경 후 필터링 완료 대기
      attemptScroll(0);
    }
  }, [selectedStore, stores, type, location, radiusKm, calculateDistance]); // stores, type, location, radiusKm, calculateDistance도 의존성에 추가

  // Google Maps 기본 마커 클릭 시 stores 배열에 추가
  const handleAddStore = useCallback((store: Store) => {
    setStores(prevStores => {
      // 이미 존재하는지 확인 (중복 방지)
      const exists = prevStores.some(s => s.id === store.id);
      if (exists) {
        return prevStores;
      }
      return [...prevStores, store];
    });
  }, []);

  // 옵션이 변경될 때마다 자동으로 장소 검색
  useEffect(() => {
    if (location) {
      fetchRecommendations();
    }
  }, [location, timeOption, type, fetchRecommendations]);

  // 무한 스크롤: Intersection Observer로 하단 감지
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && displayedCount < stores.length) {
          // 더 표시할 아이템이 있으면 10개씩 추가
          setDisplayedCount((prev) => Math.min(prev + 10, stores.length));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [displayedCount, stores.length]);

  const handleMarkerClick = async (store: Store | null) => {
    if (store) {
      console.log('handleMarkerClick called with store:', store.name, 'type:', store.type, 'current type:', type);
      
      // 조회수 증가 (마커 클릭 시) 및 실시간 업데이트
      const updatedViewCount = await incrementPlaceView(store.id);
      let updatedStore = store;
      
      if (updatedViewCount !== null) {
        // stores 배열에서 해당 store의 조회수 업데이트
        setStores(prevStores => 
          prevStores.map(s => 
            s.id === store.id 
              ? { ...s, viewCount: updatedViewCount }
              : s
          )
        );
        // selectedStore용 업데이트된 store 객체 생성 (불변성 유지)
        updatedStore = { ...store, viewCount: updatedViewCount };
      }
      
      // 유형 필터를 해당 상점의 유형으로 변경 (먼저 타입 변경)
      const needsTypeChange = updatedStore.type && updatedStore.type !== 'all' && updatedStore.type !== type;
      
      if (needsTypeChange) {
        console.log('Changing type from', type, 'to', updatedStore.type);
        // 타입 변경 - 즉시 실행
        setType(updatedStore.type);
        
        // 타입 변경 후 stores가 필터링될 때까지 기다린 후 selectedStore 설정
        // 더 긴 지연 시간으로 필터링 완료 보장
        setTimeout(() => {
          console.log('Setting selectedStore after type change:', updatedStore.name);
          setSelectedStore(updatedStore);
          setClickedMapLocation(null);
        }, 800); // 타입 변경 후 필터링이 완료될 때까지 충분한 시간 대기
      } else {
        console.log('No type change needed, setting selectedStore immediately');
        // 타입이 변경되지 않으면 즉시 설정
        setSelectedStore(updatedStore);
        setClickedMapLocation(null);
      }
    } else {
      setSelectedStore(null);
      setClickedMapLocation(null);
    }
  };

  const handleStoreCardClick = async (store: Store) => {
    // 조회수 증가 (카드 클릭 시) 및 실시간 업데이트
    const updatedViewCount = await incrementPlaceView(store.id);
    let updatedStore = store;
    
    if (updatedViewCount !== null) {
      // stores 배열에서 해당 store의 조회수 업데이트
      setStores(prevStores => 
        prevStores.map(s => 
          s.id === store.id 
            ? { ...s, viewCount: updatedViewCount }
            : s
        )
      );
      // selectedStore용 업데이트된 store 객체 생성 (불변성 유지)
      updatedStore = { ...store, viewCount: updatedViewCount };
    }
    
    // selectedStore 설정 (지도 중심은 항상 사용자 위치 고정)
    setSelectedStore(updatedStore);
    // mapCenter는 설정하지 않음 (지도 중심은 항상 사용자 위치 고정)
    setClickedMapLocation(null);
  };

  // 헤더 높이 (대략 60px)
  const headerHeight = 60;
  
  // 드래그 시작 (마우스 및 터치 지원)
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    setDragDirection(null); // 드래그 방향 초기화
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStartY(clientY);
    // 패널이 아래로 내려가 있으면 panelOffset을 기준으로, 아니면 optionsHeight를 기준으로
    if (panelOffset > 0) {
      setDragStartHeight(panelOffset);
    } else {
      setDragStartHeight(optionsHeight);
    }
    e.preventDefault();
  };

  // 드래그 중 (마우스 및 터치 지원)
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = dragStartY - clientY; // 위로 드래그하면 양수, 아래로 드래그하면 음수
      
      // 드래그 방향 감지 (10px 이상 움직였을 때만)
      if (Math.abs(deltaY) > 10) {
        setDragDirection(deltaY > 0 ? 'up' : 'down');
      }
      
      // 패널이 아래로 내려가 있는 경우 (panelOffset > 0)
      if (panelOffset > 0) {
        // 위로 드래그하면 패널을 위로 올리기, 아래로 드래그하면 패널을 더 아래로 내리기
        // 드래그 핸들(토글 바)이 항상 보이도록 최대 오프셋 제한
        // translateY는 양수일 때 아래로 이동하므로, 드래그 핸들만 보이도록 제한
        // 패널이 화면 밖으로 완전히 나가지 않도록 패널의 최소 높이를 고려
        // 패널이 화면 밖으로 나가지 않도록 최대 오프셋 제한
        const newOffset = Math.max(-headerHeight, Math.min(maxPanelOffset, panelOffset - deltaY));
        setPanelOffset(newOffset);
        // 패널이 완전히 위로 올라가면 높이 조절 모드로 전환
        if (newOffset <= 0) {
          setOptionsHeight(Math.max(200, Math.min(window.innerHeight * 0.8, dragStartHeight)));
        }
      } else {
        // 패널이 위에 있는 경우 높이 조절 또는 상단 바까지 올리기
        const newHeight = dragStartHeight + deltaY;
        
        // 아래로 드래그하면 패널을 아래로 내리기
        if (deltaY < 0 && newHeight > window.innerHeight * 0.5) {
          // 패널을 아래로 내리기 시작
          const offsetFromTop = newHeight - 200;
          setPanelOffset(Math.min(maxPanelOffset, Math.max(0, offsetFromTop)));
          setOptionsHeight(200);
        } else if (newHeight < 200) {
          // 상단 바까지 올라가려면 panelOffset을 음수로 설정
          const offsetFromTop = newHeight - 200; // 음수값
          setPanelOffset(Math.max(-headerHeight, offsetFromTop));
          setOptionsHeight(200);
        } else {
          // 일반적인 높이 조절
          setPanelOffset(0);
          setOptionsHeight(Math.max(200, Math.min(window.innerHeight * 0.8, newHeight)));
        }
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      
      // 드래그 종료 시 자동 스냅 (반동 효과)
      // 드래그 방향을 우선적으로 고려
      if (dragDirection === 'down') {
        // 아래로 드래그한 경우 - 아래로 내리기 (드래그 핸들만 보이도록)
        setPanelOffset(maxPanelOffset);
        } else if (dragDirection === 'up') {
        // 위로 드래그한 경우 - 위로 올리기
        if (panelOffset > 0) {
          const threshold = window.innerHeight * 0.3; // 30% 지점
          if (panelOffset < threshold) {
            setPanelOffset(0);
          } else {
            // 충분히 아래에 있으면 그대로 유지
            setPanelOffset(maxPanelOffset);
          }
        } else if (panelOffset < 0) {
          const threshold = -headerHeight * 0.5;
          if (panelOffset > threshold) {
            setPanelOffset(0);
          } else {
            setPanelOffset(-headerHeight);
          }
        } else {
          // 원래 위치에서 위로 올리기
          setPanelOffset(-headerHeight);
        }
      } else {
        // 드래그 방향이 없으면 위치 기반 스냅
        if (panelOffset > 0) {
          const threshold = window.innerHeight * 0.4;
          if (panelOffset < threshold) {
            setPanelOffset(0);
          } else {
            setPanelOffset(maxPanelOffset);
          }
        } else if (panelOffset < 0) {
          const threshold = -headerHeight * 0.5;
          if (panelOffset > threshold) {
            setPanelOffset(0);
          } else {
            setPanelOffset(-headerHeight);
          }
        }
      }
      
      setDragDirection(null); // 드래그 방향 초기화
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStartY, dragStartHeight, panelOffset]);

  // 지도 중심은 항상 사용자 위치(fixedLocation 또는 location)로 고정
  // mapCenter는 selectedStore 위치로 변경될 수 있으므로 사용하지 않음
  const currentLocation = location || fixedLocation;

  const handleFeedbackSubmit = async (feedback: string, image: File | null) => {
    await sendFeedbackToDiscord(feedback, image);
  };

  // 위아래 이동 핸들러 (반동 효과)
  const handleToggle = () => {
    // 드래그 핸들(토글 바)이 항상 보이도록 최대 오프셋 제한
    if (panelOffset === 0 || panelOffset < 0) {
      // 아래로 이동 (일부만 보이도록 - 드래그 핸들만 보임)
      setPanelOffset(maxPanelOffset);
    } else {
      // 위로 이동 (원래 위치로)
      setPanelOffset(0);
    }
  };

  return (
    <>
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} />
      )}
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div 
        ref={headerRef}
        className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 relative z-10" 
        style={{ 
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/web.png"
              alt="CES EATS Logo"
              width={40}
              height={40}
              className="object-contain flex-shrink-0"
              unoptimized
              priority
            />
            <h1 className="text-xl font-bold text-black">
              CES EATS 2026
            </h1>
          </div>
          
          <button
            onClick={() => setIsFeedbackModalOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            title="피드백 보내기"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        </div>
      </div>


      {/* 메인 컨텐츠 영역 - 모바일: 세로 배치, 데스크톱: 가로 배치 */}
      <div className="flex-1 relative min-h-0 flex flex-col lg:flex-row">
        {/* 지도 영역 - 헤더 아래부터 전체 높이까지 */}
        <div className="flex-1 relative min-h-0 lg:min-w-0">
          <GoogleMapComponent
            center={currentLocation}
            radius={radiusKm}
            stores={stores}
            selectedStore={selectedStore}
            onMarkerClick={handleMarkerClick}
            type={type}
            radiusKm={radiusKm}
            timeOption={timeOption}
            onTimeChange={setTimeOption}
            onTypeChange={setType}
            onMapLocationClick={(location) => {
              setClickedMapLocation(location);
              // 선택된 store가 있으면 해제
              if (selectedStore) {
                setSelectedStore(null);
              }
            }}
            onAddStore={handleAddStore}
            autoCollapse={shouldCollapseOptions}
          />
        </div>

        {/* 옵션 선택 및 장소 목록 영역 - 모바일: 아래, 데스크톱: 오른쪽 */}
        <div 
          className="bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex-shrink-0 lg:rounded-none rounded-t-2xl lg:w-[500px] lg:shadow-none lg:translate-y-0"
          style={{ 
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
            transform: isDesktop ? 'none' : `translateY(${Math.min(panelOffset, maxPanelOffset)}px)`,
            transition: isDesktop ? 'none' : isDragging ? 'none' : 'transform 0.8s cubic-bezier(0.34, 1.8, 0.64, 1)', // 강한 반동 효과
            overflow: 'visible', // 드래그 핸들이 보이도록
            position: isDesktop ? 'relative' : 'absolute',
            bottom: isDesktop ? 'auto' : 0,
            left: isDesktop ? 'auto' : 0,
            right: isDesktop ? 'auto' : 0,
            width: isDesktop ? 'auto' : '100%',
            zIndex: isDesktop ? 'auto' : 20,
            maxHeight: isDesktop ? 'none' : `calc(100vh - ${maxPanelOffset}px)`
          }}
        >
          
          {/* 드래그 핸들 - 모바일에서만 표시 */}
          {!isDesktop && (
            <div 
              className="absolute top-0 left-0 right-0 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 bg-white rounded-t-2xl"
              onTouchStart={(e) => handleDragStart(e)}
              onMouseDown={(e) => handleDragStart(e)}
              style={{
                touchAction: 'none'
              }}
            >
              <div className="flex flex-col gap-1 items-center pointer-events-none">
                <div className="w-10 h-0.5 bg-gray-400 rounded-full"></div>
                <div className="w-10 h-0.5 bg-gray-400 rounded-full"></div>
                <div className="w-10 h-0.5 bg-gray-400 rounded-full"></div>
              </div>
            </div>
          )}
          
          {/* 옵션 및 장소 목록 컨텐츠 */}
          <div
            className="overflow-hidden relative lg:h-full"
            style={{ 
              height: isDesktop 
                ? '100%' 
                : `${Math.max(200, optionsHeight)}px`,
              minHeight: isDesktop ? 'auto' : '200px',
              transition: isDragging ? 'none' : 'height 1s cubic-bezier(0.25, 2, 0.5, 1)',
              marginTop: !isDesktop ? '48px' : '0' // 드래그 핸들 공간 확보
            }}
          >
              <div 
                className="h-full overflow-y-auto" 
                ref={optionsContainerRef} 
                style={{ 
                  WebkitOverflowScrolling: 'touch', 
                  position: 'relative',
                  paddingTop: '0px', // 상단 바 바로 아래에서 시작
                  scrollPaddingTop: '0px', // 스크롤 시 상단 바 바로 아래에 위치
                  paddingBottom: '100vh' // 제목이 맨 아래까지 스크롤될 수 있도록 충분한 여백
                }}
                onScroll={(e) => {
                  const target = e.target as HTMLElement;
                  const scrollTop = target.scrollTop;
                  // 스크롤이 50px 이상 올라가면 거리/유형 UI 접기
                  if (scrollTop > 50) {
                    setShouldCollapseOptions(true);
                  } else {
                    setShouldCollapseOptions(false);
                  }
                }}
              >
              {/* 옵션 선택 영역 - 지도 위에 floating UI로 이동하여 숨김 */}
              <div 
                ref={stickyOptionsRef} 
                className="sticky top-0 z-[60] bg-white px-4 pt-16 lg:pt-4 pb-4 border-b border-gray-200 shadow-sm hidden"
              >
                <OptionSelector
                  timeOption={timeOption}
                  type={type}
                  onTimeChange={setTimeOption}
                  onTypeChange={setType}
            />
              </div>
              
              {/* 장소 목록 */}
              <div className="bg-gray-50 px-4 py-4" style={{ minHeight: 'calc(100vh + 200px)' }}>
                {loading && (
                  <div className="space-y-3">
                    {/* 스켈레톤 UI - 로딩 중 카드 미리보기 */}
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-white rounded-xl shadow-md border border-gray-200 animate-pulse">
                        <div className="h-48 bg-gray-300 rounded-t-xl"></div>
                        <div className="p-4 space-y-3">
                          <div className="h-5 bg-gray-300 rounded w-3/4"></div>
                          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                          <div className="h-4 bg-gray-200 rounded w-full"></div>
                          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                        </div>
                      </div>
                    ))}
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-xs text-gray-500">장소 정보를 가져오는 중...</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {!loading && !error && stores.length > 0 && (() => {
                  // Circle 내부에 있는 장소만 필터링
                  const currentLocation = location || fixedLocation;
                  const filteredStores = stores.filter(store => {
                    // 타입 필터링
                    const typeMatch = type === 'all' || store.type === type || (type === 'other' && (!store.type || store.type === 'other'));
                    
                    // Circle 내부에 있는지 확인 (거리 계산)
                    const distance = calculateDistance(
                      currentLocation.lat,
                      currentLocation.lng,
                      store.latitude,
                      store.longitude
                    );
                    const isWithinCircle = distance <= radiusKm;
                    
                    return typeMatch && isWithinCircle;
                  });
                  
                  // 거리 표시 형식
                  const distanceText = radiusKm >= 1 
                    ? `${radiusKm.toFixed(1)}km`
                    : `${Math.round(radiusKm * 1000)}m`;
                  
                  // 유형 한국어 라벨
                  const typeLabels: { [key: string]: string } = {
                    'all': '전체',
                    'restaurant': '레스토랑',
                    'cafe': '카페',
                    'fastfood': '패스트푸드',
                    'bar': '바',
                    'food': '음식점',
                    'bakery': '베이커리',
                    'meal_delivery': '배달음식',
                    'night_club': '나이트클럽',
                    'liquor_store': '주류판매점',
                    'store': '상점',
                    'shopping_mall': '쇼핑몰',
                    'supermarket': '슈퍼마켓',
                    'convenience_store': '편의점',
                    'other': '기타',
                  };
                  const typeLabel = typeLabels[type] || '전체';
                  
                  return (
                    <>
                      {/* 텍스트 입력 필드 - 제목 위 가운데 */}
                      <div className="mb-4 flex justify-center">
                        <div className="w-full max-w-md flex items-end gap-2">
                          <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={(e) => {
                              setInputText(e.target.value);
                              // 자동 높이 조절
                              if (textareaRef.current) {
                                textareaRef.current.style.height = 'auto';
                                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                              }
                            }}
                            placeholder="선호하는 장소, 음식을 자유롭게 써봐요!"
                            rows={1}
                            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-hidden"
                            style={{ minHeight: '40px', maxHeight: '200px' }}
                          />
                          {/* 위쪽 화살표 버튼 */}
                          <button
                            onClick={() => {
                              // 버튼 클릭 시 처리 로직 (필요시 추가)
                              if (inputText.trim()) {
                                // 메시지 전송 또는 처리 로직
                                console.log('전송:', inputText);
                                // setInputText(''); // 전송 후 초기화 (필요시)
                              }
                            }}
                            className="flex-shrink-0 w-10 h-10 bg-black rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
                            style={{ minHeight: '40px' }}
                          >
                            <svg 
                              className="w-5 h-5 text-white" 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2.5} 
                                d="M5 15l7-7 7 7" 
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-900">
                          {distanceText} 거리 이내, "{typeLabel}" 유형 결과에요 ({filteredStores.length}개)
                        </h2>
                        <p className="text-xs text-gray-600 mt-1">
                          마커 혹은 카드를 클릭하면 상세 정보를 볼 수 있습니다
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {filteredStores
                          .slice(0, displayedCount)
                          .map((store) => (
                            <div
                              key={store.id}
                              ref={(el) => {
                                storeRefs.current[store.id] = el;
                              }}
                              onClick={() => handleStoreCardClick(store)}
                              className={selectedStore?.id === store.id ? 'ring-2 ring-blue-500 rounded-xl' : ''}
                            >
                              <StoreCard 
                                store={store} 
                                isSelected={selectedStore?.id === store.id}
                                onViewCountUpdate={(placeId, viewCount) => {
                                  // stores 배열에서 해당 store의 조회수 업데이트
                                  setStores(prevStores => 
                                    prevStores.map(s => 
                                      s.id === placeId 
                                        ? { ...s, viewCount }
                                        : s
                                    )
                                  );
                                  // selectedStore도 업데이트
                                  if (selectedStore?.id === placeId) {
                                    setSelectedStore({ ...selectedStore, viewCount });
                                  }
                                }}
                              />
                            </div>
                          ))}
                        {displayedCount < filteredStores.length && (
                          <div
                            ref={loadMoreRef}
                            className="text-center py-4"
                          >
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-sm text-gray-600 mt-2">더 불러오는 중...</p>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {!loading && !error && stores.length === 0 && location && (
                  <div className="text-center py-8">
                    <p className="text-gray-600">선택한 조건에 맞는 장소가 없습니다.</p>
                    <p className="text-sm text-gray-500 mt-2">
                      시간이나 유형을 조정해보세요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 피드백 모달 */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
    </>
  );
}
