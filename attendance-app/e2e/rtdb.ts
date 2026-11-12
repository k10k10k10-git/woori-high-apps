// `@/lib/rtdb`(Supabase 기반, firebase/database 와 같은 이름·인자) 자리. 전용 Vite 시험 서버의 별칭으로만 로드한다.
// 같은 이름의 Firebase SDK 를 에뮬레이터 db(./firebase)로 돌려, 원천 Rules(database.rules.json)와 화면 흐름을 함께 검사한다.
// 운영 모듈의 동작 계약은 src/lib/rtdb 의 단위 시험(가짜 Supabase)이 따로 지킨다.
import './firebase';
export * from 'firebase/database';
