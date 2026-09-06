// 승인 검토·로컬 에뮬레이터용 제안. 운영 원천 database.rules.json을 수정하거나 배포하지 않는다.
const textRule = (max) => ({ ".validate": `newData.isString() && newData.val().length <= ${max}` });
const approved = "root.child('admins').child(auth.uid).val() === true || root.child('retreatAdmins').child(auth.uid).exists() || root.child('iguardMembers').child(auth.uid).exists()";
const ownRequest = "newData.child('area').val() === 'requests' && (newData.child('target/path').val() === 'iguardPending/' + auth.uid || newData.child('target/path').val().beginsWith('iguardPending/' + auth.uid + '/') || newData.child('target/path').val() === 'retreatPending/' + auth.uid || newData.child('target/path').val().beginsWith('retreatPending/' + auth.uid + '/'))";

export const activityLogRulesProposal = {
  events: {
    ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
    ".indexOn": ["occurredAt"],
    "$eventId": {
      ".write": `auth != null && !data.exists() && newData.exists() && (${approved} || (${ownRequest}))`,
      ".validate": "newData.hasChildren(['id', 'schemaVersion', 'occurredAt', 'recordedAt', 'actor', 'area', 'action', 'target', 'changedCount'])",
      id: { ".validate": "newData.val() === $eventId && newData.isString() && newData.val().length <= 160" },
      schemaVersion: { ".validate": "newData.val() === 1" },
      occurredAt: { ".validate": "newData.isNumber() && newData.val() === now" },
      recordedAt: { ".validate": "newData.isNumber() && newData.val() === now" },
      actor: {
        ".validate": "newData.hasChildren(['kind', 'uid'])",
        kind: { ".validate": "newData.val() === 'user'" },
        uid: { ".validate": "newData.isString() && newData.val() === auth.uid && newData.val().length <= 128" },
        name: { ".validate": "newData.isString() && newData.val().length <= 80 && newData.val() === auth.token.name" },
        "$other": { ".validate": false },
      },
      area: { ".validate": "newData.val() === 'attendance' || newData.val() === 'semester' || newData.val() === 'newFriends' || newData.val() === 'retreat' || newData.val() === 'programs' || newData.val() === 'field' || newData.val() === 'accounts' || newData.val() === 'requests' || newData.val() === 'schedule'" },
      action: { ".validate": "newData.val() === 'create' || newData.val() === 'update' || newData.val() === 'delete'" },
      target: {
        ".validate": "newData.hasChildren(['path', 'label'])",
        path: textRule(1024), label: textRule(160), context: textRule(160), href: textRule(512),
        "$other": { ".validate": false },
      },
      changes: {
        ".validate": "newData.hasChildren()",
        "$index": {
          ".validate": "$index.matches(/^(0|[1-9]|[12][0-9])$/) && newData.hasChild('field') && ((newData.child('redacted').val() === true && !newData.hasChild('after') && !newData.hasChild('before')) || (!newData.hasChild('redacted') && !newData.hasChild('before') && (newData.child('after').val() === '출석' || newData.child('after').val() === '지각' || newData.child('after').val() === '결석')))",
          field: textRule(160),
          redacted: { ".validate": "newData.val() === true" },
          after: { ".validate": "newData.val() === '출석' || newData.val() === '지각' || newData.val() === '결석'" },
          "$other": { ".validate": false },
        },
      },
      changedCount: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000 && newData.val() % 1 === 0" },
      "$other": { ".validate": false },
    },
  },
};

export function rulesWithActivityLogProposal(currentRules) {
  if (currentRules.rules.activityLogs) throw new Error("활동 로그 규칙이 이미 있습니다. 기존 운영 원천을 먼저 대조하세요.");
  return { ...currentRules, rules: { ...currentRules.rules, activityLogs: activityLogRulesProposal } };
}
