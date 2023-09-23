import { produce } from "immer";
import { UndoRedoSystem } from "..";

class Counter {
  public state: { count: number };
  private undoRedoSystem: UndoRedoSystem<{ count: number }>;

  constructor(initialCount = 0) {
    const initialState = {
      count: initialCount,
    };
    this.state = initialState;
    this.undoRedoSystem = new UndoRedoSystem<{ count: number }>();
  }

  increment() {
    this.state = this.undoRedoSystem.update(this.state, (state) => {
      state.count++;
    });
  }

  decrement() {
    this.state = this.undoRedoSystem.update(this.state, (state) => {
      state.count--;
    });
  }

  undo() {
    this.state = this.undoRedoSystem.undo(this.state);
  }

  redo() {
    this.state = this.undoRedoSystem.redo(this.state);
  }
}

class Input {
  public state: { value: string };
  private undoRedoSystem: UndoRedoSystem<{ value: string }>;

  constructor() {
    this.state = {
      value: "",
    };
    this.undoRedoSystem = new UndoRedoSystem<{ value: string }>();
  }

  change(value: string, transactionId?: string) {
    let nextState: { value: string };
    nextState = this.undoRedoSystem.update(
      this.state,
      (draft, { isNewEntry }) => {
        if (isNewEntry) {
          draft.value = value;
        } else {
          draft.value += value;
        }
      },
      transactionId
    );

    this.state = nextState;
  }

  undo() {
    this.state = this.undoRedoSystem.undo(this.state);
  }

  redo() {
    this.state = this.undoRedoSystem.redo(this.state);
  }
}

class App {
  public state: { count: number; double: number };
  private undoRedoSystem: UndoRedoSystem<{ count: number; double: number }>;
  constructor() {
    this.state = {
      count: 0,
      double: 0,
    };
    this.undoRedoSystem = new UndoRedoSystem<{
      count: number;
      double: number;
    }>();
  }

  set(key: "count" | "double", value: number, transactionId?: string) {
    this.state = this.undoRedoSystem.update(
      this.state,
      (draft) => {
        draft[key] = value;
      },
      transactionId
    );
  }

  undo() {
    this.state = this.undoRedoSystem.undo(this.state);
  }

  redo() {
    this.state = this.undoRedoSystem.redo(this.state);
  }
}

// Non-class consumer
type CanvasState = {
  shapes: string[];
  relations: Record<string, string[]>;
};
const initialCanvasState: CanvasState = {
  shapes: ["root", "circle", "rect", "star"],
  relations: {
    root: ["circle", "rect", "star"],
  },
};
let canvas: CanvasState = initialCanvasState;
const canvasUndoRedo = new UndoRedoSystem<CanvasState>();

const reparentShape = (
  shapeId: string,
  parentId: string,
  transactionId?: string
) => {
  // Commit state update to undoRedo system
  canvas = canvasUndoRedo.update(
    canvas,
    (draftCanvas) => {
      draftCanvas.relations = produce(canvas.relations, (draft) => {
        // add it to the new parent
        if (!draft[parentId]) {
          draft[parentId] = [];
        }
        draft[parentId].push(shapeId);

        // remove it from existing parent
        for (const id in draft) {
          if (id !== parentId && draft[id].includes(shapeId)) {
            const index = draft[id].indexOf(shapeId);
            draft[id].splice(index, 1);
          }
        }
      });
    },
    transactionId
  );
};

const undoCanvas = () => {
  canvas = canvasUndoRedo.undo(canvas);
};
const redoCanvas = () => {
  canvas = canvasUndoRedo.redo(canvas);
};
// /Non-class consumer

describe("Spec", () => {
  it("canUndo", () => {
    let state = { num: 0 };
    const undoRedo = new UndoRedoSystem<typeof state>();
    expect(undoRedo.canUndo()).toBe(false);
    state = undoRedo.update(state, (d) => {
      d.num = 1;
    });
    expect(undoRedo.canUndo()).toBe(true);
    state = undoRedo.redo(state);
    expect(undoRedo.canUndo()).toBe(true);
    state = undoRedo.undo(state);
    expect(undoRedo.canUndo()).toBe(false);
    state = undoRedo.undo(state);
    expect(undoRedo.canUndo()).toBe(false);
  });
  it("canRedo", () => {
    let state = { num: 0 };
    const undoRedo = new UndoRedoSystem<typeof state>();
    expect(undoRedo.canRedo()).toBe(false);
    state = undoRedo.update(state, (d) => {
      d.num = 1;
    });
    expect(undoRedo.canRedo()).toBe(false);
    state = undoRedo.undo(state);
    expect(undoRedo.canRedo()).toBe(true);
    state = undoRedo.redo(state);
    expect(undoRedo.canRedo()).toBe(false);
    state = undoRedo.undo(state);
    expect(undoRedo.canRedo()).toBe(true);
    state = undoRedo.update(state, (d) => {
      d.num = 2;
    });
    expect(undoRedo.canRedo()).toBe(false);
  });
  it("Undo and redo should work", () => {
    const counter = new Counter(0);
    counter.increment();
    expect(counter.state.count).toBe(1);
    counter.undo();
    expect(counter.state.count).toBe(0);
    counter.undo();
    expect(counter.state.count).toBe(0);
    counter.redo();
    expect(counter.state.count).toBe(1);
    counter.redo();
    expect(counter.state.count).toBe(1);
  });
});

