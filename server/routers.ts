import { systemRouter } from "./_core/systemRouter.js";
import { router } from "./_core/trpc.js";
import { authRouter } from "./auth/router.js";
import { catalogRouter } from "./delivery/catalog.js";
import { ordersRouter } from "./delivery/orders.js";
import { teamRouter } from "./delivery/team.js";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  delivery: router({ catalog: catalogRouter, orders: ordersRouter, team: teamRouter }),
});

export type AppRouter = typeof appRouter;
