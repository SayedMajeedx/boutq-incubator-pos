import { createServerFn } from "@tanstack/react-start";

export type DomainRouteResult = {
  redirect: string;
  brandId?: string;
  loaderText?: string | null;
};

export const resolveDomainRoute = createServerFn({ method: "GET" }).handler(
  async (): Promise<DomainRouteResult> => {
    const { resolveDomainRouteImpl } = await import("./domain-routing.server");
    return resolveDomainRouteImpl();
  },
);
