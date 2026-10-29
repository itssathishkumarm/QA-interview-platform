// PawMart sample app (system under test) + cross-origin PCI card frame.
const express = require('express');
const path = require('path');

const PRODUCTS = [
  { id: 'pet-101', sku: 'AQUA-HTR-50W', name: '50W Preset Aquarium Heater', category: 'Aquatic', price: 38, stock: 12, unit: 'units' },
  { id: 'pet-102', sku: 'DOG-KBL-15KG', name: 'Royal Canin Adult Dog Kibble', category: 'Dog Nutrition', price: 85, stock: 15, unit: 'bags' },
  { id: 'pet-103', sku: 'VET-RX-HWT', name: 'Rx Heartworm Chewables (6-Pack)', category: 'Vet Pharmacy', price: 64, stock: 6, unit: 'units' },
  { id: 'pet-104', sku: 'CAT-WND-FTH', name: 'Interactive Feather Cat Wand', category: 'Cat Toys', price: 14, stock: 42, unit: 'units' }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (req, name) => {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};

function startSample(port, pciPort) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const file = (f) => (req, res) => res.sendFile(path.join(__dirname, f));
  app.get('/', file('shop.html'));
  app.get('/checkout', file('checkout.html'));
  app.get('/account', file('account.html'));
  app.get('/pos', file('pos.html'));
  app.get('/common.css', file('common.css'));
  app.get('/common.js', file('common.js'));
  app.get('/config.js', (req, res) => {
    // Reached through the portal proxy -> same-origin /pci/card; reached directly (tests) -> separate-origin port.
    const proxied = !!req.headers['x-pawmart-prefix'];
    const host = String(req.headers.host || 'localhost').split(':')[0];
    const pciUrl = proxied ? '/pci/card' : '//' + host + ':' + pciPort + '/card';
    res.type('js').send('window.PAWMART=' + JSON.stringify({ pciUrl }) + ';');
  });

  // ---- DotCom API
  app.get('/api/v1/pets/catalog', (req, res) => res.json(PRODUCTS));
  app.get('/api/v1/pets/search', async (req, res) => {
    await sleep(500); // slow search: the grid keeps showing stale results meanwhile
    const q = String(req.query.q || '').toLowerCase();
    res.json(PRODUCTS.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  });
  app.post('/api/v1/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === 'pet_parent' && password === 'secret') {
      res.set('Set-Cookie', 'pawmart_token=pet_parent.vip; Path=/; HttpOnly; SameSite=Lax');
      return res.json({ token: 'pet_parent.vip', tier: 'VIP' });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  });
  app.get('/api/v1/me', (req, res) => {
    if (cookie(req, 'pawmart_token') === 'pet_parent.vip') return res.json({ user: 'pet_parent', tier: 'VIP' });
    res.status(401).json({ error: 'Not authenticated' });
  });
  app.post('/api/v1/checkout/vet-rx-upload', (req, res) => res.status(201).json({ ok: true }));
  app.post('/api/v1/checkout/submit', (req, res) => {
    const address = String((req.body || {}).address || '');
    if (/[#&]/.test(address)) return res.status(500).json({ error: 'Unescaped gate character in address' });
    res.json({ orderId: 'PAW-' + Math.floor(10000 + Math.random() * 90000) });
  });

  // ---- POS API
  app.post('/api/v2/pos/promo-validate', async (req, res) => {
    await sleep(3000);
    const code = String((req.body || {}).code || '').toUpperCase();
    res.json({ message: 'PROMO APPLIED: ' + code + ' (Vet Clinic Discount)' });
  });
  app.post('/api/v2/pos/microchip-batch', (req, res) => res.json({ ok: true }));
  app.post('/api/v2/pos/cloud-receipt', (req, res) => res.status(500).json({ error: 'Vet Cloud Print Service Unavailable' }));

  const servers = [app.listen(port)];

  // ---- Cross-origin PCI card frame (separate port = separate origin)
  const pci = express();
  pci.get('/card', (req, res) => res.sendFile(path.join(__dirname, 'pci.html')));
  servers.push(pci.listen(pciPort));
  return servers;
}

module.exports = { startSample, PRODUCTS };
