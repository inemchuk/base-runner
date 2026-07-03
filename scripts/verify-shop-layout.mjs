import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/app/globals.css', 'utf8');

assert.match(
  css,
  /\.shop-info\s*\{[^}]*flex:\s*1\s+1\s+0[^}]*min-width:\s*0/s,
  'shop info column should be allowed to shrink so action buttons stay inside cards',
);

assert.match(
  css,
  /\.shop-action\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*max-width:\s*34%/s,
  'shop action column should have a bounded width inside the card',
);

assert.match(
  css,
  /\.shop-btn-buy\s*\{[^}]*white-space:\s*nowrap/s,
  'shop buy buttons should keep coin icon and price on one line',
);
