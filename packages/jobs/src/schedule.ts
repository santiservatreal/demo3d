import { createHash } from 'node:crypto';
import { DomainError } from '@birdview/contracts';

export type RoutineSchedule = 'daily_briefing' | 'weekly_report' | 'receivables';
export interface ScheduleConfig { schedule:RoutineSchedule; timezone:string; hour?:number; minute?:number; weekdays?:number[]; }
export interface ScheduledOccurrence { occurrenceKey:string; scheduledAt:string; localDate:string; }
const dayNumbers:Record<string,number> = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
const formatters = new Map<string,Intl.DateTimeFormat>();
function localParts(date:Date,timezone:string):{date:string;hour:number;minute:number;weekday:number} {
  if (!formatters.has(timezone)) {
    try { formatters.set(timezone,new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'})); }
    catch { throw new DomainError('INVALID_TIMEZONE','Zona horaria no válida.'); }
  }
  const parts = Object.fromEntries(formatters.get(timezone)!.formatToParts(date).map(part => [part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute),weekday:dayNumbers[parts.weekday] || 0};
}
export function normalizedSchedule(input:ScheduleConfig):Required<ScheduleConfig> {
  const known = ['daily_briefing','weekly_report','receivables'];
  if (!known.includes(input.schedule)) throw new DomainError('INVALID_SCHEDULE','Horario de rutina no válido.');
  localParts(new Date(0),input.timezone);
  const defaults = input.schedule === 'daily_briefing' ? {hour:7,minute:30,weekdays:[1,2,3,4,5]} : input.schedule === 'weekly_report' ? {hour:8,minute:0,weekdays:[1]} : {hour:9,minute:0,weekdays:[1,2,3,4,5]};
  const hour = input.hour ?? defaults.hour, minute = input.minute ?? defaults.minute, weekdays = input.weekdays ?? defaults.weekdays;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new DomainError('INVALID_SCHEDULE','Horario de rutina no válido.');
  return {...input,hour,minute,weekdays:[...new Set(weekdays)]};
}
/** Look back at most one hour. Missing DST wall times are skipped; repeated times share one key. */
export function dueOccurrences(input:ScheduleConfig, now:Date, lastChecked?:Date, misfireMinutes = 60):ScheduledOccurrence[] {
  const schedule = normalizedSchedule(input);
  const window = Math.min(60,Math.max(1,Math.floor(misfireMinutes))) * 60_000;
  const end = Math.floor(now.getTime()/60_000)*60_000;
  const start = Math.max(end-window,lastChecked ? Math.floor(lastChecked.getTime()/60_000)*60_000 : end-window);
  const seen = new Set<string>(), result:ScheduledOccurrence[] = [];
  for (let time = start; time <= end; time += 60_000) {
    const parts = localParts(new Date(time),schedule.timezone);
    if (parts.hour !== schedule.hour || parts.minute !== schedule.minute || !schedule.weekdays.includes(parts.weekday)) continue;
    const occurrenceKey = `${schedule.timezone}/${parts.date}/${String(schedule.hour).padStart(2,'0')}:${String(schedule.minute).padStart(2,'0')}`;
    if (seen.has(occurrenceKey)) continue;
    seen.add(occurrenceKey);
    result.push({occurrenceKey,scheduledAt:new Date(time).toISOString(),localDate:parts.date});
  }
  return result;
}
export function routineRunId(organizationId:string,routineId:string,occurrenceKey:string):string {
  return `run-${createHash('sha256').update(`${organizationId}\0${routineId}\0${occurrenceKey}`).digest('hex').slice(0,48)}`;
}
