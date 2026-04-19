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

describe("rng-core-v1 :: initial state", () => {
  it("deployer is the owner", () => {
    const r = simnet.callReadOnlyFn(CORE, "get-owner", [], deployer);
    expect(r.result).toBeOk(Cl.principal(deployer));
  });

  it("requests are enabled", () => {
    const r = simnet.callReadOnlyFn(CORE, "get-requests-enabled", [], deployer);
    expect(r.result).toBeOk(Cl.bool(true));
  });

  it("last-request-id is 0", () => {
    const r = simnet.callReadOnlyFn(CORE, "get-last-request-id", [], deployer);
    expect(r.result).toBeOk(Cl.uint(0));
  });

  it("operators not allowed by default", () => {
    const r = simnet.callReadOnlyFn(
      CORE, "get-operator-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(false));
  });

  it("requesters not allowed by default", () => {
    const r = simnet.callReadOnlyFn(
      CORE, "get-requester-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(false));
  });
});

// ===========================================
// Read-only Guards
// ===========================================

describe("rng-core-v1 :: read-only guards", () => {
  it("get-request returns err for unknown id", () => {
    const r = simnet.callReadOnlyFn(CORE, "get-request", [Cl.uint(999)], deployer);
    expect(r.result).toBeErr(Cl.uint(404));
  });

  it("get-randomness returns err for unknown id", () => {
    const r = simnet.callReadOnlyFn(CORE, "get-randomness", [Cl.uint(999)], deployer);
    expect(r.result).toBeErr(Cl.uint(404));
  });

  it("get-randomness-in-range rejects max=0", () => {
    const r = simnet.callReadOnlyFn(
      CORE, "get-randomness-in-range", [Cl.uint(1), Cl.uint(0)], deployer
    );
    expect(r.result).toBeErr(Cl.uint(411));
  });

  it("get-randomness-in-range returns err for unknown id", () => {
    const r = simnet.callReadOnlyFn(
      CORE, "get-randomness-in-range", [Cl.uint(999), Cl.uint(100)], deployer
    );
    expect(r.result).toBeErr(Cl.uint(404));
  });
});

// ===========================================
// Allowlists
// ===========================================

describe("rng-core-v1 :: allowlists", () => {
  it("owner can allow and revoke an operator", () => {
    let r = simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.principal(wallet1), Cl.bool(true)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    let c = simnet.callReadOnlyFn(
      CORE, "get-operator-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(c.result).toBeOk(Cl.bool(true));

    r = simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.principal(wallet1), Cl.bool(false)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    c = simnet.callReadOnlyFn(
      CORE, "get-operator-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(c.result).toBeOk(Cl.bool(false));
  });

  it("non-owner cannot set operator", () => {
    const r = simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.principal(wallet2), Cl.bool(true)], wallet1
    );
    expect(r.result).toBeErr(Cl.uint(401));
  });

  it("owner can allow and revoke a requester", () => {
    let r = simnet.callPublicFn(
      CORE, "set-requester-allowed",
      [Cl.principal(wallet1), Cl.bool(true)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    let c = simnet.callReadOnlyFn(
      CORE, "get-requester-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(c.result).toBeOk(Cl.bool(true));

    r = simnet.callPublicFn(
      CORE, "set-requester-allowed",
      [Cl.principal(wallet1), Cl.bool(false)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    c = simnet.callReadOnlyFn(
      CORE, "get-requester-allowed", [Cl.principal(wallet1)], deployer
    );
    expect(c.result).toBeOk(Cl.bool(false));
  });

  it("non-owner cannot set requester", () => {
    const r = simnet.callPublicFn(
      CORE, "set-requester-allowed",
      [Cl.principal(wallet2), Cl.bool(true)], wallet1
    );
    expect(r.result).toBeErr(Cl.uint(401));
  });

  it("can allow a contract principal as operator", () => {
    const r = simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.bool(true)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    const c = simnet.callReadOnlyFn(
      CORE, "get-operator-allowed",
      [Cl.contractPrincipal(deployer, OPERATOR)], deployer
    );
    expect(c.result).toBeOk(Cl.bool(true));
    // clean up
    simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.bool(false)], deployer
    );
  });
});

// ===========================================
// Requests Toggle
// ===========================================

describe("rng-core-v1 :: requests toggle", () => {
  it("owner can disable and re-enable requests", () => {
    let r = simnet.callPublicFn(CORE, "flip-requests-enabled", [], deployer);
    expect(r.result).toBeOk(Cl.bool(false));
    let c = simnet.callReadOnlyFn(CORE, "get-requests-enabled", [], deployer);
    expect(c.result).toBeOk(Cl.bool(false));

    r = simnet.callPublicFn(CORE, "flip-requests-enabled", [], deployer);
    expect(r.result).toBeOk(Cl.bool(true));
    c = simnet.callReadOnlyFn(CORE, "get-requests-enabled", [], deployer);
    expect(c.result).toBeOk(Cl.bool(true));
  });

  it("non-owner cannot flip", () => {
    const r = simnet.callPublicFn(CORE, "flip-requests-enabled", [], wallet1);
    expect(r.result).toBeErr(Cl.uint(401));
  });
});

// ===========================================
// request-randomness Guards
// ===========================================

describe("rng-core-v1 :: request-randomness guards", () => {
  it("rejects when requests disabled", () => {
    simnet.callPublicFn(CORE, "flip-requests-enabled", [], deployer);
    const r = simnet.callPublicFn(
      CORE, "request-randomness",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.uint(1)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(406));
    // re-enable
    simnet.callPublicFn(CORE, "flip-requests-enabled", [], deployer);
  });

  it("rejects invalid mode u0", () => {
    const r = simnet.callPublicFn(
      CORE, "request-randomness",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.uint(0)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(412));
  });

  it("rejects invalid mode u99", () => {
    const r = simnet.callPublicFn(
      CORE, "request-randomness",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.uint(99)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(412));
  });

  it("rejects when tx-sender is not the operator contract", () => {
    const r = simnet.callPublicFn(
      CORE, "request-randomness",
      [Cl.contractPrincipal(deployer, OPERATOR), Cl.uint(1)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(402));
  });
});

// ===========================================
// finalize-randomness Guards
// ===========================================

describe("rng-core-v1 :: finalize-randomness guards", () => {
  it("rejects non-existent request", () => {
    const r = simnet.callPublicFn(
      CORE, "finalize-randomness",
      [Cl.uint(999), Cl.contractPrincipal(deployer, OPERATOR)],
      deployer
    );
    expect(r.result).toBeErr(Cl.uint(404));
  });
});

// ===========================================
// Ownership Transfer (destructive — last)
// ===========================================

describe("rng-core-v1 :: ownership transfer", () => {
  it("non-owner cannot transfer", () => {
    const r = simnet.callPublicFn(
      CORE, "transfer-ownership", [Cl.principal(wallet2)], wallet1
    );
    expect(r.result).toBeErr(Cl.uint(401));
  });

  it("owner can transfer to wallet1", () => {
    const r = simnet.callPublicFn(
      CORE, "transfer-ownership", [Cl.principal(wallet1)], deployer
    );
    expect(r.result).toBeOk(Cl.bool(true));
    const c = simnet.callReadOnlyFn(CORE, "get-owner", [], deployer);
    expect(c.result).toBeOk(Cl.principal(wallet1));
  });

  it("old owner cannot admin after transfer", () => {
    // transfer first, then verify old owner is locked out
    simnet.callPublicFn(CORE, "transfer-ownership", [Cl.principal(wallet1)], deployer);
    const r = simnet.callPublicFn(CORE, "flip-requests-enabled", [], deployer);
    expect(r.result).toBeErr(Cl.uint(401));
  });

  it("new owner can admin after transfer", () => {
    simnet.callPublicFn(CORE, "transfer-ownership", [Cl.principal(wallet1)], deployer);
    const r = simnet.callPublicFn(
      CORE, "set-operator-allowed",
      [Cl.principal(wallet2), Cl.bool(true)], wallet1
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });
});
