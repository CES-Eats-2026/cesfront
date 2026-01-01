'use client';

import { useState, useRef, useEffect } from 'react';
import { Store } from '@/types';
import { getGoogleMapsDeepLink, incrementPlaceView } from '@/lib/api';

interface StoreCardProps {
  store: Store;
  isSelected?: boolean; // 선택되었는지 여부
}

export default function StoreCard({ store, isSelected = false }: StoreCardProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  
  const priceLevels = {
    1: '$',
    2: '$$',
    3: '$$$',
  };

  const handleNavigate = () => {
    // 조회수 증가 (카드 클릭 시)
    incrementPlaceView(store.id);
    
    const deepLink = getGoogleMapsDeepLink(store.latitude, store.longitude);
    window.open(deepLink, '_blank');
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (store.photos && store.photos.length > 0) {
      setCurrentPhotoIndex((prev) => (prev === 0 ? store.photos!.length - 1 : prev - 1));
    }
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (store.photos && store.photos.length > 0) {
      setCurrentPhotoIndex((prev) => (prev === store.photos!.length - 1 ? 0 : prev + 1));
    }
  };

  // 터치 스와이프 처리
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || !store.photos || store.photos.length <= 1) {
      return;
    }

    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50; // 최소 스와이프 거리

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // 왼쪽으로 스와이프 (다음 사진)
        setCurrentPhotoIndex((prev) => (prev === store.photos!.length - 1 ? 0 : prev + 1));
      } else {
        // 오른쪽으로 스와이프 (이전 사진)
        setCurrentPhotoIndex((prev) => (prev === 0 ? store.photos!.length - 1 : prev - 1));
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // 선택되었을 때 이미지 슬라이더 자동 이동
  useEffect(() => {
    if (isSelected && store.photos && store.photos.length > 1) {
      // 선택되면 이미지 슬라이더를 자동으로 순환
      const interval = setInterval(() => {
        setCurrentPhotoIndex((prev) => {
          return (prev + 1) % store.photos!.length;
        });
      }, 2000); // 2초마다 다음 이미지로

      return () => clearInterval(interval);
    } else if (!isSelected) {
      // 선택 해제되면 첫 번째 이미지로 리셋
      setCurrentPhotoIndex(0);
    }
  }, [isSelected, store.photos]);

  return (
    <div
      className="bg-white rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
    >
      {/* 사진 슬라이드 */}
      {store.photos && store.photos.length > 0 && (
        <div 
          className="relative w-full h-48 bg-gray-200 overflow-hidden group"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 이미지 컨테이너 */}
          <div 
            className="flex transition-transform duration-300 ease-in-out h-full"
            style={{ transform: `translateX(-${currentPhotoIndex * 100}%)` }}
          >
            {store.photos.map((photo, index) => (
              <div key={index} className="min-w-full h-full flex-shrink-0 relative">
                <img
                  src={photo}
                  alt={`${store.name} - 사진 ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // 이미지 로드 실패 시 숨김
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>

          {/* 이전/다음 버튼 (여러 사진이 있을 때만 표시) */}
          {store.photos.length > 1 && (
            <>
              {/* 이전 버튼 */}
              <button
                onClick={handlePrevPhoto}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-50"
                aria-label="이전 사진"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* 다음 버튼 */}
              <button
                onClick={handleNextPhoto}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-50"
                aria-label="다음 사진"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* 사진 인디케이터 (하단 점) */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-50">
                {store.photos.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentPhotoIndex(index);
                    }}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentPhotoIndex
                        ? 'bg-white w-6'
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
      
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-xl font-bold text-gray-900">{store.name}</h3>
          <span className="text-lg font-semibold text-gray-600">
            {priceLevels[store.priceLevel]}
          </span>
        </div>

      <div className="mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <span className="font-medium">도보:</span>
          <span className="ml-2">{store.walkingTime}분</span>
        </div>
      </div>

      {/* 리뷰 표시 */}
      {store.reviews && store.reviews.length > 0 ? (
        <div className="mb-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">리뷰</h4>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {store.reviews.slice(0, 3).map((review, index) => (
              <div key={index} className="border-l-2 border-blue-200 pl-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-800">
                    {review.authorName || '익명'}
                  </span>
                  {review.rating && (
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-xs ${
                            i < review.rating
                              ? 'text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {review.text && (
                  <p className="text-xs text-gray-600 line-clamp-2">{review.text}</p>
                )}
                {review.relativeTimeDescription && (
                  <span className="text-xs text-gray-400 block mt-1">
                    {review.relativeTimeDescription}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pt-3 border-t border-gray-200">
        <p className="text-sm text-gray-700 leading-relaxed">
          <span className="font-semibold text-blue-600">한줄평:</span>{' '}
          {store.cesReason}
        </p>
      </div>

      <button
        onClick={handleNavigate}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        길찾기
      </button>
      </div>
    </div>
  );
}

