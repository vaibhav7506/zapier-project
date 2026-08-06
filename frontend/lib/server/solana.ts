import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import base58 from "bs58";

type PreparedTransfer = {
  serializedTransaction: string;
  signature: string;
  lastValidBlockHeight: number;
};

const connection = new Connection("https://api.mainnet-beta.solana.com", "finalized");

function getKeypair() {
  const privateKey = process.env.SOL_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SOL_PRIVATE_KEY must be set");
  }

  return Keypair.fromSecretKey(base58.decode(privateKey));
}

export async function prepareSolanaTransfer(to: string, amount: string): Promise<PreparedTransfer> {
  const keypair = getKeypair();
  const latestBlockhash = await connection.getLatestBlockhash("finalized");
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: parseFloat(amount) * LAMPORTS_PER_SOL,
    }),
  );

  transaction.sign(keypair);
  if (!transaction.signature) {
    throw new Error("Unable to sign Solana transfer");
  }

  return {
    serializedTransaction: Buffer.from(transaction.serialize()).toString("base64"),
    signature: base58.encode(transaction.signature),
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

export async function submitPreparedSolanaTransfer(transfer: PreparedTransfer) {
  const signatureStatus = await connection.getSignatureStatus(transfer.signature, {
    searchTransactionHistory: true,
  });

  if (signatureStatus.value?.err) {
    throw new Error(`Solana transaction failed: ${JSON.stringify(signatureStatus.value.err)}`);
  }

  if (signatureStatus.value?.confirmationStatus) {
    return transfer.signature;
  }

  const currentBlockHeight = await connection.getBlockHeight("finalized");
  if (currentBlockHeight > transfer.lastValidBlockHeight) {
    throw new Error(
      "Solana transaction expired without confirmation; manual review is required before any retry",
    );
  }

  await connection.sendRawTransaction(
    Buffer.from(transfer.serializedTransaction, "base64"),
    { skipPreflight: false },
  );
  await connection.confirmTransaction(
    {
      signature: transfer.signature,
      blockhash: Transaction.from(Buffer.from(transfer.serializedTransaction, "base64")).recentBlockhash!,
      lastValidBlockHeight: transfer.lastValidBlockHeight,
    },
    "finalized",
  );

  return transfer.signature;
}
