# 컬링 기량 기록부를 GitHub에 올리기

**데이터는 지금처럼 구글 시트에 저장**되고, GitHub에는 **화면(프로그램 코드)만** 올립니다.

GitHub에 올리면 좋은 점:
- **깔끔한 주소:** `https://아이디.github.io/curling-record/` 같은 주소로 열립니다. 구글 안내 문구도 화면 위에 뜨지 않습니다.
- **코드 보관:** 프로그램이 GitHub에 안전하게 백업되고, 고친 이력이 남습니다.
- **간단한 수정:** 앞으로는 GitHub의 `index.html` 하나만 바꾸면 됩니다.

> 올리는 파일에는 학생 이름, 점수, PIN, 서버 주소가 **들어 있지 않습니다.**

---

## 1단계. Apps Script를 새 버전으로 (먼저 꼭)
GitHub 화면이 구글 시트와 통신하려면 새 `Code.gs`가 필요합니다.
1. 구글 시트 → **확장 프로그램 → Apps Script**
2. `Code.gs` 내용을 이 폴더의 새 **`Code.gs`** 로 모두 바꿔 붙여 넣고 저장
3. `Index.html` 도 이 폴더의 새 **`Index.html`** 로 바꿔 붙여 넣고 저장
4. **배포 → 배포 관리 → ✏️ 수정 → 버전: 새 버전 → 배포**
5. 화면에 나온 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사해 둡니다. 이것이 "서버 주소"입니다.

## 2단계. GitHub 저장소 만들기 (컴퓨터에서 약 10분)
1. https://github.com 에 가입하고 로그인합니다. (딜리버리 분석 앱을 올릴 때 만든 계정을 그대로 써도 됩니다)
2. 오른쪽 위 **+ → New repository**
   - Repository name: `curling-record`
   - **Public** 선택 → **Create repository**
3. **uploading an existing file** 을 누르고, 이 폴더 안 **`github` 폴더 안의 내용 전체**를 끌어다 놓습니다.
   - `index.html`, `README.md`, `apps-script` 폴더, `docs` 폴더
4. 아래 **Commit changes** 를 누릅니다.

## 3단계. 웹 주소 켜기 (GitHub Pages)
1. 저장소 **Settings → Pages**
2. Source: **Deploy from a branch** / Branch: **main**, 폴더 **/(root)** → **Save**
3. 1~2분 뒤 위쪽에 주소가 뜹니다. 예: `https://아이디.github.io/curling-record/`

## 4단계. 코치·아이들에게 링크 보내기
서버 주소를 붙인 **공유용 링크**를 한 번 만들어 보내면, 받는 사람은 PIN만 입력하면 됩니다.

```
https://아이디.github.io/curling-record/?api=웹앱URL
```

예시:
`https://아이디.github.io/curling-record/?api=https://script.google.com/macros/s/AKfy…/exec`

- 처음 열면 서버 주소가 그 기기에 저장되고, 주소창의 `?api=…` 부분은 자동으로 사라집니다.
- `?api=` 없이 열면 접속 화면에 **서버 주소** 칸이 나옵니다. 거기에 웹 앱 URL을 붙여 넣어도 됩니다.
- 휴대폰에서는 공유 → **홈 화면에 추가** 하면 앱처럼 쓸 수 있습니다.

> 공유용 링크에는 서버 주소가 들어 있으니 **팀 안에서만** 보내 주세요. PIN이 없으면 기록을 볼 수 없습니다.

---

## 고친 뒤 다시 올릴 때
- **화면만 바뀐 경우:** GitHub 저장소에서 `index.html` → **Add file → Upload files** 로 같은 이름 파일을 올려 덮어쓰면 됩니다. 주소는 그대로입니다.
- **`Code.gs`도 바뀐 경우:** 1단계처럼 Apps Script에도 붙여 넣고 **새 버전으로 배포**하세요.
- 기존 Apps Script 주소(`…/exec`)로 열어도 계속 똑같이 작동합니다. 두 주소 중 편한 쪽을 쓰세요.

## 문제가 생기면
| 화면에 보이는 문구                         | 확인할 것                                                          |
| :---                                       | :---                                                               |
| 서버 주소(웹 앱 URL)를 먼저 입력하세요       | 링크에 `?api=…` 가 빠졌습니다. 접속 화면에 웹 앱 URL을 붙여 넣으세요 |
| 서버 응답을 읽지 못했습니다                  | 1단계(새 `Code.gs` + 새 버전 배포)를 했는지, 주소가 `/exec`로 끝나는지 |
| PIN이 맞지 않습니다                          | 시트 메뉴 **컬링 기록부 → ② 코치 PIN 설정** 에서 정한 PIN            |
| 배포 시 '모든 사용자'가 없음                 | 교육청 계정 제한입니다. 개인 Gmail 계정으로 시트를 만드세요          |
