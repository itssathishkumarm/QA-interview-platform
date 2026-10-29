function getCart(){try{return JSON.parse(localStorage.getItem('pawmart_cart')||'[]')}catch(e){return []}}
function addToCart(name){const c=getCart();c.push(name);localStorage.setItem('pawmart_cart',JSON.stringify(c))}
function renderBadge(){const b=document.querySelector('[data-testid="dotcom-cart-badge"]');if(b)b.textContent=String(getCart().length)}
document.addEventListener('DOMContentLoaded',renderBadge);
