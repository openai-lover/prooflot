# Prooflot 제출 자료

2026-11-15 KST 공개 릴리스 반영. Open Innovation 및 Agent Economy. 내부 스키마·계약명 AgentProof는 기존 불변 기록과 호환되도록 유지한다.

[공개 GitHub](https://github.com/openai-lover/prooflot) · [공개 89초 시연 영상](https://youtu.be/OEni-eWBdwk) · [공개 X 영상 게시물](https://x.com/AlphaGgang/status/2121637337587458332) · [최신 객관적 평가](release-review.ko.md)

## 한 문장

**봇을 사기 전에 같은 기준으로 검사하고, 확인한 버전 그대로 받는 마켓.**

제작자는 Python·규칙형 봇을 검사 결과와 함께 판매하고, 구매자는 같은 조건으로 비교·재시험한 뒤 본인 지갑으로 정확한 버전의 사용권을 구매한다. 성과가 나쁘거나 표본이 부족한 결과도 그대로 보여준다.

## 지금 제출 근거로 쓸 수 있는 것

- 개인 지갑 연결 요청: NEAR Connect, Meteor·Nightly 고정 어댑터.
- NEP-413 소유 확인, FINAL FullAccess 키 검사, 지갑별 제작자·사용권과 세션 복구.
- 제작자 서명 등록/판매 → 구매자 서명 결제 → 실제 ZIP 다운로드/재시험 → 제작자 출금.
- 실제 별도 테스트 계정 14개 흐름 검증, 전체 로컬 테스트 84개, 공개 지갑 증거 14개 대조.
- 실제 Meteor 개인 지갑으로 로그인 서명·구매·ZIP 다운로드·새 재시험 완료: 16개 대조, 독립 공개 체인 검사 10개 통과.
- 동일 비용·시장 데이터에서 4개 공통 시험을 사전 기록하고 전체 결과 공개. 새 지갑 소유 Python 봇: 628회 판단, 42회 체결.
- 캐시되는 첫 방문 소개, 기하학 로고, 간결한 모바일 화면.

**Meteor 개인 구매자 경로는 실제 지갑 UI로 검증했다.** nearblog6709.testnet으로 NEP-413 로그인과 0.03 test NEAR 결제를 서명하고, 최종 사용권·원본 ZIP·61회 새 Python 실행을 확인했다. [실제 구매](https://testnet.nearblocks.io/txns/5okSTWEwmR7BR8Yzao1uV5R1sT4LHrbBvtoKoK6Nt92L)와 [검증 근거](meteor-wallet-evidence.json)를 사용한다. 제작자 등록·판매·출금 및 공격 사례는 별도 SDK 테스트 계정으로 검증했다. Nightly 확장과 제작자 지갑 UI까지 직접 승인한 것으로 표현하지 않는다.

## 공개한 89초 시연

앱 내 브라우저에서 실제 Python 파일을 올리고 검사·게시한 뒤, 로컬 모의 구매·파일 다운로드·새 재시험까지 진행했다. 이후 실제 테스트넷 상품의 FINAL 상태와 네 과거 시험 결과, 공개 소스를 보여준다. 로컬 모의 결제와 실제 체인 조회를 영어 자막으로 구분했다. 기존 Meteor 구매를 방금 승인한 것처럼 편집하지 않았다. 실제 저장 파일은 prooflot-browser-evidence.json으로 확인한다.

## 상세 3분 발표용 구성

| 시간 | 보여줄 화면 | 전달할 내용 |
|---|---|---|
| 0:00–0:08 | 첫 방문 소개 세 장면 | 올리고, 검사하고, 확인한 버전을 거래한다. |
| 0:08–0:35 | Signal Check 상품·검사 결과 | 수익률 −0.98%, 낙폭 1.54%, 표본 부족 경고도 숨기지 않는다. |
| 0:35–1:00 | 공통 검증 네 결과 | BTC·ETH 두 기간에 −1.74%, −0.34%, −4.96%, +2.02%. 한 번의 좋은 결과만 고르지 않는다. |
| 1:00–1:25 | 조건·기록 → FINAL 재확인 | 조건을 먼저 기록하고 전체 결과 해시를 계약과 대조한다. 실행은 운영자를 신뢰한다. |
| 1:25–1:55 | 제작자 지갑·버전·등록 트랜잭션 | 제작자가 실제 버전 등록과 판매를 서명했다. 운영자는 검사 결과만 기록했다. |
| 1:55–2:30 | Meteor 실제 구매 화면·영수증·봇 ZIP·새 재시험 | 개인 지갑으로 purchase_license를 서명했고, 검사한 소스가 내려받아지고 같은 결과가 새로 실행됨을 보여준다. 기록된 거래임을 표시한다. |
| 2:30–2:45 | 출금 영수증·새 세션 사용권 복구 증거 | 판매자 수령과 구매자 복구가 작동한다. |
| 2:45–3:00 | 공개 검증 명령·README | 키 없이 계약/지급/버전 증거를 재확인할 수 있다. |

Meteor 연결·구매 요청·구매 완료 스크린샷과 실제 거래 기록이 있다. 시연 영상을 새로 촬영할 때 기존 사용권은 재결제되지 않으므로 새 계정 또는 새 상품을 사용한다. 이미 기록된 거래를 방금 승인한 것처럼 편집하지 않는다. Python·규칙형 봇에는 LLM이 필요 없고, 실제 유료 모델을 호출한 영상처럼 표현하지 않는다.

## 제출 설명 영문 초안

Prooflot is a marketplace for bot versions buyers can inspect before purchasing. Creators register Python or rule bots, run backtests and sell exact-version research licenses. Buyers compare fresh runs on frozen data and inspect a fixed BTC/ETH benchmark across four public historical cases. The benchmark manifest is committed to NEAR before execution, and all outcomes—including failures—remain visible. The wallet-owned Python example completed 628 decisions and 42 fills, with returns from −4.96% to +2.02%; completion is not a profitability badge.

NEAR enforces version/terms-bound purchases, creator ownership, credits and withdrawals. NEP-413 authentication links private records and download rights to the wallet account. Creator and buyer transactions are prepared for external-wallet signing; the operator only attests and settles reports. A buyer can recover an existing license in a new browser session without paying again. Purchased ZIPs contain the exact source, artifact, terms and report.

We verified the complete creator/buyer workflow using two separate SDK signing accounts on real testnet, including rejected terms, duplicate payment, fresh Python retesting and creator withdrawal. We additionally completed the personal buyer flow in the real Meteor Web wallet: NEP-413 login, a signed purchase, FINAL license confirmation, source ZIP download and a new 61-decision isolated Python run. The downloaded source matches the inspected version and the deterministic results reproduce. Public proof commands verify chain bindings without keys or a running app. Creator wallet UI approvals and the Nightly extension remain unverified. Execution and market data remain operator-attested; this is not independent performance certification.

## 게시된 X 영상

Buying a bot should start with evidence.

Built Prooflot at NEAR HACKATHON: inspect, buy the exact version, download and retest. Version-bound licenses on NEAR testnet.

https://github.com/openai-lover/prooflot
@NEARProtocol #NEARHackathon

사용자의 명시적 승인을 받은 뒤 실제 시연 영상과 함께 게시했다. [공개 게시물](https://x.com/AlphaGgang/status/2121637337587458332). 최종 신청 내용·연락 동의는 별도로 확인한다. [공식 제출 안내](https://nearhackathon.com/HACKATHON.md)의 재확인 기준 마감: 2026-11-15 08:59 KST. 공개 영상만으로 접수 완료를 주장하지 않는다.

## 심사위원 확인 명령

~~~sh
npm ci
npm run build
node scripts/check-wallet-proof.mjs
node scripts/check-meteor-proof.mjs
node scripts/check-benchmark-proof.mjs docs/wallet-benchmark-evidence.json
npm test
npm start
~~~

Python 검증은 Docker와 RUN_DOCKER_TESTS=1이 필요하다. 공개 체인 증거 확인에는 키가 필요 없다. 새 실제 거래를 만들 때는 README의 본인 개발 운영자 설정과 개인 테스트넷 지갑을 사용한다.

[완료 결과](completion.ko.md) · [검증 범위](verification.md) · [공모전·경쟁작 평가](release-review.ko.md) · [계정 준비](start.ko.md)

