// Add only YLN-verified, secure payment routes here before enabling donations.
// Card and PayPal URLs may contain {amount}, replaced with the visitor's amount.
const donationRoutes={cardUrl:'',paypalUrl:'',bankDetails:'',otherUrl:''};
const donationNotice=document.querySelector('[data-donation-notice]');
document.querySelectorAll('[data-method]').forEach(button=>button.addEventListener('click',()=>{
  const custom=Number(document.querySelector('#customAmount').value);
  const selected=document.querySelector('input[name="amount"]:checked');
  const amount=custom>0?custom:(selected?Number(selected.value):0);
  const method=button.dataset.method;
  if(!amount||amount<1){donationNotice.textContent='Choose a donation amount of at least €1.';return;}
  if(method==='bank'&&donationRoutes.bankDetails){donationNotice.textContent=donationRoutes.bankDetails;return;}
  const key={card:'cardUrl',paypal:'paypalUrl',other:'otherUrl'}[method];
  const route=key&&donationRoutes[key];
  if(route){window.location.assign(route.replaceAll('{amount}',encodeURIComponent(String(amount))));return;}
  donationNotice.textContent='This payment method is not active yet. YLN will add its verified recipient and payment details before accepting donations.';
}));
