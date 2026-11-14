# Prooflot — 공개 릴리스 검증

2026-11-15 KST. 로컬 주소: http://127.0.0.1:4317

[공개 GitHub](https://github.com/openai-lover/prooflot) · [공개 89초 시연 영상](https://youtu.be/OEni-eWBdwk)

표시 이름·영문 화면·기하학 P 로고를 Prooflot으로 통일했습니다. 과거 계약·버전·보고서 식별자는 기존 증거가 계속 검증되도록 유지합니다.

## 실제로 확인한 흐름

제작자와 구매자를 별도 테스트넷 계정으로 분리했습니다. 각 계정이 NEP-413 메시지를 서명해 로그인하고, 제작자가 Python 봇을 등록·검사·판매하며 구매자가 결과를 확인하고 결제·다운로드·재시험합니다. 판매 대금과 남은 예치금의 지갑 출금까지 실제 체인에서 확인했습니다. 정상 앱 서버는 사용자의 판매·구매 거래를 대신 서명하지 않습니다.

- [실제 상품](http://127.0.0.1:4317/#product/bb80edef-1132-4685-a021-2678ab4b8d95): Signal Check v1.0, 0.01 test NEAR.
- [실제 구매](https://testnet.nearblocks.io/txns/HzsAKJTqpYtaVhRt43PvF6oVkFhjGHUcq5ki8cLPvUCE) / [제작자 출금](https://testnet.nearblocks.io/txns/5ADXj9HcTWue2Z6MUmHFKiRELVsgD2mSozvTxLvm6WRX).
- [Meteor 개인 지갑 구매](https://testnet.nearblocks.io/txns/5okSTWEwmR7BR8Yzao1uV5R1sT4LHrbBvtoKoK6Nt92L): nearblog6709.testnet의 실제 외부 지갑 서명. 로그인·결제·ZIP 다운로드·새 재시험까지 완료했습니다.
- [공통 시험](http://127.0.0.1:4317/#benchmarks/46c0c9ee-aa30-494b-9371-5417847e6c2f): BTC·ETH × 두 기간, 628회 판단·42회 체결. 수익률 −1.74%, −0.34%, −4.96%, +2.02%. 손실을 포함한 전체 결과입니다.
- 봇 ZIP에 bot.py, bot.json, license.json, report.json, README.txt, passport.json, verify.mjs를 넣습니다. 내려받은 Python 소스가 검사한 버전과 일치합니다.
- 앱 내 브라우저에서 실제 Python 업로드 → 검사·판매 등록 → 로컬 모의 구매 → Windows Downloads 파일 저장 → 새 73회 판단까지 다시 확인했습니다. 73,387바이트 ZIP을 디스크에서 읽고 독립 실행 없이 해시·원본·보고서·사용권 연결을 검증했습니다. [파일 증거](prooflot-browser-evidence.json).

## 검증 근거

| 종류 | 결과 | 근거 |
|---|---|---|
| JS·SQLite·HTTP·실제 Docker | 84개 통과 | test-results.txt |
| 공개 GitHub 새 복제본 설치·빌드·실제 Docker | 84개 통과, 건너뛴 검사 없음 | public-clone-test-results.txt |
| 별도 계정 실제 거래 흐름 | 14개 통과 | wallet-testnet-evidence.json |
| Meteor 개인 지갑 구매·파일·재시험 | 16개 대조 통과 | meteor-wallet-evidence.json |
| Meteor 구매 공개 RPC 대조 | 10개 통과 | check-meteor-proof.mjs |
| 지갑 거래 공개 RPC 대조 | 14개 통과 | check-wallet-proof.mjs |
| 구매 ZIP | Windows ZIP 리더로 소스·버전·보고서·구매자 대조, 비로그인·로그아웃 접근 차단 | wallet-download-evidence.json |
| 새 공통 시험의 공개 RPC 대조 | 8개 통과 | wallet-benchmark-evidence.json |
| 기존 계약 VM 검사 | 기존 Rust 10개 통과, 계약 코드 변경 없음 | verification.md |

서명 재사용, 다른 계정·도메인·세션, 만료 서명, 제한된 키, 변경된 약관, 잘못된 버전과 중복 결제를 거절합니다. 같은 지갑으로 다른 브라우저 세션에 로그인하면 기존 사용권을 복구합니다. 중간에 멈춘 판매 등록도 체인 상태에서 이어집니다.

## 화면

첫 방문 소개는 등록 → 검사 → 거래의 세 장면으로 움직입니다. 해당 브라우저의 localStorage에 기록해 재방문에는 자동 표시하지 않으며 하단에서 다시 볼 수 있습니다. 건너뛰기·키보드·동작 줄이기를 지원합니다. 새 로고는 독자적인 P 기하학 마크입니다. 데스크톱과 모바일에서 검수했습니다.

## 정확한 검증 범위

외부 지갑 연결은 NEAR Connect 0.12.0과 고정된 Meteor·Nightly 어댑터를 사용합니다. **Meteor 개인 지갑으로 실제 연결·로그인 서명·구매 서명·FINAL 사용권·ZIP 다운로드·재시험을 확인했습니다.** 사용자가 지갑을 준비하고 잠금을 해제했으며, 비밀번호나 복구 문구를 읽지 않았습니다. 새 재시험은 61회 판단·5회 체결, −0.98% 수익률·1.54% 낙폭을 재현했습니다.

검증 중 발견한 앱 주소 전달 오류, 오래된 어댑터 캐시, 서명 팝업을 연이어 자동으로 여는 흐름을 수정했습니다. 지갑 서명은 앱의 명시적인 버튼으로 엽니다. 최초 테스트 잔액 0.1이 부족해 0.5 test NEAR로 보충했고, 재시도 전 기존 사용권이 없음을 확인했습니다. 제작자 등록·판매·출금은 별도 SDK 테스트 계정으로 검증했으며, 제작자 지갑 UI와 Nightly 확장 승인은 아직 별도 검증이 필요합니다.

우승이나 상용 서비스 준비 완료를 보장하지 않습니다. 실행은 운영자 검증이며 독립 실행 증명·보안 감사·독립 사용자 실증은 남아 있습니다. 공개 저장소와 YouTube 시연, [X 영상](https://x.com/AlphaGgang/status/2121637337587458332)은 게시됐습니다. 최종 신청은 아직 접수하지 않았습니다. [제출 자료](submission-pack.ko.md), [최신 평가](release-review.ko.md), [계정 준비](start.ko.md)를 함께 보세요.

서버는 숨겨진 프로세스로 실행합니다. PID: output/server.pid. 재시작: start.ps1. 사용자가 로컬 실행을 요청했으므로 컴퓨터를 종료하지 않습니다.

