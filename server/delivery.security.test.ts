import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { adminProcedure, staffProcedure } from "./delivery/shared";
import { protectedProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

function userContext(role: "admin" | "staff" | "user"): TrpcContext {
  return {
    user: {
      id: 27,
      openId: `delivery-${role}`,
      email: `${role}@example.com`,
      name: "Loja",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const guardRouter = router({
  staff: staffProcedure.query(({ ctx }) => ctx.user.role),
  owner: adminProcedure.query(({ ctx }) => ctx.user.role),
});
const passwordGateRouter = router({
  privateData: protectedProcedure.query(() => "private"),
});

describe("delivery role authorization", () => {
  it("allows staff through the staff order guard but denies owner-only operations", async () => {
    const caller = guardRouter.createCaller(userContext("staff"));
    await expect(caller.staff()).resolves.toBe("staff");
    await expect(caller.owner()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows only the owner role into owner procedures", async () => {
    const caller = guardRouter.createCaller(userContext("admin"));
    await expect(caller.owner()).resolves.toBe("admin");
    await expect(caller.staff()).resolves.toBe("admin");
  });
  it("rejects customer-role accounts from the private order queue and finance endpoints", async () => {
    const caller = appRouter.createCaller(userContext("user"));
    await expect(caller.delivery.orders.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.delivery.orders.assignCourier({ id: 3, courierId: 8 })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.couriers.activeList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.orders.adminStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.catalog.adminData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.team.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects staff from financial metrics, catalog administration, and team management", async () => {
    const caller = appRouter.createCaller(userContext("staff"));
    await expect(caller.delivery.orders.adminStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.catalog.adminData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.team.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.delivery.couriers.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.delivery.couriers.create({
        name: "Motoboy Demo",
        phone: "11987654321",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.delivery.couriers.setActive({ id: 5, isActive: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks private endpoints until a temporary password is changed", async () => {
    const context = userContext("staff");
    context.user!.passwordResetRequired = true;
    const privateCaller = passwordGateRouter.createCaller(context);
    await expect(privateCaller.privateData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const authCaller = appRouter.createCaller(context);
    await expect(authCaller.auth.me()).resolves.toMatchObject({
      passwordResetRequired: true,
    });
  });
});
