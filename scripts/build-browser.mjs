import { build } from 'esbuild';
await build({entryPoints:['public/wallet-entry.js'],outfile:'public/wallet.bundle.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
console.log('Built local NEAR Connect wallet bundle.');
