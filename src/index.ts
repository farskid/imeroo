import {
  enablePatches,
  produceWithPatches,
  Patch,
  applyPatches,
  Objectish,
  produce,
  enableMapSet,
} from "immer";
import {
  immerToTransactionPatches,
  transactionToImmerPatches,
  uniqueTransactionId,
} from "./utils";
export type { Patch } from "immer";

export interface Transaction {
  patches: Record<string, Patch>;
  inversePatches: Record<string, Patch>;
  transactionId: string;
}

/**
 * Patch {
 *  op: 'replace' | 'remove' | 'add'
 *  path: string[];
 *  value: any
 * }
 */

export class UndoRedoSystem<ConsumerState extends Objectish = Objectish> {
  private undoStack: Transaction[];
  private redoStack: Transaction[];

  constructor(config?: { mapSet?: boolean }) {
    this.undoStack = [];
    this.redoStack = [];
    enablePatches();
    if (config?.mapSet) {
      enableMapSet();
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * @description Appends new changes to the last undo entry if exists. If undone later, these changes and the last entry changes will be undone together.
   * @description IMPORTANT: Appending to empty undo stack will commit a new change
   * @param recipe A recipe to update consumer state. Mutations are safe inside the recipe.
   * @returns next state
   */
  update(
    currentState: ConsumerState,
    recipe: (draft: ConsumerState, options: { isNewEntry: boolean }) => void,
    transactionId?: string
  ) {
    const lastUndoEntry = this.undoStack.at(-1);
    const isAppending =
      lastUndoEntry &&
      transactionId &&
      lastUndoEntry.transactionId === transactionId;

    const [nextState, patches, inversePatches] = produceWithPatches(
      currentState,
      (draft) => recipe(draft as ConsumerState, { isNewEntry: !isAppending })
    );

    this.redoStack.length = 0;

    if (isAppending) {
      // Update to a path that already exists in prev transaction just replaces that update
      // Any update path that didn't exist in the prev transaction will be added to it

      lastUndoEntry.patches = {
        ...lastUndoEntry.patches,
        ...immerToTransactionPatches(patches),
      };
      // When inversing, only take new paths because existing paths now have a merged patch and need to be taken back 2 steps
      lastUndoEntry.inversePatches = produce(
        lastUndoEntry.inversePatches,
        (draft) => {
          const newInversePatches = immerToTransactionPatches(inversePatches);
          for (const key in newInversePatches) {
            if (!draft[key]) {
              draft[key] = newInversePatches[key];
            }
          }
        }
      );
    } else {
      this.undoStack.push({
        patches: immerToTransactionPatches(patches),
        inversePatches: immerToTransactionPatches(inversePatches),
        transactionId: transactionId ?? uniqueTransactionId(),
      });
    }

    return nextState;
  }

  /**
   * Undo and return the next state
   */
  undo(currentState: ConsumerState): ConsumerState {
    const prevTransaction = this.undoStack.pop();

    if (prevTransaction) {
      this.redoStack.push(prevTransaction);

      return applyPatches(
        currentState,
        transactionToImmerPatches(prevTransaction.inversePatches)
      );
    }

    return currentState;
  }

  /**
   * Redo and return the next state
   */
  redo(currentState: ConsumerState): ConsumerState {
    const nextTransaction = this.redoStack.pop();

    if (nextTransaction) {
      this.undoStack.push(nextTransaction);
      return applyPatches(
        currentState,
        transactionToImmerPatches(nextTransaction.patches)
      );
    }

    return currentState;
  }
}
