'use client';

import { useEffect, useState, useMemo } from 'react';
import { Store } from '@/types';

interface TrendingPlacesProps {
  stores: Store[];
  onPlaceClick?: (store: Store) => void;
  isCollapsed?: boolean; // 외부에서 접기/펼치기 제어
  onCollapseChange?: (collapsed: boolean) => void; // 접기/펼치기 상태 변경 콜백
}

interface RankedStore extends Store {
  currentRank: number;
  viewCountIncrease: number; // 조회수 증가량
}

export default function TrendingPlaces({ stores, onPlaceClick, isCollapsed, onCollapseChange }: TrendingPlacesProps) {
  const [previousViewCounts, setPreviousViewCounts] = useState<{ [key: string]: number }>({});
  const [internalExpanded, setInternalExpanded] = useState(true); // 내부 접기/펼치기 상태
  const [currentIndex, setCurrentIndex] = useState(0); // 현재 표시할 항목 인덱스
  const [isSliding, setIsSliding] = useState(false); // 슬라이드 애니메이션 상태
  
  // 외부에서 제어되는 경우 외부 상태 사용, 아니면 내부 상태 사용
  const isExpanded = isCollapsed !== undefined ? !isCollapsed : internalExpanded;
  
  const setIsExpanded = (expanded: boolean) => {
    if (isCollapsed !== undefined && onCollapseChange) {
      // 외부 제어 모드
      onCollapseChange(!expanded);
    } else {
      // 내부 제어 모드
      setInternalExpanded(expanded);
    }
  };

  // 순위와 조회수에 따른 동적 메시지 생성
  const getTrendingMessage = (rank: number, viewCount: number, viewCountIncrease: number): string => {
    if (rank === 1) {
      // 1위: 조회수에 따라 메시지 변경
      if (viewCount >= 50) {
        return '가장 많은 사람이 보고 있어요!';
      } else if (viewCount >= 20) {
        return '많은 사람들이 관심을 보이고 있어요!';
      } else {
        return '인기 있는 곳이에요!';
      }
    } else if (rank === 2) {
      // 2위: 조회수 증가량에 따라 메시지 변경
      if (viewCountIncrease >= 5) {
        return `급상승! 10분 동안 ${viewCountIncrease}명이 더 봤어요!`;
      } else if (viewCountIncrease > 0) {
        return `인기 상승 중! ${viewCountIncrease}명이 더 봤어요!`;
      } else {
        return '인기 있는 곳이에요!';
      }
    } else if (rank === 3) {
      // 3위: 조회수 증가량에 따라 메시지 변경
      if (viewCountIncrease >= 3) {
        return `10분 동안 조회수가 ${viewCountIncrease}명이 넘게 보고 있어요!`;
      } else if (viewCountIncrease > 0) {
        return `${viewCountIncrease}명이 더 찾고 있어요!`;
      } else {
        return '많은 사람들이 찾고 있어요!';
      }
    }
    return '많은 사람들이 찾고 있어요!';
  };

  // 조회수 증가량 기준으로 정렬하여 상위 3개 선택 (실시간 급상승)
  const topStores = useMemo(() => {
    // 백엔드에서 제공하는 viewCountIncrease 사용 (없으면 계산)
    const storesWithIncrease = stores.map(store => {
      // 백엔드에서 제공하는 증가량이 있으면 사용, 없으면 계산
      let viewCountIncrease = store.viewCountIncrease ?? 0;
      
      if (viewCountIncrease === 0 && store.viewCount !== undefined) {
        // 백엔드 증가량이 없으면 프론트엔드에서 계산 (fallback)
        const currentViewCount = store.viewCount ?? 0;
        const previousViewCount = previousViewCounts[store.id] ?? currentViewCount;
        viewCountIncrease = Math.max(0, currentViewCount - previousViewCount);
      }

      return {
        ...store,
        viewCountIncrease: viewCountIncrease,
      } as RankedStore;
    });

    // 조회수 증가량 기준으로 정렬 (증가량이 같으면 전체 조회수로 정렬)
    const sortedStores = storesWithIncrease
      .sort((a, b) => {
        // 먼저 증가량으로 정렬
        if (b.viewCountIncrease !== a.viewCountIncrease) {
          return b.viewCountIncrease - a.viewCountIncrease;
        }
        // 증가량이 같으면 전체 조회수로 정렬
        const aCount = a.viewCount ?? 0;
        const bCount = b.viewCount ?? 0;
        return bCount - aCount;
      })
      .slice(0, 3);

    // 순위 부여
    return sortedStores.map((store, index) => ({
      ...store,
      currentRank: index + 1,
    }));
  }, [stores, previousViewCounts]);

  // localStorage에서 이전 조회수 불러오기 및 초기화
  useEffect(() => {
    if (stores.length === 0 || Object.keys(previousViewCounts).length > 0) return; // 이미 설정되었으면 실행하지 않음
    
    try {
      const savedViewCounts = localStorage.getItem('placeViewCounts');
      const savedTimestamp = localStorage.getItem('placeViewCountsTimestamp');
      
      if (savedViewCounts && savedTimestamp) {
        const timestamp = parseInt(savedTimestamp, 10);
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000; // 10분 (밀리초)
        
        // 10분이 지났으면 리셋, 아니면 이전 조회수 사용
        if (now - timestamp < tenMinutes) {
          setPreviousViewCounts(JSON.parse(savedViewCounts));
        } else {
          // 10분이 지났으면 현재 조회수를 기준으로 리셋
          const currentViewCounts: { [key: string]: number } = {};
          stores.forEach(store => {
            currentViewCounts[store.id] = store.viewCount ?? 0;
          });
          setPreviousViewCounts(currentViewCounts);
          localStorage.setItem('placeViewCounts', JSON.stringify(currentViewCounts));
          localStorage.setItem('placeViewCountsTimestamp', now.toString());
        }
      } else {
        // 처음 로드 시 현재 조회수를 기준으로 설정
        const currentViewCounts: { [key: string]: number } = {};
        stores.forEach(store => {
          currentViewCounts[store.id] = store.viewCount ?? 0;
        });
        setPreviousViewCounts(currentViewCounts);
        localStorage.setItem('placeViewCounts', JSON.stringify(currentViewCounts));
        localStorage.setItem('placeViewCountsTimestamp', Date.now().toString());
      }
    } catch (e) {
      console.error('Failed to load view counts from localStorage:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]); // stores가 로드될 때 실행

  // 10분마다 이전 조회수를 현재 조회수로 리셋
  useEffect(() => {
    const interval = setInterval(() => {
      const newViewCounts: { [key: string]: number } = {};
      stores.forEach(store => {
        newViewCounts[store.id] = store.viewCount ?? 0;
      });
      
      setPreviousViewCounts(newViewCounts);
      localStorage.setItem('placeViewCounts', JSON.stringify(newViewCounts));
      localStorage.setItem('placeViewCountsTimestamp', Date.now().toString());
    }, 10 * 60 * 1000); // 10분마다 실행

    return () => clearInterval(interval);
  }, [stores]);

  // 자동 슬라이드: 3초마다 다음 항목으로 전환 (아래에서 위로)
  useEffect(() => {
    if (topStores.length === 0 || !isExpanded || topStores.length <= 1) return;
    
    const interval = setInterval(() => {
      // 슬라이드 아웃 (위로 사라짐)
      setIsSliding(true);
      
      // 애니메이션 후 다음 항목으로 전환
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % topStores.length);
        // 슬라이드 인 (아래에서 나타남) - 약간의 지연 후
        requestAnimationFrame(() => {
          setTimeout(() => {
            setIsSliding(false);
          }, 10);
        });
      }, 350); // 슬라이드 아웃 시간
    }, 3000); // 3초마다 전환

    return () => clearInterval(interval);
  }, [topStores.length, isExpanded]);

  // topStores가 변경되면 인덱스 리셋
  useEffect(() => {
    setCurrentIndex(0);
  }, [topStores.length]);

  if (topStores.length === 0) {
    return null;
  }

  const currentStore = topStores[currentIndex];

  return (
    <div className="flex items-center gap-2 relative ml-4">
      {/* 헤더 - 클릭 가능 */}
      <div 
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        <h3 className="text-xs font-semibold text-gray-700 whitespace-nowrap">실시간 급상승</h3>
      </div>
      
      {/* 내용 - 자동 슬라이드 */}
      {isExpanded && currentStore && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-20 min-w-[280px] max-w-[320px]">
          <div className="relative overflow-hidden" style={{ minHeight: '60px' }}>
            <div 
              className="px-4 py-3 transition-all ease-in-out"
              style={{
                transform: isSliding ? 'translateY(-100%)' : 'translateY(0)',
                opacity: isSliding ? 0 : 1,
                transitionDuration: '350ms',
              }}
            >
              <div
                className="flex items-center justify-between rounded hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation(); // 헤더 클릭 이벤트 전파 방지
                  if (onPlaceClick) {
                    onPlaceClick(currentStore);
                  }
                }}
              >
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 flex-shrink-0">#{currentStore.currentRank}</span>
                    <span className="text-sm font-medium text-gray-900 truncate block overflow-hidden text-ellipsis whitespace-nowrap">{currentStore.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-600 truncate">
                      {getTrendingMessage(currentStore.currentRank, currentStore.viewCount ?? 0, currentStore.viewCountIncrease)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 인디케이터 (3개 점) */}
          {topStores.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-2">
              {topStores.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${
                    index === currentIndex 
                      ? 'w-6 bg-blue-600' 
                      : 'w-1.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

