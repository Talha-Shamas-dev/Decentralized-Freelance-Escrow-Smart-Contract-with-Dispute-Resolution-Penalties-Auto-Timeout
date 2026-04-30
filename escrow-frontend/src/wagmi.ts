import { http, createConfig } from 'wagmi';
import { zkSyncSepoliaTestnet } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

const projectId = 'b2edc6e815f88411f8f1ea23dbecac20'; // get from cloud.walletconnect.com

export const config = createConfig({
  chains: [zkSyncSepoliaTestnet],
  transports: {
    [zkSyncSepoliaTestnet.id]: http('https://sepolia.era.zksync.dev'),
  },
  connectors: [
    injected(),
    walletConnect({ projectId, showQrModal: true }),
    coinbaseWallet({ appName: 'Escrow dApp' }),
  ],
});