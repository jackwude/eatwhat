export function formatBeijingTime(value: string | Date): string {
  const date =
    typeof value === "string"
      ? // Supabase 返回值可能不带时区（如 2026-02-22T09:53:37.742），按 UTC 解释再转北京时间。
        new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)
      : value;

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
