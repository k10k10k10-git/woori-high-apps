import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
// 이 모듈은 전용 Vite 테스트 서버의 별칭으로만 로드한다. 운영 소스에는 에뮬레이터 분기를 넣지 않는다.
if (location.hostname !== '127.0.0.1' || location.port !== '3199') throw new Error('격리된 테스트 화면이 아닙니다.');
const app = initializeApp({ apiKey: 'synthetic-key', projectId: 'demo-attendance-recovery', authDomain: 'demo-attendance-recovery.firebaseapp.com', databaseURL: 'https://demo-attendance-recovery-default-rtdb.firebaseio.com' });
export const auth = getAuth(app);
export const db = getDatabase(app);
connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
connectDatabaseEmulator(db, '127.0.0.1', 19017);
