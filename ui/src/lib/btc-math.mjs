export const WAD=10n**18n;
export function ceilDiv(a,b){if(a<0n||b<=0n)throw Error('Invalid division');return (a+b-1n)/b;}
export function ratio(collateral,price,debt){return debt===0n?null:collateral*price/debt;}
export function borrowingPreview({collateral,price,draw,fee,gasCompensation,targetBps,minimumDebt}){
 if(collateral<=0n||price<=0n||draw<=0n||fee<0n||gasCompensation<0n||targetBps<15000n||targetBps>100000n)throw Error('Invalid borrowing inputs');
 const netDebt=draw+fee,totalDebt=netDebt+gasCompensation,icr=ratio(collateral,price,totalDebt);
 return {netDebt,totalDebt,icr,withinTarget:icr*10000n>=targetBps*WAD,aboveMinimum:netDebt>=minimumDebt};
}
export function repayToTarget({collateral,price,debt,targetBps,gasCompensation,minimumDebt}){
 if(collateral<0n||price<=0n||debt<0n||targetBps<15000n)throw Error('Invalid defense inputs');
 const targetDebt=collateral*price*10000n/(WAD*targetBps);
 const desired=debt>targetDebt?debt-targetDebt:0n;
 const floor=gasCompensation+minimumDebt;
 const maximumPartial=debt>floor?debt-floor:0n;
 return {desired,amount:desired<maximumPartial?desired:maximumPartial,requiresClose:desired>maximumPartial};
}
export function compareBtcRoutes(routes){
 const eligible=routes.filter(r=>r.simulated&&r.output>0n&&r.gasCost>=0n&&r.keeperFee>=0n).map(r=>({...r,net:r.output-r.gasCost-r.keeperFee})).filter(r=>r.net>0n);
 return eligible.sort((a,b)=>a.net===b.net?0:a.net>b.net?-1:1);
}
export function netCarry({savingsPrincipal,savingsAprBps,debt,borrowAprBps,annualCosts}){
 if([savingsPrincipal,savingsAprBps,debt,borrowAprBps,annualCosts].some(n=>n<0n))throw Error('Negative input');
 return savingsPrincipal*savingsAprBps/10000n-debt*borrowAprBps/10000n-annualCosts;
}
