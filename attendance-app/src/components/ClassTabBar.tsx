'use client';
import { useApp, useClassKeys } from '@/store/AppContext';

export default function ClassTabBar() {
  const { state, dispatch } = useApp();
  const { curPart, curGrade, curClass, classData } = state;
  const classKeys = useClassKeys(state);

  return (
    <div className="class-tabs-wrap" role="group" aria-label="반 선택">
      {classKeys.map(k => {
        const classNum = k.split('-')[2];
        const teacherName = classData[k]?.teacher;
        const isActive = curClass === classNum && k.startsWith(`${curPart}-${curGrade}-`);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={isActive}
            className={`class-tab${isActive ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_CLASS', payload: classNum })}
          >
            {classNum}반{teacherName ? ` · ${teacherName}` : ''}
          </button>
        );
      })}
    </div>
  );
}
