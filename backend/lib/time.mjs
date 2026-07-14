const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function shanghaiDate(date = new Date()) {
  return FORMATTER.format(date);
}

