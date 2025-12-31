'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import OptionSelector from '@/components/OptionSelector';
import GoogleMapComponent from '@/components/GoogleMap';
import StoreCard from '@/components/StoreCard';
import FeedbackModal from '@/components/FeedbackModal';
import { getRecommendations, sendFeedbackToDiscord } from '@/lib/api';
import { StoreType, TimeOption, Store } from '@/types';

export default function Home() {
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
  const [radiusKm, setRadiusKm] = useState(Math.max(0.05, Math.min(1.5, Math.round((timeOption / 12) * 1000) / 1000))); // 지도에 표시할 반경 (km, 1m 단위, 최소 0.05km, 최대 1.5km)
  const [clickedMapLocation, setClickedMapLocation] = useState<{ lat: number; lng: number; walkingTime: number; name?: string } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(10); // 표시할 아이템 수
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 고정 위치: The Venetian Expo
  const fixedLocation = { lat: 36.1215699, lng: -115.1651093 };

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
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, []);

  const fetchRecommendations = useCallback(async () => {
    const currentLocation = location || fixedLocation;
    
    setLoading(true);
    setError(null);
    setSelectedStore(null);

    try {
      const response = await getRecommendations({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        timeOption: timeOption,
        type: type,
      });
      setStores(response.stores);
      setDisplayedCount(10); // 새 검색 시 초기화
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '추천 결과를 가져오는데 실패했습니다.';
      setError(errorMessage);
      console.error('Error fetching recommendations:', err);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [location, timeOption, type]);

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

  // 옵션이 변경될 때마다 자동으로 추천 받기
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

  const handleMarkerClick = (store: Store | null) => {
    setSelectedStore(store);
    if (store) {
      setMapCenter({ lat: store.latitude, lng: store.longitude });
      // 추천된 store 클릭 시 clickedMapLocation 해제
      setClickedMapLocation(null);
    } else {
      setClickedMapLocation(null);
    }
  };

  const handleStoreCardClick = (store: Store) => {
    setSelectedStore(store);
    setMapCenter({ lat: store.latitude, lng: store.longitude });
    // 카드 클릭 시에도 메시지 표시
  };

  // 드래그 시작
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartHeight(optionsHeight);
    e.preventDefault();
  };

  // 드래그 중
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY - e.clientY; // 위로 드래그하면 양수
      const newHeight = Math.max(200, Math.min(600, dragStartHeight + deltaY)); // 최소 200px 보장
      setOptionsHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartY, dragStartHeight]);

  const currentLocation = mapCenter || location || fixedLocation;

  const handleFeedbackSubmit = async (feedback: string, image: File | null) => {
    await sendFeedbackToDiscord(feedback, image);
  };

  // 위아래 이동 핸들러 (반동 효과)
  const handleToggle = () => {
    if (panelOffset === 0) {
      // 아래로 이동 (일부만 보이도록 - 드래그 핸들만 보임)
      setPanelOffset(window.innerHeight - 60); // 드래그 핸들 높이만 남김
    } else {
      // 위로 이동 (원래 위치로)
      setPanelOffset(0);
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div 
        className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 relative z-10" 
        style={{ 
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/ceslogo.png"
              alt="CES Logo"
              width={32}
              height={32}
              className="object-contain"
              unoptimized
              priority
            />
            <h1 className="text-xl font-bold text-gray-900">
              CESEats 2026
            </h1>
          </div>
          <button
            onClick={() => setIsFeedbackModalOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
            title="피드백 보내기"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 선택된 핀까지의 거리 메시지 - InfoWindow가 표시될 때 나타남 */}
      {selectedStore && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-shrink-0 relative z-10 animate-slide-down">
          <p className="text-sm text-blue-700 text-center">
            도보로 총 {selectedStore.walkingTime}분이 걸려요!
          </p>
        </div>
      )}
      
      {/* Google Maps 기본 마커 클릭 시 거리 메시지 */}
      {clickedMapLocation && clickedMapLocation.walkingTime && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-shrink-0 relative z-10 animate-slide-down">
          <p className="text-sm text-blue-700 text-center">
            도보로 총 {clickedMapLocation.walkingTime}분이 걸려요!
          </p>
        </div>
      )}

      {/* 메인 컨텐츠 영역 - 모바일: 세로 배치, 데스크톱: 가로 배치 */}
      <div className="flex-1 relative min-h-0 flex flex-col lg:flex-row">
        {/* 지도 영역 */}
        <div className="flex-1 relative min-h-0 lg:min-w-0">
          <GoogleMapComponent
            center={currentLocation}
            radius={radiusKm}
            stores={stores}
            selectedStore={selectedStore}
            onMarkerClick={handleMarkerClick}
            onMapLocationClick={(location) => {
              setClickedMapLocation(location);
              // 선택된 store가 있으면 해제
              if (selectedStore) {
                setSelectedStore(null);
              }
            }}
          />
        </div>

        {/* 옵션 선택 및 추천 결과 영역 - 모바일: 아래, 데스크톱: 오른쪽 */}
        <div 
          className="bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex-shrink-0 relative lg:rounded-none rounded-t-2xl overflow-visible lg:w-96 lg:shadow-none lg:translate-y-0"
          style={{ 
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
            transform: isDesktop ? 'none' : `translateY(${panelOffset}px)`,
            transition: isDesktop ? 'none' : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // 반동 효과
          }}
        >
          {/* 토글 버튼 - 모바일에서만 표시 */}
          <button
            onClick={handleToggle}
            className="lg:hidden absolute top-2 right-2 z-20 bg-white rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
            aria-label={panelOffset > 0 ? '위로 올리기' : '아래로 내리기'}
          >
            <svg 
              className={`w-5 h-5 text-gray-600 transition-transform ${panelOffset > 0 ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {/* 드래그 핸들 - 모바일에서만 표시 (패널 상단 회색 부분) */}
          <div
            onClick={(e) => {
              // 패널이 아래로 내려갔을 때 클릭하면 위로 올리기
              if (panelOffset > 0) {
                e.preventDefault();
                e.stopPropagation();
                setPanelOffset(0);
              }
            }}
            onMouseDown={(e) => {
              // 패널이 위에 있을 때만 드래그 가능
              if (panelOffset === 0) {
                handleDragStart(e);
              } else {
                e.preventDefault();
              }
            }}
            className={`lg:hidden absolute top-0 left-1/2 -translate-x-1/2 w-16 h-6 cursor-pointer z-30 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center ${
              isDragging ? 'bg-gray-50' : ''
            }`}
          >
            <div className="flex flex-col gap-1 items-center">
              <div className="w-12 h-0.5 bg-gray-400 rounded-full"></div>
              <div className="w-12 h-0.5 bg-gray-400 rounded-full"></div>
              <div className="w-12 h-0.5 bg-gray-400 rounded-full"></div>
            </div>
          </div>
          
          {/* 옵션 및 추천 결과 컨텐츠 */}
          <div
            className="overflow-hidden relative lg:h-full"
            style={{ 
              height: isDesktop 
                ? '100%' 
                : `${Math.max(200, optionsHeight)}px`,
              minHeight: isDesktop ? 'auto' : '200px',
              transition: isDragging ? 'none' : 'height 1s cubic-bezier(0.25, 2, 0.5, 1)'
            }}
          >
            <div className="h-full overflow-y-auto">
              {/* 옵션 선택 - sticky로 고정 */}
              <div className="sticky top-0 z-10 bg-white px-4 pt-8 lg:pt-4 pb-4 border-b border-gray-200 shadow-sm">
                <OptionSelector
                  timeOption={timeOption}
                  type={type}
                  onTimeChange={setTimeOption}
                  onTypeChange={setType}
                />
              </div>
              
              {/* 추천 결과 */}
              <div className="bg-gray-50 px-4 py-4">
                {loading && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">추천 중...</p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {!loading && !error && stores.length > 0 && (
                  <>
                    <div className="mb-4">
                      <h2 className="text-lg font-bold text-gray-900">
                        추천 결과 ({stores.length}개)
                      </h2>
                      <p className="text-xs text-gray-600 mt-1">
                        마커를 클릭하면 상세 정보를 볼 수 있습니다
                      </p>
                    </div>
                    <div className="space-y-3">
                      {stores.slice(0, displayedCount).map((store) => (
                        <div
                          key={store.id}
                          onClick={() => handleStoreCardClick(store)}
                          className={selectedStore?.id === store.id ? 'ring-2 ring-blue-500 rounded-xl' : ''}
                        >
                          <StoreCard store={store} />
                        </div>
                      ))}
                    </div>
                    {displayedCount < stores.length && (
                      <div
                        ref={loadMoreRef}
                        className="text-center py-4"
                      >
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2">더 불러오는 중...</p>
                      </div>
                    )}
                  </>
                )}

                {!loading && !error && stores.length === 0 && location && (
                  <div className="text-center py-8">
                    <p className="text-gray-600">추천할 장소가 없습니다.</p>
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
  );
}
