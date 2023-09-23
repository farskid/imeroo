import {
  enablePatches,
  produceWithPatches,
  Patch,
  applyPatches,
  Objectish,
  produce,
} from "immer";
import { immerToTransactionPatches, transactionToImmerPatches } from "./utils";
export type { Patch } from "immer";

enablePatches();

export interface Transaction {
  patches: Record<string, Patch>;
  inversePatches: Record<string, Patch>;
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

  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   *
   * @description Commits a new entry to the undo stack
   * @param recipe A recipe to update consumer state. Mutations are safe inside the recipe.
   * @returns next state
   */
  update(
    currentState: ConsumerState,
    recipe: (draft: ConsumerState) => void
  ): ConsumerState {
    const [nextState, patches, inversePatches] = produceWithPatches(
      currentState,
      recipe
    );

    this.redoStack.length = 0;

    this.undoStack.push({
      patches: immerToTransactionPatches(patches),
      inversePatches: immerToTransactionPatches(inversePatches),
    });

    return nextState;
  }

  /**
   * @description Appends new changes to the last undo entry if exists. If undone later, these changes and the last entry changes will be undone together.
   * @description IMPORTANT: Appending to empty undo stack will commit a new change
   * @param recipe A recipe to update consumer state. Mutations are safe inside the recipe.
   * @returns next state
   */
  append(currentState: ConsumerState, recipe: (draft: ConsumerState) => void) {
    const [nextState, patches, inversePatches] = produceWithPatches(
      currentState,
      recipe
    );

    this.redoStack.length = 0;
    const lastUndoEntry = this.undoStack.at(-1);
    if (lastUndoEntry) {
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
      this.update(currentState, recipe);
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
