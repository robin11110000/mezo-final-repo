export const WAD: bigint;
export function ceilDiv(a:bigint,b:bigint):bigint;
export function ratio(collateral:bigint,price:bigint,debt:bigint):bigint|null;
export function borrowingPreview(input:{collateral:bigint;price:bigint;draw:bigint;fee:bigint;gasCompensation:bigint;targetBps:bigint;minimumDebt:bigint}):{netDebt:bigint;totalDebt:bigint;icr:bigint;withinTarget:boolean;aboveMinimum:boolean};
export function repayToTarget(input:{collateral:bigint;price:bigint;debt:bigint;targetBps:bigint;gasCompensation:bigint;minimumDebt:bigint}):{desired:bigint;amount:bigint;requiresClose:boolean};
export function compareBtcRoutes<T extends {simulated:boolean;output:bigint;gasCost:bigint;keeperFee:bigint}>(routes:T[]):(T&{net:bigint})[];
export function netCarry(input:{savingsPrincipal:bigint;savingsAprBps:bigint;debt:bigint;borrowAprBps:bigint;annualCosts:bigint}):bigint;
