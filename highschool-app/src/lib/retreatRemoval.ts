import { paths } from "./paths";

/**
 * 수련회 삭제를 위한 루트 다중 경로 update payload.
 *
 * `retreats/{id}`만 지우면 `retreatsPrivate/{id}`(환불계좌·의료일지·주민등록번호·시트 raw)가
 * 고아로 남는다. 수련회가 목록에서 사라지므로 화면에서는 그 데이터에 접근할 방법이 없어
 * 민감정보가 영구히 방치된다. 학기 삭제(`removeSemester`)와 같은 계약으로 맞춘다.
 */
export function buildRetreatRemovalUpdates(id: string): Record<string, null> {
  return {
    [paths.retreat(id)]: null,
    [paths.retreatPrivate(id)]: null,
  };
}
