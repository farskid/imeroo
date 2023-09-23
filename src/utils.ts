import { Patch } from "immer";
import { nanoid } from "nanoid";

export const uniqueTransactionId = () => nanoid();

export const getPatchPath = (patch: Patch) => patch.path.join(".");

export const immerToTransactionPatches = (
  patches: Patch[]
): Record<string, Patch> =>
  Object.fromEntries(patches.map((p) => [getPatchPath(p), p]));

export const transactionToImmerPatches = (
  patches: Record<string, Patch>
): Patch[] => Object.values(patches);
