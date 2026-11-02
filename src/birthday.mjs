export function isWinterBirthday(nickname, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul', month:'numeric', day:'numeric'}).formatToParts(date);
  const value = type => Number(parts.find(part => part.type === type)?.value);
  return nickname === '겨울이' && value('month') === 11 && value('day') === 3;
}
