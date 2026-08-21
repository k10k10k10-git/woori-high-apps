export type DailyVerse = {
  text: string;
  reference: string;
};

// 사용자가 확정한 문구만 둔다. 날짜로 고르므로 새로고침할 때 임의로 바뀌지 않는다.
export const MINISTRY_ENCOURAGEMENTS = [
  "오늘의 섬김에도 하나님이 함께하세요.",
  "기쁨으로 맡은 자리를 함께 세워가요.",
  "하나님께서 오늘도 새 힘을 더해 주실 거예요.",
  "사랑으로 서로를 섬기는 하루가 되길 바라요.",
  "오늘도 은혜 안에서 평안하게 시작해요.",
  "맡겨진 자리에서 빛과 소금이 되어 주세요.",
  "우리의 작은 섬김이 공동체를 든든히 세워요.",
  "오늘의 만남마다 따뜻한 마음을 전해 주세요.",
  "하나님이 주시는 지혜로 함께 준비해요.",
  "기도하는 마음으로 오늘의 사역을 시작해요.",
  "서로를 격려하며 기쁜 하루를 만들어 가요.",
  "오늘의 섬김도 하나님께서 기억하세요.",
  "맡겨진 영혼을 사랑으로 섬겨요.",
  "감사와 기쁨으로 오늘의 한 걸음을 시작해요.",
  "하나님께서 필요한 힘과 마음을 채워 주실 거예요.",
  "우리가 함께할 때 공동체는 더욱 따뜻해져요.",
  "오늘의 섬김이 누군가에게 위로가 되길 바라요.",
  "주님 안에서 평안하고 힘찬 하루 보내세요.",
  "서로의 짐을 나누며 함께 걸어가요.",
  "오늘도 한마음으로 기쁘게 섬겨요.",
  "하나님이 맡기신 오늘을 감사함으로 살아가요.",
  "사랑으로 말하고 기쁨으로 행동하는 하루가 되길 바라요.",
] as const;

export const DAILY_MINISTRY_VERSES: readonly DailyVerse[] = [
  { text: "오직 사랑으로 서로 종노릇 하라", reference: "갈라디아서 5:13" },
  { text: "각각 은사를 받은 대로 서로 봉사하라", reference: "베드로전서 4:10" },
  { text: "섬김을 받으려 함이 아니라 도리어 섬기려 하고", reference: "마가복음 10:45" },
  { text: "사람이 나를 섬기려면 나를 따르라", reference: "요한복음 12:26" },
  { text: "열심을 품고 주를 섬기라", reference: "로마서 12:11" },
  { text: "무슨 일을 하든지 마음을 다하여 주께 하듯 하라", reference: "골로새서 3:23" },
  { text: "지극히 작은 자 하나에게 한 것이 곧 내게 한 것이니라", reference: "마태복음 25:40" },
  { text: "너희 모든 일을 사랑으로 행하라", reference: "고린도전서 16:14" },
  { text: "내가 너희를 사랑한 것 같이 서로 사랑하라", reference: "요한복음 13:34" },
  { text: "우리가 사랑함은 그가 먼저 우리를 사랑하셨음이라", reference: "요한일서 4:19" },
  { text: "사랑은 오래 참고 사랑은 온유하며", reference: "고린도전서 13:4" },
  { text: "무엇보다도 뜨겁게 서로 사랑할지니", reference: "베드로전서 4:8" },
  { text: "형제를 사랑하여 서로 우애하고", reference: "로마서 12:10" },
  { text: "이 모든 것 위에 사랑을 더하라", reference: "골로새서 3:14" },
  { text: "쉬지 말고 기도하라", reference: "데살로니가전서 5:17" },
  { text: "모든 일에 기도와 간구로 너희 구할 것을 아뢰라", reference: "빌립보서 4:6" },
  { text: "기도를 계속하고 기도에 감사함으로 깨어 있으라", reference: "골로새서 4:2" },
  { text: "항상 성령 안에서 기도하고", reference: "에베소서 6:18" },
  { text: "기도에 항상 힘쓰며", reference: "로마서 12:12" },
  { text: "아침에 내가 주께 기도하고 바라리이다", reference: "시편 5:3" },
  { text: "범사에 감사하라", reference: "데살로니가전서 5:18" },
  { text: "감사함으로 그의 문에 들어가며", reference: "시편 100:4" },
  { text: "너희는 또한 감사하는 자가 되라", reference: "골로새서 3:15" },
  { text: "하나님 아버지께 감사하라", reference: "골로새서 3:17" },
  { text: "여호와께 감사하라 그는 선하시며", reference: "시편 136:1" },
  { text: "너희가 짐을 서로 지라", reference: "갈라디아서 6:2" },
  { text: "서로 돌아보아 사랑과 선행을 격려하며", reference: "히브리서 10:24" },
  { text: "마음을 같이하여 같은 사랑을 가지고", reference: "빌립보서 2:2" },
  { text: "두세 사람이 내 이름으로 모인 곳에는 나도 그들 중에 있느니라", reference: "마태복음 18:20" },
  { text: "형제가 연합하여 동거함이 어찌 그리 아름다운고", reference: "시편 133:1" },
  { text: "성령이 하나 되게 하신 것을 힘써 지키라", reference: "에베소서 4:3" },
] as const;

const COMPOUND_FAMILY_NAMES = ["남궁", "황보", "제갈", "선우", "서문", "독고", "동방", "사공"];
const SINGLE_FAMILY_NAMES = new Set([
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
  "유", "고", "문", "양", "손", "배", "백", "허", "남", "심", "노", "하", "곽", "성", "차", "주", "우", "구", "민", "진",
  "지", "엄", "채", "원", "천", "방", "공", "현", "함", "변", "염", "여", "추", "도", "소", "석", "선", "설", "마", "길",
]);

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function dayNumber(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`잘못된 날짜 형식입니다: ${dateKey}`);
  const [, year, month, day] = match;
  const value = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const normalized = new Date(value).toISOString().slice(0, 10);
  if (normalized !== dateKey) throw new Error(`존재하지 않는 날짜입니다: ${dateKey}`);
  return value / 86_400_000;
}

/** 브라우저 위치와 관계없이 한국 날짜를 반환한다. */
export function seoulDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** 같은 한국 날짜에는 같은 문구를, 다음 날에는 다음 조합을 반환한다. */
export function dailyMinistryMessage(dateKey: string) {
  const index = dayNumber(dateKey);
  return {
    encouragement: MINISTRY_ENCOURAGEMENTS[positiveModulo(index, MINISTRY_ENCOURAGEMENTS.length)],
    verse: DAILY_MINISTRY_VERSES[positiveModulo(index * 7 + 11, DAILY_MINISTRY_VERSES.length)],
  };
}

/** 한국식 전체 이름은 성을 덜어 부르고, 판단하기 어려운 이름은 원문을 보존한다. */
export function friendlyMinistryName(value: string | null | undefined): string {
  const raw = value?.trim() || "선생님";
  if (raw.endsWith("님")) return raw;
  const compact = raw.replace(/\s+/g, "");
  if (/^[가-힣]+$/.test(compact)) {
    const compound = COMPOUND_FAMILY_NAMES.find((familyName) => compact.startsWith(familyName) && compact.length > familyName.length);
    if (compound) return `${compact.slice(compound.length)}님`;
    if (compact.length >= 3 && SINGLE_FAMILY_NAMES.has(compact[0])) return `${compact.slice(1)}님`;
  }
  return `${raw}님`;
}
