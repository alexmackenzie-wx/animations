// Lets an HTML block ask the app to open the HTML editor.
export type HtmlRequest = {
  html: string;
  onSave: (html: string) => void;
  onCancel: () => void;
};

let listener: (req: HtmlRequest | null) => void = () => {};

export const htmlBus = {
  open: (req: HtmlRequest) => listener(req),
  subscribe(fn: (req: HtmlRequest | null) => void) {
    listener = fn;
    return () => {
      listener = () => {};
    };
  },
};
