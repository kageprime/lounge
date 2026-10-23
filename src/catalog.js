// Shared prize shop catalog & spending price list (pure data, shared between client and server).

export const SPEND_PRICES = {
  claw:  { currency: 'COIN', amount: 10 },
  gacha: { currency: 'COIN', amount: 5 },
  gift:  { currency: 'COIN', amount: 10 }
};

export const PRIZE_SHOP_CATALOG = [
  {
    id: 'coins30',
    name: '30 Arcade Tokens',
    cost: 25,
    currency: 'TICKET',
    icon: '🪙',
    desc: 'Convert tickets into playable game tokens',
    grantCoins: 30,
    consumable: true
  },
  {
    id: 'halo',
    name: 'Golden Neon Halo',
    cost: 100,
    currency: 'TICKET',
    icon: '👑',
    desc: 'Radiant glowing halo for your avatar',
    accessory: 'halo'
  },
  {
    id: 'neon_sign',
    name: 'CYBER Neon Sign',
    cost: 150,
    currency: 'TICKET',
    icon: '⚡',
    desc: 'Exclusive neon sign prop for Decorator Mode',
    propUnlock: { cat: 'decor', type: 'neon', side: 'n', text: 'CYBER', color: '#54e0ee', label: 'CYBER Sign' }
  },
  {
    id: 'tape0',
    name: 'Cassette: Track 00',
    cost: 200,
    currency: 'TICKET',
    icon: '📼',
    desc: 'Cryptic tape fragment found behind a cabinet'
  }
];

export const SHOP_BY_ID = Object.fromEntries(PRIZE_SHOP_CATALOG.map(it => [it.id, it]));
