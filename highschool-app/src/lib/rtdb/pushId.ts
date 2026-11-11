// Firebase 푸시 ID: 시각 8자 + 무작위 12자 = 20자. 같은 밀리초에 만든 ID 는 무작위 부분을 1 올려 순서를 지킨다.
const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

let lastPushTime = 0;
const lastRandChars: number[] = [];

export function nextPushId(now: number, random: () => number = Math.random): string {
  const duplicateTime = now === lastPushTime;
  lastPushTime = now;
  const timeStampChars = new Array<string>(8);
  let time = now;
  for (let i = 7; i >= 0; i -= 1) {
    timeStampChars[i] = PUSH_CHARS.charAt(time % 64);
    time = Math.floor(time / 64);
  }
  let id = timeStampChars.join("");
  if (!duplicateTime) {
    for (let i = 0; i < 12; i += 1) lastRandChars[i] = Math.floor(random() * 64);
  } else {
    let i = 11;
    for (; i >= 0 && lastRandChars[i] === 63; i -= 1) lastRandChars[i] = 0;
    lastRandChars[i] += 1;
  }
  for (let i = 0; i < 12; i += 1) id += PUSH_CHARS.charAt(lastRandChars[i]);
  return id;
}
