# Vercel 환경 변수 설정 가이드

## 필수 환경 변수

프론트엔드가 `https://ceseats.store`로 배포되었으므로, Vercel 프로젝트에 다음 환경 변수를 설정해야 합니다.

### Vercel 대시보드에서 설정

1. **Vercel 대시보드 접속**
   - https://vercel.com/dashboard
   - 프로젝트 선택

2. **Settings → Environment Variables**
   - 좌측 메뉴에서 "Settings" 클릭
   - "Environment Variables" 메뉴 선택

3. **환경 변수 추가**

다음 환경 변수들을 추가하세요:

#### 필수 환경 변수

```env
# Google Maps API 키 (필수)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# 백엔드 API URL (필수)
NEXT_PUBLIC_API_URL=https://ceseats.r-e.kr/api
```

#### 선택 환경 변수

```env
# Discord 웹훅 URL (피드백 기능용, 선택사항)
NEXT_PUBLIC_DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

### 환경별 설정

각 환경(Production, Preview, Development)에 대해 설정할 수 있습니다:

- **Production**: 프로덕션 배포에 사용 (`https://ceseats.store`)
- **Preview**: PR/브랜치별 미리보기 배포에 사용
- **Development**: 로컬 개발에 사용

**권장**: Production 환경에만 설정하거나, 모든 환경에 동일하게 설정

### 환경 변수 적용

환경 변수를 추가한 후:

1. **자동 재배포**: Vercel이 자동으로 재배포합니다
2. **수동 재배포**: 필요시 "Deployments" 탭에서 최신 배포를 "Redeploy" 할 수 있습니다

## 현재 설정 확인

### 프론트엔드 도메인
- **프로덕션**: `https://ceseats.store`
- **백엔드 API**: `https://ceseats.r-e.kr/api`

### 백엔드 CORS
- `https://ceseats.store` 허용됨 ✅
- `https://cesfront.vercel.app` 허용됨 ✅
- `http://localhost:3000` 허용됨 (로컬 개발) ✅

## 문제 해결

### Google Maps가 표시되지 않는 경우

1. **환경 변수 확인**
   - Vercel 대시보드에서 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 설정 확인
   - Production 환경에 설정되어 있는지 확인

2. **Google Cloud Console 확인**
   - API 키가 활성화되어 있는지 확인
   - Maps JavaScript API가 활성화되어 있는지 확인
   - HTTP 리퍼러 제한에 `https://ceseats.store/*` 추가

### API 호출 실패하는 경우

1. **CORS 오류 확인**
   - 브라우저 개발자 도구 → Console 탭
   - CORS 오류 메시지 확인
   - 백엔드 CORS 설정에 `https://ceseats.store`가 포함되어 있는지 확인

2. **네트워크 확인**
   - 브라우저 개발자 도구 → Network 탭
   - API 요청이 `https://ceseats.r-e.kr/api`로 가는지 확인
   - 응답 상태 코드 확인

3. **백엔드 재배포**
   - 백엔드 CORS 설정 변경 후 재배포 필요

