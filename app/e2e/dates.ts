const JST = 9 * 3600 * 1000;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const today = () => new Date(Date.now() + JST).toISOString().slice(0, 10);
export const yesterday = () => addDays(today(), -1);
