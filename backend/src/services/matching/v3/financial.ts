import type { V3Config, RunOptions } from "./config";
import { Prisma } from "../../../generated/prisma/client";
import type { PlayerDataVerification } from "../../../generated/prisma/client";

export function verifiedFreeAgent(verification: PlayerDataVerification | null, hasActiveContract: boolean, asOf: Date, now: Date) {
  return !hasActiveContract && verification?.registrationStatus === "FREE_AGENT"
    && verification.registrationAsOf?.getTime() === asOf.getTime()
    && !!verification.registrationSource?.trim()
    && !!verification.registrationVerifiedAt && verification.registrationVerifiedAt <= now;
}
export function weighted(values: Record<string, number | null>, weights: Record<string, number>): number | null {
  let sum = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (!w) continue;
    const value = values[key]; if (value == null || !Number.isFinite(value)) return null;
    sum += w * value;
  }
  return sum;
}
export function affordability(amount: number | null, cap: number, tolerance: number, intercept: number, slope: number) {
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(tolerance) || tolerance < 0) throw new Error("Invalid cap/tolerance");
  if (amount === null) return { score: null, ratio: null, allowed: null };
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount");
  const money = new Prisma.Decimal(amount), limit = new Prisma.Decimal(cap), fraction = money.div(limit), ratio = fraction.toNumber();
  if (money.lte(limit)) return { score: new Prisma.Decimal(100).mul(new Prisma.Decimal(intercept).sub(fraction.mul(slope))).toNumber(), ratio, allowed: true };
  if (!tolerance || money.gt(limit.mul(new Prisma.Decimal(1).add(tolerance)))) return { score: 0, ratio, allowed: false };
  return { score: Math.max(0, new Prisma.Decimal(60).mul(new Prisma.Decimal(1).sub(fraction.sub(1).div(tolerance))).toNumber()), ratio, allowed: true };
}
export function financial(input: { fee: number | null; wage: number | null; budget: number; salaryLimit: number; contractYears: number | null }, config: V3Config, options: RunOptions) {
  const fee = affordability(input.fee, input.budget, options.feeTolerance, .9, .3);
  const salary = affordability(input.wage, input.salaryLimit, options.wageTolerance, .96, .36);
  const c = input.contractYears;
  const contract = c === null ? null : Math.max(0, 100 - 30 * Math.max(options.contractMinYears - c, 0, c - options.contractMaxYears));
  const scores = { fee: fee.score, salary: salary.score, contract };
  return { score: weighted(scores, config.financialWeights), scores, fee, salary, inputs: input, weights: config.financialWeights };
}
