import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, baseSepolia } from "viem/chains";

const chains: Record<number, { chain: Chain; rpcUrl: string }> = {
  31337: {
    chain: hardhat,
    rpcUrl: process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545",
  },
  84532: {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  },
};

export const chainId = Number(process.env.CHAIN_ID || 31337);
const { chain, rpcUrl } = chains[chainId] ?? chains[31337]!;

const account = privateKeyToAccount(
  process.env.AGENT_PRIVATE_KEY as `0x${string}`,
);

export const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

export const agentAddress = account.address;
export { chain };
