import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./auth/router";
import { catalogRouter } from "./delivery/catalog";
import { ordersRouter } from "./delivery/orders";
import { teamRouter } from "./delivery/team";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  delivery: router({ catalog: catalogRouter, orders: ordersRouter, team: teamRouter }),
});

export type AppRouter = typeof appRouter;
