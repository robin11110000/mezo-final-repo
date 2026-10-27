import test from 'node:test';
import assert from 'node:assert/strict';
import {WAD,borrowingPreview,repayToTarget,compareBtcRoutes,netCarry} from '../ui/src/lib/btc-math.mjs';
test('borrowing accounts for issuance fee and gas debt before enforcing owner ratio',()=>{
 const p=borrowingPreview({collateral:WAD,price:80000n*WAD,draw:40000n*WAD,fee:40n*WAD,gasCompensation:200n*WAD,targetBps:20000n,minimumDebt:1800n*WAD});
 assert.equal(p.totalDebt,40240n*WAD);assert.equal(p.withinTarget,false);assert.equal(p.aboveMinimum,true);
 assert.throws(()=>borrowingPreview({collateral:WAD,price:0n,draw:1n,fee:0n,gasCompensation:0n,targetBps:20000n,minimumDebt:0n}));
});
test('defense never leaves debt below the protocol floor and identifies closure',()=>{
 const p=repayToTarget({collateral:WAD/10n,price:30000n*WAD,debt:4000n*WAD,targetBps:20000n,gasCompensation:200n*WAD,minimumDebt:1800n*WAD});
 assert.equal(p.desired,2500n*WAD);assert.equal(p.amount,2000n*WAD);assert.equal(p.requiresClose,true);
});
test('route ranking excludes unsimulated, losing and fee-heavy routes',()=>{
 const p=compareBtcRoutes([{name:'fake',simulated:false,output:100n,gasCost:0n,keeperFee:0n},{name:'losing',simulated:true,output:10n,gasCost:11n,keeperFee:0n},{name:'redemption',simulated:true,output:50n,gasCost:10n,keeperFee:2n},{name:'swap',simulated:true,output:49n,gasCost:1n,keeperFee:2n}]);
 assert.deepEqual(p.map(r=>r.name),['swap','redemption']);assert.equal(p[0].net,46n);
});
test('carry shows a loss when only part of borrowed MUSD earns savings income',()=>{
 assert.equal(netCarry({savingsPrincipal:6000n*WAD,savingsAprBps:200n,debt:10000n*WAD,borrowAprBps:200n,annualCosts:10n*WAD}),-90n*WAD);
});