describe("Appending", () => {
  it("Should support appending to the last update", () => {
    const input = new Input();

    input.change("a");

    const id = "abcd";

    // As if we changed to `bc` at once
    input.change("b", id);
    input.change("c", id);

    expect(input.state.value).toBe("bc");

    input.undo();

    expect(input.state.value).toBe("a");

    input.redo();

    expect(input.state.value).toBe("bc");
  });

  it("Should support appending to the last update on updates onto unrelated parts of the state", () => {
    const app = new App();

    app.set("count", 2);

    const id = "1234";
    // Merged into one update
    app.set("double", 6, id);
    app.set("count", 4, id);
    // As if we did app.set(['count', 'double'], [4, 6])

    // 2 0
    // 4 6
    expect(app.state).toMatchInlineSnapshot(`
          {
            "count": 4,
            "double": 6,
          }
        `);

    app.undo();

    expect(app.state).toMatchInlineSnapshot(`
          {
            "count": 2,
            "double": 0,
          }
        `);

    app.redo();

    expect(app.state).toMatchInlineSnapshot(`
          {
            "count": 4,
            "double": 6,
          }
        `);
  });

  it("Should work with non-class cosumers", () => {
    expect(canvas).toMatchInlineSnapshot(`
    {
      "relations": {
        "root": [
          "circle",
          "rect",
          "star",
        ],
      },
      "shapes": [
        "root",
        "circle",
        "rect",
        "star",
      ],
    }
  `);

    const id = "abcd";

    reparentShape("circle", "rect", id);

    expect(canvas).toMatchInlineSnapshot(`
    {
      "relations": {
        "rect": [
          "circle",
        ],
        "root": [
          "rect",
          "star",
        ],
      },
      "shapes": [
        "root",
        "circle",
        "rect",
        "star",
      ],
    }
  `);

    reparentShape("rect", "star", id);

    expect(canvas).toMatchInlineSnapshot(`
    {
      "relations": {
        "rect": [
          "circle",
        ],
        "root": [
          "star",
        ],
        "star": [
          "rect",
        ],
      },
      "shapes": [
        "root",
        "circle",
        "rect",
        "star",
      ],
    }
  `);

    undoCanvas();

    // This should get back to the initial state
    expect(canvas).toMatchInlineSnapshot(`
    {
      "relations": {
        "root": [
          "circle",
          "rect",
          "star",
        ],
      },
      "shapes": [
        "root",
        "circle",
        "rect",
        "star",
      ],
    }
  `);

    redoCanvas();

    // This should be the changes after both updates
    expect(canvas).toMatchInlineSnapshot(`
      {
        "relations": {
          "rect": [
            "circle",
          ],
          "root": [
            "star",
          ],
          "star": [
            "rect",
          ],
        },
        "shapes": [
          "root",
          "circle",
          "rect",
          "star",
        ],
      }
    `);
  });
});

describe("Batching", () => {
  it("Should batch concurrent updates into a single update", async () => {
    // Reset canvas from prev tests
    canvas = initialCanvasState;

    const id = "abcd";
    const reparentShapeAsync = (shapeId: string, parentId: string) => {
      const randomDelay = Math.floor(Math.random() * 2000);
      return new Promise((resolve) => {
        setTimeout(() => {
          reparentShape(shapeId, parentId, id);
          resolve(undefined);
        }, randomDelay);
      });
    };

    await Promise.all([
      reparentShapeAsync("circle", "rect"),
      reparentShapeAsync("rect", "star"),
      reparentShapeAsync("star", "circle"),
    ]);

    expect(canvas).toMatchInlineSnapshot(`
      {
        "relations": {
          "circle": [
            "star",
          ],
          "rect": [
            "circle",
          ],
          "root": [],
          "star": [
            "rect",
          ],
        },
        "shapes": [
          "root",
          "circle",
          "rect",
          "star",
        ],
      }
    `);

    undoCanvas();

    expect(canvas).toMatchInlineSnapshot(`
      {
        "relations": {
          "root": [
            "circle",
            "rect",
            "star",
          ],
        },
        "shapes": [
          "root",
          "circle",
          "rect",
          "star",
        ],
      }
    `);

    redoCanvas();

    expect(canvas).toMatchInlineSnapshot(`
      {
        "relations": {
          "circle": [
            "star",
          ],
          "rect": [
            "circle",
          ],
          "root": [],
          "star": [
            "rect",
          ],
        },
        "shapes": [
          "root",
          "circle",
          "rect",
          "star",
        ],
      }
    `);
  });
});
