declare module "express" {
  type Request = Record<string, unknown>;
  type Response = Record<string, unknown>;

  interface ExpressApp {
    get(path: string, handler: (req: Request, res: Response) => void): void;
  }

  function express(): ExpressApp;

  export default express;
  export type { Request, Response };
}
