// Lets a drawing node view ask the app to open the full-screen drawing editor.
export type DrawingMode = 'sketch' | 'wireframe';

export type DrawingRequest = {
  mode: DrawingMode;
  scene: string | null;
  onSave: (scene: string, svg: string) => void | Promise<void>;
  onCancel: () => void;
};

type Listener = (req: DrawingRequest | null) => void;
let listener: Listener = () => {};

export const drawingBus = {
  open(req: DrawingRequest) {
    listener(req);
  },
  close() {
    listener(null);
  },
  subscribe(fn: Listener) {
    listener = fn;
    return () => {
      listener = () => {};
    };
  },
};
