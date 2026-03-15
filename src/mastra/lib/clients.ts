import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, baseSepolia } from "viem/chains";

const CHAINS = {
  31337: { chain: hardhat,    rpcUrl: () => process.env.HARDHAT_RPC_URL ?? "http://127.0.0.1:8545" },
  84532: { chain: baseSepolia, rpcUrl: () => process.env.BASE_SEPOLIA_RPC_URL },
} as const;

export type SupportedChainId = keyof typeof CHAINS;

export function getChainId(): SupportedChainId {
  const id = parseInt(process.env.CHAIN_ID ?? "31337") as SupportedChainId;
  if (!(id in CHAINS)) {
    throw new Error(`Unsupported CHAIN_ID: ${id}. Use: ${Object.keys(CHAINS).join(", ")}`);
  }
  return id;
}

export function createClients() {
  const chainId = getChainId();
  const { chain, rpcUrl } = CHAINS[chainId];

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY is required");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(rpcUrl());

  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  return { walletClient, publicClient, account, chainId };
}
