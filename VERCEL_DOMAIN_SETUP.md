# Vercel 커스텀 도메인 설정 가이드

## 1. Vercel 프로젝트에 도메인 추가

### Vercel 대시보드에서 설정

1. **Vercel 대시보드 접속**
   - https://vercel.com/dashboard
   - 프로젝트 선택

2. **Settings → Domains 메뉴**
   - 좌측 메뉴에서 "Settings" 클릭
   - "Domains" 메뉴 선택

3. **도메인 추가**
   - "Add Domain" 버튼 클릭
   - `ceseats.store` 입력
   - "Add" 클릭

4. **DNS 설정 안내 확인**
   - Vercel이 DNS 설정 방법을 안내합니다
   - 다음 중 하나의 방법을 사용:
     - **CNAME 레코드** (권장)
     - **A 레코드**

## 2. DNS 설정 (도메인 등록 업체에서)

### CNAME 레코드 설정 (권장)

도메인 등록 업체의 DNS 관리 페이지에서:

```
Type: CNAME
Name: @ (또는 비워두기, 루트 도메인)
Value: cname.vercel-dns.com
```

또는 서브도메인 사용 시:

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### A 레코드 설정 (대안)

Vercel이 제공하는 IP 주소를 사용:

```
Type: A
Name: @
Value: 76.76.21.21 (Vercel이 제공하는 IP)
```

**참고**: Vercel 대시보드에서 정확한 DNS 설정 값을 확인하세요.

## 3. DNS 전파 대기

- DNS 변경 사항이 전파되는 데 **몇 분에서 24시간** 걸릴 수 있습니다
- Vercel 대시보드에서 도메인 상태 확인
- "Valid Configuration" 상태가 되면 완료

## 4. HTTPS 자동 설정

- Vercel이 자동으로 Let's Encrypt SSL 인증서를 발급합니다
- 도메인 추가 후 몇 분 내에 HTTPS가 활성화됩니다

## 5. 백엔드 CORS 설정 업데이트

프론트엔드 도메인이 변경되었으므로 백엔드 CORS 설정을 업데이트해야 합니다.

### 방법 1: 환경 변수로 설정 (권장)

GitHub Secrets 또는 서버 환경 변수에 추가:

```bash
CORS_ALLOWED_ORIGINS=https://ceseats.store,https://cesfront.vercel.app
```

### 방법 2: 코드에 직접 추가

컨트롤러 파일들을 수정하여 `https://ceseats.store` 추가

## 6. 프론트엔드 환경 변수 확인

프론트엔드는 이미 `https://ceseats.r-e.kr/api`를 백엔드 API로 사용하도록 설정되어 있으므로 추가 설정 불필요합니다.

## 확인 사항

배포 후 확인:

1. **도메인 접속 확인**
   ```bash
   curl -I https://ceseats.store
   ```

2. **HTTPS 확인**
   - 브라우저에서 `https://ceseats.store` 접속
   - 자물쇠 아이콘 확인

3. **API 연결 확인**
   - 브라우저 개발자 도구 → Network 탭
   - API 호출이 `https://ceseats.r-e.kr/api`로 가는지 확인

## 문제 해결

### 도메인이 연결되지 않는 경우

1. **DNS 전파 확인**
   ```bash
   # DNS 확인
   nslookup ceseats.store
   dig ceseats.store
   ```

2. **Vercel 도메인 설정 확인**
   - Vercel 대시보드에서 도메인 상태 확인
   - 오류 메시지 확인

3. **DNS TTL 확인**
   - DNS TTL이 너무 길면 변경 사항 반영이 늦을 수 있습니다

### HTTPS가 활성화되지 않는 경우

- Vercel이 자동으로 처리하므로 몇 분 기다려보세요
- 24시간 이상 걸리면 Vercel 지원팀에 문의

