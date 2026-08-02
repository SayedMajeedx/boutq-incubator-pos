declare module "vinxi/http" {
  export function getEvent():
    | {
        context?: any;
      }
    | undefined;
}
