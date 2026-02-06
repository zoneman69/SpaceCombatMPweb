declare module "express" {
  import type { IncomingMessage, ServerResponse } from "http";

  interface Request extends IncomingMessage {}

  interface Response extends ServerResponse {
    send(body?: string): void;
  }

  interface ExpressApp {
    (req: IncomingMessage, res: ServerResponse): void;
    get(path: string, handler: (req: Request, res: Response) => void): void;
  }

  function express(): ExpressApp;

  export default express;
  export type { Request, Response };
}
