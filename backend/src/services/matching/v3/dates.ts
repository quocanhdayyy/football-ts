import { Prisma } from "../../../generated/prisma/client";
import { InputError } from "../../../utils/api-validation";

export const shiftCalendarMonths = (date: Date, months: number) => {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return shifted;
};

export const playerAge = (birth: Date, asOf: Date) => {
  if (birth > asOf) return null;
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  if (asOf.getUTCMonth() < birth.getUTCMonth() || (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

// Whole calendar months plus a fraction of the following month, with month-end clamping.
export const remainingContractMonths = (asOf: Date, end: Date): Prisma.Decimal => {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const finish = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(finish.getTime())) throw new InputError("Ngày tính thời hạn hợp đồng không hợp lệ.");
  if (finish <= start) return new Prisma.Decimal(0);
  let whole = (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + finish.getUTCMonth() - start.getUTCMonth();
  if (shiftCalendarMonths(start, whole) > finish) whole--;
  const anchor = shiftCalendarMonths(start, whole), next = shiftCalendarMonths(start, whole + 1);
  return new Prisma.Decimal(whole).add(new Prisma.Decimal(finish.getTime() - anchor.getTime()).div(next.getTime() - anchor.getTime()));
};
