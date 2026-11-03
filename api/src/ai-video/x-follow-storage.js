import { createObjectStorage, createOpaqueObjectKey } from './object-storage.js';

export const X_FOLLOW_PREFIX = 'production/x-follow-proofs';
let storage;
export const getXFollowStorage = () => storage ||= createObjectStorage({ prefix: X_FOLLOW_PREFIX });
export const createXFollowKey = () => createOpaqueObjectKey(X_FOLLOW_PREFIX);
