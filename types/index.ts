export type StoreType = 'restaurant' | 'cafe' | 'fastfood' | 'bar' | 'food' | 'bakery' | 'meal_delivery' | 'night_club' | 'liquor_store' | 'store' | 'shopping_mall' | 'supermarket' | 'convenience_store' | 'other' | 'all';

/** 유형별 Google Places API types 매핑 (지도/리스트 필터 공통) */
export const TYPE_TO_PLACES_TYPES: Record<StoreType, string[]> = {
  'all': [],
  'restaurant': [
    'restaurant', 'food', 'establishment',
    'american_restaurant', 'asian_restaurant', 'brazilian_restaurant',
    'chinese_restaurant', 'french_restaurant', 'italian_restaurant',
    'japanese_restaurant', 'korean_restaurant', 'mexican_restaurant',
    'breakfast_restaurant', 'brunch_restaurant', 'buffet_restaurant',
    'dessert_restaurant', 'diner', 'fine_dining_restaurant',
    'pizza_restaurant', 'seafood_restaurant', 'steak_house',
    'sushi_restaurant', 'vegetarian_restaurant',
    'bar_and_grill', 'barbecue_restaurant', 'catering_service', 'deli'
  ],
  'cafe': ['cafe', 'coffee_shop', 'internet_cafe', 'tea_house'],
  'fastfood': [
    'fast_food_restaurant', 'hamburger_restaurant', 'sandwich_shop',
    'meal_takeaway', 'meal_delivery', 'food_delivery'
  ],
  'bar': ['bar', 'night_club', 'pub'],
  'food': [
    'restaurant', 'food', 'food_store', 'meal_takeaway', 'meal_delivery',
    'food_delivery', 'establishment'
  ],
  'bakery': [
    'bakery', 'bagel_shop', 'donut_shop', 'confectionery',
    'candy_store', 'chocolate_shop', 'dessert_shop', 'ice_cream_shop'
  ],
  'meal_delivery': ['meal_delivery', 'food_delivery', 'meal_takeaway', 'fast_food_restaurant'],
  'night_club': ['night_club', 'bar', 'pub'],
  'liquor_store': ['liquor_store'],
  'store': [
    'store', 'clothing_store', 'shoe_store', 'electronics_store',
    'furniture_store', 'home_goods_store', 'home_improvement_store',
    'gift_shop', 'sporting_goods_store', 'hardware_store'
  ],
  'shopping_mall': ['shopping_mall', 'department_store'],
  'supermarket': ['supermarket', 'grocery_store', 'food_store', 'convenience_store'],
  'convenience_store': ['convenience_store', 'grocery_store', 'food_store'],
  'other': []
};

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
  types?: string[]; // Google Places API types 리스트 (필터링용)
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

