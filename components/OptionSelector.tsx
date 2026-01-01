'use client';

import { useState, useEffect } from 'react';
import { StoreType, TimeOption } from '@/types';

interface OptionSelectorProps {
  timeOption: TimeOption;
  type: StoreType;
  onTimeChange: (time: TimeOption) => void;
  onTypeChange: (type: StoreType) => void;
}

export default function OptionSelector({
  timeOption,
  type,
  onTimeChange,
  onTypeChange,
}: OptionSelectorProps) {
  // 거리(미터)를 시간으로 변환: 도보 속도 5km/h 기준
  const distanceToTime = (meters: number): number => {
    // (meters / 5000) * 60
    return Math.round((meters / 5000) * 60);
  };
  
  // 시간을 거리(미터)로 변환
  const timeToDistance = (minutes: number): number => {
    // (minutes / 60) * 5000m
    return Math.round((minutes / 60) * 5000);
  };
  
  // 초기 거리 값 계산 (100m ~ 2000m 범위)
  const initialDistance = Math.max(100, Math.min(2000, timeToDistance(timeOption)));
  const [sliderValue, setSliderValue] = useState(initialDistance);
  
  // 거리 옵션: 100m, 500m, 1km, 1.5km, 2km
  const distanceOptions: { value: number; label: string }[] = [
    { value: 100, label: '100m' },
    { value: 500, label: '500m' },
    { value: 1000, label: '1km' },
    { value: 1500, label: '1.5km' },
    { value: 2000, label: '2km' },
  ];

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

  // timeOption이 외부에서 변경되면 슬라이더 값도 업데이트
  useEffect(() => {
    const distance = Math.max(100, Math.min(2000, timeToDistance(timeOption)));
    setSliderValue(distance);
  }, [timeOption]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const distanceMeters = parseInt(e.target.value);
    // 실시간으로 슬라이더 값 업데이트
    setSliderValue(distanceMeters);
    // 거리를 시간으로 변환하여 백엔드에 전달
    const timeMinutes = distanceToTime(distanceMeters);
    onTimeChange(timeMinutes);
  };

  return (
    <div className="space-y-6">
      <div>
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
          </div>
        </div>
        <div className="relative">
          {/* 말풍선: "이 정도면 X분 내로 걸어갈 수 있는 거리에요!" */}
          <div
            className="absolute bottom-full mb-2 whitespace-nowrap"
            style={{
              left: sliderValue <= 600 
                ? '0%' 
                : sliderValue >= 1800
                ? '100%'
                : `${((sliderValue - 100) / (2000 - 100)) * 100}%`,
              transform: sliderValue <= 600 
                ? 'translateX(0)' 
                : sliderValue >= 1800
                ? 'translateX(-100%)'
                : 'translateX(-50%)',
              transition: 'left 0.1s ease-out, transform 0.1s ease-out'
            }}
          >
            <div className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg relative">
              이 정도면 {distanceToTime(sliderValue)}분 내로 걸어갈 수 있는 거리에요!
              {/* 말풍선 꼬리 */}
              <div
                className="absolute top-full left-0 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-blue-600"
                style={{
                  left: sliderValue <= 600 
                    ? '12px' 
                    : sliderValue >= 1800
                    ? 'calc(100% - 12px)'
                    : '50%',
                  transform: sliderValue <= 600 
                    ? 'translateX(0)' 
                    : sliderValue >= 1800
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)'
                }}
              />
            </div>
          </div>
          
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={sliderValue}
            onChange={handleSliderChange}
            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all smooth-slider"
            style={{
              background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((sliderValue - 100) / (2000 - 100)) * 100}%, #e5e7eb ${((sliderValue - 100) / (2000 - 100)) * 100}%, #e5e7eb 100%)`
            }}
          />
        </div>
        <div className="flex justify-between mt-1 relative">
          {distanceOptions.map((option) => {
            const isNearby = Math.abs(option.value - sliderValue) <= 100;
            
            return (
              <span
                key={option.value}
                className={`text-xs transition-all ${
                  isNearby
                    ? 'font-bold text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                {option.label}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          유형
        </label>
        <div className="flex gap-2 flex-wrap pb-2">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onTypeChange(option.value)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                type === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
