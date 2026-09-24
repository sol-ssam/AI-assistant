import { nowHourMinuteInSeoul, todayDateString } from "./date";

// settings.briefingTime(기본 "08:20") 이후이고, 오늘 아직 자동 브리핑을 표시하지 않았다면 true.
// 8:20 이전에 실행된 경우에는 false를 반환하며, 이 경우 lastBriefingDate를 변경해서는 안 된다.
export function shouldTriggerAutoBriefing(settings) {
  const briefingTime = settings?.briefingTime || "08:20";
  const [bh, bm] = briefingTime.split(":").map(Number);
  const { hour, minute } = nowHourMinuteInSeoul();

  const nowMinutes = hour * 60 + minute;
  const briefingMinutes = (bh || 0) * 60 + (bm || 0);

  const today = todayDateString();
  const alreadyShownToday = settings?.lastBriefingDate === today;

  return nowMinutes >= briefingMinutes && !alreadyShownToday;
}
