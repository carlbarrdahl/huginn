import { CuratorSDK, createUploadFn, type SupportedChainId } from "@curator-studio/sdk";
import { walletClient, chainId } from "./clients";

const uploadMetadata = createUploadFn(
  process.env.CURATOR_UPLOAD_URL!,
  process.env.CURATOR_UPLOAD_SECRET!,
);

export const sdk = new CuratorSDK(walletClient, {
  chain: chainId as SupportedChainId,
  tenant: process.env.CURATOR_TENANT,
  indexerUrl: process.env.CURATOR_INDEXER_URL,
  uploadMetadata,
});
