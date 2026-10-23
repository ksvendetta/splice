// Naming for the automatic snapshot Reset takes before clearing a project.
// The timestamp leads so History sorts and reads chronologically; the splice
// name is appended when there is one, to make an entry recognisable.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatSaveStamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function autoSaveName(spliceName?: string | null, date: Date = new Date()): string {
  const stamp = formatSaveStamp(date);
  const label = spliceName?.trim();
  return label ? `${stamp} — ${label}` : stamp;
}
