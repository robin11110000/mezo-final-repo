import test from 'node:test';import assert from 'node:assert/strict';
import {planRedemption} from '../ui/src/lib/redemption-plan.mjs';
const W=10n**18n,zero='0x0000000000000000000000000000000000000000';
test('hint planning stops at first partial instead of computing a later trove NICR',async()=>{
 const seen=[];const p=await planRedemption({amount:100n*W,price:80000n*W,mcr:11n*W/10n,gasCompensation:200n*W,minimumDebt:1800n*W,last:async()=> 'first',previous:async()=> 'second',position:async a=>{seen.push(a);return {collateral:W,principal:2000n*W,interest:10n*W};}});
 assert.equal(p.amount,10n*W);assert.equal(p.nicr,(W-10n*W/80000n)*10n**20n/(2000n*W));assert.deepEqual(seen,['first']);
});
test('full troves can be traversed, then a partial uses the remaining amount',async()=>{
 const p=await planRedemption({amount:2100n*W,price:80000n*W,mcr:11n*W/10n,gasCompensation:200n*W,minimumDebt:1800n*W,last:async()=> 'first',previous:async a=>a==='first'?'second':zero,position:async a=>({collateral:W,principal:(a==='first'?2200n:5200n)*W,interest:0n})});
 assert.equal(p.amount,2100n*W);assert.equal(p.visited,2);assert.ok(p.nicr>0n);
});
