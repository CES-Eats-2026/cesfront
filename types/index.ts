export type StoreType = 'restaurant' | 'cafe' | 'fastfood' | 'bar' | 'food' | 'bakery' | 'meal_delivery' | 'night_club' | 'liquor_store' | 'store' | 'shopping_mall' | 'supermarket' | 'convenience_store' | 'other' | 'all';

export type TimeOption = number; // 분 단위 (15-90)

export interface Store {
  id: string;
  name: string;
  type: StoreType;
  walkingTime: number; // 분
  estimatedDuration: number; // 분
  priceLevel: 1 | 2 | 3; // $, $$, $$$
  cesReason: string; // CES 기준 한 줄 이유
  latitude: number;
  longitude: number;
  address?: string;
  photos?: string[]; // 사진 URL 리스트
  reviews?: Review[]; // 리뷰 리스트
  viewCount?: number; // 조회수
  viewCountIncrease?: number; // 최근 10분 동안의 조회수 증가량
}

export interface Review {
  authorName: string;
  rating: number;
  text: string;
  time?: number; // Unix timestamp
  relativeTimeDescription?: string;
}

export interface RecommendationRequest {
  latitude: number;
  longitude: number;
  timeOption: number; // 분 단위
  type: StoreType;
}

export interface RecommendationResponse {
  stores: Store[];
}

