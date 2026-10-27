// Mezo stops after its first partial redemption. Never produce a later partial's NICR.
export async function planRedemption({amount,price,mcr,gasCompensation,minimumDebt,last,previous,position,maxIterations=50}){
 if(amount<=0n||price<=0n||maxIterations<1||maxIterations>100)throw Error('Invalid redemption limits');
 const zero='0x0000000000000000000000000000000000000000';
 let borrower=await last(),first=zero,remaining=amount,nicr=0n,visited=0;
 while(borrower.toLowerCase()!==zero&&remaining>0n&&visited<maxIterations){
  visited++;const p=await position(borrower),debt=p.principal+p.interest;
  if(debt===0n||p.collateral*price/debt<mcr){borrower=await previous(borrower);continue;}
  if(first===zero)first=borrower;
  const netDebt=debt-gasCompensation;
  if(netDebt<=0n)throw Error('Invalid trove debt');
  if(remaining>=netDebt){remaining-=netDebt;borrower=await previous(borrower);continue;}
  const available=netDebt>minimumDebt?netDebt-minimumDebt:0n;
  const partial=remaining<available?remaining:available;
  if(partial===0n)break;
  const principalPaid=partial>p.interest?partial-p.interest:0n;
  const newPrincipal=p.principal-principalPaid;
  const newCollateral=p.collateral-partial*10n**18n/price;
  if(newPrincipal<=0n)throw Error('Invalid post-redemption principal');
  nicr=newCollateral*10n**20n/newPrincipal;remaining-=partial;break;
 }
 return {first,amount:amount-remaining,nicr,visited};
}
