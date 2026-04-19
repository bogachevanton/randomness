import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const CORE = "rng-core-v1";
const OPERATOR = "rng-operator-v1";

// ===========================================
// Initial State
// ===========================================

describe("rng-operator-v1 :: initial state", () => {
  it("deployer is the owner", () => {
    const r = simnet.callReadOnlyFn(OPERATOR, "get-owner", [], deployer);
    expect(r.result).toBeOk(Cl.principal(deployer));
  });

  it("last-request-id is 0", () => {
    const r = simnet.callReadOnlyFn(OPERATOR, "get-last-request-id", [], deployer);
    expect(r.result).toBeOk(Cl.uint(0));
  });

  it("last-random is 0", () => {
    const r = simnet.callReadOnlyFn(OPERATOR, "get-last-random", [], deployer);
    expect(r.result).toBeOk(Cl.uint(0));
  });

  it("rng-core points to .rng-core-v1", () => {
    const r = simnet.callReadOnlyFn(OPERATOR, "get-rng-core", [], deployer);
    expect(r.result).toBeOk(Cl.contractPrincipal(deployer, CORE));
  });
});

// ===========================================
// Read-only Guards
// ===========================================

describe("rng-operator-v1 :: read-only guards", () => {
  it("get-result returns err for unknown id", () => {
    const r = simnet.callReadOnlyFn(OPERATOR, "get-result", [Cl.uint(999)], deployer);
    expect(r.result).toBeErr(Cl.uint(404));
  });

  it("get-result-in-range rejects max=0", () => {
    const r = simnet.callReadOnlyFn(
      OPERATOR, "get-result-in-range", [Cl.uint(1), Cl.uint(0)], deployer
    );
    expect(r.result).toBeErr(Cl.uint(407));
  });

  it("get-result-in-range returns err for unknown id", () => {
    const r = simnet.callReadOnlyFn(
      OPERATOR, "get-result-in-range", [Cl.uint(999), Cl.uint(100)], deployer
    );
    expect(r.result).toBeErr(Cl.uint(404));
  });
});

// ===========================================
// Admin :: set-rng-core
// ===========================================

describe("rng-operator-v1 :: set-rng-core", () => {
  it("owner can change rng-core", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet1)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    const c = simnet.callReadOnlyFn(OPERATOR, "get-rng-core", [], deployer);
    expect(c.result).toBeOk(Cl.principal(wallet1));
    // restore
    simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], deployer
    );
  });

  it("non-owner cannot change rng-core", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet2)], wallet1
    );
    expect(r.result).toBeErr(Cl.uint(501));
  });
});

// ===========================================
// receive-randomness
// ===========================================

describe("rng-operator-v1 :: receive-randomness", () => {
  it("rejects for non-existent request", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "receive-randomness",
      [Cl.uint(999), Cl.uint(42)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(404));
  });
});

// ===========================================
// Request Flow Guards
// ===========================================

describe("rng-operator-v1 :: request flow", () => {
  it("request-rng rejects when core doesn't match data-var", () => {
    // Set rng-core to wallet1 so .rng-core-v1 won't match
    simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet1)], deployer
    );
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
        Cl.uint(1),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(410));
    // restore
    simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], deployer
    );
  });

  it("request-rng rejects invalid mode", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
        Cl.uint(99),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(408));
  });

  it("request-rng propagates core tx-sender check error", () => {
    // Core rejects because tx-sender (wallet1) != .rng-operator-v1
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
        Cl.uint(1),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(402));
  });

  it("request-rng-now rejects when core doesn't match", () => {
    simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet1)], deployer
    );
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng-now",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(410));
    simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], deployer
    );
  });

  it("request-rng-now propagates core error", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng-now",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(402));
  });

  it("request-rng-next-tenure rejects invalid core", () => {
    simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet1)], deployer
    );
    const r = simnet.callPublicFn(
      OPERATOR, "request-rng-next-tenure",
      [
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(410));
    simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], deployer
    );
  });

  it("finalize-request rejects when core doesn't match", () => {
    simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet1)], deployer
    );
    const r = simnet.callPublicFn(
      OPERATOR, "finalize-request",
      [
        Cl.uint(1),
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(410));
    simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], deployer
    );
  });

  it("finalize-request propagates core not-found error", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "finalize-request",
      [
        Cl.uint(999),
        Cl.contractPrincipal(deployer, CORE),
        Cl.contractPrincipal(deployer, OPERATOR),
      ],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(404));
  });
});

// ===========================================
// Ownership Transfer (destructive — last)
// ===========================================

describe("rng-operator-v1 :: ownership transfer", () => {
  it("non-owner cannot transfer", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "transfer-ownership", [Cl.principal(wallet2)], wallet1
    );
    expect(r.result).toBeErr(Cl.uint(501));
  });

  it("owner can transfer to wallet1", () => {
    const r = simnet.callPublicFn(
      OPERATOR, "transfer-ownership", [Cl.principal(wallet1)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    const c = simnet.callReadOnlyFn(OPERATOR, "get-owner", [], deployer);
    expect(c.result).toBeOk(Cl.principal(wallet1));
  });

  it("old owner cannot admin after transfer", () => {
    simnet.callPublicFn(OPERATOR, "transfer-ownership", [Cl.principal(wallet1)], deployer);
    const r = simnet.callPublicFn(
      OPERATOR, "set-rng-core", [Cl.principal(wallet2)], deployer
    );
    expect(r.result).toBeErr(Cl.uint(501));
  });

  it("new owner can admin after transfer", () => {
    simnet.callPublicFn(OPERATOR, "transfer-ownership", [Cl.principal(wallet1)], deployer);
    const r = simnet.callPublicFn(
      OPERATOR, "set-rng-core",
      [Cl.contractPrincipal(deployer, CORE)], wallet1
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });
});
