// @citadel/core — shared domain types & contracts
// Single source of truth for entities used across api, ws, web, modules.
import { z } from 'zod';

// ─── Roles & RBAC ───────────────────────────────────────────────
export const Role = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_RANK: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.OWNER]: 3,
  [Role.MANAGER]: 2,
  [Role.STAFF]: 1,
};

// ─── Core entities ──────────────────────────────────────────────
export interface Org {
  id: string;
  name: string;
  slug: string;
  logoEmoji?: string;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  displayName: string;
  role: Role;
  avatarColor: AvatarColor;
  createdAt: string;
}

export const AVATAR_COLORS = ['mint', 'violet', 'amber', 'rose', 'sky'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

// ─── Auth (V2.1 Token, ADR-0001) ────────────────────────────────
/** Access token: 13 chars, uppercase alphanumeric (no ambiguous I/O/0/1 excluded set kept simple). */
export const TOKEN_LENGTH = 13;
export const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const tokenSchema = z
  .string()
  .length(TOKEN_LENGTH)
  .regex(/^[A-Z0-9]{13}$/, 'Token phải gồm 13 ký tự in hoa hoặc số');

/** Decoded JWT payload carried on every authenticated request. */
export interface JwtPayload {
  sub: string;      // user id
  orgId: string;    // tenant scope — NEVER trust org from client body
  role: Role;
  iat?: number;
  exp?: number;
}

// ─── API envelope & errors ──────────────────────────────────────
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    requestId?: string;
  };
}

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ─── WebSocket event contract (6 types, blueprint) ──────────────
export const WsEventType = {
  CHAT_MESSAGE: 'chat:message',
  CHAT_STREAM: 'chat:stream',
  NOTIFICATION: 'notification',
  PRESENCE: 'presence:update',
  MODULE_EVENT: 'module:event',
  DATA_CHANGED: 'data:changed',
} as const;
export type WsEventType = (typeof WsEventType)[keyof typeof WsEventType];

export interface WsEvent<T = unknown> {
  type: WsEventType;
  orgId: string;
  payload: T;
  ts: number;
}

// ─── Tiểu Tâm (LLM mode, stubbed-reply support) ─────────────────
export type LlmMode = 'stub' | 'live';
export interface TieuTamReply {
  text: string;
  toolCalls?: { tool: string; module: string; result: unknown }[];
  suggestions?: string[];
  mode: LlmMode;
}

export * from './errors.js';
export * from './env.js';
export * from './permissions.js';
export * from './manifest.js';
export * from './outbox.js';
