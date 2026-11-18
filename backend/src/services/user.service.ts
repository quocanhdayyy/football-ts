import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import type { UserRole } from "../generated/prisma/client";
import { ApiError } from "../utils/api-handler";

const scryptAsync = promisify(scrypt);
const publicFields = { id: true, username: true, email: true, role: true, createdAt: true } as const;
export type CreateUserInput = { username: string; email: string; password: string; role?: UserRole };
export type UpdateUserInput = Partial<CreateUserInput>;

const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
};
export const getUsers = () => prisma.user.findMany({ select: publicFields, orderBy: { id: "asc" } });
export const getUserById = (id: number) => prisma.user.findUnique({ where: { id }, select: publicFields });

const manageUsers = <T>(actorId: number, operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(async tx => {
    // Database-wide, transaction-scoped lock: requests from different processes
    // must re-check the actor and admin count after earlier mutations commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71913, 1)`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") throw new ApiError(403, "Chức năng này chỉ dành cho Admin.");
    return operation(tx);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 15000,
  });

const preserveAdmin = async (tx: Prisma.TransactionClient, role: UserRole) => {
  if (role === "ADMIN" && await tx.user.count({ where: { role: "ADMIN" } }) <= 1) {
    throw new ApiError(409, "Không thể xóa hoặc hạ quyền Admin cuối cùng.");
  }
};

// Bootstrap scripts and fixtures omit actorId; HTTP controllers always supply it.
export const createUser = async ({ password, ...data }: CreateUserInput, actorId?: number) => {
  const input = { ...data, passwordHash: await hashPassword(password) };
  if (actorId === undefined) return prisma.user.create({ data: input, select: publicFields });
  return manageUsers(actorId, tx => tx.user.create({ data: input, select: publicFields }));
};

export const updateUser = async (id: number, { password, ...data }: UpdateUserInput, actorId: number) => {
  const passwordData = password === undefined ? {} : { passwordHash: await hashPassword(password) };
  return manageUsers(actorId, async tx => {
    const target = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
    if (data.role !== undefined && data.role !== "ADMIN") {
      await preserveAdmin(tx, target.role);
      if (id === actorId) throw new ApiError(409, "Không thể tự hạ quyền tài khoản Admin của chính mình.");
    }
    return tx.user.update({ where: { id }, data: { ...data, ...passwordData }, select: publicFields });
  });
};

export const deleteUser = (id: number, actorId: number) => manageUsers(actorId, async tx => {
  const target = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
  await preserveAdmin(tx, target.role);
  if (id === actorId) throw new ApiError(409, "Không thể tự xóa tài khoản Admin của chính mình.");
  return tx.user.delete({ where: { id }, select: publicFields });
});
